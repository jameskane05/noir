/**
 * Dialog Data Structure
 *
 * Each dialog sequence contains:
 * - id: Unique identifier for the dialog
 * - audio: Path to the audio file
 * - captions: Array of caption objects with:
 *   - text: The text to display
 *   - duration: How long to show this caption (in seconds)
 * - criteria: Optional object with key-value pairs that must match game state
 *   - Simple equality: { currentState: GAME_STATES.TITLE_SEQUENCE_COMPLETE }
 *   - Comparison operators: { currentState: { $gte: GAME_STATES.INTRO, $lt: GAME_STATES.DRIVE_BY } }
 *   - Operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
 *   - Example: Play after INTRO but before DRIVE_BY
 * - once: If true, only play once (tracked automatically)
 * - priority: Higher priority dialogs are checked first (default: 0)
 * - autoPlay: If true, automatically play when conditions are met (default: false)
 * - delay: Delay in seconds before playing after state conditions are met (default: 0)
 * - onComplete: Optional function called when dialog completes, receives gameManager
 *   - Example: (gameManager) => gameManager.setState({ currentState: GAME_STATES.NEXT_STATE })
 *
 * Note: For multiple choice dialogs, see dialogChoiceData.js
 *
 * Usage:
 * import { dialogSequences, getDialogForState } from './dialogData.js';
 * dialogManager.playDialog(dialogSequences.intro);
 */

import { GAME_STATES, DIALOG_RESPONSE_TYPES } from "./gameData.js";
import { checkCriteria } from "./criteriaHelper.js";

/**
 * Dialog IDs - Numeric constants for type safety
 */
export const DIALOG_IDS = {
  INTRO: 0,
  OKAY_I_CAN_TAKE_A_HINT: 1,
  BONNE_SOIREE: 2,
  DIALOG_CHOICE_1_EMPATH: 3,
  DIALOG_CHOICE_1_PSYCHOLOGIST: 4,
  DIALOG_CHOICE_1_LAWFUL: 5,
  DIALOG_CHOICE_1_EMPATH_RESPONSE: 6,
  DIALOG_CHOICE_1_PSYCHOLOGIST_RESPONSE: 7,
  DIALOG_CHOICE_1_LAWFUL_RESPONSE: 8,
  THEYRE_HERE_FOR_YOU: 9,
  DRIVE_BY_PREAMBLE: 10,
};

