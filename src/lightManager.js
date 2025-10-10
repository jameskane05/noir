import * as THREE from "three";
import AudioReactiveLight from "./vfx/audioReactiveLight.js";

/**
 * LightManager - Manages all lights in the scene
 *
 * Features:
 * - Create and manage static lights
 * - Create and manage audio-reactive lights
 * - Centralized light control
 *
 * Usage:
 * const lightManager = new LightManager(scene);
 * lightManager.createAmbientLight({ color: 0xffffff, intensity: 0.5 });
 * lightManager.createReactiveLight('phone-light', howl, config);
 */

class LightManager {
  constructor(scene) {
    this.scene = scene;
    this.lights = new Map(); // Map of id -> THREE.Light
    this.reactiveLights = new Map(); // Map of id -> { light, audioReactive }
  }

  /**
   * Create an ambient light
   * @param {Object} config - Light configuration
   * @returns {THREE.AmbientLight}
   */
  createAmbientLight(config = {}) {
    const light = new THREE.AmbientLight(
      config.color ?? 0xffffff,
      config.intensity ?? 1.0
    );

    if (config.id) {
      this.lights.set(config.id, light);
    }

    this.scene.add(light);
    return light;
  }

  /**
   * Create a directional light
   * @param {Object} config - Light configuration
   * @returns {THREE.DirectionalLight}
   */
  createDirectionalLight(config = {}) {
    const light = new THREE.DirectionalLight(
      config.color ?? 0xffffff,
      config.intensity ?? 1.0
    );

    if (config.position) {
      light.position.set(
        config.position.x ?? 0,
        config.position.y ?? 0,
        config.position.z ?? 0
      );
    }

    if (config.castShadow !== undefined) {
      light.castShadow = config.castShadow;
    }

    if (config.id) {
      this.lights.set(config.id, light);
    }

    this.scene.add(light);
    return light;
  }

  /**
   * Create a point light
   * @param {Object} config - Light configuration
   * @returns {THREE.PointLight}
   */
  createPointLight(config = {}) {
    const light = new THREE.PointLight(
      config.color ?? 0xffffff,
      config.intensity ?? 1.0,
      config.distance ?? 0,
      config.decay ?? 2
    );

    if (config.position) {
      light.position.set(
        config.position.x ?? 0,
        config.position.y ?? 0,
        config.position.z ?? 0
      );
    }

    if (config.castShadow !== undefined) {
      light.castShadow = config.castShadow;
    }

    if (config.id) {
      this.lights.set(config.id, light);
    }

    this.scene.add(light);
    return light;
  }

  /**
   * Create a spot light
   * @param {Object} config - Light configuration
   * @returns {THREE.SpotLight}
   */
  createSpotLight(config = {}) {
    const light = new THREE.SpotLight(
      config.color ?? 0xffffff,
      config.intensity ?? 1.0,
      config.distance ?? 0,
      config.angle ?? Math.PI / 3,
      config.penumbra ?? 0,
      config.decay ?? 2
    );

    if (config.position) {
      light.position.set(
        config.position.x ?? 0,
        config.position.y ?? 0,
        config.position.z ?? 0
      );
    }

    if (config.target) {
      light.target.position.set(
        config.target.x ?? 0,
        config.target.y ?? 0,
        config.target.z ?? 0
      );
      this.scene.add(light.target);
    }

    if (config.castShadow !== undefined) {
      light.castShadow = config.castShadow;
    }

    if (config.id) {
      this.lights.set(config.id, light);
    }

    this.scene.add(light);
    return light;
  }

  /**
   * Create an audio-reactive light
   * @param {string} id - Unique identifier for this light
   * @param {Howl} howl - Howl instance to analyze
   * @param {Object} config - Light and reactivity configuration
   * @returns {Object} { light, audioReactive }
   */
  createReactiveLight(id, howl, config) {
    try {
      // Create THREE.js light based on type
      let light;
      switch (config.type) {
        case "PointLight":
          light = this.createPointLight({
            ...config,
            id: null, // Don't double-register
            intensity: config.baseIntensity ?? 1.0,
          });
          break;
        case "SpotLight":
          light = this.createSpotLight({
            ...config,
            id: null,
            intensity: config.baseIntensity ?? 1.0,
          });
          break;
        case "DirectionalLight":
          light = this.createDirectionalLight({
            ...config,
            id: null,
            intensity: config.baseIntensity ?? 1.0,
          });
          break;
        default:
          console.warn(
            `LightManager: Unknown light type "${config.type}" for "${id}"`
          );
          return null;
      }

      // Create audio-reactive controller
      const audioReactive = new AudioReactiveLight(light, howl, {
        baseIntensity: config.baseIntensity,
        reactivityMultiplier: config.reactivityMultiplier,
        smoothing: config.smoothing,
        frequencyRange: config.frequencyRange,
        minIntensity: config.minIntensity,
        maxIntensity: config.maxIntensity,
        noiseFloor: config.noiseFloor,
      });

      // Store references
      this.lights.set(id, light);
      this.reactiveLights.set(id, { light, audioReactive });

      console.log(`LightManager: Created reactive light "${id}"`);
      return { light, audioReactive };
    } catch (error) {
      console.error(
        `LightManager: Error creating reactive light "${id}":`,
        error
      );
      return null;
    }
  }

  /**
   * Get a light by ID
   * @param {string} id - Light ID
   * @returns {THREE.Light|null}
   */
  getLight(id) {
    return this.lights.get(id) || null;
  }

  /**
   * Get reactive light data by ID
   * @param {string} id - Light ID
   * @returns {Object|null} { light, audioReactive }
   */
  getReactiveLight(id) {
    return this.reactiveLights.get(id) || null;
  }

  /**
   * Remove a light by ID
   * @param {string} id - Light ID
   */
  removeLight(id) {
    const light = this.lights.get(id);
    if (light) {
      this.scene.remove(light);
      this.lights.delete(id);
    }

    // Also remove from reactive lights if present
    const reactive = this.reactiveLights.get(id);
    if (reactive) {
      reactive.audioReactive.destroy();
      this.reactiveLights.delete(id);
    }
  }

  /**
   * Update all audio-reactive lights
   * Call this in your animation loop
   * @param {number} dt - Delta time (not used, but kept for consistency)
   */
  updateReactiveLights(dt) {
    for (const { audioReactive } of this.reactiveLights.values()) {
      audioReactive.update();
    }
  }

  /**
   * Enable/disable a reactive light
   * @param {string} id - Light ID
   * @param {boolean} enabled - Enable or disable
   */
  setReactiveLightEnabled(id, enabled) {
    const reactive = this.reactiveLights.get(id);
    if (reactive) {
      if (enabled) {
        reactive.audioReactive.enable();
      } else {
        reactive.audioReactive.disable();
      }
    }
  }

  /**
   * Get all light IDs
   * @returns {Array<string>}
   */
  getLightIds() {
    return Array.from(this.lights.keys());
  }

  /**
   * Get all reactive light IDs
   * @returns {Array<string>}
   */
  getReactiveLightIds() {
    return Array.from(this.reactiveLights.keys());
  }

  /**
   * Clean up all lights
   */
  destroy() {
    // Clean up reactive lights
    for (const [id, { light, audioReactive }] of this.reactiveLights) {
      audioReactive.destroy();
      if (light.parent === this.scene) {
        this.scene.remove(light);
      }
    }
    this.reactiveLights.clear();

    // Clean up regular lights
    for (const [id, light] of this.lights) {
      if (light.parent === this.scene) {
        this.scene.remove(light);
      }
    }
    this.lights.clear();
  }
}

export default LightManager;
