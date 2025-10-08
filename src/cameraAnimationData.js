/**
 * Camera Animation Data Structure
 *
 * Defines camera animations and lookats, triggered by game state changes.
 *
 * Common properties:
 * - id: Unique identifier
 * - type: "animation" or "lookat"
 * - description: Human-readable description
 * - criteria: Optional object with key-value pairs that must match game state
 *   - Simple equality: { currentState: GAME_STATES.INTRO }
 *   - Comparison operators: { currentState: { $gte: GAME_STATES.INTRO, $lt: GAME_STATES.PHONE_BOOTH_RINGING } }
 *   - Operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
 * - priority: Higher priority animations are checked first (default: 0)
 * - playOnce: If true, only plays once per game session (default: false)
 *
 * Type-specific properties:
 *
 * For type "animation":
 * - path: Path to the animation JSON file
 * - syncController: If true, sync character controller yaw/pitch to final camera pose (default: true)
 * - restoreInput: If true, restore input controls when complete (default: true)
 *
 * For type "lookat":
 * - position: {x, y, z} world position to look at
 * - duration: Duration of the look-at in seconds (default: 2.0)
 * - restoreControl: If true, restore input controls when complete (default: true)
 * - enableZoom: If true, enable zoom/DoF effect (default: false)
 * - zoomOptions: Optional zoom configuration
 *   - zoomFactor: Camera zoom multiplier (e.g., 2.0 for 2x zoom)
 *   - minAperture: DoF effect strength at peak
 *   - maxAperture: DoF effect strength at rest
 *   - transitionStart: When to start zoom (0-1, fraction of duration)
 *   - transitionDuration: How long zoom transition takes in seconds
 *   - holdDuration: How long to hold zoom before returning
 *
 * Usage:
 * import { cameraAnimations, getCameraAnimationForState } from './cameraAnimationData.js';
 */

import { GAME_STATES } from "./gameData.js";
import { checkCriteria } from "./criteriaHelper.js";

export const cameraAnimations = {
  phoneBoothLookat: {
    id: "phoneBoothLookat",
    type: "lookat",
    description: "Look at phone booth when it starts ringing",
    position: { x: 7, y: 2, z: 42 }, // Look at phonebooth (center/eye level)
    duration: 1.5,
    restoreControl: true,
    enableZoom: true, // Enable dramatic zoom/DoF when looking at phone booth
    zoomOptions: {
      zoomFactor: 2.0, // More dramatic 2x zoom
      minAperture: 0.2, // Stronger DoF effect
      maxAperture: 0.4,
      transitionStart: 0.6, // Start zooming earlier (60% of look-at)
      transitionDuration: 2.5, // Slower, more dramatic transition
      holdDuration: 3.0, // Hold the zoom longer for dramatic effect
    },
    criteria: { currentState: GAME_STATES.PHONE_BOOTH_RINGING },
    priority: 100,
    playOnce: true,
  },

  lookAndJump: {
    id: "lookAndJump",
    type: "animation",
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
