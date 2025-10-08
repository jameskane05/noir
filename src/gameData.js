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
  START_SCREEN: 0,
  TITLE_SEQUENCE: 1,
  TITLE_SEQUENCE_COMPLETE: 2,
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

/**
 * Optional: Descriptions for state keys (for reference and tooling).
 */
export const stateDescriptions = {
  isPlaying: "True when gameplay has started.",
  isPaused: "True when game is paused.",
  currentScene: "Identifier for the currently loaded scene/area.",
  playerPosition: "Last known player position in world space.",
  currentState: "High-level app state (e.g., 'startScreen', 'titleSequence').",
  controlEnabled: "Enables character controller updates and input.",
  hasGizmoInData:
    "True when any data object declares gizmo: true (authoring mode).",
  titleSequenceComplete: "Set true when title sequence completes.",
  isFullscreen: "True when app is in fullscreen mode.",
};

export default startScreen;
