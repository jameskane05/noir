/**
 * Video Data Structure
 *
 * Each video contains:
 * - id: Unique identifier for the video
 * - videoPath: Path to the video file (WebM with alpha channel)
 * - position: {x, y, z} position in 3D space
 * - rotation: {x, y, z} rotation in radians
 * - scale: {x, y, z} scale multipliers
 * - loop: Whether the video should loop
 * - muted: Whether the video should be muted (default: true)
 * - volume: Volume level 0.0-1.0 (default: 1.0)
 * - spatialAudio: Enable 3D spatial audio (default: false)
 * - audioPositionOffset: {x, y, z} offset from video position for audio source (default: {x:0, y:0, z:0})
 * - pannerAttr: Web Audio API PannerNode attributes (default: HRTF, inverse distance)
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
 * - gizmo: If true, enable debug gizmo for positioning visual objects (G=move, R=rotate, S=scale)
 * - onComplete: Optional function called when video ends, receives gameManager
 *
 * Usage:
 * import { videos } from './videoData.js';
 * videoManager.playVideo('drive-by');
 * // or reference directly: videos.driveBy.position
 */

import { GAME_STATES } from "./gameData.js";
import { checkCriteria } from "./criteriaHelper.js";

export const videos = {
  driveBy: {
    id: "drive-by",
    videoPath: "/video/1007-bw-2.webm",
    position: { x: -27.82, y: 1, z: 53.86 },
    rotation: { x: 0, y: -Math.PI / 2, z: 0 },
    scale: { x: 3, y: 3, z: 3 },
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
  cat: {
    id: "cat",
    videoPath: "/video/cat.webm",
    position: { x: -78.53, y: -6.79, z: 46.03 },
    rotation: { x: 0, y: Math.PI / 2, z: 0 },
    scale: { x: 2, y: 2, z: 2 },
    loop: false,
    muted: false,
    billboard: true,
    criteria: {
      heardCat: true,
    },
    autoPlay: true,
    once: true,
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
