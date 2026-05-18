import { buildActionPrompt, type PoseSequence } from "./shared";
import type { ActionPromptInput } from "./types";

const POSES: PoseSequence = {
  title: "run",
  motion:
    "A full running cycle, viewed from the side (character facing right). Longer stride than walk, more forward lean, both feet leave the ground at peak of cycle.",
  poses: [
    "Side view facing right. Heavy forward lean. Right foot striking ground in front, left foot fully extended behind at midair. Arms bent ~90° and swinging hard: left arm forward, right arm back.",
    "Side view facing right. Right foot planted, body weight pivoting over it, left knee rising fast in front.",
    "Side view facing right. Left foot striking ground in front, right foot fully extended behind midair. Arms reversed from cell 1.",
    "Side view facing right. Left foot planted, body weight pivoting over it, right knee rising fast in front. Returns toward cell 1.",
    "Side view facing right. Airborne moment — both feet off the ground, right foot reaching forward, left fully extended back.",
    "Side view facing right. Right heel-strike, weight transferring.",
    "Side view facing right. Right foot planted at midpoint, left knee at peak.",
    "Side view facing right. Push-off from right foot, left foot beginning forward swing.",
    "Side view facing right. Second airborne moment, mirrored: left foot reaching forward, right fully extended back.",
    "Side view facing right. Left heel-strike, weight transferring.",
    "Side view facing right. Left foot planted at midpoint, right knee at peak.",
    "Side view facing right. Push-off from left foot.",
    "Side view facing right. Airborne, right foot reaching forward again.",
    "Side view facing right. Right heel-strike.",
    "Side view facing right. Transitioning back through midpoint.",
    "Side view facing right. Returning to exact cell 1 pose for seamless loop.",
  ],
};

export function buildRunPrompt(input: ActionPromptInput): string {
  return buildActionPrompt(input, POSES);
}
