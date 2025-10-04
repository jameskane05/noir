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
 * - "custom": Emit custom event for game-specific logic
 *   - data: { eventName: "name", payload: {...} }
 */

import { dialogSequences } from "./dialogData.js";

export const colliders = [
  // Debug test trigger - moved away from phonebooth
  {
    id: "test-paintings-trigger",
    type: "box",
    position: { x: 10, y: 2, z: 5 }, // 5m away from phonebooth (phonebooth at z:10)
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: { x: 1.5, y: 1.5, z: 1.5 }, // 3x3x3 box
    onEnter: [
      {
        type: "dialog",
        data: { dialogId: "paintings" },
      },
    ],
    onExit: [],
    once: false, // Can trigger multiple times for testing
    enabled: true,
  },

  // Add your colliders here...
];

export default colliders;
