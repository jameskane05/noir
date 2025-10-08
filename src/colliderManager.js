import * as THREE from "three";

/**
 * ColliderManager - Manages trigger colliders and intersection detection
 *
 * Features:
 * - Creates sensor colliders from collider data
 * - Detects when character enters/exits colliders
 * - Emits events to GameManager
 * - Supports box, sphere, and capsule shapes
 * - Handles one-time triggers and enable/disable states
 */

class ColliderManager {
  constructor(physicsManager, gameManager, colliderData = [], scene = null) {
    this.physicsManager = physicsManager;
    this.gameManager = gameManager;
    this.scene = scene;
    this.colliders = [];
    this.debugMeshes = new Map(); // Map of collider id -> debug mesh
    this.activeColliders = new Set(); // Track which colliders the character is currently inside
    this.triggeredOnce = new Set(); // Track which "once" colliders have been triggered

    // Initialize all colliders
    this.initializeColliders(colliderData);

    // Initialize debug visualization meshes (if enabled via URL param)
    this.initializeDebugMeshes();
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
      `ColliderManager: Initialized ${this.colliders.length} colliders`
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
          `ColliderManager: Unknown collider type "${type}" for ${data.id}`
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
    // Update debug mesh visibility based on activation conditions
    this.updateDebugMeshVisibility();

    // Get character collider
    const characterCollider = characterBody.collider(0);

    this.colliders.forEach(({ id, data, collider, enabled }) => {
      if (!enabled) return;
      if (data.once && this.triggeredOnce.has(id)) return;

      // Check activation conditions based on game state
      if (!this.checkActivationConditions(data)) return;

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
          // Clean up the collider after a short delay to allow events to complete
          setTimeout(() => {
            this.removeCollider(id);
          }, 100);
        }
      } else if (!isIntersecting && wasActive) {
        // Character just exited
        this.activeColliders.delete(id);
        this.onExit(id, data);
      }
    });
  }

  /**
   * Check if collider's activation conditions are met
   * @param {Object} data - Collider data
   * @returns {boolean} True if collider should be active
   */
  checkActivationConditions(data) {
    const gameState = this.gameManager.getState();

    // Check criteria (simple key-value matching)
    if (data.criteria) {
      for (const [key, value] of Object.entries(data.criteria)) {
        if (gameState[key] !== value) {
          return false;
        }
      }
    }

    // Check activationCondition (custom function)
    if (data.activationCondition) {
      if (typeof data.activationCondition === "function") {
        try {
          return data.activationCondition(gameState);
        } catch (error) {
          console.warn(
            `ColliderManager: Error in activationCondition for collider:`,
            error
          );
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Handle character entering a collider
   * @param {string} id - Collider ID
   * @param {Object} data - Collider data
   */
  onEnter(id, data) {
    console.log(`ColliderManager: Entered "${id}"`);

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
    console.log(`ColliderManager: Exited "${id}"`);

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
      case "state":
        this.handleStateEvent(data, colliderId);
        break;

      case "camera-lookat":
        this.handleCameraLookAtEvent(data, colliderId);
        break;

      case "camera-animation":
        this.handleCameraAnimationEvent(data, colliderId);
        break;

      default:
        console.warn(`ColliderManager: Unknown event type "${type}"`);
    }
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
  }

  /**
   * Handle camera look-at event
   */
  handleCameraLookAtEvent(data, colliderId) {
    const { position, duration = 2.0, restoreControl = true } = data;

    // Emit event for character controller to handle
    this.gameManager.emit("camera:lookat", {
      position,
      duration,
      restoreControl,
      colliderId,
    });
  }

  /**
   * Handle camera animation event
   */
  handleCameraAnimationEvent(data, colliderId) {
    const { animation, onComplete } = data;

    // Emit event for game manager to handle
    this.gameManager.emit("camera:animation", {
      animation,
      onComplete,
      colliderId,
    });
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
      console.log(`ColliderManager: Enabled "${id}"`);
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
      console.log(`ColliderManager: Disabled "${id}"`);
    }
  }

  /**
   * Reset a "once" collider so it can trigger again
   * @param {string} id - Collider ID
   */
  resetOnceCollider(id) {
    this.triggeredOnce.delete(id);
    console.log(`ColliderManager: Reset once-trigger for "${id}"`);
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

  /**
   * Add debug mesh for a collider
   * @param {string} id - Collider ID
   * @param {THREE.Mesh} mesh - Debug mesh
   */
  addDebugMesh(id, mesh) {
    this.debugMeshes.set(id, mesh);
  }

  /**
   * Update debug mesh visibility based on activation conditions
   */
  updateDebugMeshVisibility() {
    this.colliders.forEach(({ id, data, enabled }) => {
      const mesh = this.debugMeshes.get(id);
      if (!mesh) return;

      // Hide if disabled or activation conditions not met
      const isActive = enabled && this.checkActivationConditions(data);
      mesh.visible = isActive;
    });
  }

  /**
   * Initialize debug visualization meshes for colliders
   */
  initializeDebugMeshes() {
    const showColliders =
      this.gameManager.getURLParam("showColliders") === "true";
    if (!showColliders) {
      console.log(
        "Collider debug visualization disabled (add ?showColliders=true to URL to enable)"
      );
      return;
    }

    console.log("Collider debug visualization enabled (showColliders=true)");
    this.colliders.forEach(({ id, data, enabled }) => {
      if (!enabled) return;

      let geometry;
      switch (data.type) {
        case "box":
          geometry = new THREE.BoxGeometry(
            data.dimensions.x * 2,
            data.dimensions.y * 2,
            data.dimensions.z * 2
          );
          break;
        case "sphere":
          geometry = new THREE.SphereGeometry(data.dimensions.radius, 16, 16);
          break;
        case "capsule":
          geometry = new THREE.CapsuleGeometry(
            data.dimensions.radius,
            data.dimensions.halfHeight * 2,
            8,
            16
          );
          break;
      }

      if (geometry) {
        // Wireframe debug material
        const material = new THREE.MeshBasicMaterial({
          color: 0x00ff00,
          wireframe: true,
          wireframeLinewidth: 2,
        });
        const mesh = new THREE.Mesh(geometry, material);

        // Apply position
        mesh.position.set(data.position.x, data.position.y, data.position.z);

        // Apply rotation (convert degrees to radians)
        mesh.rotation.set(
          THREE.MathUtils.degToRad(data.rotation.x),
          THREE.MathUtils.degToRad(data.rotation.y),
          THREE.MathUtils.degToRad(data.rotation.z)
        );

        this.scene.add(mesh);
        this.debugMeshes.set(id, mesh);

        console.log(`Added debug mesh for collider: ${id}`);
      }
    });
  }

  /**
   * Remove and clean up a collider completely
   * @param {string} id - Collider ID
   */
  removeCollider(id) {
    const colliderIndex = this.colliders.findIndex((c) => c.id === id);
    if (colliderIndex === -1) return;

    const { collider } = this.colliders[colliderIndex];

    // Remove from physics world
    if (collider && this.physicsManager.world) {
      this.physicsManager.world.removeCollider(collider);
    }

    // Remove debug mesh from scene
    if (this.debugMeshes.has(id)) {
      const mesh = this.debugMeshes.get(id);
      if (this.scene && mesh) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      this.debugMeshes.delete(id);
    }

    // Remove from colliders array
    this.colliders.splice(colliderIndex, 1);

    // Clean up tracking sets
    this.activeColliders.delete(id);
    this.triggeredOnce.delete(id);

    console.log(`ColliderManager: Removed and cleaned up collider "${id}"`);
  }
}

export default ColliderManager;
