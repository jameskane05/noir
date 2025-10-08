import { Howl, Howler } from "howler";
import { checkCriteria } from "./criteriaHelper.js";

/**
 * SFXManager - Manages all sound effects with master volume control
 *
 * Features:
 * - Centralized SFX volume control using Howler.js
 * - Register/unregister individual sound effects
 * - Master volume that scales all SFX
 * - Individual sound volume relative to master
 * - Support for spatial/positional audio
 */

class SFXManager {
  constructor(options = {}) {
    this.masterVolume = options.masterVolume || 0.5;
    this.sounds = new Map(); // Map of id -> {howl, baseVolume}
    this.dialogManager = null; // Will be set externally
    this.lightManager = options.lightManager || null; // LightManager for reactive lights
    this.gameManager = null;

    // Track sounds that have been played once (for playOnce functionality)
    this.playedSounds = new Set();

    // Set global Howler volume (we'll manage individual sounds separately)
    Howler.volume(1.0);
  }

  /**
   * Set game manager and register event listeners
   * @param {GameManager} gameManager - The game manager instance
   */
  setGameManager(gameManager) {
    this.gameManager = gameManager;

    // State change handler
    const handleStateChange = (newState, oldState) => {
      // Check all sounds with criteria and play/stop based on current state
      this.updateSoundsForState(newState);
    };

    // Listen for state changes
    this.gameManager.on("state:changed", handleStateChange);

    // Handle initial state
    const currentState = this.gameManager.getState();
    handleStateChange(currentState, null);

    console.log(
      "SFXManager: Event listeners registered and initial state handled"
    );
  }

  /**
   * Update all sounds based on current game state
   * Checks criteria for each sound and plays/stops accordingly
   * @param {Object} state - Current game state
   */
  updateSoundsForState(state) {
    if (!state || !this._data) return;

    for (const [id] of this.sounds) {
      const def = this._data[id];
      if (!def || !def.criteria) continue;

      const matchesCriteria = checkCriteria(state, def.criteria);
      const isPlaying = this.isPlaying(id);
      const hasPlayedOnce = this.playedSounds.has(id);

      // If criteria matches and sound is not playing
      if (matchesCriteria && !isPlaying) {
        // Check playOnce - skip if already played
        if (def.playOnce && hasPlayedOnce) {
          continue;
        }

        // Play the sound
        try {
          this.play(id);
          if (def.playOnce) {
            this.playedSounds.add(id);
          }
        } catch (e) {
          // Ignore autoplay errors, user gesture will trigger later
        }
      }
      // If criteria doesn't match and sound is playing, stop it
      else if (!matchesCriteria && isPlaying) {
        this.stop(id);
      }
    }
  }

  /**
   * Register a sound effect
   * @param {string} id - Unique identifier for this sound
   * @param {Howl|Object} howl - Howler.js Howl instance or object with setVolume method
   * @param {number} baseVolume - Base volume for this sound (0-1), defaults to 1.0
   */
  registerSound(id, howl, baseVolume = 1.0) {
    this.sounds.set(id, {
      howl,
      baseVolume,
      isProxy:
        typeof howl.volume !== "function" &&
        typeof howl.setVolume === "function",
    });

    // Apply current master volume
    this.updateSoundVolume(id);

    console.log(
      `SFXManager: Registered sound "${id}" with base volume ${baseVolume}`
    );
  }

  /**
   * Unregister a sound effect
   * @param {string} id - Sound identifier
   */
  unregisterSound(id) {
    this.sounds.delete(id);
  }

