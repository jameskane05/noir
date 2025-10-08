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
 * - criteria: Optional object with key-value pairs that must match game state for video to play
 *   - Simple equality: { currentState: GAME_STATES.INTRO }
 *   - Comparison operators: { currentState: { $gte: GAME_STATES.INTRO, $lt: GAME_STATES.DRIVE_BY } }
 *   - Operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
 *   - If criteria matches → video should play
 *   - If criteria doesn't match → video should stop
 * - autoPlay: If true, automatically play when criteria are met (default: false)
 * - delay: Delay in seconds before playing the video when criteria are met (default: 0)
 * - once: If true, only play once (tracked automatically)
 * - priority: Higher priority videos are checked first (default: 0)
 * - onComplete: Optional function called when video ends, receives gameManager
 *
 * Usage:
 * import { videos } from './videoData.js';
 * videoManager.playVideo(videos.driveBy);
 */

import { GAME_STATES } from "./gameData.js";
import { checkCriteria } from "./criteriaHelper.js";

/**
 * Video IDs - Constants for type safety
 */
export const VIDEO_IDS = {
  DRIVE_BY: "drive-by",
  CAT: "cat",
};

export const videos = {
  [VIDEO_IDS.DRIVE_BY]: {
    id: VIDEO_IDS.DRIVE_BY,
    videoPath: "/video/1007-bw-2.webm",
    position: [-27.82, 1, 53.86],
    rotation: [0, -Math.PI / 2, 0],
    scale: [3, 3, 3],
    loop: true,
    muted: true,
    billboard: true,
    criteria: {
      currentState: { $gte: GAME_STATES.START_SCREEN },
    },
    autoPlay: true,
    once: false,
    priority: 0,
  },
  [VIDEO_IDS.CAT]: {
    id: VIDEO_IDS.CAT,
    videoPath: "/video/cat.webm",
    position: [-102.44, -6.4, -118.24], // 3 meters in front of drive-by video
    rotation: [0, -Math.PI / 2, 0],
    scale: [2, 2, 2],
    loop: true,
    muted: true,
    billboard: true,
    criteria: {
      heardCat: true,
    },
    autoPlay: true,
    delay: 0.5, // Wait 1 second after heardCat becomes true before playing
    once: false,
    priority: 0,
    gizmo: true,
  },
};

/**
 * Get videos that match current game state
 * @param {Object} gameState - Current game state
 * @returns {Array} Array of matching video configurations
 */
export function getVideosForState(gameState) {
  return Object.values(videos).filter((video) => {
    // Check if video has criteria
    if (!video.criteria) {
      return false;
    }

    // Check if criteria match current state
    const shouldPlay = checkCriteria(gameState, video.criteria);
    console.log(
      `VideoData: Checking video "${video.id}" - currentState: ${gameState.currentState}, criteria:`,
      video.criteria,
      `shouldPlay: ${shouldPlay}`
    );

    return shouldPlay;
  });
}
