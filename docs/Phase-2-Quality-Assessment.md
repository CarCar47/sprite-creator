# Phase 2 Quality Assessment — Why Action Sheets Look Wonky

**Date:** 05/18/2026
**Reported symptom:** Phase 1 base characters look great with Gentle bg-removal. Phase 2 actions are "wonky, flashing, identity drifts between frames, body parts disappearing." User asks: is there an industry standard? Can we apply Gentle to actions? What's the right fix?

## Why this is happening (root cause)

The current Phase 2 implementation asks the diffusion model to generate a single grid image (e.g., 1024×1024 split into 2×2 cells) where each cell shows the same character in a different pose. The prompt enumerates per-cell poses and restates the character description.

**This doesn't work on free-tier text-to-image models for three structural reasons:**

1. **No reference-image conditioning.** FLUX.1-schnell, Sana, and SDXL all take a *text* prompt only — they have no idea what your accepted base character actually looks like. "Green dragon with red eyes" produces a different green-dragon-with-red-eyes every time, even with the same seed. Hence the identity drift.

2. **Grid generation is out-of-distribution for these models.** They were trained on single subject-centered images, not on multi-cell sprite sheets. Asking them to produce four coherent versions of the same character in a 2×2 layout is a prompt-engineering hack the model was never trained for. It often interprets cells as a single chaotic composition.

3. **No temporal continuity.** Each cell is rendered independently — the model doesn't know cell 2 should be "between" cells 1 and 3. Hence the flashing / back-and-forth / disappearing-parts effects.

## What the industry actually does

The canonical pipeline for AI sprite animation (per the *Sprite Sheet Diffusion* arXiv paper, the ComfyUI community, and tools like Scenario / PixelLab):

1. **Per-frame generation** (one diffusion call per frame, not one for the whole sheet).
2. **ReferenceNet or IP-Adapter** to condition every frame on the same reference image (the base character). Industry uses denoising strength 0.3–0.5 for character work.
3. **ControlNet OpenPose** to provide a skeleton/pose template per frame — the model fills in *this character* doing *this pose*.
4. **Composite frames** into a horizontal strip server-side (same as we already do).

The reason commercial tools (PixelLab, Scenario, Spritebrew) charge per generation is that this is fundamentally an N-times-more-expensive operation than text-only.

## Available models on HuggingFace for character-consistent edits

| Model | Free on HF Inference? | Notes |
|---|---|---|
| `black-forest-labs/FLUX.1-schnell` (text-to-image) | Yes (default) | What we use today. No reference support. |
| `black-forest-labs/FLUX.1-Kontext-dev` (image-to-image, character consistency) | **No** — routed through fal.ai / Replicate / Together / BFL (all paid, ~$0.04–0.07/image) | Designed for this exact problem. License is non-commercial only. |
| `black-forest-labs/FLUX.2-dev` (image-to-image) | **No** — fal.ai / Replicate / Wavespeed only (paid) | |
| `briaai/RMBG-1.4` (segmentation) | Yes via Inference | Background removal, not character generation. |

So on the strictly-free tier, **HuggingFace itself does not serve a true image-to-image model.**

## Pollinations supports image-conditioned generation

Pollinations.ai is free, no signup, supports `?image=<URL>` for reference-image-conditioned generation on specific models (`nanobanana`, `seedream`, `kontext`). This is a real img2img path on the free path we already have.

Caveats:
- Pollinations is community-run and shares rate limits with all Vercel egress IPs (we already handle this with one retry).
- We'd be passing a ~700 KB base64 base image per frame call.
- Pollinations doesn't expose a denoising-strength knob in their public docs — quality of preservation depends on their internal setting.

## Three concrete options, with honest tradeoffs

### Option A — Per-frame mode with provider-appropriate reference

Add a **Quality mode** toggle in the Action Panel: **Fast** (current grid mode) vs **Careful** (per-frame).

