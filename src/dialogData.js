/**
 * Dialog Data Structure
 *
 * Each dialog sequence contains:
 * - id: Unique identifier for the dialog
 * - audio: Path to the audio file
 * - captions: Array of caption objects with:
 *   - text: The text to display
 *   - duration: How long to show this caption (in seconds)
 *
 * Usage:
 * import { dialogSequences } from './dialogData.js';
 * dialogManager.playDialog(dialogSequences.intro);
 */

export const dialogSequences = {
  // Example intro dialog
  intro: {
    id: "intro",
    audio: "./audio/dialog/01-didnt-paint-those-paintings.mp3",
    captions: [
      { text: "I didn't paint those paintings!", duration: 2.0 },
      { text: "And I just saved your life!", duration: 3.5 },
      {
        text: "Those goons were going to hang this on you, dummy!",
        duration: 2.5,
      },
    ],
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

  // Example tutorial
  tutorial: {
    id: "tutorial",
    audio: "./audio/dialog/tutorial.mp3",
    captions: [
      { text: "Use WASD to move around.", duration: 3.0 },
      { text: "Hold Shift to sprint.", duration: 2.5 },
      { text: "Press O to switch music.", duration: 2.5 },
    ],
  },

  // Example warning
  warning: {
    id: "warning",
    audio: "./audio/dialog/warning.mp3",
    captions: [
      { text: "Something doesn't feel right...", duration: 3.0 },
      { text: "Be careful.", duration: 2.0 },
    ],
  },

  // Add your dialog sequences here following the same format:
  // sequenceName: {
  //   id: "unique-id",
  //   audio: "./audio/dialog/filename.mp3",
  //   captions: [
  //     { text: "First line of dialog", duration: 3.0 },
  //     { text: "Second line of dialog", duration: 2.5 },
  //   ],
  // },
};

// Optional: Dialog triggers for game events
export const dialogTriggers = {
  onGameStart: "intro",
  onFirstEncounter: "greeting",
  onTutorialStart: "tutorial",
  onDangerNear: "warning",

  // Add your triggers here:
  // eventName: "dialogSequenceId",
};

export default dialogSequences;
