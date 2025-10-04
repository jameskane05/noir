/**
 * GameManager - Central game state and event management
 *
 * Features:
 * - Manage game state
 * - Trigger events
 * - Coordinate between different systems
 */

class GameManager {
  constructor() {
    this.state = {
      isPlaying: false,
      isPaused: false,
      currentScene: null,
      playerPosition: { x: 0, y: 0, z: 0 },
      // Add your custom state properties here
    };

    this.eventListeners = {};
    this.dialogManager = null;
    this.musicManager = null;
    this.sfxManager = null;
    this.uiManager = null;

    // Parse URL parameters on construction
    this.urlParams = this.parseURLParams();
  }

  /**
   * Parse URL parameters
   * @returns {Object} Object with URL parameters
   */
  parseURLParams() {
    const params = {};
    const searchParams = new URLSearchParams(window.location.search);

    for (const [key, value] of searchParams) {
      params[key] = value;
    }

    console.log("GameManager: URL params:", params);
    return params;
  }

  /**
   * Get a URL parameter value
   * @param {string} key - Parameter name
   * @returns {string|null} Parameter value or null if not found
   */
  getURLParam(key) {
    return this.urlParams[key] || null;
  }

  /**
   * Check if intro sequence should be skipped
   * @returns {boolean} True if intro should be skipped
   */
  shouldSkipIntro() {
    const location = this.getURLParam("location");
    return location === "spawn";
  }

  /**
   * Initialize with managers
   * @param {Object} managers - Object containing manager instances
   */
  initialize(managers = {}) {
    this.dialogManager = managers.dialogManager;
    this.musicManager = managers.musicManager;
    this.sfxManager = managers.sfxManager;
    this.uiManager = managers.uiManager;
    // Add other managers as needed
  }

  /**
   * Set game state
   * @param {Object} newState - State updates to apply
   */
  setState(newState) {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...newState };
    this.emit("state:changed", this.state, oldState);
  }

  /**
   * Get current state
   * @returns {Object}
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Trigger a dialog sequence
   * @param {string} dialogId - ID of the dialog sequence
   * @param {Object} dialogData - Dialog data object
   * @param {Function} onComplete - Optional completion callback
   */
  playDialog(dialogId, dialogData, onComplete = null) {
    if (!this.dialogManager) {
      console.warn("GameManager: No DialogManager initialized");
      return;
    }

    this.emit("dialog:trigger", dialogId, dialogData);
    this.dialogManager.playDialog(dialogData, (completedDialog) => {
      this.emit("dialog:finished", completedDialog);
      if (onComplete) onComplete(completedDialog);
    });
  }

  /**
   * Change music
   * @param {string} trackName - Name of the music track
   * @param {number} fadeTime - Fade duration in seconds
   */
  changeMusic(trackName, fadeTime = 2.0) {
    if (!this.musicManager) {
      console.warn("GameManager: No MusicManager initialized");
      return;
    }

    this.musicManager.changeMusic(trackName, fadeTime);
    this.emit("music:changed", trackName);
  }

  /**
   * Pause the game
   */
  pause() {
    this.setState({ isPaused: true });
    this.emit("game:paused");
  }

  /**
   * Resume the game
   */
  resume() {
    this.setState({ isPaused: false });
    this.emit("game:resumed");
  }

  /**
   * Start the game
   */
  start() {
    this.setState({ isPlaying: true, isPaused: false });
    this.emit("game:started");
  }

  /**
   * Stop the game
   */
  stop() {
    this.setState({ isPlaying: false, isPaused: false });
    this.emit("game:stopped");
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {function} callback - Callback function
   */
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {function} callback - Callback function
   */
  off(event, callback) {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event].indexOf(callback);
      if (index > -1) {
        this.eventListeners[event].splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {...any} args - Arguments to pass to callbacks
   */
  emit(event, ...args) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach((callback) => callback(...args));
    }
  }

  /**
   * Update method - call in animation loop if needed
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // Add any per-frame game logic here
    this.emit("game:update", dt);
  }
}

export default GameManager;
