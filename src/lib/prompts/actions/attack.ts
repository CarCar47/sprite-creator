import { buildActionPrompt, type PoseSequence } from "./shared";
import type { ActionPromptInput } from "./types";

const POSES: PoseSequence = {
  title: "attack",
  motion:
    "A melee strike: wind-up (load), strike (extend toward target on the right), follow-through, recovery. Side view facing right, attacking toward the right side of the cell. Not a loop — one-shot.",
  poses: [
    "Side view facing right. Wind-up: arms drawn back to the left, weight shifted onto back (left) foot, weapon or fist pulled back behind the head or shoulder, body coiled.",
    "Side view facing right. Mid-strike: arm fully extended forward to the right, weapon or fist at full reach, body weight shifted to front (right) foot, slight forward lean. Maximum extension.",
    "Side view facing right. Follow-through: arm continuing past the strike point, momentum carrying slightly downward to the right, body still leaning forward.",
    "Side view facing right. Recovery: arm returning to ready position, weight rebalancing, body coming back to upright stance. Ready for another strike or to return to idle.",
    "Side view facing right. Ready stance, weight evenly distributed, weapon held in front.",
    "Side view facing right. Beginning of wind-up, arms starting to draw back.",
    "Side view facing right. Wind-up peak, weapon fully cocked.",
    "Side view facing right. Wind-up hold, body coiled and tense.",
    "Side view facing right. Strike initiation, arm beginning to extend forward.",
    "Side view facing right. Mid-strike forward thrust.",
    "Side view facing right. Strike peak, weapon at full extension.",
    "Side view facing right. Strike connecting, slight impact shake.",
    "Side view facing right. Follow-through, weapon continuing past target.",
    "Side view facing right. Follow-through complete, momentum dissipating.",
    "Side view facing right. Recovery begin, weapon returning.",
    "Side view facing right. Recovery complete, returning to ready stance.",
  ],
};

export function buildAttackPrompt(input: ActionPromptInput): string {
  return buildActionPrompt(input, POSES);
}
