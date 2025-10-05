import * as THREE from "three";

/**
 * CameraAnimationSystem - Manages playback of recorded camera animations
 *
 * Features:
 * - Load and play head-pose animations from JSON
 * - Smooth handoff to/from character controller
 * - Local-space playback (applies deltas relative to starting pose)
 * - Event-based completion callbacks
 */
class CameraAnimationSystem {
  constructor(camera, characterController) {
    this.camera = camera;
    this.characterController = characterController;

    // Playback state
    this.isPlaying = false;
    this.currentAnimation = null;
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
        console.warn(`CameraAnimationSystem: No frames in '${src}'`);
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
        `CameraAnimationSystem: Loaded '${name}' (${
          frames.length
        } frames, ${duration.toFixed(2)}s)`
      );
      return true;
    } catch (e) {
      console.warn(`CameraAnimationSystem: Failed to load '${name}':`, e);
      return false;
    }
  }

  /**
   * Play an animation
   * @param {string} name - Animation identifier
   * @param {Function} onComplete - Optional completion callback
   * @returns {boolean} Success
   */
  play(name, onComplete = null) {
    const anim = this.animations.get(name);
    if (!anim) {
      console.warn(`CameraAnimationSystem: Animation '${name}' not found`);
      return false;
    }

    // Capture current camera pose as base
    this.baseQuat.copy(this.camera.quaternion);
    this.basePos.copy(this.camera.position);

    // Disable character controller
    if (this.characterController) {
      this.characterController.inputDisabled = true;
      this.characterController.keys = {
        w: false,
        a: false,
        s: false,
        d: false,
        shift: false,
      };
    }

    // Start playback
    this.currentAnimation = anim;
    this.elapsed = 0;
    this.frameIdx = 1;
    this.isPlaying = true;
    this.onComplete = onComplete;

    console.log(`CameraAnimationSystem: Playing '${name}'`);
    return true;
  }

  /**
   * Stop current animation and restore control
   * @param {boolean} syncController - If true, sync controller yaw/pitch to camera
   */
  stop(syncController = true) {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    this.currentAnimation = null;

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
      this.characterController.inputDisabled = false;
    }

    console.log(
      "CameraAnimationSystem: Stopped, physics body updated to camera position"
    );
  }

  /**
   * Update animation (call every frame)
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
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

      // Complete
      const callback = this.onComplete;
      this.stop(true);
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

export default CameraAnimationSystem;
