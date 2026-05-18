# Phase 2 — Action Sprite Sheets

**Companion to:** `Sprite-Creator-Engineering-Plan.docx` Section 8 Phase 2, with adjustments from `Phase-1.5-Provider-Refactor.md`.
**Date:** 05/18/2026
**Goal:** From an accepted base character, generate animated sprite sheets for seven actions (idle, walk, run, jump, attack, hurt, death) at user-selectable frame counts, with each frame uniformly cropped, repacked horizontally, and accompanied by a Unity-importable JSON manifest. End-to-end: type description → accept base → pick action+frames → preview animation → download ZIP that imports into Unity 6 with no manual edits.

## Adjustments since the original plan

| Original plan | Phase 2 reality |
|---|---|
| Gemini multi-reference for ~80% identity preservation | Free providers (HF FLUX.1-schnell, Pollinations) have no native multi-image reference. Fall back to seed reuse + verbatim prompt restatement. Realistic target: 50–60% per-frame identity. |
| One model call per action returns a 2x2 / 3x3 grid | Same approach works on FLUX, but free models honor "grid of N cells with these poses" instructions less reliably. Keep grid generation; add a per-cell fallback path for providers that fail to honor the grid spec. |
| Chroma-key gives clean alpha edges | FLUX leaves a near-color halo around silhouettes. Need bg-cleanup improvement before action grids look acceptable (see Phase 1.6). |

## Phase 1.6 — Pre-Phase 2 quality fix (required gate)

The chroma-key halo visible in `docs/phase1.5-hf-sample.png` will multiply across 4-16 frames in an action grid. Fix this once before building the grid pipeline.

**Two options, pick one:**

- **1.6-A (cheap, 10 min):** Bump default tolerance in `src/lib/chromaKey.ts` from 60 to 90. Risk: may eat character pixels that share color with the chroma background. Acceptable for green bg if characters avoid neon-green features; we already offer a magenta alternative.
- **1.6-B (proper, 2-3 hours):** Add `@imgly/background-removal-node` as a real semantic segmentation pass. Runs on a 30 MB ONNX model in the Node runtime. Works regardless of background color. Provider chroma-key becomes a fallback / pre-pass.

Recommendation: start with 1.6-A. If real-world action grids still look bad, swap to 1.6-B in Phase 2.

## Phase 2 work items (in build order)

### 2.1 Action prompt templates (~30 min)

`src/lib/prompts/actions/{idle,walk,run,jump,attack,hurt,death}.ts` each export a function `buildActionPrompt(input)` that produces:

1. Grid specification: "Compose a 2x2 grid of 4 frames" / "3x3 grid of 9 frames" based on requested frame count
2. Per-cell pose table: "Frame 1: character in neutral stance. Frame 2: weight shifted to right leg. Frame 3: weight shifted to left leg. Frame 4: return to neutral."
3. Identity-lock clause restating the base character's description verbatim
4. Style + chroma-key constraints inherited from the base
5. Strict negative guidance (no text, no border, no separator lines, etc.)

Frame counts and grid layouts:
- 4 frames → 2x2
- 8 frames → 4x2
- 9 frames → 3x3
- 16 frames → 4x4

### 2.2 Sprite sheet image processing (~2 hours)

`src/lib/spriteSheet.ts`:
- `sliceGrid(buffer, cols, rows)` → returns array of per-frame buffers
- `findCommonAlphaBox(frames)` → returns the largest bounding box that contains every frame's non-transparent region
- `cropAllToBox(frames, box)` → uniform-crop every frame to that box
- `repackHorizontal(frames)` → composite N frames left-to-right into one wide PNG

Sharp APIs: `extract` for cropping, `composite` for repacking with explicit `left` offsets.

### 2.3 Unity manifest (~30 min)

`src/lib/manifest.ts`:
```ts
export interface Manifest {
  frame_count: number;
  frame_width: number;
  frame_height: number;
  columns: number;    // after horizontal repack, always = frame_count
  rows: number;        // always 1 after repack
  fps: number;         // per-action default: idle=4, walk=8, run=12, jump=10, attack=8, hurt=4, death=4
  pivot: { x: number; y: number };          // (0.5, 0.5) default
  pixels_per_unit: number;                  // from PPU_BY_STYLE
  filter_mode_hint: "Point" | "Bilinear";
  generated_at: string;
  model_version: string;
  provider: ProviderId;
  prompt_hash: string;
  action: ActionKey;
}
```

### 2.4 `/api/generate-action` route (~1 hour)

