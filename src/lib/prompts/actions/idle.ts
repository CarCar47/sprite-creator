import { buildActionPrompt, type PoseSequence } from "./shared";
import type { ActionPromptInput } from "./types";

const POSES: PoseSequence = {
  title: "idle",
  motion:
    "A subtle breathing or standing-in-place loop. The character barely moves but is alive, with weight slightly shifting and small vertical breath rise/fall.",
  poses: [
    "Standing upright, weight even, arms relaxed at sides, looking forward, neutral expression. This is the neutral keyframe.",
    "Same stance, chest raised slightly as the character inhales. Shoulders lift ~2 pixels worth. Eyes still forward.",
    "Same stance, back to neutral position, weight settled, exhale starting. Identical pose to cell 1 but with eyes blinking half-closed.",
    "Same stance, exhale complete, weight settled, eyes open again. Returns to the neutral keyframe ready to loop.",
    "Same stance, very subtle weight shift to the right foot, left foot lightly tapping. Otherwise identical.",
    "Same stance, weight returning to center, head turning slightly right.",
    "Same stance, head facing forward again, eyes blinking half-closed.",
    "Same stance, full neutral position, mid-blink, ready to loop back to cell 1.",
    "Neutral standing pose with eyes fully closed (long blink).",
    "Neutral pose, eyes opening, head slightly tilted.",
    "Neutral pose, head straight, faint smile or expression unchanged.",
    "Neutral pose, breathing in fully.",
    "Neutral pose, breathing out, shoulders lowered.",
    "Neutral pose, weight shifted left.",
    "Neutral pose, weight centered, eyes forward.",
    "Neutral pose returning exactly to cell 1 keyframe for seamless loop.",
  ],
};

export function buildIdlePrompt(input: ActionPromptInput): string {
  return buildActionPrompt(input, POSES);
}
