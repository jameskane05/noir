/**
 * SFXManager - Manages all sound effects with master volume control
 *
 * Features:
 * - Centralized SFX volume control
 * - Register/unregister individual sound effects
 * - Master volume that scales all SFX
 * - Individual sound volume relative to master
 */

class SFXManager {
  constructor(options = {}) {
    this.masterVolume = options.masterVolume || 0.5;
    this.sounds = new Map(); // Map of id -> {audio, baseVolume}
    this.dialogManager = null; // Will be set externally
  }

  /**
   * Register a sound effect
   * @param {string} id - Unique identifier for this sound
   * @param {THREE.Audio} audio - THREE.Audio instance
   * @param {number} baseVolume - Base volume for this sound (0-1), defaults to 1.0
   */
  registerSound(id, audio, baseVolume = 1.0) {
    this.sounds.set(id, {
      audio,
      baseVolume,
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

    const { audio, baseVolume } = soundData;
    const finalVolume = baseVolume * this.masterVolume;

    if (audio && audio.setVolume) {
      audio.setVolume(finalVolume);
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
   * Get a registered sound
   * @param {string} id - Sound identifier
   * @returns {THREE.Audio|null}
   */
  getSound(id) {
    const soundData = this.sounds.get(id);
    return soundData ? soundData.audio : null;
  }

  /**
   * Play a sound by ID
   * @param {string} id - Sound identifier
   */
  play(id) {
    const soundData = this.sounds.get(id);
    if (soundData && soundData.audio) {
      soundData.audio.play();
    }
  }

  /**
   * Stop a sound by ID
   * @param {string} id - Sound identifier
   */
  stop(id) {
    const soundData = this.sounds.get(id);
    if (soundData && soundData.audio) {
      soundData.audio.stop();
    }
  }

  /**
   * Stop all sounds
   */
  stopAll() {
    for (const [id, soundData] of this.sounds) {
      if (soundData.audio && soundData.audio.isPlaying) {
        soundData.audio.stop();
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
    this.sounds.clear();
  }
}

export default SFXManager;
