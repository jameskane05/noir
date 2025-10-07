/**
 * Music Data Structure
 *
 * Defines music tracks and their playback conditions based on game state.
 *
 * Each track contains:
 * - id: Unique identifier
 * - path: Path to the audio file
 * - description: Human-readable description
 * - requiresState: Optional object with key-value pairs that must match game state
 *   - Example: { titleSequenceComplete: true }
 * - activationCondition: Optional function that receives gameState and returns true if track should play
 *   - Example: (state) => state.chapter === 2 && state.hasSeenEnding === false
 * - fadeTime: Crossfade duration in seconds when switching to this track
 * - priority: Higher priority tracks are checked first (default: 0)
 * - isDefault: If true, this track plays when no other conditions match (default: false)
 *
 * Usage:
 * import { musicTracks, getMusicForState } from './musicData.js';
 */

import { GAME_STATES } from "./gameData.js";

export const musicTracks = {
  rach2: {
    id: "rach2",
    path: "./audio/music/rach 3 - mv 2 - 1-00.mp3",
    description: "Rachmaninoff 3 - Movement 2 (1:00) - Intro sequence",
    requiresState: { currentState: GAME_STATES.START_SCREEN },
    fadeTime: 2.0,
    priority: 100,
  },
  rachDriveBy: {
    id: "rachDriveBy",
    path: "./audio/music/rach 3 - mv 2 - 4-30.mp3",
    description: "Rachmaninoff 3 - Movement 2 (4:30) - Drive-by sequence",
    requiresState: { currentState: GAME_STATES.DRIVE_BY },
    fadeTime: 1.0,
    priority: 90,
  },
  rach1: {
    id: "rach1",
    path: "./audio/music/rach 3 - mv 1 - 0-40.mp3",
    description: "Rachmaninoff 3 - Movement 1 (0:00-0:40) - Main gameplay",
    // Play when currentState progresses beyond START_SCREEN
    activationCondition: (state) =>
      state.currentState > GAME_STATES.START_SCREEN,
    fadeTime: 0.25,
    priority: 10,
  },
};

/**
 * Get the appropriate music track for the current game state
 * @param {Object} gameState - Current game state
 * @returns {Object|null} Music track object or null if no match
 */
export function getMusicForState(gameState) {
  // Convert to array and sort by priority (descending)
  const sortedTracks = Object.values(musicTracks).sort(
    (a, b) => (b.priority || 0) - (a.priority || 0)
  );

  for (const track of sortedTracks) {
    // Check requiresState (simple key-value matching)
    if (track.requiresState) {
      let stateMatches = true;
      for (const [key, value] of Object.entries(track.requiresState)) {
        if (gameState[key] !== value) {
          stateMatches = false;
          break;
        }
      }
      if (!stateMatches) continue;
    }

    // Check activationCondition (custom function)
    if (track.activationCondition) {
      if (typeof track.activationCondition === "function") {
        try {
          if (!track.activationCondition(gameState)) {
            continue;
          }
        } catch (error) {
          console.warn(
            `MusicData: Error in activationCondition for track "${track.id}":`,
            error
          );
          continue;
        }
      }
    }

    // If we get here, all conditions passed
    return track;
  }

  // Fallback: return default track or first track
  const defaultTrack = sortedTracks.find((t) => t.isDefault);
  return defaultTrack || sortedTracks[0] || null;
}

/**
 * Get all available track IDs
 * @returns {Array<string>} Array of track IDs
 */
export function getAllTrackIds() {
  return Object.keys(musicTracks);
}

export default musicTracks;
