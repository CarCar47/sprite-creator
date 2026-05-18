# Sprite Creator — Phase 0 Amendments

**Companion to:** `Sprite-Creator-Engineering-Plan.docx` (v1.0, May 18, 2026)
**Amendment Date:** 05/18/2026
**Author:** COR4edu / Carlos
**Status:** Required corrections before Phase 0 (Repository & Tooling) begins

---

## Why this document exists

The engineering plan was finalized on 05/18/2026 but was drafted against the image-generation and platform landscape of late 2025. Three primary-source verifications run on 05/18/2026 surfaced load-bearing claims that no longer hold:

1. The model named in the plan was retired before this plan was written.
2. The serverless timeout the plan budgets against has been raised.
3. The rate-limit implementation the plan specifies does not function correctly on Vercel's runtime.

None of these change the architecture in Section 4 of the plan. They are configuration- and dependency-level corrections. The rest of the plan — chroma-key pipeline, grid-slice strategy, reference-image enforcement, manifest schema, Unity import flow, phased rollout, security posture — is adopted as written.

---

## Amendment 1 — Replace Gemini model

### What changes

- **Plan says:** Use `gemini-2.5-flash-image` (Section 3.2, Section 5.2, Section 5.5).
- **Adopt instead:** Use `gemini-3.1-flash-image-preview` (Nano Banana 2) as the default.

### Why

| Model ID | Status (05/18/2026) |
|---|---|
| `gemini-2.5-flash-image-preview` | Shut down 01/15/2026 |
| `gemini-2.5-flash-image` (stable) | Scheduled shutdown 10/02/2026 |
| `gemini-3.1-flash-image-preview` (Nano Banana 2) | Default since 02/26/2026; #1 on Artificial Analysis Image Arena |
| `gemini-3-pro-image-preview` (Nano Banana Pro) | Higher fidelity, higher cost; available for A/B |

`gemini-3.1-flash-image-preview` exposes the same feature set the architecture relies on — up to 20 reference images per call, character-consistency / multi-image fusion as a first-class capability, 1:1 aspect-ratio targeting, SynthID invisible watermarking — plus stronger editing and text rendering. The migration is a model-string change, not an architecture change.

### How to apply

1. In `src/lib/gemini.ts`, read the model ID from an env var with a verified default:
   ```ts
   const MODEL_ID = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview";
   ```
