import { buildActionPrompt, type PoseSequence } from "./shared";
import type { ActionPromptInput } from "./types";

const POSES: PoseSequence = {
  title: "death",
  motion:
    "Defeat and collapse: knockback flinch, knees buckling, falling backward, landing on the ground, final motionless pose. One-shot, ends on a fallen sprite that holds.",
  poses: [
    "Front-facing. Knockback flinch: body recoiling from a final hit, arms flailing outward, head thrown back, eyes wide.",
    "Front-facing. Knees buckling: legs giving out, body collapsing downward, arms falling to sides, head dropping forward.",
    "Front-facing. Mid-fall: body in the air falling backward, limbs limp, eyes closed, no longer holding form.",
    "Front-facing. Fallen: character lying on the ground (top of head pointing left or right, depending on side view), limbs splayed, eyes closed, fully motionless. This is the final resting frame.",
    "Front-facing. Initial hit recoil, body arched backward.",
    "Front-facing. Knees starting to fail, body lowering.",
    "Front-facing. Half-collapsed, kneeling.",
    "Front-facing. Fully kneeling, hands on ground.",
    "Front-facing. Falling forward, hands no longer supporting.",
    "Front-facing. Mid-fall forward, face approaching ground.",
    "Front-facing. Just before impact, body horizontal.",
    "Front-facing. Impact moment with ground.",
    "Front-facing. Lying face-down (or side-up), limbs settling.",
    "Front-facing. Final fallen pose, motionless.",
    "Front-facing. Same final pose, no motion (hold frame).",
    "Front-facing. Identical to cell 14 — final still frame.",
  ],
};

export function buildDeathPrompt(input: ActionPromptInput): string {
  return buildActionPrompt(input, POSES);
}
