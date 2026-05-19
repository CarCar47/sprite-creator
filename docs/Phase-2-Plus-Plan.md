# Phase 2+ Plan — Stronger bg-removal, Action coherence, Sprite Importer

**Date:** 05/18/2026
**Three asks from Carlos:**
1. Bg-removal stronger than Gentle still leaves the subject partially transparent — need a tier below Gentle (or off entirely)
2. Phase 2 actions are still chaos — character changes between frames AND the requested action isn't actually being performed
3. **New feature:** Upload an existing sprite sheet (rows = actions, cols = frames), label each row with its action, and the system packages each row as a Unity-importable PNG + JSON + ZIP

---

## A. Bg-removal: add two more conservative tiers

Current presets:
| | tol hint | tol detected | erosion |
|---|---|---|---|
| gentle | 40 | 30 | 0 |
| balanced | 80 | 50 | 2 |
| aggressive | 120 | 80 | 3 |

Adding:
| | tol hint | tol detected | erosion | notes |
|---|---|---|---|---|
| **minimal** | 20 | 15 | 0 | Only nukes pixels that are very nearly exact-match to the bg. Most fragile subjects stay intact. |
| **none** | — | — | — | Returns the raw image with no bg removal. Useful if the user wants to do it themselves in Aseprite/Photoshop, or if the model already produced clean transparency. |

UI: the existing 3-button selector becomes a 5-button selector. Five buttons fit fine in the same row on desktop, wrap to two rows on mobile. Help text updated per tier.

**Estimated time:** 10 minutes. Pure config change + UI button list.

---

## B. Action coherence — three improvements

### B.1 — Tighten the per-frame prompts with stronger motion language

Current per-frame prompts describe pose like "side view facing right, walking. Left foot planted under the body, right foot lifted at knee height." This is abstract — diffusion models often misinterpret abstract motion descriptions.

Replace with concrete imagery prompts the model has seen in training:
- Before: "side view facing right, running. Right foot striking the ground..."
- After: "DYNAMIC ACTION SHOT, captured mid-stride. The character is running like an Olympic sprinter, side view profile, right leg fully extended forward at heel strike, left leg pushed back. Motion blur is NOT in the image — this is a single crisp action frame."

Adds explicit phrases the model treats as motion cues:
- "DYNAMIC ACTION SHOT"
- "captured mid-[action]"
- Comparative real-world references ("like an Olympic sprinter", "like a fencer mid-thrust")
- Explicit body part positions in concrete terms ("right leg fully extended forward", not "knee at peak")

**Estimated improvement:** 20-40% better pose recognizability on FLUX.1-schnell. Free, no model change.

### B.2 — Test if FLUX.1-dev is free on HF Inference Providers

FLUX.1-dev is a much more capable model than FLUX.1-schnell:
- 50 inference steps vs 4
- Better understanding of complex pose / motion descriptions
- ~3-4x slower per call but visibly better output

HF docs are ambiguous about whether FLUX.1-dev is on the free tier (`hf-inference` provider) or paid only. The only way to know: try a real call with our HF_TOKEN and see whether it returns 200 or 402/429.

If free: add an opt-in model toggle in the Action Panel: **Schnell (fast)** vs **Dev (higher quality)**. Carlos can pick per-action.

If paid: skip and rely on B.1 + B.3.

**Estimated time:** 30 minutes (test + wire toggle if available).

### B.3 — Pose reference image library (optional, free)

We can prebuild a small library of stick-figure / silhouette pose references (one PNG per pose, per action, ~16 PNGs per action × 7 actions = 112 small images committed to the repo). Pass the appropriate pose reference as the "image" parameter to providers that support image-conditioned generation (Pollinations and Gemini).

But this only helps providers with image-reference support; HF FLUX.1-schnell free doesn't, so the most-used path doesn't benefit. **Skip unless B.1 + B.2 prove insufficient.**

### B.4 — Honest expectation

Without paid Kontext-dev (FLUX-based image-to-image with character consistency, $0.04-0.07/image), there is a fundamental ceiling on action pose quality on free tier. B.1 and B.2 together should get us to "the action is recognizably what was asked for in most generations, with regenerate working for misses." We will not reach "always works first try" without spending money.

---

## C. Sprite Sheet Importer — new feature

User flow:
1. New section/tab at the top of the homepage: **"I already have a sprite sheet — package it for Unity"**
2. Drag-drop or pick a PNG file
3. Preview shown with overlay grid lines based on detected dimensions
4. User inputs:
   - **Rows** (number of actions in the sheet)
   - **Frames per row** (assumes uniform — most existing sheets are uniform; allow per-row override if needed)
   - **For each row:** action name (free text with a quick-pick list of the 7 standard actions) + optional fps override + optional pivot override
