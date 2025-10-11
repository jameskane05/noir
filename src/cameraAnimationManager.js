import * as THREE from "three";
import { getCameraAnimationForState } from "./cameraAnimationData.js";

/**
 * CameraAnimationManager - Manages playback of recorded camera animations
 *
 * Features:
 * - Load and play head-pose animations from JSON
 * - State-driven playback with criteria support
 * - Smooth handoff to/from character controller
 * - Local-space playback (applies deltas relative to starting pose)
 * - playOnce tracking per animation
 * - Configurable input restoration
 */
class CameraAnimationManager {
  constructor(camera, characterController, gameManager) {
    this.camera = camera;
    this.characterController = characterController;
    this.gameManager = gameManager;

    // Playback state
    this.isPlaying = false;
    this.currentAnimation = null;
    this.currentAnimationData = null; // Stores the data config (syncController, restoreInput, etc.)
    this.elapsed = 0;
    this.frameIdx = 1;
    this.onComplete = null;

    // Base pose (where animation starts from)
    this.baseQuat = new THREE.Quaternion();
    this.basePos = new THREE.Vector3();

    // Temp objects for interpolation
    this._interpDelta = new THREE.Quaternion();
    this._interpPos = new THREE.Vector3();
    this._rotatedPos = new THREE.Vector3();

    // Animation library
    this.animations = new Map();

    // Tracking for playOnce
    this.playedAnimations = new Set();

    // Track last state to detect changes
    this.lastState = null;

    // Delayed playback support
    this.pendingAnimations = new Map(); // Map of animId -> { animData, timer, delay }

    // Delayed input restoration (for lookat animations with zoom)
    this.pendingInputRestore = null; // { timer: 0, delay: number } or null

    // Post-animation settle-up to ensure clearance above floor
    this.isSettlingUp = false;
    this.settleStartY = 0;
    this.settleTargetY = 0;
    this.settleElapsed = 0;
    this.settleDuration = 0.3; // seconds
    this._pendingComplete = null;
    this.minCharacterCenterY = 0.9; // minimum body center Y to be above physics floor

    // Listen for state changes
    if (this.gameManager) {
      this.gameManager.on("state:changed", (newState, oldState) => {
        this.onStateChanged(newState);
      });

      // Listen for camera:animation events
      this.gameManager.on("camera:animation", async (data) => {
        const { animation, onComplete } = data;
        console.log(`CameraAnimationManager: Playing animation: ${animation}`);

        // Load animation if not already loaded
        if (!this.getAnimationNames().includes(animation)) {
          const ok = await this.loadAnimation(animation, animation);
          if (!ok) {
            console.warn(
              `CameraAnimationManager: Failed to load animation: ${animation}`
            );
            if (onComplete) onComplete(false);
            return;
          }
        }

        // Play animation
        this.play(animation, () => {
          console.log(
            `CameraAnimationManager: Animation complete: ${animation}`
          );
          if (onComplete) onComplete(true);
        });
      });
    }

    console.log("CameraAnimationManager: Initialized with event listeners");
  }

  /**
   * Load animations from data
   * @param {Object} animationData - Camera animation data object
   * @returns {Promise<void>}
   */
  async loadAnimationsFromData(animationData) {
    const animations = Object.values(animationData);
    // Only load JSON animations (jsonAnimation or animation type with path), skip lookats and moveTos
    const animationsToLoad = animations.filter(
      (anim) =>
        (anim.type === "jsonAnimation" || anim.type === "animation") &&
        anim.path
    );
    const loadPromises = animationsToLoad.map((anim) =>
      this.loadAnimation(anim.id, anim.path)
    );
    await Promise.all(loadPromises);

    const nonJsonCount = animations.length - animationsToLoad.length;
    console.log(
      `CameraAnimationManager: Loaded ${animationsToLoad.length} JSON animations from data (${nonJsonCount} lookats/moveTos)`
    );
  }

