import { buildIdlePrompt } from "./idle";
import { buildWalkPrompt } from "./walk";
import { buildRunPrompt } from "./run";
import { buildJumpPrompt } from "./jump";
import { buildAttackPrompt } from "./attack";
import { buildHurtPrompt } from "./hurt";
import { buildDeathPrompt } from "./death";
import type { ActionKey, ActionPromptInput } from "./types";

const BUILDERS: Record<ActionKey, (input: ActionPromptInput) => string> = {
  idle: buildIdlePrompt,
  walk: buildWalkPrompt,
  run: buildRunPrompt,
  jump: buildJumpPrompt,
  attack: buildAttackPrompt,
  hurt: buildHurtPrompt,
  death: buildDeathPrompt,
};

export function buildActionPromptFor(action: ActionKey, input: ActionPromptInput): string {
  return BUILDERS[action](input);
}

export {
  ACTION_KEYS,
  FRAME_COUNTS,
  GRID_BY_FRAME_COUNT,
  DEFAULT_FPS_BY_ACTION,
  ACTION_LABELS,
  ACTION_DESCRIPTIONS,
} from "./types";
export type { ActionKey, FrameCount, GridLayout, ActionPromptInput } from "./types";