In Careful mode, for each frame:
- **Pollinations provider**: call `image.pollinations.ai/prompt/{pose}?model=kontext&image=<base-url>` — true image-conditioned per-frame generation, free.
- **HuggingFace provider**: textToImage per frame with detailed pose description + character description repeated verbatim, same seed. No reference image (free HF doesn't support it), but per-frame composition is structurally better than grid because each frame gets the full canvas + a focused single-pose prompt.
- **Gemini provider** (if user enables billing later): already wired for `generateFromTextAndReference`. Use the base PNG as inline reference for every frame.

Server then composites the N frame buffers exactly the same way it composites grid cells today (slice → uniform crop → horizontal repack).

**Pros:**
- True image conditioning on the Pollinations path → dramatic identity-preservation improvement
- Each frame's prompt is single-pose, single-subject → no grid hallucinations
- Reuses 100% of our existing image-processing pipeline
- Inherits Gentle / Balanced / Aggressive bg-removal automatically (your second ask)

**Cons:**
- N times slower (4 frames × 8s = ~32s; 16 frames × 8s = ~128s)
- N times more API credits — at 4 frames per action × 7 actions = 28 calls per character, vs ~7 today. Still under HF monthly free credits but uses more.
- Pollinations img2img on the free path may itself be flaky; we'd retry the same way we retry text-to-image today
- 16-frame Careful mode might exceed the 300 s function ceiling — limit Careful to 4/8/9 frames; auto-fall-back to Fast for 16.

### Option B — Stay on grid mode, improve the prompt

Restructure the per-cell instructions: explicit fixed direction ("ALL CELLS show the character facing right"), explicit identical clothing list, more aggressive negative guidance against "different character per cell." Add a sketch of expected cell content.

**Pros:**
- No new code paths, no extra API calls
- Same cost / speed as today

**Cons:**
- Without reference-image conditioning, this is incremental at best. Diffusion models do not honor "the same character" from text. Realistic improvement: ~10–20% better. Won't fix the fundamental flashing/drift problem.
- Returning diminishing prompt-engineering returns at this point.

### Option C — Opt-in paid provider for action quality

Add a `FAL_AI_TOKEN` or `REPLICATE_TOKEN` env var. When present, route action generation through FLUX.1-Kontext-dev (image-to-image, character consistency). Keep Pollinations / HF as defaults; the paid provider only activates if you set up an account.

**Pros:**
- Industry-standard quality. Identity preservation on par with Gemini.
- ~$0.04–0.07 per frame. A typical session (7 actions × 4 frames = 28 calls) = $1.10–$2 per character.

**Cons:**
- Requires signup and billing on yet another provider.
- Per-image cost adds up if you iterate heavily.
- Adds another provider class to maintain in the registry.

## What about applying "Gentle" to actions

Yes, and we'll get this for free with any of the above options — the action route reads `bgRemoval` from the request, and the UI inherits it from the accepted base via sessionStorage (already wired in the last commit). The bg-removal strength is per-character today, applied uniformly to base and every action of that character. **No additional work needed.**

That said, "Gentle" alone won't fix the wonky animation — the wonkiness is from the model rendering different characters in different cells, not from bg-removal eating subject pixels. Gentle is the right answer for "I see the checker pattern through the character"; per-frame generation (Option A) is the right answer for "the character keeps changing between frames."

## My recommendation

**Implement Option A (per-frame mode with Quality toggle).** Pollinations img2img is the realistic free path; HF per-frame text is the fallback; Gemini-with-reference is already wired and works the moment billing is on. Option B is a dead end. Option C is worth adding later as a paid-quality opt-in but Option A should land first.

Concrete plan if you say yes:

1. **`ActionRequest`** gains `qualityMode: 'fast' | 'careful'` (default `'careful'` since that's the better default).
2. **Provider interface** gains `generateFromTextAndImageRef(prompt, refImageUrl, opts)` for providers that support remote image references via URL.
3. **Pollinations provider** implements `generateFromTextAndImageRef` using `?image=<url>` (and we use the base data URL directly — Pollinations accepts both URLs and data URLs).
4. **HF provider** implements per-frame `generateFromText` per pose (no reference; same seed; detailed prompt).
5. **New `src/lib/prompts/actions/perFrame.ts`** builds one focused prompt per frame from the existing pose tables.
6. **`/api/generate-action` route** branches:
   - `qualityMode === 'fast'`: current grid mode unchanged
   - `qualityMode === 'careful'`: loop N times, call the right provider method per frame, collect buffers, run the existing slice/crop/composite pipeline against the collected buffers (slice step skipped — frames already separated).
7. **`ActionPanel.tsx`** gets a Quality toggle next to Frame Count, defaulting to Careful, with a hint about the speed/quality tradeoff.
8. **Force `qualityMode = 'fast'` for `frameCount = 16`** to stay under 300 s function timeout.
9. **Tests + lint + typecheck + build + deploy.**

Estimated time: 90 minutes of implementation. End result should be visibly more coherent action sheets, especially on the Pollinations path.

Tell me to proceed (or pick a different option) and I'll execute.
