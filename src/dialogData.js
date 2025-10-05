/**
 * Dialog Data Structure
 *
 * Each dialog sequence contains:
 * - id: Unique identifier for the dialog
 * - audio: Path to the audio file
 * - captions: Array of caption objects with:
 *   - text: The text to display
 *   - duration: How long to show this caption (in seconds)
 * - requiresState: Optional object with key-value pairs that must match game state
 *   - Example: { titleSequenceComplete: true }
 * - activationCondition: Optional function that receives gameState and returns true if dialog should play
 *   - Example: (state) => state.chapter === 2 && !state.hasSeenDialog
 * - once: If true, only play once (tracked automatically)
 * - priority: Higher priority dialogs are checked first (default: 0)
 * - autoPlay: If true, automatically play when conditions are met (default: false)
 * - delay: Delay in seconds before playing after state conditions are met (default: 0)
 *
 * Usage:
 * import { dialogSequences, getDialogForState } from './dialogData.js';
 * dialogManager.playDialog(dialogSequences.intro);
 */

import { GAME_STATES } from "./gameData.js";

export const dialogSequences = {
  // Intro dialog - plays after title sequence
  intro: {
    id: "intro",
    audio: "./audio/dialog/00-on-her-trail.mp3",
    captions: [
      { text: "I'd been on her trail for weeks.", duration: 2.0 },
      { text: "An art thief, she'd swindled society-types,", duration: 3.5 },
      {
        text: "hauling in more than a few of the Old Masters.",
        duration: 2.5,
      },
      {
        text: "An anonymous tip came in:",
        duration: 2.5,
      },
      {
        text: "the stash was uptown,",
        duration: 2.0,
      },
      {
        text: "and sure as I staked it out, she was there.",
        duration: 2.0,
      },
      {
        text: "Time to answer some tough questions, Ms. Petit.",
        duration: 2.5,
      },
    ],
    requiresState: { currentState: GAME_STATES.TITLE_SEQUENCE_COMPLETE },
    once: true,
    autoPlay: true,
    priority: 100,
    delay: 1.0, // Wait 1 second after title sequence completes
  },

  // Example intro dialog
  paintings: {
    id: "didnt-paint-those-paintings",
    audio: "./audio/dialog/01-didnt-paint-those-paintings.mp3",
    captions: [
      { text: "I didn't paint those paintings!", duration: 2.0 },
      { text: "And I just saved your life!", duration: 3.5 },
      {
        text: "Those goons were going to hang this on you, dummy!",
        duration: 2.5,
      },
    ],
    requiresState: { currentState: GAME_STATES.ANSWERED_PHONE },
    once: true,
    autoPlay: true,
    priority: 100,
    delay: 2.0, // Wait 2 seconds after answering phone
  },

  // Example character greeting
  greeting: {
    id: "greeting",
    audio: "./audio/dialog/00-oui-you-know-him.mp3",
    captions: [
      { text: "Oui, you know him.", duration: 2.0 },
      { text: "And you'd better high-tail it!", duration: 3.0 },
      {
        text: "There is an attic nearby, and someone waiting...",
        duration: 3.0,
      },
    ],
  },
};

/**
 * Get dialog sequences that should play for the current game state
 * @param {Object} gameState - Current game state
 * @param {Set} playedDialogs - Set of dialog IDs that have already been played
 * @returns {Array} Array of dialog sequences that match conditions
 */
export function getDialogsForState(gameState, playedDialogs = new Set()) {
  // Convert to array and filter for autoPlay dialogs only
  const autoPlayDialogs = Object.values(dialogSequences).filter(
    (dialog) => dialog.autoPlay === true
  );

  // Sort by priority (descending)
  const sortedDialogs = autoPlayDialogs.sort(
    (a, b) => (b.priority || 0) - (a.priority || 0)
  );

  const matchingDialogs = [];

  for (const dialog of sortedDialogs) {
    // Skip if already played and marked as "once"
    if (dialog.once && playedDialogs.has(dialog.id)) {
      continue;
    }

    // Check requiresState (simple key-value matching)
    if (dialog.requiresState) {
      let stateMatches = true;
      for (const [key, value] of Object.entries(dialog.requiresState)) {
        if (gameState[key] !== value) {
          stateMatches = false;
          break;
        }
      }
      if (!stateMatches) continue;
    }

    // Check activationCondition (custom function)
    if (dialog.activationCondition) {
      if (typeof dialog.activationCondition === "function") {
        try {
          if (!dialog.activationCondition(gameState)) {
            continue;
          }
        } catch (error) {
          console.warn(
            `DialogData: Error in activationCondition for dialog "${dialog.id}":`,
            error
          );
          continue;
        }
      }
    }

    // If we get here, all conditions passed
    matchingDialogs.push(dialog);
  }

  return matchingDialogs;
}

export default dialogSequences;