2. Add `GEMINI_IMAGE_MODEL` to `.env.local.example` with a comment listing supported IDs and shutdown dates.
3. Set the same variable in Vercel project settings (Production, Preview, Development) so quality A/B tests with Nano Banana Pro do not require a redeploy.
4. Reference the current [Nano Banana image-generation docs](https://ai.google.dev/gemini-api/docs/image-generation) when authoring prompt templates in `src/lib/prompts/`, not the 2.5-era prompting guide cited in Section 7.4 of the plan. The structural rules (instructions before reference, per-frame enumeration, identity-lock clause, negative guidance) still apply.

### Knock-on changes to the plan

- **Section 3.2 paragraph 6 / Section 12.1**: Free-tier capacity math.
  - Plan claim: ~1,500 requests/day → ~250 unique projects/day.
  - Actual as of 05/18/2026: Google reduced free quotas 50–80% in 12/2025; free-tier image generation is ~500 images/day. At ~6 calls per project (1 base + 5 actions), that is **~80 projects/day per API key**.
- **Section 12.2**: Paid pricing.
  - 2.5-flash-image: $0.039 / image (legacy reference).
  - 3.1-flash-image-preview: ~$0.067 per 1K output, more flexible resolutions.
  - Recompute the "100 active users × 10 generations / month" figure in Section 12.2 with the new per-image price before publishing any cost statement.
- **About page copy (Section 8, Phase 3)**: Replace references to "Gemini 2.5 Flash Image (nano-banana)" with "Gemini 3.1 Flash Image (Nano Banana 2)" and update the verified-reference list in Section 13.5.

---

## Amendment 2 — Adopt Fluid Compute and raise function timeout

### What changes

- **Plan says:** `vercel.json` sets `maxDuration: 60` for all API routes; the route handler enforces a 50-second soft timeout with a 10-second safety buffer (Section 5.2, Section 8 Phase 1).
- **Adopt instead:** Enable Fluid Compute on the Vercel project and set `maxDuration: 300` for image-generation routes. Keep the 50-second soft timeout in the route handler.

### Why

Vercel Hobby's traditional serverless ceiling is 60 seconds, but Fluid Compute (free, opt-in) raises the ceiling to **300 seconds on Hobby**. The 50-second soft timeout in the plan was a workaround for the 60-second ceiling; with a 300-second envelope, that workaround becomes a **fast-fail UX choice** rather than a forced compromise. Users still get a 504 with retry guidance after 50 seconds of Gemini slowness, but transient model-side latency spikes between 50 and 300 seconds no longer cause unrecoverable timeouts at the platform boundary.

### How to apply

1. In Vercel project settings, enable **Fluid Compute** on the project (Settings → Functions → Fluid Compute).
2. Update `vercel.json`:
   ```json
   {
     "functions": {
       "src/app/api/generate-base/route.ts": { "maxDuration": 300 },
       "src/app/api/generate-action/route.ts": { "maxDuration": 300 },
       "src/app/api/health/route.ts": { "maxDuration": 10 }
     }
   }
   ```
3. Leave the in-handler soft timeout at 50 seconds. Document in Section 6.1 / 6.2 error responses that 504s still surface after 50 seconds; the 300-second platform ceiling is a safety net, not a target.
4. Update Section 5.2 paragraph 5 of the plan to read "the 50-second soft timeout is a UX choice, not a platform constraint" so future readers do not infer the timeout from a stale ceiling.

---

## Amendment 3 — Replace in-memory rate limit with Upstash Redis

### What changes

- **Plan says:** Implement `src/lib/rateLimit.ts` as a per-IP token bucket in memory (Section 5.2 step 3, Section 7.5, Section 8 Phase 1).
- **Adopt instead:** Use **Upstash Redis** (via the Vercel Marketplace integration) and the `@upstash/ratelimit` package.

### Why

Vercel serverless functions are stateless and scale horizontally. Each cold-started instance has its own memory. An in-memory token bucket lets two requests hit two different instances and both pass a "1 request/minute" check. Under Fluid Compute, multiple invocations share an instance, which mitigates but does not eliminate the problem during scale-out. A correctly-implemented rate limit requires shared state.

Upstash Redis is available as a free Vercel Marketplace integration (10,000 commands/day, 256 MB storage) — well above the plan's 60 requests/day per IP budget at any plausible session volume. It introduces no new vendor relationship for the developer (auth and billing flow through Vercel).

### How to apply

1. From the Vercel dashboard, add the **Upstash Redis** integration to the project. Vercel automatically writes `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into project environment variables.
2. Add `@upstash/redis` and `@upstash/ratelimit` to `package.json` (commit lockfile).
3. Implement `src/lib/rateLimit.ts`:
   ```ts
   import { Ratelimit } from "@upstash/ratelimit";
   import { Redis } from "@upstash/redis";

   const redis = Redis.fromEnv();
   export const perMinuteLimiter = new Ratelimit({
     redis,
     limiter: Ratelimit.slidingWindow(6, "1 m"),
     analytics: false,
   });
   export const perDayLimiter = new Ratelimit({
     redis,
     limiter: Ratelimit.fixedWindow(60, "1 d"),
     analytics: false,
   });
   ```
4. In each API route, call both limiters keyed on the request IP (Vercel exposes it via the `x-forwarded-for` header — take the first comma-separated value). On rejection, return 429 with `retryAfter` derived from `Ratelimit.reset`.
5. Update Section 7.5 of the plan: rate-limit state is shared via Upstash Redis; rate-limit decisions are correct under horizontal scale.
6. Update `.env.local.example` with the Upstash variables (the Vercel integration manages production / preview).

### Cost impact

Zero. Upstash free tier (10,000 commands/day) ÷ ~2 commands per request × the plan's per-IP limits is multiple orders of magnitude over what a single-user personal tool generates. The free tier carries no card-on-file requirement.

---

## Other adjustments folded in here (small)

| Where | Adjustment | Reason |
|---|---|---|
| Section 7.4 (Prompt engineering) | Cite the current [Nano Banana image-generation docs](https://ai.google.dev/gemini-api/docs/image-generation) as the canonical prompting reference. | The 2.5-era prompting guide is still online but Google's authoritative guidance moved to the new page. |
| Section 7.5 (Security) | Add: distinguish first `x-forwarded-for` IP for rate-limit keying; ignore client-controlled `x-real-ip`. | Prevents trivially-spoofable rate-limit bypass. |
| Section 5.5 step 7(d) | Frame-size unification crops every frame to the **largest** common alpha bounding box (not the largest individual frame's box) before horizontal repack. | Plan already says this; calling it out because it is the single most common bug in production sprite pipelines. |
| Section 10.2 (Legal) | Note SynthID watermarking applies to Nano Banana 2 outputs as well; About-page disclosure language does not change. | Confirms the disclosure is still required after the model swap. |

---

## Phase 0 checklist (revised)

The plan's Phase 0 exit criterion ("pushing to main triggers a successful Vercel deploy of a placeholder homepage") is unchanged. The following preconditions are added before Phase 1 begins:

- [ ] Repository `github.com/CarCar47/sprite-creator` created with MIT license and README skeleton.
- [ ] `create-next-app` scaffold committed (TypeScript, Tailwind, App Router, strict mode).
- [ ] `.gitignore` covers `.env*.local`, `.next/`, `node_modules/`.
- [ ] `.env.local.example` lists `GEMINI_API_KEY`, **`GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview`**, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- [ ] Dependencies pinned: `@google/genai`, `sharp`, `zod`, **`@upstash/redis`**, **`@upstash/ratelimit`**.
- [ ] ESLint + Prettier configured.
- [ ] `.github/workflows/ci.yml` runs lint + typecheck + tests on every PR.
- [ ] Vercel GitHub App connected to the repo.
- [ ] **Fluid Compute enabled** in Vercel project settings.
- [ ] **`vercel.json`** sets `maxDuration: 300` for `/api/generate-base` and `/api/generate-action`, `maxDuration: 10` for `/api/health`.
- [ ] **Upstash Redis integration** added via Vercel Marketplace; env vars auto-populated.
- [ ] `GEMINI_API_KEY` and `GEMINI_IMAGE_MODEL` set in Vercel (Production, Preview, Development).
- [ ] First push to `main` produces a working placeholder homepage at the production URL.

When every box is checked, Phase 1 begins.

---

## Sources (verified 05/18/2026)

- [Gemini API deprecations](https://ai.google.dev/gemini-api/docs/deprecations) — 2.5-flash-image shutdown timeline
- [Nano Banana 2 (Gemini 3.1 Flash Image)](https://aistudio.google.com/models/gemini-3-1-flash-image) — current default model
- [Nano Banana Pro (Gemini 3 Pro Image)](https://blog.google/innovation-and-ai/products/nano-banana-pro/) — premium tier
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) — free-tier quotas as of 2026
- [Nano Banana image-generation docs](https://ai.google.dev/gemini-api/docs/image-generation) — current prompting guidance
- [Vercel Functions duration](https://vercel.com/docs/functions/configuring-functions/duration) — Fluid Compute 300s on Hobby
- [Vercel + Upstash Redis](https://vercel.com/marketplace/upstash) — free integration
- [`@upstash/ratelimit` on npm](https://www.npmjs.com/package/@upstash/ratelimit)
- [`@google/genai` on npm](https://www.npmjs.com/package/@google/genai) — current Google GenAI SDK (the legacy `@google/generative-ai` is deprecated)
