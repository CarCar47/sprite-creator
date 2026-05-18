import { buildActionPrompt, type PoseSequence } from "./shared";
import type { ActionPromptInput } from "./types";

const POSES: PoseSequence = {
  title: "hurt",
  motion:
    "Recoil from a hit: impact flinch, stagger back, brief pain pose, recovery toward neutral. The character does NOT fall — they remain standing. Not a loop.",
  poses: [
    "Front-facing. Impact flinch: head snapping back, arms thrown up defensively, torso recoiling, eyes closed or grimacing in pain. Feet still planted.",
    "Front-facing. Stagger back: body leaning backward, one foot stepping back to catch balance, arms still raised, expression pained.",
    "Front-facing. Pain hold: body bent slightly forward now, one hand on hurt area (chest or stomach), expression grimaced, weight on one leg.",
    "Front-facing. Recovery: body straightening back up, arms lowering, expression returning to neutral but still slightly tense. Ready to return to idle.",
    "Front-facing. Initial flinch, head turning to the side.",
    "Front-facing. Recoil peak, body bent backward.",
    "Front-facing. Stagger left, off-balance.",
    "Front-facing. Stagger right, regaining balance.",
    "Front-facing. Pain pose, one knee buckling.",
    "Front-facing. Bracing against pain, hands on knees.",
    "Front-facing. Wincing, eyes squeezed shut.",
    "Front-facing. Pain easing, head lifting.",
    "Front-facing. Body straightening, arms slowly lowering.",
    "Front-facing. Eyes opening, expression hardening.",
    "Front-facing. Final upright stance, slight wince remaining.",
    "Front-facing. Fully recovered to ready stance.",
  ],
};

export function buildHurtPrompt(input: ActionPromptInput): string {
  return buildActionPrompt(input, POSES);
}
