/**
 * Video Data Structure
 *
 * Each video contains:
 * - id: Unique identifier for the video
 * - videoPath: Path to the video file (WebM with alpha channel)
 * - position: [x, y, z] position in 3D space
 * - rotation: [x, y, z] rotation in radians
 * - scale: [x, y, z] scale multipliers
 * - loop: Whether the video should loop
 * - billboard: Whether the video should always face the camera
 * - criteria: Optional object with key-value pairs that must match game state
 *   - Simple equality: { currentState: GAME_STATES.INTRO }
 *   - Comparison operators: { currentState: { $gte: GAME_STATES.INTRO, $lt: GAME_STATES.DRIVE_BY } }
 *   - Operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
 * - autoPlay: If true, automatically play when conditions are met (default: false)
 * - playOn: Array of game states OR criteria object where this video should play
 *   - Array format: [STATE1, STATE2]
 *   - Criteria format: { currentState: { $gte: STATE } }
 * - once: If true, only play once (tracked automatically)
 * - priority: Higher priority videos are checked first (default: 0)
 * - onComplete: Optional function called when video ends, receives gameManager
 *
 * Usage:
 * import { videos } from './videoData.js';
 * videoManager.playVideo(videos.driveBy);
 */

import { GAME_STATES } from "./gameData.js";
import { checkPlayOn, checkCriteria } from "./criteriaHelper.js";

/**
 * Video IDs - Constants for type safety
 */
export const VIDEO_IDS = {
  DRIVE_BY: "drive-by",
};

export const videos = {
  [VIDEO_IDS.DRIVE_BY]: {
    id: VIDEO_IDS.DRIVE_BY,
    videoPath: "/video/1007-bw-2.webm",
    position: [10, 1, 60],
    rotation: [0, -Math.PI / 2, 0],
    scale: [3, 3, 3],
    loop: true,
    billboard: true,
    // Play from TITLE_SEQUENCE_COMPLETE onwards
    playOn: {
      currentState: { $gte: GAME_STATES.TITLE_SEQUENCE_COMPLETE },
    },
    autoPlay: true,
    once: false,
    priority: 0,
  },
};

/**
 * Get videos that match current game state
 * @param {Object} gameState - Current game state
 * @returns {Array} Array of matching video configurations
 */
export function getVideosForState(gameState) {
  return Object.values(videos).filter((video) => {
    // Check if video should play on current state (supports array or criteria object)
    if (video.playOn) {
      const shouldPlay = checkPlayOn(gameState, video.playOn);
      console.log(
        `VideoData: Checking video "${video.id}" - currentState: ${gameState.currentState}, playOn:`,
        video.playOn,
        `shouldPlay: ${shouldPlay}`
      );

      if (shouldPlay) {
        // Check criteria if specified (supports operators like $gte, $lt, etc.)
        if (video.criteria) {
          return checkCriteria(gameState, video.criteria);
        }

        return true;
      }
    }

    return false;
  });
}
