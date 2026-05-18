# Sprite Creator — Execution Plan

**Companion to:** `Sprite-Creator-Engineering-Plan.docx` and `Phase-0-Amendments.md`
**Date:** 05/18/2026
**Purpose:** Stage-by-stage execution plan that maximizes CLI automation and calls out the exact moments Carlos needs to act.

---

## Pre-flight verification (done 05/18/2026)

All required CLIs are installed and authenticated on this machine:

| Tool | Version | Status |
|---|---|---|
| git | 2.51.0.windows.2 | Installed |
| gh | 2.87.3 | Authenticated as `CarCar47` (scopes: `repo`, `read:org`, `gist`) |
| node | 24.7.0 | Installed |
| npm | 11.5.1 | Installed |
| pnpm | 11.1.1 | Installed |
| vercel | 53.1.1 | Authenticated as `carlosramoncardenas-6322` |

**Implication:** I can drive the entire Phase 0 setup from the terminal. Three discrete moments require Carlos to act in a browser — they are listed below.

---

## Updated facts (since the amendments doc)

- **Fluid Compute is enabled by default** on new Vercel projects (since 04/23/2025). On Hobby, the default function execution time is now **300 seconds**, with a 2 GB / 1 vCPU Standard instance. The amendments doc's instruction to "enable Fluid Compute in dashboard" is now a no-op for a freshly created project. I will still write `maxDuration: 300` into `vercel.json` for explicit documentation.
- **Upstash Redis can be provisioned from CLI** via `vercel integration add upstash`. This installs the integration (browser consent on first use per Vercel account), provisions a database, attaches it to the linked project, and writes `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` into project env vars and `.env.local`. **The first install of any marketplace integration on a Vercel account requires a one-time browser consent.**

---

## Carlos-must-do moments (the only three)

These are the things the CLI cannot do for you. Everything else I will execute.

### 1. Obtain the Gemini API key (browser, ~2 minutes)

- Visit https://aistudio.google.com/apikey while signed into the Google account you want to use.
- Click **Create API key** → pick a project (or use the default) → copy the key.
- Paste the key into the terminal when I prompt for it, or set it yourself with:
  ```powershell
  vercel env add GEMINI_API_KEY production
  ```
  (and repeat for `preview` and `development` if you want the same key everywhere).

### 2. Approve the Upstash marketplace consent on first install (browser, ~30 seconds)

- The first time `vercel integration add upstash` runs against your Vercel account, Vercel opens a browser tab asking you to authorize the Upstash integration on your team.
- Click **Authorize**. After this, all future provisioning happens silently from CLI.

### 3. Visual verification after first production deploy (browser, ~1 minute)

- After the placeholder homepage is live, open the production URL Vercel prints and confirm it loads.
- Open `https://<project>.vercel.app/api/health` and confirm it returns `{"status":"ok","version":"...","hasGeminiKey":true}`.
- That confirms environment variables threaded through to the function runtime.

**Optional fourth (only if you ever want a custom domain):** add the domain via `vercel domains add yourdomain.com` and follow Vercel's DNS instructions on your registrar. Out of scope for Phase 0.

---

## What I will do, in order

Each stage is a tight CLI sequence. I do not advance to the next stage until the current one is green. If anything fails, I stop and surface the error.

### Stage A — Repository and git init

```powershell
cd "C:\Users\c_clo\OneDrive\Personal\Coding\sprite-image-generator"
git init -b main
gh repo create CarCar47/sprite-creator --public --license MIT --description "AI-powered sprite generator for Unity 2D (Gemini + Next.js + Vercel)"
git remote add origin https://github.com/CarCar47/sprite-creator.git
```

Outcome: empty MIT-licensed public repo at `github.com/CarCar47/sprite-creator`, local working tree connected to it.

### Stage B — Next.js scaffold

```powershell
pnpm create next-app@latest . --typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --use-pnpm --no-turbopack
```

Notes:
- Scaffolds into the current directory (already contains the two planning docs; `create-next-app` warns but proceeds when the dir has unrelated files).
- `--src-dir` matches the plan's `src/app/...` import paths.
- Turbopack is disabled for now to avoid `sharp` edge-case interactions; can be re-enabled in Phase 3 if everything is stable.

### Stage C — Dependencies

```powershell
pnpm add @google/genai sharp zod @upstash/redis @upstash/ratelimit jszip
pnpm add -D prettier eslint-config-prettier @types/jszip vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom @vitejs/plugin-react
```