  /**
   * Set master SFX volume (affects all sounds)
   * @param {number} volume - Master volume (0-1)
   */
  setMasterVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));

    // Update all registered sounds
    for (const [id] of this.sounds) {
      this.updateSoundVolume(id);
    }

    // Update dialog volume if dialog manager is registered
    if (this.dialogManager && this.dialogManager.updateVolume) {
      this.dialogManager.updateVolume();
    }
  }

  /**
   * Register dialog manager to be controlled by SFX volume
   * @param {DialogManager} dialogManager - Dialog manager instance
   */
  registerDialogManager(dialogManager) {
    this.dialogManager = dialogManager;
  }

  /**
   * Bulk-register sounds from a data object (e.g., sfxData.js)
   * @param {Record<string, any>} soundsData - Map of id -> sound descriptor
   */
  registerSoundsFromData(soundsData) {
    if (!soundsData) return;
    // Keep a reference to the raw data definitions for state-driven rules
    this._data = soundsData;
    Object.values(soundsData).forEach((sound) => {
      const howl = new Howl({
        src: sound.src,
        loop: sound.loop,
        volume: sound.volume,
        preload: sound.preload !== false,
      });

      // Apply spatial attributes after creation
      if (sound.spatial) {
        if (sound.position) howl.pos(...sound.position);
        if (sound.pannerAttr) howl.pannerAttr(sound.pannerAttr);
      }

      this.registerSound(sound.id, howl, sound.volume ?? 1.0);

      // Request audio-reactive light creation from lightManager if configured
      if (
        sound.reactiveLight &&
        sound.reactiveLight.enabled &&
        this.lightManager
      ) {
        this.lightManager.createReactiveLight(
          sound.id,
          howl,
          sound.reactiveLight
        );
      }
    });
  }

  /**
   * Get current master volume
   * @returns {number}
   */
  getMasterVolume() {
    return this.masterVolume;
  }

  /**
   * Update a specific sound's volume based on master and base volumes
   * @param {string} id - Sound identifier
   */
  updateSoundVolume(id) {
    const soundData = this.sounds.get(id);
    if (!soundData) return;

    const { howl, baseVolume, isProxy } = soundData;
    const finalVolume = baseVolume * this.masterVolume;

    if (howl) {
      if (isProxy) {
        // Legacy proxy object with setVolume method (e.g., breathing system)
        howl.setVolume(finalVolume);
      } else {
        // Howler.js Howl instance
        howl.volume(finalVolume);
      }
    }
  }

  /**
   * Set base volume for a specific sound (will be scaled by master)
   * @param {string} id - Sound identifier
   * @param {number} baseVolume - Base volume (0-1)
   */
  setSoundBaseVolume(id, baseVolume) {
    const soundData = this.sounds.get(id);
    if (!soundData) return;

    soundData.baseVolume = Math.max(0, Math.min(1, baseVolume));
    this.updateSoundVolume(id);
  }

  /**
   * Get a registered sound (Howl instance)
   * @param {string} id - Sound identifier
   * @returns {Howl|null}
   */
  getSound(id) {
    const soundData = this.sounds.get(id);
    return soundData ? soundData.howl : null;
  }

  /**
   * Play a sound by ID
   * @param {string} id - Sound identifier
   * @returns {number|null} Sound ID from Howler (for stopping specific instances)
   */
  play(id) {
    const soundData = this.sounds.get(id);
    if (soundData && soundData.howl) {
      if (soundData.isProxy) {
        // Proxy objects don't have play method
        console.warn(`SFXManager: Cannot play proxy object "${id}"`);
        return null;
      }
      return soundData.howl.play();
    }
    return null;
  }

  /**
   * Stop a sound by ID
   * @param {string} id - Sound identifier
   * @param {number} soundId - Optional: specific sound instance ID from play()
   */
  stop(id, soundId = null) {
    const soundData = this.sounds.get(id);
    if (soundData && soundData.howl) {
      if (soundData.isProxy) {
        // Proxy objects don't have stop method
        console.warn(`SFXManager: Cannot stop proxy object "${id}"`);
        return;
      }
      if (soundId !== null) {
        soundData.howl.stop(soundId);
      } else {
        soundData.howl.stop();
      }
    }
  }

  /**
   * Stop all sounds
   */
  stopAll() {
    for (const [id, soundData] of this.sounds) {
      if (soundData.howl) {
        soundData.howl.stop();
      }
    }
  }

  /**
   * Check if a sound is currently playing
   * @param {string} id - Sound identifier
   * @returns {boolean}
   */
  isPlaying(id) {
    const soundData = this.sounds.get(id);
    if (soundData && soundData.howl && !soundData.isProxy) {
      return soundData.howl.playing();
    }
    return false;
  }

  /**
   * Fade a sound's volume
   * @param {string} id - Sound identifier
   * @param {number} from - Starting volume (0-1)
   * @param {number} to - Target volume (0-1)
   * @param {number} duration - Duration in milliseconds
   * @param {number} soundId - Optional: specific sound instance ID
   */
  fade(id, from, to, duration, soundId = null) {
    const soundData = this.sounds.get(id);
    if (soundData && soundData.howl) {
      if (soundData.isProxy) {
        // Proxy objects don't have fade method
        console.warn(`SFXManager: Cannot fade proxy object "${id}"`);
        return;
      }
      const fromScaled = from * this.masterVolume;
      const toScaled = to * this.masterVolume;

      if (soundId !== null) {
        soundData.howl.fade(fromScaled, toScaled, duration, soundId);
      } else {
        soundData.howl.fade(fromScaled, toScaled, duration);
      }
    }
  }

  /**
   * Get all registered sound IDs
   * @returns {Array<string>}
   */
  getSoundIds() {
    return Array.from(this.sounds.keys());
  }

  /**
   * Clean up all sounds
   */
  destroy() {
    this.stopAll();

    // Clean up sounds
    for (const [id, soundData] of this.sounds) {
      if (soundData.howl && !soundData.isProxy) {
        soundData.howl.unload();
      }
    }
    this.sounds.clear();
  }
}

export default SFXManager;
