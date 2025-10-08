/**
 * Camera Animation Data Structure
 *
 * Defines camera animations and their playback conditions based on game state.
 *
 * Each animation contains:
 * - id: Unique identifier
 * - path: Path to the animation JSON file
 * - description: Human-readable description
 * - criteria: Optional object with key-value pairs that must match game state
 *   - Simple equality: { currentState: GAME_STATES.INTRO }
 *   - Comparison operators: { currentState: { $gte: GAME_STATES.INTRO, $lt: GAME_STATES.PHONE_BOOTH_RINGING } }
 *   - Operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
 * - priority: Higher priority animations are checked first (default: 0)
 * - playOnce: If true, animation only plays once per game session (default: false)
 * - syncController: If true, sync character controller yaw/pitch to final camera pose (default: true)
 * - restoreInput: If true, restore input controls when complete (default: true)
 *
 * Usage:
 * import { cameraAnimations, getCameraAnimationForState } from './cameraAnimationData.js';
 */

import { GAME_STATES } from "./gameData.js";
import { checkCriteria } from "./criteriaHelper.js";

export const cameraAnimations = {
  lookAndJump: {
    id: "lookAndJump",
    path: "/json/look-and-jump.json",
    description: "Camera animation for drive-by sequence",
    criteria: { currentState: GAME_STATES.DRIVE_BY },
    priority: 100,
    playOnce: true,
    syncController: true,
    restoreInput: true,
  },

  // Add your camera animations here...
};

/**
 * Get the camera animation that should play for the current game state
 * @param {Object} gameState - Current game state
 * @returns {Object|null} Camera animation data or null if none match
 */
export function getCameraAnimationForState(gameState) {
  // Convert to array and sort by priority (highest first)
  const animations = Object.values(cameraAnimations).sort(
    (a, b) => (b.priority || 0) - (a.priority || 0)
  );

  console.log(
    `CameraAnimationData: Checking ${animations.length} animations for state:`,
    gameState
  );

  // Find first animation matching criteria
  for (const animation of animations) {
    if (!animation.criteria) {
      console.log(
        `CameraAnimationData: Animation '${animation.id}' has no criteria, skipping`
      );
      continue;
    }

    const matches = checkCriteria(gameState, animation.criteria);
    console.log(
      `CameraAnimationData: Animation '${animation.id}' criteria:`,
      animation.criteria,
      `matches:`,
      matches
    );

    if (matches) {
      return animation;
    }
  }

  console.log(`CameraAnimationData: No animations matched`);
  return null;
}

export default cameraAnimations;