Notes:
- `sharp` ships prebuilt binaries for win32-x64 and linux-x64 (Vercel's runtime); no native-build steps.
- Vitest is chosen over Jest per current Next.js + Vite alignment guidance and faster cold-start for unit-test runs.

### Stage D — Config files

I write all of these via the Write tool, no shell needed:

- `.gitignore` — extends Next.js defaults with `.env*.local`, `.vercel/`, `coverage/`, `dist/`, `.DS_Store`.
- `.env.local.example` — `GEMINI_API_KEY=`, `GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview`, `UPSTASH_REDIS_REST_URL=`, `UPSTASH_REDIS_REST_TOKEN=`.
- `.prettierrc.json` — `{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 100 }`.
- `.prettierignore` — `.next/`, `node_modules/`, `*.docx`, `*.md`.
- `vercel.json` — `{ "functions": { "src/app/api/generate-base/route.ts": { "maxDuration": 300 }, "src/app/api/generate-action/route.ts": { "maxDuration": 300 }, "src/app/api/health/route.ts": { "maxDuration": 10 } } }`.
- `tsconfig.json` — confirm `"strict": true` and `"noUncheckedIndexedAccess": true`.
- `.github/workflows/ci.yml` — Node 24, pnpm cache, runs `pnpm lint`, `pnpm typecheck`, `pnpm test --run`, `pnpm build`.
- `src/app/api/health/route.ts` — minimal handler returning `{ status, version, hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) }`.
- `src/app/page.tsx` — placeholder homepage with project name and a "coming soon" line. Phase 1 replaces it.
- `README.md` — short overview, links to the engineering plan, MIT license note, "this is the v1 placeholder" disclaimer.

### Stage E — First commit and push

```powershell
git add .
git commit -m "Phase 0: scaffold Next.js, configs, health route, CI"
git push -u origin main
```

GitHub Actions kicks off on push; should pass since there is no app logic yet.

### Stage F — Vercel project link and first deploy

```powershell
vercel link --yes --project sprite-creator
vercel git connect
```

`vercel git connect` wires the GitHub repo to the Vercel project so every push to `main` auto-deploys and every PR gets a Preview URL. This is the CLI equivalent of the dashboard "Connect Git Repository" button. Requires `gh` to have already pushed the repo (done in Stage E).

### Stage G — Environment variables

**This is where the first browser moment happens (Carlos action #1: get the Gemini key).**

I will prompt you in the terminal:

> "Paste your `GEMINI_API_KEY` value (input is hidden), or press Enter to skip and set it manually later:"

Then I run:
```powershell
echo $env:GEMINI_API_KEY_INPUT | vercel env add GEMINI_API_KEY production
echo $env:GEMINI_API_KEY_INPUT | vercel env add GEMINI_API_KEY preview
echo $env:GEMINI_API_KEY_INPUT | vercel env add GEMINI_API_KEY development

echo "gemini-3.1-flash-image-preview" | vercel env add GEMINI_IMAGE_MODEL production
echo "gemini-3.1-flash-image-preview" | vercel env add GEMINI_IMAGE_MODEL preview
echo "gemini-3.1-flash-image-preview" | vercel env add GEMINI_IMAGE_MODEL development
```

If you skip the key paste, I write a `TODO-secrets.md` with the exact three commands you need to run when you do have it.

### Stage H — Upstash Redis integration

**This is the second browser moment (Carlos action #2: one-time Upstash consent).**

```powershell
vercel integration add upstash
vercel env pull .env.local
```

The first run opens a Vercel browser tab once; after that, the rest of the integration completes from CLI. `vercel env pull` syncs the newly-provisioned `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into `.env.local` for local dev.

### Stage I — Trigger production deploy

```powershell
vercel deploy --prod
```

(With Git Connect in place, a `git push` would also trigger a prod deploy; running `vercel deploy --prod` from the CLI is faster for this first manual smoke.)

### Stage J — Smoke test

```powershell
$prod = (vercel ls sprite-creator --prod --json | ConvertFrom-Json)[0].url
curl "https://$prod/api/health"
```

Expected: `{"status":"ok","version":"0.1.0","hasGeminiKey":true}`.

**This is the third and final browser moment (Carlos action #3: eyeball the homepage and the health endpoint).**

---

## Failure modes I'm prepared for

| Stage | Failure | What I do |
|---|---|---|
| A | `gh repo create` says repo already exists | Stop and ask: rename or use existing? |
| B | `create-next-app` refuses because directory not empty | Move planning docs to `docs/` first, retry |
| C | `sharp` install fails (rare on Win/Node 24) | Pin `sharp@^0.33`, retry; fall back to `npm install --build-from-source` if needed |
| F | `vercel link` cannot find project | Run `vercel project add sprite-creator` first |
| G | `vercel env add` rejects empty value | Skip with `TODO-secrets.md` and continue |
| H | Upstash consent denied / closed tab | Skip; document follow-up commands in `TODO-integrations.md` and continue without the rate limiter (Phase 1 work can still proceed) |
| I | Build fails on Vercel | Pull logs with `vercel logs <deployment>` and surface the first error |
| J | `/api/health` returns `hasGeminiKey: false` | Verify env scopes with `vercel env ls` and re-add if scoped wrong |

---

## After Phase 0 (preview of who-does-what in later phases)

| Phase | My share | Your share |
|---|---|---|
| 1 — Base character generation | All code, tests, local + Vercel smoke | Visual review of generated base sprite quality on real Gemini API |
| 2 — Action sprite sheets | All code, tests, Vercel smoke | Visual + Unity import review of one action end-to-end |
| 3 — Polish & reliability | All code, axe + Lighthouse audits | Final eyeball on the About / Unity-import guide copy |
| 4 — Stretch (optional) | Code if/when prioritized | Decide which stretch items, if any, ship |

The pattern: **I do the build; you do the perceptual / domain-quality gates** (does the sprite look right, does Unity actually import it cleanly, does the documentation read correctly to a human game developer).

---

## Time estimate for Carlos in Phase 0

- Gemini key fetch: ~2 minutes (browser)
- Upstash consent click: ~30 seconds (browser)
- Final smoke verification: ~1 minute (browser)

**Total user-active time: under 5 minutes.** Everything else is me on the terminal, with progress reports.

---

## Ready signal

When you reply "go" (or any equivalent), I begin Stage A and run through to Stage J without stopping for clarification, surfacing errors as they happen. I will not advance past Stage G if you do not provide the Gemini key, but I will leave everything else in a deploy-ready state and write the `TODO-secrets.md` so you can finish it later in one paste.
