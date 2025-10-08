/**
 * Collider Data Structure
 *
 * Each collider defines a trigger zone that can emit events when the player enters or exits.
 * These events are passed to the GameManager which can then trigger dialog, music, UI, etc.
 *
 * Collider properties:
 * - id: Unique identifier for the collider
 * - type: Shape type - "box", "sphere", or "capsule"
 * - position: {x, y, z} world position
 * - rotation: {x, y, z} rotation in DEGREES (converted to quaternion internally)
 * - dimensions: Shape-specific dimensions
 *   - box: {x, y, z} half-extents (full size is 2x these values)
 *   - sphere: {radius}
 *   - capsule: {halfHeight, radius}
 * - onEnter: Array of events to emit when player enters
 *   - Each event: { type: "event-type", data: {...} }
 * - onExit: Array of events to emit when player exits
 * - once: If true, only trigger once then deactivate (default: false)
 * - enabled: If false, collider is inactive (default: true)
 * - activationCondition: Optional function that receives gameState and returns true if collider should be active
 *   - Example: (state) => state.hasMetCharacter === true
 * - criteria: Optional object with key-value pairs that must match game state
 *   - Example: { introComplete: true, chapter: 1 }
 *
 * Event Types:
 * - "dialog": Trigger a dialog sequence
 *   - data: { dialogId: "sequence-name", onComplete: "optional-event-id" }
 * - "music": Change music track
 *   - data: { track: "track-name", fadeTime: 2.0 }
 * - "sfx": Play a sound effect
 *   - data: { sound: "sound-name", volume: 1.0 }
 * - "ui": Show/hide UI elements
 *   - data: { action: "show|hide", element: "element-name" }
 * - "state": Set game state
 *   - data: { key: "state-key", value: any }
 * - "camera-lookat": Trigger camera look-at
 *   - data: { position: {x, y, z}, duration: 2.0, restoreControl: true }
 * - "camera-animation": Play a camera animation
 *   - data: { animation: "path/to/animation.json", onComplete: optional-callback }
 * - "custom": Emit custom event for game-specific logic
 *   - data: { eventName: "name", payload: {...} }
 */

import { GAME_STATES } from "./gameData.js";

export const colliders = [
  // {
  //   id: "trigger-camera-animation-test",
  //   type: "box",
  //   position: { x: 2, y: 0, z: 20 }, // Just behind the phonebooth-ring trigger
  //   rotation: { x: 0, y: 120, z: 0 },
  //   dimensions: { x: 6, y: 1.5, z: 1.5 },
  //   onEnter: [
  //     {
  //       type: "camera-animation",
  //       data: {
  //         animation: "/json/json-test.json",
  //       },
  //     },
  //   ],
  //   onExit: [],
  //   once: true,
  //   enabled: true,
  // },

  {
    id: "trigger-phonebooth-ring",
    type: "box",
    position: { x: 8, y: 0, z: 20 }, // 5m away from phonebooth (phonebooth at z:10)
    rotation: { x: 0, y: 120, z: 0 },
    dimensions: { x: 6, y: 1.5, z: 1.5 }, // 3x3x3 box
    onEnter: [
      {
        type: "camera-lookat",
        data: {
          position: { x: 7, y: 2, z: 42 }, // Look at phonebooth (center/eye level)
          duration: 1.5,
          restoreControl: true,
        },
      },
      {
        type: "state",
        data: { key: "currentState", value: GAME_STATES.PHONE_BOOTH_RINGING },
      },
    ],
    onExit: [],
    once: true, // Triggers once then cleans itself up
    enabled: true,
    // Optional: Activation conditions
    // criteria: { titleComplete: true }, // Simple key-value check
    // activationCondition: (state) => state.isPlaying === true, // Custom function
  },

  // Phonebooth interaction - only available after hearing the phone ring
  {
    id: "phonebooth-answer",
    type: "box",
    position: { x: 7, y: 1, z: 42 }, // At phonebooth location
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: { x: 1, y: 1.5, z: 1 }, // Small box around phone
    onEnter: [
      {
        type: "state",
        data: { key: "currentState", value: GAME_STATES.ANSWERED_PHONE },
      },
    ],
    onExit: [],
    once: true,
    enabled: true,
    criteria: { currentState: GAME_STATES.PHONE_BOOTH_RINGING }, // Only activates after phone starts ringing
  },

  // Add your colliders here...
];

export default colliders;