  /**
   * Handle game state changes
   * @param {Object} newState - New game state
   */
  onStateChanged(newState) {
    console.log(
      `CameraAnimationManager: State changed, checking for animations...`,
      newState
    );

    // Don't interrupt currently playing animation
    if (this.isPlaying) {
      console.log(
        `CameraAnimationManager: Animation already playing, skipping`
      );
      return;
    }

    // Check if any animation should play for this state (pass playedAnimations for playOnce filtering)
    const animData = getCameraAnimationForState(
      newState,
      this.playedAnimations
    );
    if (!animData) {
      console.log(`CameraAnimationManager: No animation matches current state`);
      return;
    }

    console.log(
      `CameraAnimationManager: Found animation '${animData.id}' for state`
    );

    // Check if animation has a delay
    const delay = animData.delay || 0;

    if (delay > 0) {
      // Schedule delayed playback
      this.scheduleDelayedAnimation(animData, delay);
    } else {
      // Play immediately (playOnce check already handled in getCameraAnimationForState)
      console.log(
        `CameraAnimationManager: State changed, playing '${animData.id}'`
      );
      this.playFromData(animData);
    }
  }

  /**
   * Schedule an animation to play after a delay
   * @param {Object} animData - Animation data to schedule
   * @param {number} delay - Delay in seconds
   * @private
   */
  scheduleDelayedAnimation(animData, delay) {
    console.log(
      `CameraAnimationManager: Scheduling animation "${animData.id}" with ${delay}s delay`
    );

    this.pendingAnimations.set(animData.id, {
      animData,
      timer: 0,
      delay,
    });
  }

  /**
   * Cancel a pending delayed animation
   * @param {string} animId - Animation ID to cancel
   */
  cancelDelayedAnimation(animId) {
    if (this.pendingAnimations.has(animId)) {
      console.log(
        `CameraAnimationManager: Cancelled delayed animation "${animId}"`
      );
      this.pendingAnimations.delete(animId);
    }
  }

  /**
   * Cancel all pending delayed animations
   */
  cancelAllDelayedAnimations() {
    if (this.pendingAnimations.size > 0) {
      console.log(
        `CameraAnimationManager: Cancelling ${this.pendingAnimations.size} pending animation(s)`
      );
      this.pendingAnimations.clear();
    }
  }

  /**
   * Check if an animation is pending (scheduled with delay)
   * @param {string} animId - Animation ID to check
   * @returns {boolean}
   */
  isAnimationPending(animId) {
    return this.pendingAnimations.has(animId);
  }

  /**
   * Check if any animations are pending
   * @returns {boolean}
   */
  hasAnimationsPending() {
    return this.pendingAnimations.size > 0;
  }

  /**
   * Play an animation from data config
   * @param {Object} animData - Animation data from cameraAnimationData.js
   * @returns {boolean} Success
   */
  playFromData(animData) {
    // Handle lookat type
    if (animData.type === "lookat") {
      this.playLookat(animData);
      return true;
    }

    // Handle moveTo type
    if (animData.type === "moveTo") {
      this.playMoveTo(animData);
      return true;
    }

    // Handle jsonAnimation or animation type (default)
    if (animData.type === "jsonAnimation" || animData.type === "animation") {
      const success = this.play(
        animData.id,
        () => {
          // Mark as played if playOnce
          if (animData.playOnce) {
            this.playedAnimations.add(animData.id);
          }
        },
        animData
      );
      return success;
    }

    console.warn(
      `CameraAnimationManager: Unknown animation type "${animData.type}"`
    );
    return false;
  }

