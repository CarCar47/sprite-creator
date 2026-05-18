import { buildActionPrompt, type PoseSequence } from "./shared";
import type { ActionPromptInput } from "./types";

const POSES: PoseSequence = {
  title: "jump",
  motion:
    "A single jump arc: crouch wind-up, leap upward, peak/apex pose, descent, landing impact, recovery to standing. Not a loop — a one-shot sequence.",
  poses: [
    "Front-facing. Crouched wind-up: knees bent ~90°, hips low, arms swung back behind body, head down slightly, weight loaded into legs.",
    "Front-facing. Launch: legs extending explosively, arms swinging forward and up, body rising. Feet just leaving the ground.",
    "Front-facing. Mid-air apex: body fully extended upward, arms reaching overhead or out for balance, legs slightly tucked. Highest point of the jump.",
    "Front-facing. Landing impact: knees bent absorbing impact, arms forward for balance, feet flat on ground, body lowered. Recovery to ready stance imminent.",
    "Front-facing. Pre-crouch ready stance, weight settling.",
    "Front-facing. Deeper crouch, arms swinging back.",
    "Front-facing. Crouch peak, arms fully back, ready to launch.",
    "Front-facing. Launch begin, arms starting forward swing.",
    "Front-facing. Mid-launch, body extending, feet leaving ground.",
    "Front-facing. Rising, knees tucking slightly.",
    "Front-facing. Apex pose at peak height.",
    "Front-facing. Beginning to descend, legs starting to extend toward ground.",
    "Front-facing. Mid-descent, body braced for impact.",
    "Front-facing. Pre-landing, feet about to contact ground.",
    "Front-facing. Landing absorb, knees deep bend.",
    "Front-facing. Recovery to standing, neutral pose.",
  ],
};

export function buildJumpPrompt(input: ActionPromptInput): string {
  return buildActionPrompt(input, POSES);
}
