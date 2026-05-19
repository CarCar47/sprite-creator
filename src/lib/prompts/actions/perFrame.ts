import type { Style } from "@/lib/validators";
import type { ActionKey, ActionPromptInput } from "./types";

const STYLE_INSTRUCTIONS: Record<Style, string> = {
  pixel16:
    "16-bit pixel art video-game sprite style. Clean integer pixel grid, limited palette (~16 colors), hard edges, no anti-aliasing, no gradients.",
  pixel32:
    "32-bit pixel art video-game sprite style. Detailed pixel art with a richer palette (~32-64 colors), restrained dithering, hard edges, no anti-aliasing on silhouettes.",
  cartoon:
    "2D cartoon game character illustration. Bold black outlines, flat fill colors, hand-drawn feel, expressive but consistent line weight.",
  modern:
    "Modern 2D game character illustration. Clean vector-style shapes, soft shadows, smooth gradients, contemporary game-art aesthetic.",
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
  "no motion blur",
  "no speed lines",
].join(", ");

/**
 * Per-frame pose descriptions written in concrete, visceral natural language rather than
 * abstract pose-anatomy math. FLUX.1-schnell at 4 inference steps responds badly to phrases
 * like "right foot at heel-strike, weight transferring" — those are technical terms it has
 * no training to interpret as visual poses. The model DOES understand "frozen in mid-stride,
 * one leg forward and one back, like a video game sprite of someone walking."
 *
 * Each entry is intentionally short and uses real-world references the model has seen on
 * the internet a million times (video-game sprites, Olympic athletes, fencers, etc.). Every
 * frame in a single action also locks the view angle in the same wording, which is what
 * stops the "character flipping left/right between frames" issue that grid mode produced.
 */