  /**
   * Play a lookat from data config
   * @param {Object} lookAtData - Lookat data from cameraAnimationData.js
   */
  playLookat(lookAtData) {
    console.log(`CameraAnimationManager: Playing lookat '${lookAtData.id}'`);

    // Mark as played if playOnce
    if (lookAtData.playOnce) {
      this.playedAnimations.add(lookAtData.id);
    }

    // Support both new (transitionTime) and old (duration) property names for backwards compatibility
    const transitionTime =
      lookAtData.transitionTime || lookAtData.duration || 2.0;
    const returnTransitionTime =
      lookAtData.returnTransitionTime ||
      lookAtData.returnDuration ||
      transitionTime;

    // Determine if we need to delay input restoration after zoom completes
    // This happens when: zoom is enabled, returnToOriginalView is false
    const needsDelayedRestore =
      lookAtData.enableZoom &&
      !lookAtData.returnToOriginalView &&
      lookAtData.zoomOptions;

    let onComplete = null;

    if (needsDelayedRestore) {
      const zoomOpts = lookAtData.zoomOptions;
      const holdDuration = zoomOpts.holdDuration || 0;
      const zoomTransitionDuration = zoomOpts.transitionDuration || 0;
      const delayAfterLookat = holdDuration + zoomTransitionDuration;

      console.log(
        `CameraAnimationManager: Lookat '${lookAtData.id}' has zoom without return. ` +
          `Will restore control ${delayAfterLookat.toFixed(
            2
          )}s after lookat completes ` +
          `(hold: ${holdDuration}s + zoom-out: ${zoomTransitionDuration}s)`
      );

      // Provide onComplete that schedules delayed restoration
      onComplete = () => {
        this.pendingInputRestore = {
          timer: 0,
          delay: delayAfterLookat,
        };
      };
    } else {
      // Immediate restoration when lookat completes
      onComplete = () => {
        if (this.characterController) {
          this.characterController.enableInput();
          console.log(
            `CameraAnimationManager: Lookat '${lookAtData.id}' complete, input restored`
          );
        }
      };
    }

    // Emit lookat event through gameManager
    // Note: This doesn't block isPlaying - lookats can happen during JSON animations
    if (this.gameManager) {
      this.gameManager.emit("camera:lookat", {
        position: lookAtData.position,
        duration: transitionTime,
        onComplete: onComplete,
        returnToOriginalView: lookAtData.returnToOriginalView || false,
        returnDuration: returnTransitionTime,
        enableZoom: lookAtData.enableZoom || false,
        zoomOptions: lookAtData.zoomOptions || {},
        colliderId: `camera-data-${lookAtData.id}`,
      });
    } else {
      console.warn(
        `CameraAnimationManager: Cannot play lookat '${lookAtData.id}', no gameManager`
      );
    }
  }

  /**
   * Play a moveTo from data config
   * @param {Object} moveToData - MoveTo data from cameraAnimationData.js
   */
  playMoveTo(moveToData) {
    console.log(`CameraAnimationManager: Playing moveTo '${moveToData.id}'`);

    // Mark as played if playOnce
    if (moveToData.playOnce) {
      this.playedAnimations.add(moveToData.id);
    }

    // Support both new (transitionTime) and old (duration) property names for backwards compatibility
    const transitionTime =
      moveToData.transitionTime || moveToData.duration || 2.0;

    // Emit moveTo event through gameManager
    // Note: This doesn't block isPlaying - moveTos can happen during JSON animations
    if (this.gameManager) {
      this.gameManager.emit("character:moveto", {
        position: moveToData.position,
        rotation: moveToData.rotation || null,
        duration: transitionTime, // Still use 'duration' for the event for compatibility with characterController
        inputControl: moveToData.inputControl || {
          disableMovement: true,
          disableRotation: true,
        },
        onComplete: moveToData.onComplete || null,
      });
    } else {
      console.warn(
        `CameraAnimationManager: Cannot play moveTo '${moveToData.id}', no gameManager`
      );
    }
  }

  /**
   * Load an animation from JSON
   * @param {string} name - Animation identifier
   * @param {string} url - Path to JSON file
   * @returns {Promise<boolean>} Success
   */
  async loadAnimation(name, url) {
    try {
      let src = url || "";
      if (!/^(\/|https?:)/i.test(src)) {
        src = "/json/" + (src.endsWith(".json") ? src : src + ".json");
      }
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = Array.isArray(data.frames) ? data.frames : [];
      if (raw.length === 0) {
        console.warn(`CameraAnimationManager: No frames in '${src}'`);
        return false;
      }

      // Build quaternions and compute deltas relative to first frame
      const quats = raw.map(
        (f) => new THREE.Quaternion(f.q[0], f.q[1], f.q[2], f.q[3])
      );
      const q0Inv = quats[0].clone().invert();
      const p0 = Array.isArray(raw[0].p)
        ? new THREE.Vector3(raw[0].p[0], raw[0].p[1], raw[0].p[2])
        : new THREE.Vector3(0, 0, 0);

      const t0 = typeof raw[0].t === "number" ? raw[0].t : 0;
      const positionScale = 7.0; // Scale factor for world coordinates
      const frames = raw.map((f, i) => {
        const t = (typeof f.t === "number" ? f.t : 0) - t0;
        const qd = q0Inv.clone().multiply(quats[i]);
        let pd = null;
        if (Array.isArray(f.p)) {
          const p = new THREE.Vector3(f.p[0], f.p[1], f.p[2]);
          const dpWorld = p.sub(p0).multiplyScalar(positionScale);
          pd = dpWorld.applyQuaternion(q0Inv.clone());
        }
        return { t, qd, pd };
      });

      const duration = frames[frames.length - 1].t;
      this.animations.set(name, { frames, duration });
      console.log(
        `CameraAnimationManager: Loaded '${name}' (${
          frames.length
        } frames, ${duration.toFixed(2)}s)`
      );
      return true;
    } catch (e) {
      console.warn(`CameraAnimationManager: Failed to load '${name}':`, e);
      return false;
    }
  }

