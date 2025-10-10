/**
 * Game Data
 *
 * Centralized definition of game state keys and their default values.
 * Keep this in sync with systems that read state (music, dialog, SFX, colliders).
 */

/**
 * Canonical state names/flags used across data files
 */
export const GAME_STATES = {
  START_SCREEN: 0, // Game has loaded, START and OPTIONS buttons available, fullscreen available, camera animation plays
  TITLE_SEQUENCE: 1, // Title sequence plays, camera animation plays
  TITLE_SEQUENCE_COMPLETE: 2, // Title sequence completes, intro narration starts, player starts
  INTRO_COMPLETE: 3,
  PHONE_BOOTH_RINGING: 4,
  ANSWERED_PHONE: 5,
  DIALOG_CHOICE_1: 6,
  DRIVE_BY_PREAMBLE: 7,
  DRIVE_BY: 8,
};

export const DIALOG_RESPONSE_TYPES = {
  EMPATH: 0,
  PSYCHOLOGIST: 1,
  LAWFUL: 2,
};

/**
 * Initial game state applied at startup (and can be reused for resets).
 */
export const startScreen = {
  // Session/game lifecycle
  isPlaying: false,
  isPaused: false,

  // Scene and world
  currentScene: null,

  // High-level state name
  currentState: GAME_STATES.START_SCREEN,

  // Control flow
  controlEnabled: false, // When true, character controller updates/inputs are enabled

  // Debug/authoring
  hasGizmoInData: false, // True when any data object (scene/video/etc.) declares gizmo: true

  // Display state
  isFullscreen: false, // When true, the app is in fullscreen mode
};

export default startScreen;
