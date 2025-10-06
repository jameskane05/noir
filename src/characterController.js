import * as THREE from "three";
import { Howl } from "howler";
import BreathingSystem from "./wip/breathingSystem.js";

class CharacterController {
  constructor(character, camera, renderer, sfxManager = null) {
    this.character = character;
    this.camera = camera;
    this.renderer = renderer;
    this.sfxManager = sfxManager;

    // Movement state
    this.keys = { w: false, a: false, s: false, d: false, shift: false };

    // Camera rotation
    this.yaw = THREE.MathUtils.degToRad(-230); // Initial yaw in radians
    this.pitch = 0;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;

    // Camera look-at system
    this.isLookingAt = false;
    this.lookAtTarget = null;
    this.lookAtDuration = 0;
    this.lookAtProgress = 0;
    this.lookAtStartQuat = new THREE.Quaternion();
    this.lookAtEndQuat = new THREE.Quaternion();
    this.lookAtOnComplete = null;
    this.inputDisabled = false;

    // Headbob state
    this.headbobTime = 0;
    this.headbobIntensity = 0;
    this.idleHeadbobTime = 0;
    this.headbobEnabled = true;

    // Idle glance system
    this.glanceEnabled = false; // Disabled for now - can re-enable later
    this.idleTime = 0; // Time spent idle
    this.glanceState = null; // null, 'glancing', 'returning'
    this.glanceProgress = 0; // 0 to 1
    this.glanceDuration = 1.2; // Duration of one glance animation (slower)
    this.glanceTimer = 3.0; // Time until next glance (starts at 3 seconds)
    this.glanceStartYaw = 0;
    this.glanceTargetYaw = 0;
    this.glanceStartPitch = 0;
    this.glanceTargetPitch = 0;

    // Audio
    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener);
    this.footstepSound = null;
    this.isPlayingFootsteps = false;

    // Breathing system
    this.breathingSystem = new BreathingSystem(this.audioListener.context, {
      idleBreathRate: 0.17, // Slower, deeper breathing - 10 breaths per minute
      activeBreathRate: 0.5, // 30 breaths per minute when moving
      volume: 0.8, // Louder breathing
    });

    // Settings
    this.baseSpeed = 4.0;
    this.sprintMultiplier = 1.75; // Reduced from 2.0 (30% slower sprint)
    this.cameraHeight = 1.6;
    this.mouseSensitivity = 0.0025;
    this.cameraSmoothingFactor = 0.15;

