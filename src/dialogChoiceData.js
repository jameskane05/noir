/**
 * Dialog Choice Data
 *
 * Defines which dialog options to present as choices for each DIALOG_CHOICE state.
 * This keeps dialog data clean and separates choice configuration.
 *
 * Structure:
 * - triggerDialog: ID of the dialog that triggers this choice moment
 * - choiceStateKey: The game state key to store the selected response type
 * - prompt: Optional prompt text shown above choices
 * - choices: Array of choice objects:
 *   - text: Button text (what player sees)
 *   - responseType: Response type to store in game state (from DIALOG_RESPONSE_TYPES)
 *   - dialogId: ID of the dialog to play from dialogData.js
 * - onSelect: Callback when any choice is selected
 *   - Receives: (gameManager, selectedChoice)
 *   - Should return: object with state updates (e.g., { currentState: GAME_STATES.NEXT })
 *   - Returns are merged with choiceStateKey to apply all updates at once
 */

import { GAME_STATES, DIALOG_RESPONSE_TYPES } from "./gameData.js";
import { dialogSequences, DIALOG_IDS } from "./dialogData.js";

export const dialogChoices = {
  // First choice moment - after phone call
  choice1: {
    id: "choice1",
    criteria: { currentState: GAME_STATES.ANSWERED_PHONE },
    triggerDialog: DIALOG_IDS.BONNE_SOIREE, // Dialog that triggers this choice
    choiceStateKey: "dialogChoice1",
    prompt: null, // Optional prompt above choices
    choices: [
      {
        text: "Someone who made a mistake.",
        responseType: DIALOG_RESPONSE_TYPES.EMPATH,
        dialogId: DIALOG_IDS.DIALOG_CHOICE_1_EMPATH,
      },
      {
        text: "Someone who was never taught better.",
        responseType: DIALOG_RESPONSE_TYPES.PSYCHOLOGIST,
        dialogId: DIALOG_IDS.DIALOG_CHOICE_1_PSYCHOLOGIST,
      },
      {
        text: "Someone with stolen property.",
        responseType: DIALOG_RESPONSE_TYPES.LAWFUL,
        dialogId: DIALOG_IDS.DIALOG_CHOICE_1_LAWFUL,
      },
    ],
    onSelect: (gameManager, selectedChoice) => {
      // Return state updates instead of calling setState directly
      // This prevents multiple setState calls that would retrigger autoplay
      return { currentState: GAME_STATES.DIALOG_CHOICE_1 };
    },
  },

  // Example: Second choice moment
  // choice2: {
  //   id: "choice2",
  //   criteria: { currentState: GAME_STATES.SOME_OTHER_STATE },
  //   triggerDialog: "someOtherDialog",
  //   choiceStateKey: "dialogChoice2",
  //   prompt: "What do you do?",
  //   choices: [
  //     {
  //       text: "Option A",
  //       responseType: "optionA",
  //       dialogId: "optionAResponse",
  //     },
  //     {
  //       text: "Option B",
  //       responseType: "optionB",
  //       dialogId: "optionBResponse",
  //     },
  //   ],
  //   onSelect: (gameManager, selectedChoice) => {
  //     // selectedChoice contains: { text, responseType, responseDialog, onSelect }
  //     return { currentState: GAME_STATES.NEXT_STATE };
  //   },
  // },
};

/**
 * Get choice configuration for a specific dialog
 * @param {string} dialogId - Dialog ID that just completed
 * @returns {Object|null} Choice configuration or null if no choices
 */
export function getChoiceForDialog(dialogId) {
  for (const choice of Object.values(dialogChoices)) {
    if (choice.triggerDialog === dialogId) {
      return choice;
    }
  }
  return null;
}

/**
 * Build choice data with actual dialog objects
 * @param {Object} choiceConfig - Choice configuration
 * @returns {Object} Choice data ready for DialogChoiceUI
 */
export function buildChoiceData(choiceConfig) {
  return {
    prompt: choiceConfig.prompt || null,
    stateKey: choiceConfig.choiceStateKey,
    choices: choiceConfig.choices.map((choice) => ({
      text: choice.text,
      responseType: choice.responseType,
      responseDialog: dialogSequences[choice.dialogId] || null,
      onSelect: choiceConfig.onSelect, // Use the shared onSelect from config
    })),
  };
}

export default dialogChoices;
