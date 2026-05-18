# Phase 1.5 — Provider Abstraction Refactor

**Date:** 05/18/2026
**Trigger:** Production smoke surfaced that Google has stripped image-generation free-tier quota (`limit: 0`) from new API keys. The "free" claim in the original plan was therefore unreachable as written.
**Goal:** Replace Gemini-only image generation with a pluggable provider system so the app can ship on a truly-free path and add/swap providers later without touching the API contract.

## What changes

### Architecture

```
[ UI: provider dropdown ]
        │
[ /api/generate-base ]  ← unchanged request/response shape
        │
[ ProviderRegistry.get(id) ]
        │
   ┌────┴───────────────────────────────┐
   ▼                ▼                    ▼
Pollinations    HuggingFace          Gemini
 (truly free,    (free w/ token,     (paid, kept
  no token)       FLUX.1-schnell)     for later)
        │
[ chroma-key → trim → meta ]  ← unchanged
        │
[ data URL + meta JSON ]
```

### New module layout

```
src/lib/providers/
  types.ts           Interface + ProviderError + ProviderId enum
  registry.ts        getProvider, listAvailableProviders
  pollinations.ts    No-auth GET to image.pollinations.ai
  huggingface.ts     Bearer-token POST to HF Inference API
  gemini.ts          Moved from src/lib/gemini.ts, refactored to interface
```

### Default provider selection

- Server reads `IMAGE_PROVIDER` env var if set, else picks first available from this priority order: `huggingface` → `pollinations` → `gemini`.
- Client sends an optional `provider` field in the request body; server validates it against the available registry.
- A provider counts as "available" if its required env vars are present (HF_TOKEN for HuggingFace, GEMINI_API_KEY for Gemini, none for Pollinations).

### API contract (unchanged from Phase 1)

Request:
```json
{
  "description": "string",
  "style": "pixel32",
  "chromaColor": "#00FF00",
  "provider": "huggingface" // NEW, optional
}
```

Response (success):
```json
{
  "image": "data:image/png;base64,...",
  "meta": { "width": N, "height": N, "generatedAt": "...", "model": "...", "provider": "...", "ppu": 32, "style": "pixel32" }
}
```

Response (error): same HTTP code mapping as Phase 1 (400 / 422 / 429 / 500 / 502 / 504) plus new `provider_unavailable` (424) for "you asked for a provider whose env vars aren't set."

### Health endpoint extension

`/api/health` gains a `providers` field listing which providers are available and which is the current default:

```json
{
  "status": "ok",
  ...
  "providers": {
    "available": ["pollinations", "huggingface"],
    "default": "huggingface"
  }
}
```

### UI

`GenerateForm` gains a provider dropdown at the top of the form. Options come from a fetch to `/api/health` on mount. Selection persists in sessionStorage. If only one provider is available, the dropdown still renders for transparency but is disabled.

## Tradeoffs being accepted

| Concern | Gemini (paid) | HF FLUX.1-schnell (free) | Pollinations (free, no auth) |
|---|---|---|---|
| Cost | $0.04/image | ~$0.003/image (free credits cover ~100/mo) | $0 always |
| Quality on chroma-key prompts | High; follows "solid #00FF00 background" | Medium; may produce gradient/non-uniform bg | Variable; depends on server routing |
| Character consistency (Phase 2) | Native via multi-image reference | Not native — requires ControlNet/IP-Adapter | Not native |
| Reliability | High | High (paid endpoint) | Community-run, occasional slowness |

**Practical consequence for Phase 2 (action sheets):** Without Gemini's reference-image conditioning, identity preservation across action frames drops from the planned ~80% target to roughly ~50–60%. We mitigate by (a) reusing the same seed where the provider supports it, (b) including the base character's description as text in every action prompt, and (c) considering an opt-in upscale/refine pass per frame. Real-world result: the user will regenerate more often, but the cost is $0.

