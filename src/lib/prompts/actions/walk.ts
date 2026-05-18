import { buildActionPrompt, type PoseSequence } from "./shared";
import type { ActionPromptInput } from "./types";

const POSES: PoseSequence = {
  title: "walk",
  motion:
    "A full walking cycle, viewed from the side (character facing right). The character takes one full stride with the left leg, then one with the right.",
  poses: [
    "Side view facing right. Mid-contact pose: left foot planted under body, right foot lifted and passing forward at knee height. Arms swinging — right arm forward, left arm back. Slight forward lean.",
    "Side view facing right. Right foot just touching ground in front, left foot pushing off behind. Body weight transferring forward. Arms continuing to swing.",
    "Side view facing right. Mid-contact pose mirrored: right foot planted under body, left foot lifted and passing forward at knee height. Right arm back, left arm forward.",
    "Side view facing right. Left foot just touching ground in front, right foot pushing off behind. Returns to start of cycle.",
    "Side view facing right. Right foot fully forward, heel-strike, weight beginning to transfer to it. Left foot at full extension behind.",
    "Side view facing right. Both feet planted, weight centered, body upright as it transitions through midpoint.",
    "Side view facing right. Left foot fully forward, heel-strike. Right foot at full extension behind.",
    "Side view facing right. Both feet planted again as the second half of the cycle completes back to cell 1's keyframe.",
    "Side view facing right. Right foot lifted high, knee bent, mid-air. Left foot planted.",
    "Side view facing right. Right foot extending forward toward the ground.",
    "Side view facing right. Right foot planted, left foot lifting behind.",
    "Side view facing right. Left foot mid-air at peak of swing.",
    "Side view facing right. Left foot extending forward.",
    "Side view facing right. Left foot planted in front, right pushing off.",
    "Side view facing right. Transitioning back through mid-contact.",
    "Side view facing right. Returning to exact cell 1 pose for seamless loop.",
  ],
};

export function buildWalkPrompt(input: ActionPromptInput): string {
  return buildActionPrompt(input, POSES);
}