const PER_FRAME_POSES: Record<ActionKey, string[]> = {
  idle: [
    "standing still in a relaxed idle pose, arms hanging at sides, front view, like an idle video-game character waiting",
    "standing still, taking a small breath in, chest very slightly raised, otherwise identical idle pose, front view",
    "standing still, blinking, eyes closed, otherwise identical idle pose, front view",
    "standing still in the same relaxed pose, eyes open again, front view, idle game character",
    "standing still, weight subtly on the right foot, otherwise identical, front view",
    "standing still, weight returning to center, head slightly turned right, front view",
    "standing still, mid-blink, otherwise identical idle pose, front view",
    "standing still in the neutral idle pose ready to loop, front view",
    "standing still, eyes closed for a longer blink, otherwise identical, front view",
    "standing still, eyes opening, head slightly tilted, front view",
    "standing still, neutral expression, head straight forward, front view",
    "standing still, deeper breath in, chest slightly raised, front view",
    "standing still, breath out, shoulders lower, front view",
    "standing still, weight on left foot, otherwise identical, front view",
    "standing still, weight back to center, front view",
    "standing still in the starting neutral idle pose for a seamless loop, front view",
  ],
  walk: [
    "WALKING, frozen mid-stride, side view facing right. The right foot is lifted off the ground and swinging forward. The left foot is planted flat. The body leans very slightly forward. Looks like a video game character walking",
    "WALKING, frozen mid-step, side view facing right. The right foot has just landed in front of the body, planted flat. The left foot is pushing off behind. Body leans forward",
    "WALKING, frozen mid-stride, side view facing right. The left foot is lifted off the ground and swinging forward (mirrored from frame 1). The right foot is planted flat. Body leans slightly forward",
    "WALKING, frozen mid-step, side view facing right. The left foot has just landed in front of the body, planted flat. The right foot is pushing off behind",
    "WALKING, frozen mid-stride, side view facing right. Right leg is fully forward with the foot striking the ground heel-first. Arms swing naturally — left arm forward, right arm back",
    "WALKING, frozen at the midpoint of a step, side view facing right. Both feet are on the ground briefly as weight transfers. Body upright",
    "WALKING, frozen mid-stride, side view facing right. Left leg is fully forward with foot striking the ground heel-first. Arms swung: right arm forward, left arm back",
    "WALKING, frozen at the midpoint of the second half of the cycle, side view facing right. Returning to the starting pose",
    "WALKING, frozen mid-stride, side view facing right. Right knee lifted very high, foot in the air. Left foot planted",
    "WALKING, frozen mid-step, side view facing right. Right foot reaching forward toward the ground",
    "WALKING, frozen mid-step, side view facing right. Right foot just planted, left foot beginning to lift behind",
    "WALKING, frozen mid-stride, side view facing right. Left knee lifted very high, foot in the air (mirrored)",
    "WALKING, frozen mid-step, side view facing right. Left foot reaching forward toward the ground",
    "WALKING, frozen mid-step, side view facing right. Left foot planted in front, right foot pushing off",
    "WALKING, side view facing right. Transitioning through the middle of the stride, body upright, weight centered",
    "WALKING, side view facing right. Back to the starting frame for a seamless loop",
  ],
  run: [
    "RUNNING, like an Olympic sprinter, frozen mid-stride, side view facing right. Heavy forward body lean. Right leg fully forward and just striking the ground. Left leg fully extended behind, off the ground. Arms bent at ~90 degrees swinging hard — left arm forward, right arm back",
    "RUNNING, side view facing right. Right foot planted, body weight directly over it, left knee driving forward and up. Heavy forward lean",
    "RUNNING, side view facing right. Mirrored from frame 1: left leg fully forward striking the ground, right leg fully extended behind off the ground. Arms reversed",
    "RUNNING, side view facing right. Left foot planted, body weight over it, right knee driving forward and up",
    "RUNNING, side view facing right. Mid-air moment, both feet completely off the ground, right leg reaching forward, left leg extended back",
    "RUNNING, side view facing right. Right heel-strike just made, weight rolling forward",
    "RUNNING, side view facing right. Right foot fully planted underneath, left knee at the very top of its drive forward",
    "RUNNING, side view facing right. Pushing off explosively from the right foot, left foot beginning to reach forward",
    "RUNNING, side view facing right. Mid-air moment mirrored: left leg reaching forward, right leg extended back, both feet off the ground",
    "RUNNING, side view facing right. Left heel-strike just made, weight rolling forward",
    "RUNNING, side view facing right. Left foot fully planted underneath, right knee at the top of its drive forward",
    "RUNNING, side view facing right. Pushing off from the left foot",
    "RUNNING, side view facing right. Mid-air with right leg reaching forward again",
    "RUNNING, side view facing right. Right heel-strike",
    "RUNNING, side view facing right. Transitioning back through the midpoint of the cycle",
    "RUNNING, side view facing right. Returning to the starting sprinting pose for a seamless loop",
  ],
  jump: [
    "JUMPING, crouched down at the bottom of a jump wind-up, front view. Knees bent deeply, hips low to the ground, arms swung back behind the body. Body looks loaded up like a spring",
    "JUMPING, mid-launch, front view. Body explosively extending upward, knees still bent slightly, arms swinging forward and up overhead. Feet are just leaving the ground",
    "JUMPING, at the peak of the jump in mid-air, front view. Body fully extended upward, both arms raised overhead, legs slightly tucked. Hangtime moment, like a video game character at the top of a jump",
    "LANDING from a jump, front view. Feet just touched the ground, knees bent deep to absorb impact, arms forward for balance, body lowered",
    "JUMPING, front view, pre-crouch ready stance, weight settling, knees slightly bent",
    "JUMPING, front view, deeper crouch beginning, arms starting to swing back",
    "JUMPING, front view, deepest crouch wind-up, arms fully back behind body, ready to launch",
    "JUMPING, front view, launch beginning, arms starting to swing forward",
    "JUMPING, front view, feet just leaving the ground, body extending upward",
    "JUMPING, front view, rising into the air, knees tucking slightly",
    "JUMPING, front view, mid-air apex pose, arms up overhead, body fully extended",
    "JUMPING, front view, beginning to descend from the peak",
    "JUMPING, front view, mid-descent, body braced for the impact below",
    "LANDING, front view, just before feet touch the ground, body in a ready landing posture",
    "LANDING, front view, feet planted but knees deeply bent absorbing the impact",
    "JUMPING, front view, recovery to a standing neutral pose after landing",
  ],
  attack: [
    "ATTACKING, like a fencer mid-lunge, side view facing right. Right arm fully extended forward to the right holding a weapon or fist, body weight transferred onto the front (right) leg, body leaning forward into the strike",
    "ATTACKING, wound up for a strike, side view facing right. Right arm pulled all the way back behind the right shoulder holding the weapon, weight on the back (left) leg, body coiled and tense",
    "ATTACKING, follow-through after the strike, side view facing right. Right arm has swung past the strike point and is angling slightly down to the right, body still leaning forward, momentum carrying through",
    "ATTACKING, recovering from the strike, side view facing right. Right arm pulling back to a ready position at the side, body straightening back up to upright stance",
    "ATTACKING, side view facing right, ready stance with weapon held in front of body, both feet planted evenly",
    "ATTACKING, side view facing right, beginning to wind up, arm drawing back",
    "ATTACKING, side view facing right, wind-up peak, weapon all the way back behind shoulder",
    "ATTACKING, side view facing right, wind-up hold, body coiled, ready to release",
    "ATTACKING, side view facing right, strike initiation, arm beginning to extend forward",
    "ATTACKING, side view facing right, mid-thrust forward, arm extending fast",
    "ATTACKING, side view facing right, strike at full extension, arm completely straight forward",
    "ATTACKING, side view facing right, strike connecting, small impact frame at full extension",
    "ATTACKING, side view facing right, follow-through, arm continuing past the strike point",
    "ATTACKING, side view facing right, follow-through complete, arm angling downward",
    "ATTACKING, side view facing right, recovery beginning, arm pulling back",
    "ATTACKING, side view facing right, recovery complete, back to ready stance",
  ],
  hurt: [
    "HURT, just took a hit, front view. Head snapping backward, arms thrown up in front of the face defensively, torso recoiling backward, face grimacing in pain. Feet still planted",
    "HURT, staggering backward from the impact, front view. Body leaning backward, one foot stepping back to catch balance, arms still raised, expression pained",
    "HURT, bent forward in pain, front view. One hand clutching the chest or stomach where they were hit, body slightly hunched, weight on one leg, face grimacing",
    "HURT, recovering, front view. Body straightening back up, arms lowering, face starting to return to neutral but still tense",
    "HURT, initial flinch reaction, front view. Head turned sharply to the side from the impact",
    "HURT, recoil at peak, front view. Body arched backward",
    "HURT, staggering left to recover balance, front view, off-balance",
    "HURT, staggering right to recover balance, front view, regaining balance",
    "HURT, knee buckling slightly in pain, front view, leaning",
    "HURT, bracing against pain with hands on knees, front view, hunched forward",
    "HURT, wincing hard, front view, eyes squeezed shut",
    "HURT, pain easing slightly, front view, lifting head back up",
    "HURT, body straightening, front view, arms lowering slowly",
    "HURT, eyes opening, front view, hardening expression",
    "HURT, final standing pose with a faint wince remaining, front view",
    "HURT, fully recovered to a ready stance, front view",
  ],
  death: [
    "DEATH, just took a fatal hit, front view. Body recoiling violently backward, arms flung outward, head thrown back, eyes wide open in shock",
    "DEATH, knees buckling, front view. Legs giving out underneath the character, body collapsing straight downward, arms falling limp at the sides, head dropping forward",
    "DEATH, falling backward through the air, front view. Body horizontal in the air mid-fall, arms and legs limp, eyes closed, no longer holding any pose",
    "DEAD, lying motionless on the ground, front view (top-down). Limbs splayed out, eyes closed, fully still. This is the final dead frame",
    "DEATH, initial fatal hit recoil, front view, body arched backward",
    "DEATH, knees starting to give out, front view, body lowering",
    "DEATH, mid-collapse, front view, falling to one knee",
    "DEATH, fully kneeling, front view, hands hitting the ground",
    "DEATH, falling forward off the knees, front view, hands no longer supporting",
    "DEATH, mid-fall forward, front view, face approaching the ground",
    "DEATH, body horizontal just before impact with the ground, front view",
    "DEATH, impact with the ground, front view, body sprawling out",
    "DEAD, lying face-down on the ground, front view, limbs settling into final positions",
    "DEAD, lying still in the final pose, front view, motionless",
    "DEAD, identical final still frame held, front view",
    "DEAD, identical final still frame held, front view",
  ],
};