    this.setupInputListeners();
    this.loadFootstepAudio();
  }

  /**
   * Enable breathing (call when character controller becomes active)
   */
  enableBreathing() {
    if (this.breathingSystem) {
      this.breathingSystem.start();
    }
  }

  /**
   * Disable breathing
   */
  disableBreathing() {
    if (this.breathingSystem) {
      this.breathingSystem.stop();
    }
  }

  loadFootstepAudio() {
    // Load footstep audio using Howler.js
    this.footstepSound = new Howl({
      src: ["./audio/sfx/gravel-steps.ogg"],
      loop: true,
      volume: 0.2,
      preload: true,
      onload: () => {
        console.log("Footstep audio loaded successfully");
      },
      onloaderror: (id, error) => {
        console.warn("Failed to load footstep audio:", error);
      },
    });

    // Register with SFX manager if available
    if (this.sfxManager) {
      this.sfxManager.registerSound("footsteps", this.footstepSound, 0.2);
    }

    // Register breathing system volume control with SFX manager
    if (this.sfxManager && this.breathingSystem) {
      // Create a proxy object that implements the setVolume interface
      const breathingVolumeControl = {
        setVolume: (volume) => {
          this.breathingSystem.setVolume(volume * 0.2); // Scale to appropriate range (louder)
        },
      };
      this.sfxManager.registerSound("breathing", breathingVolumeControl, 1.0);
    }
  }

  /**
   * Start camera look-at sequence
   * @param {THREE.Vector3} targetPosition - World position to look at
   * @param {number} duration - Time to complete the look-at in seconds
   * @param {Function} onComplete - Optional callback when complete
   */
  lookAt(targetPosition, duration = 1.0, onComplete = null) {
    this.isLookingAt = true;
    this.lookAtTarget = targetPosition.clone();
    this.lookAtDuration = duration;
    this.lookAtProgress = 0;
    this.lookAtOnComplete = onComplete;
    this.inputDisabled = true;

    // Clear all key states to prevent stuck keys
    this.keys = { w: false, a: false, s: false, d: false, shift: false };

    // Store current camera orientation as quaternion
    this.lookAtStartQuat.setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, 0, "YXZ")
    );

    // Calculate target orientation
    const direction = new THREE.Vector3()
      .subVectors(targetPosition, this.camera.position)
      .normalize();

    // Calculate target yaw and pitch from direction
    const targetYaw = Math.atan2(-direction.x, -direction.z);
    const targetPitch = Math.asin(direction.y);

    // Create target quaternion from target euler angles
    this.lookAtEndQuat.setFromEuler(
      new THREE.Euler(targetPitch, targetYaw, 0, "YXZ")
    );

    console.log(`CharacterController: Looking at target over ${duration}s`);
  }

  /**
   * Cancel the look-at and restore player control
   * @param {boolean} updateYawPitch - If true, update yaw/pitch to match current camera orientation
   */
  cancelLookAt(updateYawPitch = true) {
    if (!this.isLookingAt) return;

    this.isLookingAt = false;
    this.inputDisabled = false;

    // Clear all key states to prevent stuck keys
    this.keys = { w: false, a: false, s: false, d: false, shift: false };

    // Reset glance state
    this.glanceState = null;
    this.idleTime = 0;
    this.glanceTimer = 3.0;

    if (updateYawPitch) {
      // Update yaw and pitch to match current camera orientation
      const euler = new THREE.Euler().setFromQuaternion(
        this.camera.quaternion,
        "YXZ"
      );
      this.yaw = euler.y;
      this.pitch = euler.x;
      this.targetYaw = this.yaw;
      this.targetPitch = this.pitch;
    }

    console.log("CharacterController: Look-at cancelled, control restored");
  }

  setupInputListeners() {
    // Keyboard input
    window.addEventListener("keydown", (event) => {
      if (this.inputDisabled) return;
      const k = event.key.toLowerCase();
      if (k in this.keys) this.keys[k] = true;
      if (event.key === "Shift") this.keys.shift = true;
    });

    window.addEventListener("keyup", (event) => {
      if (this.inputDisabled) return;
      const k = event.key.toLowerCase();
      if (k in this.keys) this.keys[k] = false;
      if (event.key === "Shift") this.keys.shift = false;
    });

    // Pointer lock + mouse look
    this.renderer.domElement.addEventListener("click", () => {
      if (this.inputDisabled) return;
      this.renderer.domElement.requestPointerLock();
    });

    document.addEventListener("mousemove", (event) => {
      if (this.inputDisabled) return;
      if (document.pointerLockElement !== this.renderer.domElement) return;
      this.targetYaw -= event.movementX * this.mouseSensitivity;
      this.targetPitch -= event.movementY * this.mouseSensitivity;
      this.targetPitch = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, this.targetPitch)
      );
    });
  }

  getForwardRightVectors() {
    const forward = new THREE.Vector3(0, 0, -1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)
      .setY(0)
      .normalize();
    const right = new THREE.Vector3().crossVectors(
      forward,
      new THREE.Vector3(0, 1, 0)
    );
    return { forward, right };
  }

  calculateIdleHeadbob() {
    // Gentle breathing/idle animation - half strength of walking
    const idleFrequency = 0.8; // Slow breathing rate
    const idleVerticalAmp = 0.015; // Half of walk vertical (0.04)
    const idleHorizontalAmp = 0.01; // Half of walk horizontal (0.03)

    const verticalBob =
      Math.sin(this.idleHeadbobTime * idleFrequency * Math.PI * 2) *
      idleVerticalAmp;
    const horizontalBob =
      Math.sin(this.idleHeadbobTime * idleFrequency * Math.PI) *
      idleHorizontalAmp;

    return {
      vertical: verticalBob,
      horizontal: horizontalBob,
    };
  }

  /**
   * Start a glance animation (look left/right and slightly up/down)
   */
  startGlance() {
    this.glanceState = "glancing";
    this.glanceProgress = 0;
    this.glanceStartYaw = this.yaw;
    this.glanceStartPitch = this.pitch;

    // Random horizontal direction and angle
    const horizontalDir = Math.random() > 0.5 ? 1 : -1;
    const glanceAngle = (Math.random() * 0.3 + 0.2) * horizontalDir; // 0.2 to 0.5 radians (~11 to 29 degrees)
    this.glanceTargetYaw = this.yaw + glanceAngle;

    // Random vertical angle (slight up or down)
    const verticalAngle = Math.random() * 0.15 - 0.075; // -0.075 to 0.075 radians (~-4 to 4 degrees)
    this.glanceTargetPitch = this.pitch + verticalAngle;

    // Clamp pitch to valid range
    this.glanceTargetPitch = Math.max(
      -Math.PI / 2 + 0.01,
      Math.min(Math.PI / 2 - 0.01, this.glanceTargetPitch)
    );
  }

  /**
   * Update idle glance system
   * @param {number} dt - Delta time
   * @param {boolean} isMoving - Whether the player is moving
   */
  updateIdleGlance(dt, isMoving) {
    // Skip if glance system is disabled
    if (!this.glanceEnabled) return;

    // Reset idle time if moving or input is disabled
    if (isMoving || this.inputDisabled) {
      this.idleTime = 0;
      this.glanceState = null;
      this.glanceTimer = 3.0; // Reset to initial 3 seconds
      return;
    }

    // Accumulate idle time
    this.idleTime += dt;

    // Update glance animation if glancing
    if (this.glanceState === "glancing") {
      this.glanceProgress += dt / this.glanceDuration;

      if (this.glanceProgress >= 1.0) {
        // Glance complete - start return to start
        this.glanceProgress = 0;
        this.glanceState = "returning";
      } else {
        // Animate glance with ease-in-out
        const t = this.glanceProgress;
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        // Interpolate yaw and pitch
        this.targetYaw =
          this.glanceStartYaw +
          (this.glanceTargetYaw - this.glanceStartYaw) * easedT;
        this.targetPitch =
          this.glanceStartPitch +
          (this.glanceTargetPitch - this.glanceStartPitch) * easedT;
      }
    } else if (this.glanceState === "returning") {
      // Return to start position at the same speed
      this.glanceProgress += dt / this.glanceDuration;

      if (this.glanceProgress >= 1.0) {
        // Return complete - reset state
        this.glanceProgress = 1.0;
        this.glanceState = null;
        this.glanceTimer = 4.0 + Math.random() * 2.0; // Next glance in 4-6 seconds

        // Ensure we're back at start
        this.targetYaw = this.glanceStartYaw;
        this.targetPitch = this.glanceStartPitch;
      } else {
        // Animate return with ease-in-out
        const t = this.glanceProgress;
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        // Interpolate back to start
        this.targetYaw =
          this.glanceTargetYaw +
          (this.glanceStartYaw - this.glanceTargetYaw) * easedT;
        this.targetPitch =
          this.glanceTargetPitch +
          (this.glanceStartPitch - this.glanceTargetPitch) * easedT;
      }
    } else {
      // Count down to next glance
      if (this.idleTime >= 3.0) {
        this.glanceTimer -= dt;

        if (this.glanceTimer <= 0) {
          this.startGlance();
        }
      }
    }
  }

  calculateHeadbob(isSprinting) {
    // Different parameters for walking vs sprinting
    const walkFrequency = 2.2; // Steps per second
    const sprintFrequency = 2.6; // Reduced from 3.5 for less rapid bobbing
    const walkVerticalAmp = 0.04; // Vertical bobbing amplitude
    const sprintVerticalAmp = 0.08;
    const walkHorizontalAmp = 0.03; // Horizontal swaying amplitude
    const sprintHorizontalAmp = 0.06;

    const frequency = isSprinting ? sprintFrequency : walkFrequency;
    const verticalAmp = isSprinting ? sprintVerticalAmp : walkVerticalAmp;
    const horizontalAmp = isSprinting ? sprintHorizontalAmp : walkHorizontalAmp;

    // Vertical bob: double frequency for realistic step pattern
    const verticalBob =
      Math.sin(this.headbobTime * frequency * Math.PI * 2) * verticalAmp;

    // Horizontal sway: half frequency for subtle side-to-side motion
    const horizontalBob =
      Math.sin(this.headbobTime * frequency * Math.PI) * horizontalAmp;

    // Apply intensity smoothing
    return {
      vertical: verticalBob * this.headbobIntensity,
      horizontal: horizontalBob * this.headbobIntensity,
    };
  }

  update(dt) {
    // Handle camera look-at sequence
    if (this.isLookingAt) {
      this.lookAtProgress += dt / this.lookAtDuration;

      if (this.lookAtProgress >= 1.0) {
        // Look-at complete
        this.lookAtProgress = 1.0;
        this.isLookingAt = false;

        // Clear all key states to prevent stuck keys
        this.keys = { w: false, a: false, s: false, d: false, shift: false };

        // Reset glance state
        this.glanceState = null;
        this.idleTime = 0;
        this.glanceTimer = 3.0;

        // Call completion callback if provided
        if (this.lookAtOnComplete) {
          this.lookAtOnComplete();
          this.lookAtOnComplete = null;
        }
      }

      // Slerp between start and end quaternions
      const t = Math.min(this.lookAtProgress, 1.0);
      // Apply easing for smoother motion
      const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const currentQuat = new THREE.Quaternion();
      currentQuat.slerpQuaternions(
        this.lookAtStartQuat,
        this.lookAtEndQuat,
        easedT
      );

      // Apply quaternion to camera
      this.camera.quaternion.copy(currentQuat);

      // Update yaw/pitch to match (for smooth transition back to player control)
      const euler = new THREE.Euler().setFromQuaternion(currentQuat, "YXZ");
      this.yaw = euler.y;
      this.pitch = euler.x;
      this.targetYaw = this.yaw;
      this.targetPitch = this.pitch;
    } else {
      // Normal camera control
      // Smooth camera rotation to reduce jitter
      this.yaw += (this.targetYaw - this.yaw) * this.cameraSmoothingFactor;
      this.pitch +=
        (this.targetPitch - this.pitch) * this.cameraSmoothingFactor;
    }

    // Input -> desired velocity in XZ plane (disabled during look-at)
    let isMoving = false;
    if (!this.inputDisabled) {
      const { forward, right } = this.getForwardRightVectors();
      const moveSpeed = this.keys.shift
        ? this.baseSpeed * this.sprintMultiplier
        : this.baseSpeed;
      const desired = new THREE.Vector3();
      if (this.keys.w) desired.add(forward);
      if (this.keys.s) desired.sub(forward);
      if (this.keys.a) desired.sub(right);
      if (this.keys.d) desired.add(right);
      isMoving = desired.lengthSq() > 1e-6;
      if (isMoving) desired.normalize().multiplyScalar(moveSpeed);

      // Apply velocity: preserve current Y velocity (gravity)
      const linvel = this.character.linvel();
      this.character.setLinvel(
        { x: desired.x, y: linvel.y, z: desired.z },
        true
      );
    } else {
      // Stop movement when input is disabled
      const linvel = this.character.linvel();
      this.character.setLinvel({ x: 0, y: linvel.y, z: 0 }, true);
    }

    // Update idle glance system (before headbob so it can affect targetYaw)
    this.updateIdleGlance(dt, isMoving);

    // Update headbob state
    const targetIntensity = this.headbobEnabled ? (isMoving ? 1.0 : 0.0) : 0.0;
    this.headbobIntensity += (targetIntensity - this.headbobIntensity) * 0.15; // Smooth transition

    // Always update idle headbob time for breathing animation
    this.idleHeadbobTime += dt;

    if (isMoving && this.headbobEnabled) {
      this.headbobTime += dt; // Accumulate time only when moving
    }

    // Update breathing system
    const movementIntensity = this.keys.shift ? 1.0 : 0.5;
    this.breathingSystem.update(dt, isMoving, movementIntensity);

    // Update footstep audio
    if (this.footstepSound) {
      // Resume audio context if it's suspended (browser autoplay policy)
      if (this.audioListener.context.state === "suspended") {
        this.audioListener.context.resume();
      }

      if (isMoving && !this.isPlayingFootsteps) {
        this.footstepSound.play();
        this.isPlayingFootsteps = true;
      } else if (!isMoving && this.isPlayingFootsteps) {
        this.footstepSound.stop();
        this.isPlayingFootsteps = false;
      }

      // Adjust playback rate based on sprint
      if (this.isPlayingFootsteps) {
        const playbackRate = this.keys.shift ? 1.5 : 1.0;
        this.footstepSound.rate(playbackRate);
      }
    }

    // Calculate headbob offset (movement + idle)
    const movementHeadbob = this.headbobEnabled
      ? this.calculateHeadbob(this.keys.shift)
      : { vertical: 0, horizontal: 0 };
    const idleHeadbob = this.headbobEnabled
      ? this.calculateIdleHeadbob()
      : { vertical: 0, horizontal: 0 };
    const { forward: fwd, right: rgt } = this.getForwardRightVectors();

    // Sync camera to physics body position
    const p = this.character.translation();

    // Camera follow: position slightly behind and above the character with headbob
    const cameraOffset = new THREE.Vector3(0, this.cameraHeight, 0);
    const camFollow = new THREE.Vector3(p.x, p.y, p.z).add(cameraOffset);

    // Apply combined headbob: vertical (Y) and horizontal (side-to-side relative to view direction)
    camFollow.y += movementHeadbob.vertical + idleHeadbob.vertical;
    camFollow.add(
      rgt
        .clone()
        .multiplyScalar(movementHeadbob.horizontal + idleHeadbob.horizontal)
    );

    this.camera.position.copy(camFollow);

    // Build look direction from yaw/pitch (only when not in look-at mode)
    if (!this.isLookingAt) {
      const lookDir = new THREE.Vector3(0, 0, -1).applyEuler(
        new THREE.Euler(this.pitch, this.yaw, 0, "YXZ")
      );
      const lookTarget = new THREE.Vector3()
        .copy(this.camera.position)
        .add(lookDir);
      this.camera.lookAt(lookTarget);
    }
  }
}

export default CharacterController;
