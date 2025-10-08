/**
 * Scene Data Structure
 *
 * Defines scene objects like splat meshes and GLTF models.
 *
 * Each object contains:
 * - id: Unique identifier
 * - type: Type of object ('splat', 'gltf', etc.)
 * - path: Path to the asset file
 * - position: THREE.Vector3-compatible array [x, y, z]
 * - rotation: Euler angles [x, y, z] in radians
 * - scale: Uniform scale or [x, y, z] array
 * - description: Human-readable description
 * - options: Type-specific options
 * - criteria: Optional object with key-value pairs that must match game state
 *   - Simple equality: { currentState: GAME_STATES.CHAPTER_2 }
 *   - Comparison operators: { currentState: { $gte: GAME_STATES.INTRO, $lt: GAME_STATES.DRIVE_BY } }
 *   - Operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
 * - loadByDefault: If true, load regardless of state (default: false)
 * - priority: Higher priority objects are loaded first (default: 0)
 * - animations: Array of animation definitions (for GLTF objects with animations)
 *   - id: Unique identifier for this animation
 *   - clipName: Name of animation clip in GLTF (null = use first clip)
 *   - loop: Whether to loop the animation
 *   - criteria: Optional object with key-value pairs that must match game state for animation to play
 *     - Simple equality: { currentState: GAME_STATES.ANSWERED_PHONE }
 *     - Comparison operators: { currentState: { $gte: GAME_STATES.INTRO, $lt: GAME_STATES.DRIVE_BY } }
 *     - Operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
 *     - If criteria matches and not playing → play it
 *     - If criteria doesn't match and playing → stop it
 *   - autoPlay: If true, automatically play when criteria are met
 *   - playOnce: If true, only play once per game session
 *   - timeScale: Playback speed (1.0 = normal)
 *
 * Usage:
 * import { sceneObjects, getSceneObjectsForState } from './sceneData.js';
 */

import { GAME_STATES } from "./gameData.js";
import { checkCriteria } from "./criteriaHelper.js";

export const sceneObjects = {
  exterior: {
    id: "exterior",
    type: "splat",
    path: "/exterior-test.compressed.ply",
    description: "Main exterior environment splat mesh",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [7, 7, 7],
    quaternion: [1, 0, 0, 0], // [x, y, z, w]
    loadByDefault: true, // Always load this scene
    priority: 100, // Load first
  },

  phonebooth: {
    id: "phonebooth",
    type: "gltf",
    path: "/gltf/phonebooth.glb",
    description: "Phone booth GLTF model",
    position: [7, -2.5, 42],
    rotation: [0, Math.PI / 2, 0], // 90 degrees around Y axis
    scale: [2.5, 2.5, 2.5],
    options: {
      // Create a container group for proper scaling
      useContainer: true,
    },
    loadByDefault: true, // Always load this object
    priority: 50,
    animations: [
      {
        id: "phonebooth-ring", // Identifier for this animation
        clipName: null, // null = use first animation clip from GLTF
        loop: false, // Whether the animation should loop
        criteria: {
          currentState: {
            $gte: GAME_STATES.ANSWERED_PHONE,
            $lt: GAME_STATES.DIALOG_CHOICE_1,
          },
        },
        autoPlay: true, // Automatically play when criteria are met
        playOnce: true, // Only play once per session
        timeScale: 1.0, // Playback speed (1.0 = normal)
      },
    ],
  },
};

/**
 * Get scene objects that should be loaded for the current game state
 * @param {Object} gameState - Current game state
 * @returns {Array<Object>} Array of scene objects that should be loaded
 */
export function getSceneObjectsForState(gameState) {
  // Convert to array and sort by priority (descending)
  const sortedObjects = Object.values(sceneObjects).sort(
    (a, b) => (b.priority || 0) - (a.priority || 0)
  );

  const matchingObjects = [];

  for (const obj of sortedObjects) {
    // Always include objects marked as loadByDefault
    if (obj.loadByDefault === true) {
      matchingObjects.push(obj);
      continue;
    }

    // Check criteria (supports operators like $gte, $lt, etc.)
    if (obj.criteria) {
      if (!checkCriteria(gameState, obj.criteria)) {
        continue;
      }
    }

    // If we get here, all conditions passed
    matchingObjects.push(obj);
  }

  return matchingObjects;
}

/**
 * Get a scene object by ID
 * @param {string} id - Object ID
 * @returns {Object|null} Scene object data or null if not found
 */
export function getSceneObject(id) {
  return sceneObjects[id] || null;
}

/**
 * Get all scene object IDs
 * @returns {Array<string>} Array of all object IDs
 */
export function getAllSceneObjectIds() {
  return Object.keys(sceneObjects);
}

/**
 * Get all objects of a specific type
 * @param {string} type - Object type ('splat', 'gltf', etc.)
 * @returns {Array<Object>} Array of scene objects matching the type
 */
export function getSceneObjectsByType(type) {
  return Object.values(sceneObjects).filter((obj) => obj.type === type);
}

export default sceneObjects;