`src/app/api/generate-action/route.ts`:
1. Validate payload with zod (action, frameCount, base64 base image, style, chromaColor, optional provider/seed)
2. Per-IP rate limit (already in place)
3. Build action prompt
4. Call provider:
   - If provider supports reference: `generateFromTextAndReference(prompt, baseImage)`
   - Otherwise: `generateFromText(prompt, { seed: storedSeed })` with the base description restated in the prompt
5. Chroma-key the entire returned grid
6. Slice grid into per-frame buffers
7. Find common alpha box, uniform crop
8. Repack horizontally
9. Build manifest
10. Return `{ sheet: data-url, manifest }` JSON with same error mapping as `/api/generate-base`

### 2.5 UI — action selector + animation preview (~2 hours)

Extend `src/components/GenerateForm.tsx` (or create a sibling `ActionPanel`):
- Unlocks after a base character is **Accepted** in Phase 1
- Action picker (radio cards): idle / walk / run / jump / attack / hurt / death with a one-line description each
- Frame count picker: 4 / 8 / 9 / 16
- Generate button per action (reuses the same base)
- Result preview: CSS-driven `background-position` animation playing the sprite strip at the manifest's FPS
- Per-action history: thumbnail strip of generated actions in this session
- Each action stored under `spriteCreator.actions[{actionKey}]` in sessionStorage

### 2.6 ZIP download (client-side, no roundtrip) (~30 min)

Top-level "Download all" button that uses `jszip` (already installed) to bundle:
- `character_base.png`
- `{action}.png` per action
- `{action}.json` per action manifest
- A `README.txt` with Unity import steps (copy of the import guide from Section 9 of the plan)

### 2.7 Tests (~1 hour)

- `spriteSheet.test.ts`: synthetic 4-cell PNG fixture; verify slice/crop/repack produces expected dimensions
- `manifest.test.ts`: pure-data assertions for each action's default FPS, pivot, PPU mapping
- `prompts/actions/*.test.ts`: string assertions per action (grid spec present, identity-lock clause present, frame count matches)
- Integration test that mocks the provider's `generateFromText` to return a 4-cell fixture grid and runs the route end-to-end

### 2.8 Identity-preservation strategy (woven through the above)

- On `Accept as base` in Phase 1, store `{seed, description, style, chromaColor}` in sessionStorage alongside the image
- Every action call sends the stored seed (where provider supports it) plus restates the description verbatim in the prompt
- Provider interface gets an optional `supportsSeed: boolean` field; HF FLUX schnell supports seed; Pollinations supports it; Gemini ignores it (uses reference image instead)

### 2.9 Provider-specific reference handling

- `gemini`: passes the base PNG as a reference image (existing `generateFromTextAndReference`)
- `huggingface`: option to switch to `black-forest-labs/FLUX.1-Kontext-dev` (HF's reference-conditioned variant) when `provider === "huggingface"` AND the user opts in; default stays on FLUX.1-schnell with prompt + seed
- `pollinations`: pass the base via `?image=<data-url>` query parameter (Pollinations supports img2img this way)

This is the optional polish — Phase 2 ships with prompt+seed working first; reference conditioning is a follow-up bump.

### 2.10 Unity 6 import smoke (~30 min)

- Generate one complete action set
- Download the ZIP
- Open Unity 6 (Carlos's responsibility)
- Run through Section 9.3 / 9.4 of the engineering plan
- Confirm: PNG imports as Sprite Mode Multiple, Grid By Cell Count uses manifest values, animation clip plays at the documented FPS

## Estimated total

| Block | Time |
|---|---|
| Phase 1.6 fix | 10 min – 3 hrs depending on option |
| 2.1 prompts | 30 min |
| 2.2 sprite sheet pipeline | 2 hrs |
| 2.3 manifest | 30 min |
| 2.4 route | 1 hr |
| 2.5 UI | 2 hrs |
| 2.6 ZIP | 30 min |
| 2.7 tests | 1 hr |
| 2.8–2.9 identity/provider polish | bundled into above |
| 2.10 Unity smoke | 30 min (mostly Carlos) |
| **Total dev** | ~8–11 hrs |

## Exit criterion

From the homepage, using the HuggingFace provider:
1. Type a character description → Generate → Accept
2. For each of the 7 actions, pick a frame count → Generate → see animated preview
3. Download all → unzip → drag PNGs + JSONs into Unity 6
4. Slice each sheet with Grid By Cell Count using manifest values
5. All 7 clips play smoothly at the documented FPS
6. The character is recognizable across actions (target: a human reviewer says "same character" 50–60% of the time on first try; user regenerates as needed)
