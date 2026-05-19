import type { Style } from "@/lib/validators";
import type { ActionKey, ActionPromptInput } from "./types";

const STYLE_INSTRUCTIONS: Record<Style, string> = {
  pixel16:
    "16-bit pixel art. Clean integer pixel grid, limited palette (~16 colors), hard edges, no anti-aliasing, no gradients.",
  pixel32:
    "32-bit pixel art. Detailed pixel art with a richer palette (~32-64 colors), restrained dithering, hard edges, no anti-aliasing on silhouettes.",
  cartoon:
    "2D cartoon illustration. Bold black outlines, flat fill colors, hand-drawn feel, expressive but consistent line weight.",
  modern:
    "Modern 2D illustration. Clean vector-style shapes, soft shadows, smooth gradients, contemporary game-art aesthetic.",
};

const NEGATIVE_GUIDANCE = [
  "no text",
  "no captions",
  "no labels",
  "no watermark",
  "no border",
  "no scene clutter",
  "no second character",
  "no partial duplicate of the character",
].join(", ");

/**
 * Per-frame pose tables. Each action has a pose for each of the 16 possible frame indices.
 * The careful per-frame route picks `frameCount` poses from the head of the table.
 *
 * Critical convention: every pose is described from the SAME viewing angle (side view facing
 * right, or front view) within a single action. This is what eliminates the "back-and-forth
 * flipping" issue seen with grid mode — there is no implicit perspective change per cell.
 */
const PER_FRAME_POSES: Record<ActionKey, string[]> = {
  idle: [
    "standing upright, weight even, arms relaxed at sides, neutral expression, looking forward",
    "standing upright, chest slightly raised mid-inhale, shoulders 2 pixels higher than neutral, arms still at sides",
    "standing upright, back to neutral position, eyes half-closed mid-blink",
    "standing upright, neutral pose identical to the starting frame, eyes open",
    "standing upright, weight subtly shifted to the right foot, head facing forward",
    "standing upright, weight returning to center, head slightly turned right",
    "standing upright, neutral position, eyes half-closed in a blink",
    "standing upright, neutral position fully restored",
    "standing upright, neutral position, eyes closed for a longer blink",
    "standing upright, eyes opening, head slightly tilted",
    "standing upright, head straight, neutral expression",
    "standing upright, mid-inhale, chest raised",
    "standing upright, mid-exhale, shoulders lowered",
    "standing upright, weight shifted left",
    "standing upright, weight returning to center",
    "standing upright in the neutral starting pose for seamless loop",
  ],
  walk: [
    "side view facing right, walking. Left foot planted under the body, right foot lifted and passing forward at knee height. Arms swinging: right arm forward, left arm back. Slight forward lean",
    "side view facing right, walking. Right foot just touching the ground in front, left foot pushing off behind. Body weight transferring forward",
    "side view facing right, walking. Right foot planted under the body, left foot lifted and passing forward at knee height. Arms reversed: left arm forward, right arm back",
    "side view facing right, walking. Left foot just touching the ground in front, right foot pushing off behind",
    "side view facing right, walking. Right foot fully forward, heel-strike, weight beginning to transfer forward",
    "side view facing right, walking. Both feet planted briefly, body upright as it transitions through midpoint",
    "side view facing right, walking. Left foot fully forward, heel-strike",
    "side view facing right, walking. Both feet planted as the second half of the cycle completes",
    "side view facing right, walking. Right foot lifted high, knee bent, mid-air. Left foot planted",
    "side view facing right, walking. Right foot extending forward toward the ground",
    "side view facing right, walking. Right foot planted, left foot lifting behind",
    "side view facing right, walking. Left foot mid-air at peak of swing",
    "side view facing right, walking. Left foot extending forward",
    "side view facing right, walking. Left foot planted in front, right foot pushing off",
    "side view facing right, walking. Transitioning back through mid-contact",
    "side view facing right, walking, returning to the starting pose for seamless loop",
  ],
  run: [
    "side view facing right, running. Heavy forward lean. Right foot striking the ground in front, left foot fully extended behind mid-air. Arms bent ~90 degrees, swinging hard: left arm forward, right arm back",
    "side view facing right, running. Right foot planted, body weight pivoting over it, left knee rising fast in front",
    "side view facing right, running. Left foot striking the ground in front, right foot fully extended behind mid-air. Arms reversed from previous pose",
    "side view facing right, running. Left foot planted, body weight pivoting over it, right knee rising fast in front",
    "side view facing right, running. Airborne moment, both feet off the ground, right foot reaching forward, left fully extended back",
    "side view facing right, running. Right heel-strike, weight transferring forward",
    "side view facing right, running. Right foot planted at midpoint, left knee at peak",
    "side view facing right, running. Push-off from right foot, left foot beginning forward swing",
    "side view facing right, running. Second airborne moment, mirrored: left foot reaching forward, right fully extended back",
    "side view facing right, running. Left heel-strike, weight transferring forward",
    "side view facing right, running. Left foot planted at midpoint, right knee at peak",
    "side view facing right, running. Push-off from left foot",
    "side view facing right, running. Airborne, right foot reaching forward again",
    "side view facing right, running. Right heel-strike",
    "side view facing right, running. Transitioning back through midpoint",
    "side view facing right, running, returning to the starting pose for seamless loop",
  ],
  jump: [
    "front view, crouched wind-up. Knees bent ~90 degrees, hips low, arms swung back behind body, head down slightly, weight loaded into legs",
    "front view, launch. Legs extending explosively, arms swinging forward and up, body rising. Feet just leaving the ground",
    "front view, mid-air apex. Body fully extended upward, arms reaching overhead or out for balance, legs slightly tucked. Highest point of the jump",
    "front view, landing. Knees bent absorbing impact, arms forward for balance, feet flat on ground, body lowered",
    "front view, pre-crouch ready stance, weight settling",
    "front view, deeper crouch, arms swinging back",
    "front view, crouch peak, arms fully back, ready to launch",
    "front view, launch begin, arms starting forward swing",
    "front view, mid-launch, body extending, feet leaving ground",
    "front view, rising, knees tucking slightly",
    "front view, apex pose at peak height, arms overhead",
    "front view, beginning to descend, legs starting to extend toward ground",
    "front view, mid-descent, body braced for impact",
    "front view, pre-landing, feet about to contact ground",
    "front view, landing absorb, knees deep bend",
    "front view, recovery to standing, neutral pose",
  ],
  attack: [
    "side view facing right, mid-strike. Arm fully extended forward to the right, weapon or fist at full reach, body weight shifted to front (right) foot, slight forward lean",
    "side view facing right, wind-up. Arms drawn back to the left, weight shifted onto back (left) foot, weapon or fist pulled back behind the shoulder, body coiled",
    "side view facing right, follow-through. Arm continuing past the strike point, momentum carrying slightly downward to the right, body still leaning forward",
    "side view facing right, recovery. Arm returning to ready position, weight rebalancing, body coming back to upright stance",
    "side view facing right, ready stance, weight evenly distributed, weapon held in front",
    "side view facing right, beginning of wind-up, arms starting to draw back",
    "side view facing right, wind-up peak, weapon fully cocked",
    "side view facing right, wind-up hold, body coiled and tense",
    "side view facing right, strike initiation, arm beginning to extend forward",
    "side view facing right, mid-strike forward thrust",
    "side view facing right, strike peak, weapon at full extension",
    "side view facing right, strike connecting, slight impact emphasis",
    "side view facing right, follow-through, weapon continuing past target",
    "side view facing right, follow-through complete, momentum dissipating",
    "side view facing right, recovery begin, weapon returning",
    "side view facing right, recovery complete, returning to ready stance",
  ],
  hurt: [
    "front view, impact flinch. Head snapping back, arms thrown up defensively, torso recoiling, eyes closed or grimacing in pain. Feet still planted",
    "front view, stagger back. Body leaning backward, one foot stepping back to catch balance, arms still raised, expression pained",
    "front view, pain hold. Body bent slightly forward, one hand on the hurt area (chest or stomach), expression grimaced, weight on one leg",
    "front view, recovery. Body straightening back up, arms lowering, expression returning to neutral but still slightly tense",
    "front view, initial flinch, head turning to the side",
    "front view, recoil peak, body bent backward",
    "front view, stagger left, off-balance",
    "front view, stagger right, regaining balance",
    "front view, pain pose, one knee buckling",
    "front view, bracing against pain, hands on knees",
    "front view, wincing, eyes squeezed shut",
    "front view, pain easing, head lifting",
    "front view, body straightening, arms slowly lowering",
    "front view, eyes opening, expression hardening",
    "front view, final upright stance, slight wince remaining",
    "front view, fully recovered to ready stance",
  ],
  death: [
    "front view, knockback flinch. Body recoiling from a final hit, arms flailing outward, head thrown back, eyes wide",
    "front view, knees buckling. Legs giving out, body collapsing downward, arms falling to sides, head dropping forward",
    "front view, mid-fall. Body in the air falling backward, limbs limp, eyes closed, no longer holding form",
    "front view, fallen. Character lying on the ground, limbs splayed, eyes closed, fully motionless",
    "front view, initial hit recoil, body arched backward",
    "front view, knees starting to fail, body lowering",
    "front view, half-collapsed, kneeling",
    "front view, fully kneeling, hands on the ground",
    "front view, falling forward, hands no longer supporting",
    "front view, mid-fall forward, face approaching ground",
    "front view, just before impact, body horizontal",
    "front view, impact moment with the ground",
    "front view, lying face-down or side-up, limbs settling",
    "front view, final fallen pose, motionless",
    "front view, same final pose with no motion (hold frame)",
    "front view, identical final still frame to the previous",
  ],
};

