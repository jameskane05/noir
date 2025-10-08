/**
 * Criteria Helper - Unified criteria checking for game state
 *
 * Supports:
 * - Simple equality: { currentState: GAME_STATES.INTRO }
 * - Comparisons: { currentState: { $gte: GAME_STATES.INTRO, $lt: GAME_STATES.DRIVE_BY } }
 * - Arrays: { currentState: { $in: [STATE1, STATE2] } }
 * - Multiple conditions on same key
 *
 * Operators:
 * - $eq: equals (same as simple value)
 * - $ne: not equals
 * - $gt: greater than
 * - $gte: greater than or equal
 * - $lt: less than
 * - $lte: less than or equal
 * - $in: in array
 * - $nin: not in array
 */

/**
 * Check if a single value matches a criteria definition
 * @param {any} value - Value to check (e.g., state.currentState)
 * @param {any} criteria - Criteria definition (value, or object with operators)
 * @returns {boolean}
 */
export function matchesCriteria(value, criteria) {
  // Simple equality check
  if (
    typeof criteria !== "object" ||
    criteria === null ||
    Array.isArray(criteria)
  ) {
    return value === criteria;
  }

  // Operator-based checks
  for (const [operator, compareValue] of Object.entries(criteria)) {
    switch (operator) {
      case "$eq":
        if (value !== compareValue) return false;
        break;

      case "$ne":
        if (value === compareValue) return false;
        break;

      case "$gt":
        if (!(value > compareValue)) return false;
        break;

      case "$gte":
        if (!(value >= compareValue)) return false;
        break;

      case "$lt":
        if (!(value < compareValue)) return false;
        break;

      case "$lte":
        if (!(value <= compareValue)) return false;
        break;

      case "$in":
        if (!Array.isArray(compareValue) || !compareValue.includes(value))
          return false;
        break;

      case "$nin":
        if (!Array.isArray(compareValue) || compareValue.includes(value))
          return false;
        break;

      default:
        console.warn(`criteriaHelper: Unknown operator "${operator}"`);
        return false;
    }
  }

  return true;
}

/**
 * Check if game state matches all criteria
 * @param {Object} gameState - Current game state
 * @param {Object} criteria - Criteria object with key-value pairs
 * @returns {boolean}
 */
export function checkCriteria(gameState, criteria) {
  if (!criteria || typeof criteria !== "object") {
    return true; // No criteria means always match
  }

  for (const [key, value] of Object.entries(criteria)) {
    const stateValue = gameState[key];

    if (!matchesCriteria(stateValue, value)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if game state matches playOn conditions
 * Supports both array format and criteria object format
 * @param {Object} gameState - Current game state
 * @param {Array|Object} playOn - Array of states or criteria object
 * @returns {boolean}
 */
export function checkPlayOn(gameState, playOn) {
  if (!playOn) return false;

  // Array format: [STATE1, STATE2] - check if currentState is in array
  if (Array.isArray(playOn)) {
    return playOn.includes(gameState.currentState);
  }

  // Object format: { currentState: { $gte: STATE } } - use criteria check
  if (typeof playOn === "object") {
    return checkCriteria(gameState, playOn);
  }

  return false;
}

/**
 * Check if game state matches stopOn conditions
 * @param {Object} gameState - Current game state
 * @param {Array|Object} stopOn - Array of states or criteria object
 * @returns {boolean}
 */
export function checkStopOn(gameState, stopOn) {
  if (!stopOn) return false;

  // Array format
  if (Array.isArray(stopOn)) {
    return stopOn.includes(gameState.currentState);
  }

  // Object format
  if (typeof stopOn === "object") {
    return checkCriteria(gameState, stopOn);
  }

  return false;
}

export default {
  matchesCriteria,
  checkCriteria,
  checkPlayOn,
  checkStopOn,
};
