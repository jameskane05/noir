import { GAME_STATES, startScreen } from "./gameData.js";

/**
 * DebugSpawner - Debug utility for spawning into specific game states
 *
 * Usage:
 * - Add ?gameState=ANSWERED_PHONE to URL
 * - All managers will initialize with correct state (music, SFX, dialogs, scenes)
 *
 * Available states:
 * - START_SCREEN (default)
 * - TITLE_SEQUENCE
 * - TITLE_SEQUENCE_COMPLETE
 * - PHONE_BOOTH_RINGING
 * - ANSWERED_PHONE
 */

/**
 * Debug state presets - define the full state for each debug spawn point
 */
export const debugStatePresets = {
  START_SCREEN: {
    ...startScreen,
    currentState: GAME_STATES.START_SCREEN,
    controlEnabled: false,
    cityAmbiance: false,
    playerPosition: { x: 10, y: 0.9, z: 15 }, // Default spawn
  },

  TITLE_SEQUENCE: {
    ...startScreen,
    currentState: GAME_STATES.TITLE_SEQUENCE,
    controlEnabled: false,
    cityAmbiance: true,
    playerPosition: { x: 10, y: 0.9, z: 15 },
  },

  TITLE_SEQUENCE_COMPLETE: {
    ...startScreen,
    currentState: GAME_STATES.TITLE_SEQUENCE_COMPLETE,
    controlEnabled: true,
    cityAmbiance: true,
    playerPosition: { x: 10, y: 0.9, z: 15 },
  },

  PHONE_BOOTH_RINGING: {
    ...startScreen,
    currentState: GAME_STATES.PHONE_BOOTH_RINGING,
    controlEnabled: true,
    cityAmbiance: true,
    playerPosition: { x: 10, y: 0.9, z: 40 }, // Near phone booth
  },

  ANSWERED_PHONE: {
    ...startScreen,
    currentState: GAME_STATES.ANSWERED_PHONE,
    controlEnabled: true,
    cityAmbiance: true,
    playerPosition: { x: 7, y: 0.9, z: 42 }, // At phone booth
  },
};

/**
 * Parse URL and get debug state preset
 * @returns {Object|null} State preset if debug spawn is requested, null otherwise
 */
export function getDebugSpawnState() {
  const urlParams = new URLSearchParams(window.location.search);
  const gameStateParam = urlParams.get("gameState");

  if (!gameStateParam) {
    return null;
  }

  // Try to find matching preset
  const preset = debugStatePresets[gameStateParam];

  if (!preset) {
    console.warn(
      `DebugSpawner: Unknown gameState "${gameStateParam}". Available states:`,
      Object.keys(debugStatePresets)
    );
    return null;
  }

  console.log(`DebugSpawner: Spawning into state "${gameStateParam}"`);
  return { ...preset };
}

/**
 * Check if debug spawn is active
 * @returns {boolean}
 */
export function isDebugSpawnActive() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has("gameState");
}

/**
 * Get the name of the current debug spawn state
 * @returns {string|null}
 */
export function getDebugSpawnStateName() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("gameState");
}

/**
 * Apply character position from debug state
 * @param {Object} character - Physics character/rigid body
 * @param {Object} debugState - Debug state preset
 */
export function applyDebugCharacterPosition(character, debugState) {
  if (!character || !debugState || !debugState.playerPosition) {
    return;
  }

  const pos = debugState.playerPosition;
  character.translation.x = pos.x;
  character.translation.y = pos.y;
  character.translation.z = pos.z;

  console.log(
    `DebugSpawner: Set character position to (${pos.x}, ${pos.y}, ${pos.z})`
  );
}

export default {
  getDebugSpawnState,
  isDebugSpawnActive,
  getDebugSpawnStateName,
  applyDebugCharacterPosition,
  debugStatePresets,
};