export const dialogSequences = {
  [DIALOG_IDS.INTRO]: {
    id: DIALOG_IDS.INTRO,
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
    criteria: { currentState: GAME_STATES.TITLE_SEQUENCE_COMPLETE },
    once: true,
    autoPlay: true,
    priority: 100,
    delay: 1.0, // Wait 1 second after title sequence completes
    onComplete: (gameManager) => {
      console.log("INTRO dialog complete - setting state to INTRO_COMPLETE");
      gameManager.setState({ currentState: GAME_STATES.INTRO_COMPLETE });
    },
  },

  // Dialog that plays when phone starts ringing
  [DIALOG_IDS.OKAY_I_CAN_TAKE_A_HINT]: {
    id: DIALOG_IDS.OKAY_I_CAN_TAKE_A_HINT,
    audio: "./audio/dialog/01-okay-i-can-take-a-hint.mp3",
    captions: [{ text: "Okay, I can take a hint.", duration: 2.0 }],
    criteria: { currentState: GAME_STATES.PHONE_BOOTH_RINGING },
    once: true,
    autoPlay: true,
    priority: 100,
    delay: 5,
  },

  // Dialog that triggers first choice moment
  [DIALOG_IDS.BONNE_SOIREE]: {
    id: DIALOG_IDS.BONNE_SOIREE,
    audio: "./audio/dialog/02-bonne-soiree.mp3",
    captions: [
      { text: "Bonne soirée...", duration: 1.5 },
      { text: "I presume you know who this is?", duration: 2 },
    ],
    criteria: { currentState: GAME_STATES.ANSWERED_PHONE },
    once: true,
    autoPlay: true,
    priority: 100,
    delay: 2.0, // Wait 2 seconds after answering phone
  },

  // Follow-up dialog for EMPATH response
  [DIALOG_IDS.DIALOG_CHOICE_1_EMPATH]: {
    id: DIALOG_IDS.DIALOG_CHOICE_1_EMPATH,
    audio: "./audio/dialog/choice-1_empath_someone-who-made-a-mistake.mp3",
    captions: [
      { text: "Someone who made a little mistake, that's all.", duration: 2.5 },
    ],
    criteria: {
      currentState: GAME_STATES.DIALOG_CHOICE_1,
      dialogChoice1: DIALOG_RESPONSE_TYPES.EMPATH,
    },
    once: true,
    autoPlay: true,
    priority: 100,
    delay: 1.0,
    onComplete: (gameManager) => {
      console.log("Empath path chosen - triggering PETIT's response");
      gameManager.setState({ dialogChoice1Response: true });
    },
  },

  // Follow-up dialog for PSYCHOLOGIST response
  [DIALOG_IDS.DIALOG_CHOICE_1_PSYCHOLOGIST]: {
    id: DIALOG_IDS.DIALOG_CHOICE_1_PSYCHOLOGIST,
    audio:
      "./audio/dialog/choice-1_psych_someone-who-was-never-taught-better.mp3",
    captions: [
      {
        text: "Someone who was never taught better than the ways of a thief.",
        duration: 2.5,
      },
    ],
    criteria: {
      currentState: GAME_STATES.DIALOG_CHOICE_1,
      dialogChoice1: DIALOG_RESPONSE_TYPES.PSYCHOLOGIST,
    },
    once: true,
    autoPlay: true,
    priority: 100,
    delay: 1.0,
    onComplete: (gameManager) => {
      console.log("Psychologist path chosen - triggering PETIT's response");
      gameManager.setState({ dialogChoice1Response: true });
    },
  },

  // Follow-up dialog for LAWFUL response
  [DIALOG_IDS.DIALOG_CHOICE_1_LAWFUL]: {
    id: DIALOG_IDS.DIALOG_CHOICE_1_LAWFUL,
    audio: "./audio/dialog/choice-1_lawful_someone-with-stolen-property.mp3",
    captions: [
      {
        text: "Someone with stolen property in their possession",
        duration: 2.0,
      },
      { text: "who might be in a lot of trouble!", duration: 2.0 },
    ],
    criteria: {
      currentState: GAME_STATES.DIALOG_CHOICE_1,
      dialogChoice1: DIALOG_RESPONSE_TYPES.LAWFUL,
    },
    once: true,
    autoPlay: true,
    priority: 100,
    delay: 1.0,
    onComplete: (gameManager) => {
      console.log("Lawful path chosen - triggering PETIT's response");
      gameManager.setState({ dialogChoice1Response: true });
    },
  },

  // PETIT's responses to player's dialog choices
  [DIALOG_IDS.DIALOG_CHOICE_1_EMPATH_RESPONSE]: {
    id: DIALOG_IDS.DIALOG_CHOICE_1_EMPATH_RESPONSE,
    audio: "./audio/dialog/resp-1_empath_oui-and-ive-made-so-many.mp3",
    captions: [{ text: "Oui, and I've made *so* many.", duration: 2.5 }],
    criteria: {
      currentState: GAME_STATES.DIALOG_CHOICE_1,
      dialogChoice1: DIALOG_RESPONSE_TYPES.EMPATH,
      dialogChoice1Response: true,
    },
    once: true,
    autoPlay: true,
    priority: 99,
    delay: 0.5,
    onComplete: (gameManager) => {
      console.log("PETIT empath response complete - triggering warning");
      gameManager.setState({ currentState: GAME_STATES.DRIVE_BY_PREAMBLE });
    },
  },

  [DIALOG_IDS.DIALOG_CHOICE_1_PSYCHOLOGIST_RESPONSE]: {
    id: DIALOG_IDS.DIALOG_CHOICE_1_PSYCHOLOGIST_RESPONSE,
    audio: "./audio/dialog/resp-1_psych_im-sure-youll-educate-me.mp3",
    captions: [{ text: "I'm sure you will educate me...", duration: 2.0 }],
    criteria: {
      currentState: GAME_STATES.DIALOG_CHOICE_1,
      dialogChoice1: DIALOG_RESPONSE_TYPES.PSYCHOLOGIST,
      dialogChoice1Response: true,
    },
    once: true,
    autoPlay: true,
    priority: 99,
    delay: 0.5,
    onComplete: (gameManager) => {
      console.log("PETIT psychologist response complete - triggering warning");
      gameManager.setState({ currentState: GAME_STATES.DRIVE_BY_PREAMBLE });
    },
  },

  [DIALOG_IDS.DIALOG_CHOICE_1_LAWFUL_RESPONSE]: {
    id: DIALOG_IDS.DIALOG_CHOICE_1_LAWFUL_RESPONSE,
    audio: "./audio/dialog/resp-1_lawful_hm-quite-the-lawman-you-are.mp3",
    captions: [{ text: "Hm, quite the lawman you are.", duration: 2.0 }],
    criteria: {
      currentState: GAME_STATES.DIALOG_CHOICE_1,
      dialogChoice1: DIALOG_RESPONSE_TYPES.LAWFUL,
      dialogChoice1Response: true,
    },
    once: true,
    autoPlay: true,
    priority: 99,
    delay: 0.5,
    onComplete: (gameManager) => {
      console.log("PETIT lawful response complete - triggering warning");
      gameManager.setState({ currentState: GAME_STATES.DRIVE_BY_PREAMBLE });
    },
  },

  // Warning dialog after PETIT's response
  [DIALOG_IDS.THEYRE_HERE_FOR_YOU]: {
    id: DIALOG_IDS.THEYRE_HERE_FOR_YOU,
    audio: "./audio/dialog/04-theyre-here-for-you-duck-and-cover-now.mp3",
    captions: [
      { text: "They're here for you!", duration: 1.65 },
      { text: "Duck and cover, now!", duration: 2.0 },
    ],
    criteria: {
      currentState: GAME_STATES.DRIVE_BY_PREAMBLE,
    },
    once: true,
    autoPlay: true,
    priority: 98,
    delay: 2.125,
    onComplete: (gameManager) => {
      console.log("Warning complete - moving to DRIVE_BY_PREAMBLE state");
      gameManager.setState({ currentState: GAME_STATES.DRIVE_BY });
    },
  },

  // PETIT's final warning before drive-by
  // [DIALOG_IDS.DRIVE_BY_PREAMBLE]: {
  //   id: DIALOG_IDS.DRIVE_BY_PREAMBLE,
  //   audio: "./audio/dialog/00-oui-you-know-him.mp3",
  //   captions: [
  //     { text: "Oui, you know him.", duration: 2.0 },
  //     { text: "And you'd better high-tail it!", duration: 3.0 },
  //     {
  //       text: "There is an attic nearby, and someone waiting...",
  //       duration: 3.0,
  //     },
  //   ],
  //   criteria: {
  //     currentState: GAME_STATES.DRIVE_BY_PREAMBLE,
  //   },
  //   once: true,
  //   autoPlay: true,
  //   priority: 100,
  //   delay: 0.5,
  //   onComplete: (gameManager) => {
  //     console.log("DRIVE_BY_PREAMBLE dialog completed - moving to DRIVE_BY");
  //     gameManager.setState({ currentState: GAME_STATES.DRIVE_BY });

  //     // Trigger the look-and-jump camera animation
  //     gameManager.emit("camera:animation", {
  //       animation: "/json/look-and-jump.json",
  //       onComplete: (success) => {
  //         if (success) {
  //           console.log("Look and jump camera animation completed");
  //         }
  //       },
  //     });
  //   },
  // },
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

    // Check criteria (supports operators like $gte, $lt, etc.)
    if (dialog.criteria) {
      if (!checkCriteria(gameState, dialog.criteria)) {
        continue;
      }
    }

    // If we get here, all conditions passed
    matchingDialogs.push(dialog);
  }

  return matchingDialogs;
}

export default dialogSequences;

// { text: "I didn't paint those paintings!", duration: 2.0 },
// { text: "And I just saved your life!", duration: 3.5 },
// {
//   text: "Those goons were going to hang this on you, dummy!",
//   duration: 2.5,
// },
