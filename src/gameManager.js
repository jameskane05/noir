import * as THREE from "three";
import { getMusicForState } from "./musicData.js";
import { getDialogsForState } from "./dialogData.js";
import { getSceneObjectsForState } from "./sceneData.js";
import { startScreen, GAME_STATES } from "./gameData.js";
import { getDebugSpawnState, isDebugSpawnActive } from "./debugSpawner.js";
import PhoneBooth from "./content/phonebooth.js";

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
    // Check for debug spawn state first
    const debugState = getDebugSpawnState();
    this.state = debugState ? { ...debugState } : { ...startScreen };
    this.isDebugMode = isDebugSpawnActive();

    if (this.isDebugMode) {
      console.log("GameManager: Debug mode active", this.state);
    }

    this.eventListeners = {};
    this.dialogManager = null;
    this.musicManager = null;
    this.sfxManager = null;
    this.uiManager = null;
    this.sceneManager = null;
    this.phoneBooth = null;

    // Track played dialogs for "once" functionality
    this.playedDialogs = new Set();

    // Track loaded scene objects
    this.loadedScenes = new Set();

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
    // Skip intro if in debug mode OR if legacy location=spawn param is used
    if (this.isDebugMode) {
      return true;
    }

    const location = this.getURLParam("location");
    return location === "spawn";
  }

  /**
   * Check if running in debug mode
   * @returns {boolean}
   */
  isInDebugMode() {
    return this.isDebugMode;
  }

  /**
   * Get the debug spawn character position if in debug mode
   * @returns {Object|null} Position {x, y, z} or null
   */
  getDebugSpawnPosition() {
    if (!this.isDebugMode || !this.state.playerPosition) {
      return null;
    }
    return { ...this.state.playerPosition };
  }

  /**
   * Initialize with managers
   * @param {Object} managers - Object containing manager instances
   */
  async initialize(managers = {}) {
    this.dialogManager = managers.dialogManager;
    this.musicManager = managers.musicManager;
    this.sfxManager = managers.sfxManager;
    this.uiManager = managers.uiManager;
    this.characterController = managers.characterController;
    this.cameraAnimationSystem = managers.cameraAnimationSystem;
    this.sceneManager = managers.sceneManager;
    this.lightManager = managers.lightManager;
    this.camera = managers.camera; // Store camera reference
    // Add other managers as needed

    // Set up internal event handlers
    this.setupEventHandlers();

    // Load initial scene objects based on starting state
    if (this.sceneManager) {
      await this.updateSceneForState();
      // Trigger initial animation check after loading
      this.sceneManager.updateAnimationsForState(this.state);
    }

    // Initialize content-specific systems AFTER scene is loaded
    this.phoneBooth = new PhoneBooth({
      sceneManager: this.sceneManager,
      lightManager: this.lightManager,
      sfxManager: this.sfxManager,
      physicsManager: managers.physicsManager,
      scene: managers.scene,
      camera: this.camera,
    });
    this.phoneBooth.initialize();

    // Attempt initial autoplay/stop based on starting state
    // Ensures startScreen sounds (e.g., city ambiance) begin immediately when possible
    if (this.sfxManager) {
      this.sfxManager.stopForState(this.state);
      this.sfxManager.autoplayForState(this.state);
    }

    // Ensure initial state drives music and dialogs immediately
    this.updateMusicForState();
    this.updateDialogsForState();
  }

  /**
   * Set up internal event handlers that connect managers
   */
  setupEventHandlers() {
    // Camera animation
    this.on("camera:animation", async (data) => {
      const { animation, onComplete } = data;
      console.log(`Playing camera animation: ${animation}`);

      // Load animation if not already loaded
      if (!this.cameraAnimationSystem.getAnimationNames().includes(animation)) {
        const ok = await this.cameraAnimationSystem.loadAnimation(
          animation,
          animation
        );
        if (!ok) {
          console.warn(`Failed to load camera animation: ${animation}`);
          if (onComplete) onComplete(false);
          return;
        }
      }

      // Play animation
      this.cameraAnimationSystem.play(animation, () => {
        console.log(`Camera animation complete: ${animation}`);
        if (onComplete) onComplete(true);
      });
    });

    // Camera look-at
    this.on("camera:lookat", (data) => {
      if (!this.isControlEnabled()) return;

      const targetPos = new THREE.Vector3(
        data.position.x,
        data.position.y,
        data.position.z
      );
      const onComplete = data.restoreControl
        ? () => {
            this.characterController.inputDisabled = false;
            console.log(`Camera look-at complete (${data.colliderId})`);
          }
        : null;

      this.characterController.lookAt(targetPos, data.duration, onComplete);
    });

    // Try to autoplay required sounds on load (may fail due to browser policy)
    // We'll also trigger them again on first interaction via StartScreen
    // Start screen desired state: rach2 + city ambiance
    if (this.state.currentState === GAME_STATES.START_SCREEN) {
      this.updateMusicForState();
      this.updateSFXForState();
    }
  }

  /**
   * Set game state
   * @param {Object} newState - State updates to apply
   */
  setState(newState) {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...newState };
    this.emit("state:changed", this.state, oldState);

    // Update music based on new state
    this.updateMusicForState();

    // Update dialogs based on new state
    this.updateDialogsForState();

    // Update SFX based on new state
    this.updateSFXForState();

    // SFX autoplay/stop rules based on high-level state
    if (this.sfxManager) {
      this.sfxManager.stopForState(this.state);
      this.sfxManager.autoplayForState(this.state);
    }

    // Update scene animations based on new state
    if (this.sceneManager) {
      this.sceneManager.updateAnimationsForState(this.state);
    }

    // Update character controller based on new state
    this.updateCharacterController();
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

    // Track that this dialog has been played
    this.playedDialogs.add(dialogId);

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
   * Update music based on current game state
   */
  updateMusicForState() {
    if (!this.musicManager) return;

    const track = getMusicForState(this.state);
    if (!track) return;

    // Only change music if it's different from current track
    if (this.musicManager.getCurrentTrack() !== track.id) {
      console.log(
        `GameManager: Changing music to "${track.id}" (${track.description})`
      );
      this.musicManager.changeMusic(track.id, track.fadeTime || 0);
    }
  }

  /**
   * Update dialogs based on current game state
   * Triggers auto-play dialogs whose conditions are met
   */
  updateDialogsForState() {
    if (!this.dialogManager) return;

    // Don't trigger new dialogs if one is already pending (let it play first)
    // But DO allow canceling currently playing dialogs with new ones
    if (this.dialogManager.hasDialogsPending()) return;

    const matchingDialogs = getDialogsForState(this.state, this.playedDialogs);

    // Play the first matching dialog (highest priority)
    // DialogManager will cancel any currently playing dialog
    if (matchingDialogs.length > 0) {
      const dialog = matchingDialogs[0];
      console.log(`GameManager: Auto-playing dialog "${dialog.id}"`);
      this.playDialog(dialog.id, dialog);
    }
  }

  /**
   * Update SFX based on current game state
   */
  updateSFXForState() {
    if (!this.sfxManager) return;

    // City ambiance controlled by state.cityAmbiance
    if (this.state.cityAmbiance === true) {
      if (
        !this.sfxManager.isPlaying ||
        !this.sfxManager.isPlaying("city-ambiance")
      ) {
        this.sfxManager.play("city-ambiance");
      }
    } else if (this.state.cityAmbiance === false) {
      this.sfxManager.stop("city-ambiance");
    }
  }

  /**
   * Update character controller based on current game state
   */
  updateCharacterController() {
    if (!this.characterController) return;

    // Enable character controller when controlEnabled state is true
    if (this.state.controlEnabled === true) {
      console.log("GameManager: Enabling character controller");
      this.characterController.headbobEnabled = true;
      this.emit("character-controller:enabled");
    } else if (this.state.controlEnabled === false) {
      console.log("GameManager: Disabling character controller");
      this.characterController.headbobEnabled = false;
      this.emit("character-controller:disabled");
    }
  }

  /**
   * Update scene objects based on current game state
   * Loads new objects that match current state conditions
   */
  async updateSceneForState() {
    if (!this.sceneManager) return;

    const objectsToLoad = getSceneObjectsForState(this.state);

    // Filter out objects that are already loaded
    const newObjects = objectsToLoad.filter(
      (obj) => !this.loadedScenes.has(obj.id)
    );

    if (newObjects.length > 0) {
      console.log(
        `GameManager: Loading ${newObjects.length} new scene objects for state`
      );
      await this.sceneManager.loadObjectsForState(newObjects);

      // Track loaded objects
      newObjects.forEach((obj) => this.loadedScenes.add(obj.id));
    }
  }

  /**
   * Check if character controller is enabled
   * @returns {boolean}
   */
  isControlEnabled() {
    return this.state.controlEnabled === true;
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
    // Update content-specific systems
    if (this.phoneBooth) {
      this.phoneBooth.update(dt);
    }

    // Add any per-frame game logic here
    this.emit("game:update", dt);
  }
}

export default GameManager;