5. Click **Package for Unity**
6. Server slices per row, runs the same uniform-crop + horizontal-repack pipeline we already have, returns N rows of `{sheet, manifest}`
7. Client builds ZIP exactly like the generated path (one PNG + one JSON per row, plus a unified UNITY_IMPORT.txt)

### What it does NOT do
- No re-generation of sprites
- No AI involvement
- No background removal (the assumption is the user's sheet already has transparency; if not, they can run a separate bg-removal first — we'll add an optional "remove background" toggle in the form that applies our existing pipeline before packaging)

### New code

**`src/lib/spriteSheet.ts`** — already has the slicing helpers. Add:
- `sliceGridByRowsCols(buffer, rows, cols)` — same as `sliceGrid` but explicit rows/cols arg and returns frames grouped by row
- `packageRow(frames, options)` — wraps the existing compose pipeline for a single row

**`src/lib/validators.ts`** — new schema:
```ts
export const ImportRowSchema = z.object({
  action: z.string().trim().min(1).max(40),
  fpsOverride: z.number().int().min(1).max(60).optional(),
  pivot: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const ImportRequestSchema = z.object({
  image: DataUrlPngSchema,
  rows: z.number().int().min(1).max(12),
  cols: z.number().int().min(1).max(32),
  style: StyleSchema,
  removeBackground: z.boolean().default(false),
  chromaColor: ChromaColorSchema.default("#00FF00"),
  bgRemoval: BgRemovalStrengthSchema.default("balanced"),
  rowLabels: z.array(ImportRowSchema), // length must equal rows
});
```

**`src/app/api/package-sprite/route.ts`** — new endpoint:
1. Validate payload
2. Decode the uploaded PNG
3. Optionally run bg removal (single pass on the whole sheet)
4. For each row:
   - Slice that row into `cols` frames
   - Run the existing common-bbox + uniform-crop + horizontal-repack
   - Build a manifest with the user-supplied action name + fps (default 8 if custom, otherwise from `DEFAULT_FPS_BY_ACTION` if the action is one of the 7 standard)
5. Return `{ rows: [{action, sheet, manifest}, ...] }`

**`src/components/SpriteImporter.tsx`** — new component:
- Drag-drop file area
- Image preview with overlay grid
- Rows/cols inputs
- Per-row: action input (datalist with 7 standard actions for quick pick), fps override
- "Package for Unity" button
- Result preview with per-action thumbnails and an aggregate "Download all" ZIP button

**`src/app/import/page.tsx`** — dedicated route (or embed in homepage as a collapsible section above the Generate form).

### Manifest changes for custom actions

Currently `action: ActionKey` (enum of 7 standard). Need to either:
- Widen to `action: string` (lose type safety) → simplest
- Add `actionLabel: string` field alongside `action: ActionKey | "custom"` → preserves type safety

Recommend: widen to `string`. The 7 standard actions are still valid; custom ones now work too. Add a comment in the type that custom actions get default fps=8 unless overridden.

### Carlos's cleric example

`cleric-transparent (3).png` is 5 rows × 8 cols. He'd:
1. Drop the image in
2. Set Rows=5, Frames per row=8
3. Label rows: "attack" / "hurt" / "idle" (or custom "protection") / "death" (or custom "fatal") / "death"
4. Hit Package
5. Get 5 PNG strips + 5 manifests + 1 UNITY_IMPORT.txt, all in a ZIP

**Estimated time:** 2-3 hours for the importer feature end-to-end.

---

## Recommended execution order

1. **A** (bg-removal Minimal/None tiers) — 10 min, immediate quality fix for fragile subjects
2. **B.1** (tighten action prompts) — 30 min, free quality bump
3. **B.2** (test FLUX.1-dev availability) — 30 min, biggest potential win if free
4. **C** (sprite importer feature) — 2-3 hours, gives you a productive path forward even while AI action quality is being tuned

Total: ~4-5 hours. Each step deploys independently so you can test along the way.

---

## What I won't do without your say-so

- Spend $ on paid providers (Kontext-dev, fal.ai, Replicate)
- Restructure the existing /api/generate-action route beyond the prompt-text tweaks in B.1
- Change the homepage layout drastically (the importer will be a clearly-labeled section, not a takeover)

## Question for you

You said "the action isn't being done." Is that **on Careful mode** or **on Fast mode**? If Careful mode also produces non-recognizable actions, then B.1 + B.2 are the next move. If Fast mode is what you tested and Careful is better but slow, the answer might be: just default to Careful and accept the wait. I'm going to assume **Careful** based on context, but tell me if I'm wrong before I rebuild the action prompts.

Tell me to **go** and I'll execute A → B.1 → B.2 → C in order. Or pick a subset.