**Practical consequence for chroma-key:** Free models are less reliable about producing a uniform background fill. We compensate by (a) raising the default tolerance to 60 for non-Gemini providers, (b) enabling 1-pixel alpha erosion (`defringe: true`) by default, and (c) leaving the door open for a Phase 3 background-removal pass via `@imgly/background-removal-node` if quality is still insufficient.

## Files touched

| File | Change |
|---|---|
| `src/lib/providers/types.ts` | NEW — `ImageProvider`, `ProviderError`, `ProviderId` |
| `src/lib/providers/registry.ts` | NEW — registry + availability detection |
| `src/lib/providers/pollinations.ts` | NEW |
| `src/lib/providers/huggingface.ts` | NEW |
| `src/lib/providers/gemini.ts` | MOVED from `src/lib/gemini.ts`, refactored to interface |
| `src/lib/gemini.ts` | DELETED |
| `src/lib/validators.ts` | ADD `provider` field, `BaseResponseMeta.provider` |
| `src/lib/prompts/baseCharacter.ts` | ADD provider-aware tolerance hint (minor) |
| `src/app/api/generate-base/route.ts` | Use registry instead of direct Gemini import |
| `src/app/api/health/route.ts` | Report providers |
| `src/app/api/health/route.test.ts` | Update tests for providers field |
| `src/components/GenerateForm.tsx` | Provider dropdown |
| `src/lib/chromaKey.ts` | Raise default tolerance to 60; default `defringe: true` |
| `.env.local.example` | ADD `HF_TOKEN`, `IMAGE_PROVIDER`; mark `GEMINI_API_KEY` optional |
| `README.md` | Provider docs |
| `docs/Execution-Plan.md` | Note that Stage G is now optional (no key needed for default path) |

## Provider implementation notes

### Pollinations (`pollinations.ts`)

- Endpoint: `GET https://image.pollinations.ai/prompt/{URL-encoded prompt}?model=flux&width=1024&height=1024&nologo=true&private=true&seed={seed}`
- Returns image bytes (JPEG or PNG) directly in the response body.
- No auth. Rate-limited at the IP level by Cloudflare; our own per-IP limiter sits in front anyway.
- Optional `seed` for partial reproducibility.
- `model=` is a hint; the server may route to whatever model is healthy (their Sana/FLUX/SDXL).

### HuggingFace (`huggingface.ts`)

- Endpoint: `POST https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell`
- Headers: `Authorization: Bearer ${HF_TOKEN}`, `Content-Type: application/json`, `Accept: image/png`
- Body: `{ inputs: prompt, parameters: { width: 1024, height: 1024, num_inference_steps: 4 } }`
- Returns binary image in response body when ready; HTTP 503 with `estimated_time` JSON when the model is cold-loading (single retry after sleep).
- Model is Apache-2.0 licensed; free with HF token. Carlos can sign up at huggingface.co and create a Read token at `huggingface.co/settings/tokens`.

### Gemini (`providers/gemini.ts`)

- Refactor of the existing `src/lib/gemini.ts` to implement the `ImageProvider` interface.
- Disabled (not in `available` list) when `GEMINI_API_KEY` is absent.
- Kept for the day Carlos enables billing — no rewrite needed at that point.

## Verification gate

Before merging:
- 39 existing tests pass
- New tests: provider registry availability, pollinations URL builder, HF request shape, health endpoint reports providers
- Production smoke: hit `/api/generate-base` with `{ provider: "pollinations", description: "..." }` returns 200 + a real PNG
- Production smoke: `/api/health` reports `providers.available` correctly based on which env vars are set

## What Carlos needs to do

- **Definitely:** Nothing for the Pollinations path. The deploy will Just Work after the refactor lands.
- **Optionally:** Sign up at https://huggingface.co (free), create a Read token at https://huggingface.co/settings/tokens, then `vercel env add HF_TOKEN production "" --value "<token>" --yes` (× 3 envs). This unlocks the HuggingFace provider in the dropdown.
- **Cleanup:** Delete the unused Gemini key in Google AI Studio if not planning to enable billing. I'll also remove `GEMINI_API_KEY` from Vercel as part of the deploy so it doesn't sit there orphaned.