  /**
   * Play an animation
   * @param {string} name - Animation identifier
   * @param {Function} onComplete - Optional completion callback
   * @param {Object} animData - Optional animation data config
   * @returns {boolean} Success
   */
  play(name, onComplete = null, animData = null) {
    const anim = this.animations.get(name);
    if (!anim) {
      console.warn(`CameraAnimationManager: Animation '${name}' not found`);
      return false;
    }

    // Capture current camera pose as base
    this.baseQuat.copy(this.camera.quaternion);
    this.basePos.copy(this.camera.position);

    // Disable character controller
    if (this.characterController) {
      this.characterController.disableInput();
    }

    // Start playback
    this.currentAnimation = anim;
    this.currentAnimationData = animData;
    this.elapsed = 0;
    this.frameIdx = 1;
    this.isPlaying = true;
    this.onComplete = onComplete;

    console.log(`CameraAnimationManager: Playing '${name}'`);
    return true;
  }

  /**
   * Stop current animation
   * @param {boolean} syncController - If true, sync controller yaw/pitch to camera (can be overridden by animData)
   * @param {boolean} restoreInput - If true, restore input controls (can be overridden by animData)
   */
  stop(syncController = true, restoreInput = true) {
    if (!this.isPlaying) return;

    // Use animData config if available
    if (this.currentAnimationData) {
      syncController =
        this.currentAnimationData.syncController !== undefined
          ? this.currentAnimationData.syncController
          : syncController;
      restoreInput =
        this.currentAnimationData.restoreInput !== undefined
          ? this.currentAnimationData.restoreInput
          : restoreInput;
    }

    this.isPlaying = false;
    this.currentAnimation = null;
    this.currentAnimationData = null;

    // Update physics body position to match camera's final position
    if (this.characterController && this.characterController.character) {
      const character = this.characterController.character;

      // Calculate physics body position (camera position minus camera height offset)
      const cameraHeight = this.characterController.cameraHeight || 1.6;
      const bodyPosition = {
        x: this.camera.position.x,
        y: this.camera.position.y - cameraHeight,
        z: this.camera.position.z,
      };

      // Update physics body position
      character.setTranslation(bodyPosition, true);

      // Update physics body rotation to match camera's yaw (ignore pitch for capsule)
      const euler = new THREE.Euler().setFromQuaternion(
        this.camera.quaternion,
        "YXZ"
      );
      const bodyQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, euler.y, 0, "YXZ")
      );
      character.setRotation(
        { x: bodyQuat.x, y: bodyQuat.y, z: bodyQuat.z, w: bodyQuat.w },
        true
      );