/**
 * Build a focused single-frame prompt for one frame in careful per-frame mode.
 *
 * Key design choices (after a round of action-quality issues with FLUX.1-schnell):
 * 1. Use ALL-CAPS action verbs ("WALKING", "ATTACKING") at the front of the pose so the
 *    model treats the action as the primary subject of the image.
 * 2. Use natural-language pose descriptions ("right leg lifted off the ground and swinging
 *    forward") rather than technical anatomy ("right knee at peak angle"). The former is
 *    what diffusion training data labels look like.
 * 3. Lock the camera angle in the pose text itself ("side view facing right" or "front
 *    view") so every frame in an action shares the same camera, killing the back-and-forth
 *    flipping problem.
 * 4. Reference cultural touchstones ("like a video game character", "like an Olympic
 *    sprinter", "like a fencer mid-lunge") that the model has seen many times in training.
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
    `Single video-game character sprite, full body, centered in the frame, with at least 8 pixels of clear background padding on every side. The background is a solid uniform fill of exactly ${input.chromaColor}.`,
    `Action pose: ${pose}.`,
    `Character description (preserve every visual detail exactly): ${input.description}.`,
    `Style: ${styleInstruction}`,
    paletteClause,
    `Strict negative guidance: ${NEGATIVE_GUIDANCE}.`,
    `The background must be a uniform fill of exactly ${input.chromaColor} with no shading, no noise, no clouds, no scenery, and no anti-aliased edges where it meets the character.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
