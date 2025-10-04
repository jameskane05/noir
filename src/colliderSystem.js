import * as THREE from "three";

/**
 * ColliderSystem - Manages trigger colliders and intersection detection
 *
 * Features:
 * - Creates sensor colliders from collider data
 * - Detects when character enters/exits colliders
 * - Emits events to GameManager
 * - Supports box, sphere, and capsule shapes
 * - Handles one-time triggers and enable/disable states
 */

class ColliderSystem {
  constructor(physicsManager, gameManager, colliderData = []) {
    this.physicsManager = physicsManager;
    this.gameManager = gameManager;
    this.colliders = [];
    this.activeColliders = new Set(); // Track which colliders the character is currently inside
    this.triggeredOnce = new Set(); // Track which "once" colliders have been triggered

    // Initialize all colliders
    this.initializeColliders(colliderData);
  }

  /**
   * Initialize colliders from data
   * @param {Array} colliderData - Array of collider definitions
   */
  initializeColliders(colliderData) {
    colliderData.forEach((data) => {
      const collider = this.createCollider(data);
      if (collider) {
        this.colliders.push({
          id: data.id,
          data: data,
          collider: collider,
          handle: collider.handle,
          enabled: data.enabled !== false,
        });
      }
    });

    console.log(
      `ColliderSystem: Initialized ${this.colliders.length} colliders`
    );
  }

  /**
   * Create a physics collider from data
   * @param {Object} data - Collider data
   * @returns {Object} Rapier collider
   */
  createCollider(data) {
    const { type, position, rotation, dimensions } = data;

    // Convert rotation from degrees to quaternion
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(rotation.x),
      THREE.MathUtils.degToRad(rotation.y),
      THREE.MathUtils.degToRad(rotation.z)
    );
    const quat = new THREE.Quaternion().setFromEuler(euler);

    let colliderDesc;

    // Create appropriate collider shape
    switch (type) {
      case "box":
        colliderDesc = this.physicsManager.createSensorBox(
          dimensions.x,
          dimensions.y,
          dimensions.z
        );
        break;

      case "sphere":
        colliderDesc = this.physicsManager.createSensorSphere(
          dimensions.radius
        );
        break;

      case "capsule":
        colliderDesc = this.physicsManager.createSensorCapsule(
          dimensions.halfHeight,
          dimensions.radius
        );
        break;

      default:
        console.warn(
          `ColliderSystem: Unknown collider type "${type}" for ${data.id}`
        );
        return null;
    }

    if (!colliderDesc) return null;