      // Reset velocity to prevent any residual movement
      character.setLinvel({ x: 0, y: 0, z: 0 }, true);
      character.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    // Restore character controller
    if (this.characterController) {
      if (syncController) {
        const euler = new THREE.Euler().setFromQuaternion(
          this.camera.quaternion,
          "YXZ"
        );
        this.characterController.yaw = euler.y;
        this.characterController.pitch = euler.x;
        this.characterController.targetYaw = this.characterController.yaw;
        this.characterController.targetPitch = this.characterController.pitch;
      }

      // Only restore input if configured
      if (restoreInput) {
        this.characterController.enableInput();
        console.log("CameraAnimationManager: Stopped, input restored");
      } else {
        console.log(
          "CameraAnimationManager: Stopped, input NOT restored (manual restoration required)"
        );
      }
    }
  }

  /**
   * Update animation (call every frame)
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // Update pending delayed animations
    if (this.pendingAnimations.size > 0) {
      for (const [animId, pending] of this.pendingAnimations) {
        pending.timer += dt;

        // Check if delay has elapsed and no animation is currently playing
        if (pending.timer >= pending.delay && !this.isPlaying) {
          console.log(
            `CameraAnimationManager: Playing delayed animation "${animId}"`
          );
          this.pendingAnimations.delete(animId);
          this.playFromData(pending.animData);
          break; // Only play one animation per frame
        }
      }
    }

    // Update pending input restoration (for lookat animations with zoom)
    if (this.pendingInputRestore) {
      this.pendingInputRestore.timer += dt;

      if (this.pendingInputRestore.timer >= this.pendingInputRestore.delay) {
        // Restore input after delay
        if (this.characterController) {
          this.characterController.enableInput();
          console.log(
            `CameraAnimationManager: Restored control after zoom completion (${this.pendingInputRestore.delay.toFixed(
              2
            )}s delay)`
          );
        }
        this.pendingInputRestore = null;
      }
    }

    // Handle settle-up phase (runs after animation frames complete)
    if (this.isSettlingUp) {
      this.settleElapsed += dt;
      const t = Math.min(1, this.settleElapsed / this.settleDuration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.y =
        this.settleStartY + (this.settleTargetY - this.settleStartY) * eased;
      if (t >= 1) {
        const callback = this._pendingComplete;
        this._pendingComplete = null;
        // Complete by stopping and restoring input
        this.stop(true, true);
        if (callback) callback();
      }
      return;
    }

    if (!this.isPlaying || !this.currentAnimation) return;

    this.elapsed += dt;
    const { frames, duration } = this.currentAnimation;

    // Check if animation is complete
    if (this.elapsed >= duration) {
      const last = frames[frames.length - 1];
      // Apply final pose
      this.camera.quaternion.copy(this.baseQuat).multiply(last.qd);
      if (last.pd) {
        this._rotatedPos.copy(last.pd).applyQuaternion(this.baseQuat);
        this.camera.position.copy(this.basePos).add(this._rotatedPos);
      }

      // Ensure clearance above physics floor before restoring control
      const cameraHeight = this.characterController?.cameraHeight ?? 1.6;
      const bodyCenterY = this.camera.position.y - cameraHeight;
      if (bodyCenterY < this.minCharacterCenterY) {
        // Lerp camera up by the shortfall before restoring input
        const deltaUp = this.minCharacterCenterY - bodyCenterY;
        this.isSettlingUp = true;
        this.settleStartY = this.camera.position.y;
        this.settleTargetY = this.camera.position.y + deltaUp;
        this.settleElapsed = 0;
        this._pendingComplete = this.onComplete;
        return;
      }

      // Complete
      const callback = this.onComplete;
      this.stop(true, true); // Use defaults, will be overridden by animData if present
      if (callback) callback();
      return;
    }

    // Advance frame cursor
    while (
      this.frameIdx < frames.length &&
      frames[this.frameIdx].t < this.elapsed
    ) {
      this.frameIdx++;
    }

    // Interpolate between frames
    const a = frames[Math.max(0, this.frameIdx - 1)];
    const b = frames[Math.min(frames.length - 1, this.frameIdx)];
    const span = Math.max(1e-6, b.t - a.t);
    const s = Math.min(1, Math.max(0, (this.elapsed - a.t) / span));

    // Apply rotation delta
    this._interpDelta.copy(a.qd).slerp(b.qd, s);
    this.camera.quaternion.copy(this.baseQuat).multiply(this._interpDelta);

    // Apply position delta
    if (a.pd && b.pd) {
      this._interpPos.copy(a.pd).lerp(b.pd, s);
      this._rotatedPos.copy(this._interpPos).applyQuaternion(this.baseQuat);
      this.camera.position.copy(this.basePos).add(this._rotatedPos);
    }
  }

  /**
   * Check if an animation is currently playing
   * @returns {boolean}
   */
  get playing() {
    return this.isPlaying;
  }

  /**
   * Get list of loaded animation names
   * @returns {string[]}
   */
  getAnimationNames() {
    return Array.from(this.animations.keys());
  }
}

export default CameraAnimationManager;