/**
 * Build a focused single-pose prompt for one frame in careful per-frame mode.
 *
 * Key differences from the grid prompt:
 *   - Single subject, single pose — no grid spec, no per-cell enumeration
 *   - The character description is restated verbatim front-and-center
 *   - Composition guidance assumes the full canvas (no "this is one of N cells")
 *   - View angle is fixed by the pose itself (e.g. "side view facing right") so every frame
 *     in an action shares the same camera, eliminating the back-and-forth flipping that
 *     grid mode produced when the model interpreted different cells as different angles
 */
export function buildPerFramePrompt(
  input: ActionPromptInput,
  action: ActionKey,
  frameIndex: number,
): string {
  const poses = PER_FRAME_POSES[action];
  const pose = poses[Math.min(frameIndex, poses.length - 1)] ?? poses[0];
  const styleInstruction = STYLE_INSTRUCTIONS[input.style];

  const paletteClause = input.palette?.length
    ? `Constrain the character's colors to this palette where appropriate: ${input.palette.join(", ")}.`
    : "";

  return [
    `Generate a single character on a solid ${input.chromaColor} background.`,
    `Full body, centered in the frame, with at least 8 pixels of clear background padding on every side.`,
    `Character description (preserve every visual detail exactly): ${input.description}.`,
    `Pose: ${pose}.`,
    `Style: ${styleInstruction}`,
    paletteClause,
    `Strict negative guidance: ${NEGATIVE_GUIDANCE}.`,
    `The background must be a uniform fill of exactly ${input.chromaColor} with no shading, no noise, and no anti-aliased edges where it meets the character.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