    // Set position and rotation on the descriptor
    colliderDesc.setTranslation(position.x, position.y, position.z);
    colliderDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });

    // Create the actual collider from the descriptor
    return this.physicsManager.createColliderFromDesc(colliderDesc);
  }

  /**
   * Check for intersections with character and trigger events
   * @param {Object} characterBody - Rapier rigid body of the character
   */
  update(characterBody) {
    // Get character collider
    const characterCollider = characterBody.collider(0);

    this.colliders.forEach(({ id, data, collider, enabled }) => {
      if (!enabled) return;
      if (data.once && this.triggeredOnce.has(id)) return;

      // Check intersection
      const isIntersecting = this.physicsManager.checkIntersection(
        characterCollider,
        collider
      );

      const wasActive = this.activeColliders.has(id);

      if (isIntersecting && !wasActive) {
        // Character just entered
        this.activeColliders.add(id);
        this.onEnter(id, data);

        if (data.once) {
          this.triggeredOnce.add(id);
        }
      } else if (!isIntersecting && wasActive) {
        // Character just exited
        this.activeColliders.delete(id);
        this.onExit(id, data);
      }
    });
  }

  /**
   * Handle character entering a collider
   * @param {string} id - Collider ID
   * @param {Object} data - Collider data
   */
  onEnter(id, data) {
    console.log(`ColliderSystem: Entered "${id}"`);

    // Emit events through game manager
    data.onEnter.forEach((event) => {
      this.handleEvent(event, id, "enter");
    });
  }

  /**
   * Handle character exiting a collider
   * @param {string} id - Collider ID
   * @param {Object} data - Collider data
   */
  onExit(id, data) {
    console.log(`ColliderSystem: Exited "${id}"`);

    // Emit events through game manager
    data.onExit.forEach((event) => {
      this.handleEvent(event, id, "exit");
    });
  }

  /**
   * Handle a single event
   * @param {Object} event - Event data
   * @param {string} colliderId - ID of the collider
   * @param {string} triggerType - "enter" or "exit"
   */
  handleEvent(event, colliderId, triggerType) {
    const { type, data } = event;

    switch (type) {
      case "dialog":
        this.handleDialogEvent(data, colliderId);
        break;

      case "music":
        this.handleMusicEvent(data, colliderId);
        break;

      case "sfx":
        this.handleSFXEvent(data, colliderId);
        break;

      case "ui":
        this.handleUIEvent(data, colliderId);
        break;

      case "state":
        this.handleStateEvent(data, colliderId);
        break;

      case "custom":
        this.handleCustomEvent(data, colliderId, triggerType);
        break;

      default:
        console.warn(`ColliderSystem: Unknown event type "${type}"`);
    }
  }

  /**
   * Handle dialog event
   */
  handleDialogEvent(data, colliderId) {
    const { dialogId, onComplete } = data;

    // Import dialog sequences
    import("./dialogData.js").then((module) => {
      const dialogSequences = module.dialogSequences;
      const dialogData = dialogSequences[dialogId];

      if (dialogData) {
        this.gameManager.playDialog(
          dialogId,
          dialogData,
          onComplete
            ? () => this.gameManager.emit(`collider:${onComplete}`)
            : null
        );
      } else {
        console.warn(`ColliderSystem: Dialog "${dialogId}" not found`);
      }
    });
  }

  /**
   * Handle music event
   */
  handleMusicEvent(data, colliderId) {
    const { track, fadeTime = 2.0 } = data;
    this.gameManager.changeMusic(track, fadeTime);
    this.gameManager.emit("collider:music-changed", { colliderId, track });
  }

  /**
   * Handle SFX event
   */
  handleSFXEvent(data, colliderId) {
    const { sound, volume = 1.0 } = data;
    // Emit event that SFX manager can listen to
    this.gameManager.emit("collider:sfx", { sound, volume, colliderId });
  }

  /**
   * Handle UI event
   */
  handleUIEvent(data, colliderId) {
    const { action, element } = data;
    this.gameManager.emit("collider:ui", { action, element, colliderId });
  }

  /**
   * Handle state event
   */
  handleStateEvent(data, colliderId) {
    const { key, value } = data;
    this.gameManager.setState({ [key]: value });
    this.gameManager.emit("collider:state-changed", { key, value, colliderId });
  }

  /**
   * Handle custom event
   */
  handleCustomEvent(data, colliderId, triggerType) {
    const { eventName, payload } = data;
    this.gameManager.emit(eventName, { ...payload, colliderId, triggerType });
  }

  /**
   * Enable a collider by ID
   * @param {string} id - Collider ID
   */
  enableCollider(id) {
    const collider = this.colliders.find((c) => c.id === id);
    if (collider) {
      collider.enabled = true;
      console.log(`ColliderSystem: Enabled "${id}"`);
    }
  }

  /**
   * Disable a collider by ID
   * @param {string} id - Collider ID
   */
  disableCollider(id) {
    const collider = this.colliders.find((c) => c.id === id);
    if (collider) {
      collider.enabled = false;
      // Remove from active if it was active
      this.activeColliders.delete(id);
      console.log(`ColliderSystem: Disabled "${id}"`);
    }
  }

  /**
   * Reset a "once" collider so it can trigger again
   * @param {string} id - Collider ID
   */
  resetOnceCollider(id) {
    this.triggeredOnce.delete(id);
    console.log(`ColliderSystem: Reset once-trigger for "${id}"`);
  }

  /**
   * Check if character is currently inside a collider
   * @param {string} id - Collider ID
   * @returns {boolean}
   */
  isInCollider(id) {
    return this.activeColliders.has(id);
  }

  /**
   * Get all currently active colliders
   * @returns {Array<string>} Array of collider IDs
   */
  getActiveColliders() {
    return Array.from(this.activeColliders);
  }
}

export default ColliderSystem;
