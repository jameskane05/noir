import * as THREE from "three";
import { Howl } from "howler";
import BreathingSystem from "./wip/breathingSystem.js";

class CharacterController {
  constructor(
    character,
    camera,
    renderer,
    inputManager,
    sfxManager = null,
    sparkRenderer = null,
    idleHelper = null,
    initialRotation = null
  ) {
    this.character = character;
    this.camera = camera;
    this.renderer = renderer;
    this.inputManager = inputManager;
    this.sfxManager = sfxManager;
    this.sparkRenderer = sparkRenderer;
    this.idleHelper = idleHelper;

    // Camera rotation (use provided initial rotation or default to -180 degrees)
    const defaultYaw = THREE.MathUtils.degToRad(-180);
    this.yaw = initialRotation
      ? THREE.MathUtils.degToRad(initialRotation.y)
      : defaultYaw;
    this.pitch = initialRotation
      ? THREE.MathUtils.degToRad(initialRotation.x || 0)
      : 0;
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
    this.lookAtDisabledInput = false;
    this.inputDisabled = false;
    this.lookAtReturnToOriginalView = false;
    this.lookAtReturnDuration = 0;
    this.lookAtReturning = false;
    this.lookAtHolding = false;
    this.lookAtHoldTimer = 0;
    this.lookAtHoldDuration = 0;

    // Character move-to system
    this.isMovingTo = false;
    this.moveToStartPos = new THREE.Vector3();
    this.moveToTargetPos = new THREE.Vector3();
    this.moveToStartYaw = 0;
    this.moveToTargetYaw = 0;
    this.moveToStartPitch = 0;
    this.moveToTargetPitch = 0;
    this.moveToDuration = 0;
    this.moveToProgress = 0;
    this.moveToOnComplete = null;
    this.moveToInputControl = null;

    // Depth of Field system
    this.dofEnabled = true; // Can be controlled externally
    this.baseApertureSize = 0.01; // Base aperture from options menu
    this.baseFocalDistance = 6.0; // Base focal distance from options menu
    this.currentFocalDistance = this.baseFocalDistance;
    this.currentApertureSize = this.baseApertureSize;
    this.targetFocalDistance = this.baseFocalDistance;
    this.targetApertureSize = this.baseApertureSize;
    this.dofTransitioning = false;
    this.lookAtDofActive = false; // Track if we're in look-at DoF mode
    this.dofHoldTimer = 0; // Time to hold DoF after look-at completes
    this.dofHoldDuration = 2.0; // Hold DoF for 2 seconds
    this.dofTransitionStartProgress = 0.8; // Start DoF transition at 80% of look-at animation
    this.dofTransitionDuration = 2; // How long the DoF transition takes in seconds
    this.dofTransitionProgress = 0; // Current progress of DoF transition (0 to 1)
    this.returnTransitionDuration = null; // Override transition duration during return-to-original

    // FOV Zoom system (synced with DoF)
    this.baseFov = null; // Will be set from camera's initial FOV
    this.currentFov = null;
    this.targetFov = null;
    this.startFov = null; // Captured at start of each transition
    this.zoomTransitioning = false;
    this.zoomTransitionProgress = 0; // Separate progress for zoom
    this.zoomFactor = 1.5; // 15% zoom
    this.lookAtZoomActive = false;

    // Headbob state
    this.headbobTime = 0;
    this.headbobIntensity = 0;
    this.idleHeadbobTime = 0;
    this.headbobEnabled = true;

    // Idle glance system
    this.glanceEnabled = true; // Enable idle look-around behavior
    this.glanceState = null; // null, 'glancing', 'returning'
    this.glanceProgress = 0; // 0 to 1
    this.glanceDuration = 5.0; // Duration of one glance animation (set randomly per glance)
    this.glanceTimer = 0; // Time until next glance (0 = start immediately when idle)
    this.wasIdleAllowed = false; // Track previous idle state for edge detection
    this.glanceStartYaw = 0;
    this.glanceTargetYaw = 0;
    this.glanceStartPitch = 0;
    this.glanceTargetPitch = 0;
    this.glanceStartRoll = 0;
    this.glanceTargetRoll = 0;
    this.currentRoll = 0; // Current head tilt

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
    this.cameraHeight = 0.8; // Distance from capsule center to top (halfHeight + radius)
    this.cameraSmoothingFactor = 0.15;

    // Initialize FOV from camera
    this.baseFov = this.camera.fov;
    this.currentFov = this.baseFov;
    this.targetFov = this.baseFov;

    this.loadFootstepAudio();
  }

  /**
   * Set the idle helper reference (called after initialization)
   * @param {IdleHelper} idleHelper - The idle helper instance
   */
  setIdleHelper(idleHelper) {
    this.idleHelper = idleHelper;
  }

  /**
   * Set game manager and register event listeners
   * @param {GameManager} gameManager - The game manager instance
   */
  setGameManager(gameManager) {
    this.gameManager = gameManager;

    // Listen for camera:lookat events
    this.gameManager.on("camera:lookat", (data) => {
      // Check if control is enabled
      if (!this.gameManager.isControlEnabled()) return;

      const targetPos = new THREE.Vector3(
        data.position.x,
        data.position.y,
        data.position.z
      );
      const onComplete = data.restoreControl
        ? () => {
            this.inputDisabled = false;
            console.log(`Camera look-at complete (${data.colliderId})`);
          }
        : null;

      const enableZoom =
        data.enableZoom !== undefined ? data.enableZoom : false;
      const zoomOptions = data.zoomOptions || {};
      // If restoreControl is false, don't disable input (let moveTo or other system manage it)
      const disableInput = data.restoreControl !== false;
      const returnToOriginalView = data.returnToOriginalView || false;
      const returnDuration = data.returnDuration || data.duration;

      this.lookAt(
        targetPos,
        data.duration,
        onComplete,
        enableZoom,
        zoomOptions,
        disableInput,
        returnToOriginalView,
        returnDuration
      );
    });

    // Listen for character:moveto events
    this.gameManager.on("character:moveto", (data) => {
      // Check if control is enabled
      if (!this.gameManager.isControlEnabled()) return;

      const targetPos = new THREE.Vector3(
        data.position.x,
        data.position.y,
        data.position.z
      );

      // Parse rotation if provided
      let targetRotation = null;
      if (data.rotation) {
        targetRotation = {
          yaw: data.rotation.yaw,
          pitch: data.rotation.pitch || 0,
        };
      }

      // Parse input control settings (what to disable: movement, rotation, or both)
      const inputControl = data.inputControl || {
        disableMovement: true,
        disableRotation: true,
      };

      const onComplete = data.onComplete || null;

      this.moveTo(
        targetPos,
        targetRotation,
        data.duration,
        onComplete,
        inputControl
      );
    });

    console.log("CharacterController: Event listeners registered");
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
   * @param {boolean} enableZoom - Whether to enable zoom/DoF effects (default: false)
   * @param {Object} zoomOptions - Zoom/DoF configuration options
   * @param {boolean} disableInput - Whether to disable input during lookAt (default: true)
   * @param {boolean} returnToOriginalView - If true, return to original view before restoring control (default: false)
   * @param {number} returnDuration - Duration of the return animation in seconds (default: same as duration)
   */
  lookAt(
    targetPosition,
    duration = 1.0,
    onComplete = null,
    enableZoom = false,
    zoomOptions = {},
    disableInput = true,
    returnToOriginalView = false,
    returnDuration = null
  ) {
    this.isLookingAt = true;
    this.lookAtTarget = targetPosition.clone();
    this.lookAtDuration = duration;
    this.lookAtProgress = 0;
    this.lookAtOnComplete = onComplete;
    this.lookAtDisabledInput = disableInput; // Store whether we disabled input
    this.lookAtReturnToOriginalView = returnToOriginalView;
    this.lookAtReturnDuration = returnDuration || duration;
    this.lookAtReturning = false;
    this.lookAtHolding = false;
    this.lookAtHoldTimer = 0;

    // Parse zoom options with defaults
    const {
      zoomFactor = 1.5, // 1.5x zoom (FOV reduction)
      minAperture = 0.15, // Minimum aperture (less blur at distance)
      maxAperture = 0.35, // Maximum aperture (more blur close-up)
      transitionStart = 0.8, // When to start DoF transition (0-1)
      transitionDuration = 2.0, // How long the DoF transition takes
      holdDuration = 2.0, // How long to hold DoF after look-at completes (or before return if returnToOriginal)
    } = zoomOptions;

    // If returning to original view, use holdDuration to pause before returning
    if (returnToOriginalView && enableZoom) {
      this.lookAtHoldDuration = holdDuration;
    } else {
      this.lookAtHoldDuration = 0;
    }

    // Store zoom config for this look-at
    this.currentZoomConfig = {
      zoomFactor,
      minAperture,
      maxAperture,
      transitionStart,
      transitionDuration,
      holdDuration,
    };

    // Only disable input if requested (e.g., if not being managed by moveTo)
    if (disableInput) {
      this.inputDisabled = true;
      this.inputManager.disable();
    }

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

    // Ensure we take the shorter rotation path
    // If dot product is negative, negate the target quaternion
    if (this.lookAtStartQuat.dot(this.lookAtEndQuat) < 0) {
      this.lookAtEndQuat.x *= -1;
      this.lookAtEndQuat.y *= -1;
      this.lookAtEndQuat.z *= -1;
      this.lookAtEndQuat.w *= -1;
    }

    // Calculate DoF values based on distance to target (but don't start transition yet)
    if (enableZoom && this.sparkRenderer && this.dofEnabled) {
      const distance = this.camera.position.distanceTo(targetPosition);

      // Calculate target DoF settings
      const targetFocalDistance = distance;

      // Calculate aperture size for dramatic DoF effect using configured values
      // Larger aperture = more blur, smaller = less blur
      const { minAperture, maxAperture } = this.currentZoomConfig;

      // Scale aperture based on distance (closer = more DoF, further = less)
      // Clamp distance between 2 and 20 meters for sensible scaling
      const normalizedDistance = Math.max(2, Math.min(20, distance));
      const apertureScale = 1 - (normalizedDistance - 2) / 18; // 1.0 at 2m, 0.0 at 20m
      const targetApertureSize =
        minAperture + (maxAperture - minAperture) * apertureScale;

      // Store target values but don't start transition yet
      // Transition will start based on look-at progress
      this.targetFocalDistance = targetFocalDistance;
      this.targetApertureSize = targetApertureSize;
      this.lookAtDofActive = true;
      this.dofHoldTimer = 0; // Reset hold timer
      this.dofTransitionProgress = 0; // Reset progress

      console.log(
        `CharacterController: DoF ready - Distance: ${distance.toFixed(
          2
        )}m, Aperture: ${targetApertureSize.toFixed(
          3
        )} (min: ${minAperture.toFixed(3)}, max: ${maxAperture.toFixed(
          3
        )}) (will transition at ${(
          this.currentZoomConfig.transitionStart * 100
        ).toFixed(0)}% over ${this.currentZoomConfig.transitionDuration}s)`
      );
    }

    // Set up zoom transition (synced with DoF)
    if (enableZoom) {
      this.startFov = this.currentFov; // Capture current FOV as start
      this.targetFov = this.baseFov / this.currentZoomConfig.zoomFactor; // Zoom in by reducing FOV
      this.lookAtZoomActive = true;
      this.zoomTransitionProgress = 0; // Reset zoom progress

      console.log(
        `CharacterController: Looking at target over ${duration}s (zoom: ${this.baseFov.toFixed(
          1
        )}° → ${this.targetFov.toFixed(
          1
        )}° [${this.currentZoomConfig.zoomFactor.toFixed(2)}x])`
      );
    } else {
      console.log(
        `CharacterController: Looking at target over ${duration}s (no zoom)`
      );
    }
  }

  /**
   * Cancel the look-at and restore player control
   * @param {boolean} updateYawPitch - If true, update yaw/pitch to match current camera orientation
   */
  cancelLookAt(updateYawPitch = true) {
    if (!this.isLookingAt) return;

    this.isLookingAt = false;

    // Re-enable input manager only if we disabled it
    if (this.lookAtDisabledInput) {
      this.inputDisabled = false;
      this.inputManager.enable();
    }

    // Reset glance state
    this.glanceState = null;
    this.glanceTimer = 0;
    this.wasIdleAllowed = false;
    this.currentRoll = 0; // Reset head tilt

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

    // Return DoF to base if it was active
    if (this.sparkRenderer && this.lookAtDofActive) {
      this.targetFocalDistance = this.baseFocalDistance;
      this.targetApertureSize = this.baseApertureSize;
      this.lookAtDofActive = false;
      this.dofTransitioning = true;
      this.dofTransitionProgress = 0; // Reset for return transition
      console.log(`CharacterController: Returning DoF to base (cancelled)`);
    }

    // Return zoom to base if it was active
    if (this.lookAtZoomActive) {
      this.startFov = this.currentFov; // Capture current FOV as start
      this.targetFov = this.baseFov;
      this.lookAtZoomActive = false;
      this.zoomTransitioning = true;
      this.zoomTransitionProgress = 0; // Reset for return transition
      console.log(`CharacterController: Returning zoom to base (cancelled)`);
    }

    console.log("CharacterController: Look-at cancelled, control restored");
  }

  /**
   * Start character move-to sequence
   * Smoothly moves character to target position and rotation
   * @param {THREE.Vector3} targetPosition - World position to move to
   * @param {Object} targetRotation - Target rotation {yaw: radians, pitch: radians} (optional)
   * @param {number} duration - Time to complete the move in seconds
   * @param {Function} onComplete - Optional callback when complete
   * @param {Object} inputControl - Control what input to disable {disableMovement: true/false, disableRotation: true/false}
   */
  moveTo(
    targetPosition,
    targetRotation = null,
    duration = 2.0,
    onComplete = null,
    inputControl = { disableMovement: true, disableRotation: true }
  ) {
    this.isMovingTo = true;
    this.moveToDuration = duration;
    this.moveToProgress = 0;
    this.moveToOnComplete = onComplete;
    this.moveToInputControl = inputControl; // Store for restoration later

    // Disable input based on inputControl settings
    // Only set inputDisabled if BOTH movement and rotation are disabled
    if (inputControl.disableMovement && inputControl.disableRotation) {
      // Disable everything
      this.inputDisabled = true;
      this.inputManager.disable();
    } else if (inputControl.disableMovement) {
      // Disable only movement, keep rotation
      // Don't set inputDisabled - let inputManager handle selective blocking
      this.inputManager.disableMovement();
    } else if (inputControl.disableRotation) {
      // Disable only rotation, keep movement
      // Don't set inputDisabled - let inputManager handle selective blocking
      this.inputManager.disableRotation();
    }
    // If neither is disabled, don't change anything

    // Store current position (get from physics body)
    const currentPos = this.character.translation();
    this.moveToStartPos.set(currentPos.x, currentPos.y, currentPos.z);
    this.moveToTargetPos.copy(targetPosition);

    // Store current rotation
    this.moveToStartYaw = this.yaw;
    this.moveToStartPitch = this.pitch;

    // Set target rotation (if provided, otherwise keep current)
    if (targetRotation) {
      this.moveToTargetYaw =
        targetRotation.yaw !== undefined ? targetRotation.yaw : this.yaw;
      this.moveToTargetPitch =
        targetRotation.pitch !== undefined ? targetRotation.pitch : this.pitch;
    } else {
      this.moveToTargetYaw = this.yaw;
      this.moveToTargetPitch = this.pitch;
    }

    console.log(
      `CharacterController: Moving to position (${targetPosition.x.toFixed(
        2
      )}, ${targetPosition.y.toFixed(2)}, ${targetPosition.z.toFixed(
        2
      )}) over ${duration}s`
    );
  }

  /**
   * Cancel the move-to and restore player control
   */
  cancelMoveTo() {
    if (!this.isMovingTo) return;

    this.isMovingTo = false;
    this.inputDisabled = false;

    // Re-enable input manager
    this.inputManager.enable();

    console.log("CharacterController: Move-to cancelled, control restored");
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

  /**
   * Disable all character input (movement + rotation)
   * Convenience method for other systems (dialogs, cutscenes, etc.)
   */
  disableInput() {
    this.inputDisabled = true;
    this.inputManager.disable();
  }

  /**
   * Enable all character input (movement + rotation)
   * Convenience method for other systems
   */
  enableInput() {
    this.inputDisabled = false;
    this.inputManager.enable();
  }

  /**
   * Disable only movement input (rotation still works)
   */
  disableMovement() {
    this.inputManager.disableMovement();
  }

  /**
   * Enable movement input
   */
  enableMovement() {
    this.inputManager.enableMovement();
  }

  /**
   * Disable only rotation input (movement still works)
   */
  disableRotation() {
    this.inputManager.disableRotation();
  }

  /**
   * Enable rotation input
   */
  enableRotation() {
    this.inputManager.enableRotation();
  }

  /**
   * Debug helper: Log current player position and rotation
   * Can be called from browser console: window.characterController.logPosition()
   */
  logPosition() {
    const pos = this.character.translation();
    const yawDeg = THREE.MathUtils.radToDeg(this.yaw);
    const pitchDeg = THREE.MathUtils.radToDeg(this.pitch);

    console.log("=== Player Position & Rotation ===");
    console.log(
      `Position: { x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(
        2
      )}, z: ${pos.z.toFixed(2)} }`
    );
    console.log(
      `Rotation (radians): { yaw: ${this.yaw.toFixed(
        4
      )}, pitch: ${this.pitch.toFixed(4)} }`
    );
    console.log(
      `Rotation (degrees): { yaw: ${yawDeg.toFixed(
        2
      )}°, pitch: ${pitchDeg.toFixed(2)}° }`
    );
    console.log("\nCopy-paste for colliderData.js:");
    console.log(
      `position: { x: ${pos.x.toFixed(1)}, y: ${pos.y.toFixed(
        1
      )}, z: ${pos.z.toFixed(1)} },`
    );
    console.log(
      `rotation: { yaw: ${this.yaw.toFixed(4)}, pitch: ${this.pitch.toFixed(
        4
      )} },`
    );

    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { yaw: this.yaw, pitch: this.pitch },
    };
  }

  /**
   * Set DoF enabled state (called by options menu)
   * @param {boolean} enabled - Whether DoF is enabled
   */
  setDofEnabled(enabled) {
    this.dofEnabled = enabled;
    console.log(`CharacterController: DoF ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Update depth of field parameters
   * @param {number} dt - Delta time
   */
  updateDepthOfField(dt) {
    if (!this.sparkRenderer || !this.dofEnabled) return;

    // Handle DoF hold timer
    if (this.dofHoldTimer > 0) {
      this.dofHoldTimer -= dt;
      if (this.dofHoldTimer <= 0) {
        // Hold period over, start transitioning back to base
        this.dofHoldTimer = 0;
        this.targetFocalDistance = this.baseFocalDistance;
        this.targetApertureSize = this.baseApertureSize;
        this.lookAtDofActive = false;
        this.dofTransitioning = true;
        this.dofTransitionProgress = 0; // Reset for return transition

        // Also return zoom to base
        this.startFov = this.currentFov; // Capture current FOV as start
        this.targetFov = this.baseFov;
        this.lookAtZoomActive = false;
        this.zoomTransitioning = true;
        this.zoomTransitionProgress = 0; // Reset for return transition

        console.log(
          `CharacterController: Hold complete, returning DoF and zoom to base - Aperture: ${this.baseApertureSize.toFixed(
            3
          )}`
        );
      }
    }

    if (!this.dofTransitioning) return;

    // Update transition progress based on configured duration
    // Use returnTransitionDuration during return-to-original if set
    const transitionDuration =
      this.returnTransitionDuration ||
      this.currentZoomConfig?.transitionDuration ||
      this.dofTransitionDuration;
    this.dofTransitionProgress += dt / transitionDuration;
    const t = Math.min(1.0, this.dofTransitionProgress);

    // Use ease-out for smooth transition
    const eased = 1 - Math.pow(1 - t, 3);

    // Calculate start values (where we're transitioning from)
    const startFocalDistance = this.lookAtDofActive
      ? this.baseFocalDistance
      : this.currentFocalDistance;
    const startApertureSize = this.lookAtDofActive
      ? this.baseApertureSize
      : this.currentApertureSize;

    // Interpolate values
    this.currentFocalDistance =
      startFocalDistance +
      (this.targetFocalDistance - startFocalDistance) * eased;
    this.currentApertureSize =
      startApertureSize + (this.targetApertureSize - startApertureSize) * eased;

    // Update spark renderer
    const apertureAngle =
      2 *
      Math.atan((0.5 * this.currentApertureSize) / this.currentFocalDistance);
    this.sparkRenderer.apertureAngle = apertureAngle;
    this.sparkRenderer.focalDistance = this.currentFocalDistance;

    // Check if transition is complete
    if (t >= 1.0) {
      this.currentFocalDistance = this.targetFocalDistance;
      this.currentApertureSize = this.targetApertureSize;
      this.dofTransitioning = false;
      this.dofTransitionProgress = 0;
    }
  }

  /**
   * Update FOV zoom (synced with DoF transitions)
   * @param {number} dt - Delta time
   */
  updateZoom(dt) {
    if (!this.zoomTransitioning) return;

    // Update zoom transition progress (using configured duration, same as DoF)
    // Use returnTransitionDuration during return-to-original if set
    const transitionDuration =
      this.returnTransitionDuration ||
      this.currentZoomConfig?.transitionDuration ||
      this.dofTransitionDuration;
    this.zoomTransitionProgress += dt / transitionDuration;
    const t = Math.min(1.0, this.zoomTransitionProgress);

    // Use ease-out for smooth transition (matching DoF)
    const eased = 1 - Math.pow(1 - t, 3);

    // Interpolate FOV from captured start to target
    this.currentFov = this.startFov + (this.targetFov - this.startFov) * eased;

    // Update camera FOV
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    // Check if transition is complete
    if (t >= 1.0) {
      this.currentFov = this.targetFov;
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
      this.zoomTransitioning = false;
      this.zoomTransitionProgress = 0;
    }
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
   * Start a glance animation (look left/right and slightly up/down with head tilt)
   */
  startGlance() {
    this.glanceState = "glancing";
    this.glanceProgress = 0;
    this.glanceStartYaw = this.yaw;
    this.glanceStartPitch = this.pitch;
    this.glanceStartRoll = this.currentRoll;

    // Random duration for this glance (3-7 seconds)
    this.glanceDuration = 3.0 + Math.random() * 4.0;

    // Random horizontal direction and angle
    const horizontalDir = Math.random() > 0.5 ? 1 : -1;
    const glanceAngle = (Math.random() * 0.3 + 0.2) * horizontalDir; // 0.2 to 0.5 radians (~11 to 29 degrees)
    this.glanceTargetYaw = this.yaw + glanceAngle;

    // Random vertical angle (slight up or down)
    const verticalAngle = Math.random() * 0.15 - 0.075; // -0.075 to 0.075 radians (~-4 to 4 degrees)
    this.glanceTargetPitch = this.pitch + verticalAngle;

    // Subtle head tilt (roll) that follows the horizontal direction
    // Tilt slightly in the direction of the glance for natural head movement
    const rollAngle = (Math.random() * 0.3 + 0.04) * horizontalDir; // 0.04 to 0.12 radians (~2 to 7 degrees)
    this.glanceTargetRoll = rollAngle;

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
    // Skip if glance system is disabled or no idle helper
    if (!this.glanceEnabled || !this.idleHelper) return;

    // Use IdleHelper to check if idle behaviors should be allowed
    const shouldAllowIdle = this.idleHelper.shouldAllowIdleBehavior();

    // Detect when idle state becomes allowed (edge trigger)
    if (shouldAllowIdle && !this.wasIdleAllowed) {
      // Just became idle - start glance immediately
      this.glanceTimer = 0;
    }

    // Update previous idle state
    this.wasIdleAllowed = shouldAllowIdle;

    // Reset and stop glance if not allowed or if moving
    if (!shouldAllowIdle || isMoving || this.inputDisabled) {
      this.glanceState = null;
      this.glanceTimer = 0; // Reset timer for next idle period
      this.currentRoll = 0; // Reset head tilt
      return;
    }

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

        // Interpolate yaw, pitch, and roll
        this.targetYaw =
          this.glanceStartYaw +
          (this.glanceTargetYaw - this.glanceStartYaw) * easedT;
        this.targetPitch =
          this.glanceStartPitch +
          (this.glanceTargetPitch - this.glanceStartPitch) * easedT;
        this.currentRoll =
          this.glanceStartRoll +
          (this.glanceTargetRoll - this.glanceStartRoll) * easedT;
      }
    } else if (this.glanceState === "returning") {
      // Return to start position at the same speed
      this.glanceProgress += dt / this.glanceDuration;

      if (this.glanceProgress >= 1.0) {
        // Return complete - reset state
        this.glanceProgress = 1.0;
        this.glanceState = null;
        this.glanceTimer = 5.0 + Math.random() * 3.0; // Next glance in 5-8 seconds

        // Ensure we're back at start
        this.targetYaw = this.glanceStartYaw;
        this.targetPitch = this.glanceStartPitch;
        this.currentRoll = 0; // Return to no tilt
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
        this.currentRoll =
          this.glanceTargetRoll + (0 - this.glanceTargetRoll) * easedT; // Return to 0 tilt
      }
    } else {
      // Count down to next glance (only when idle is allowed)
      this.glanceTimer -= dt;

      if (this.glanceTimer <= 0) {
        this.startGlance();
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
    // Update depth of field (always active during transitions)
    this.updateDepthOfField(dt);

    // Update zoom (synced with DoF, always active during transitions)
    this.updateZoom(dt);

    // Handle camera look-at sequence
    if (this.isLookingAt) {
      // Handle holding phase (pause before returning to original)
      if (this.lookAtHolding) {
        this.lookAtHoldTimer += dt;

        if (this.lookAtHoldTimer >= this.lookAtHoldDuration) {
          // Hold complete, start return phase
          this.lookAtHolding = false;
          this.lookAtReturning = true;
          this.lookAtProgress = 0;
          console.log(
            `CharacterController: Hold complete, starting return to original view (${this.lookAtReturnDuration}s)`
          );

          // Start DoF/zoom reset immediately (so they return to normal as camera returns)
          if (this.sparkRenderer && this.lookAtDofActive) {
            // Manually trigger the reset transition
            this.dofHoldTimer = 0;
            this.targetFocalDistance = this.baseFocalDistance;
            this.targetApertureSize = this.baseApertureSize;
            this.lookAtDofActive = false;
            this.dofTransitioning = true;
            this.dofTransitionProgress = 0; // Reset for return transition

            // Also reset zoom
            this.startFov = this.currentFov; // Capture current FOV for smooth transition
            this.targetFov = this.baseFov;
            this.zoomTransitioning = true;
            this.zoomTransitionProgress = 0; // Reset zoom progress

            // Override transition duration to match return duration
            this.returnTransitionDuration = this.lookAtReturnDuration;

            console.log(
              `CharacterController: Starting DoF/zoom reset during return (${this.lookAtReturnDuration}s)`
            );
          }

          // Swap start and end quaternions for return journey
          const temp = this.lookAtStartQuat.clone();
          this.lookAtStartQuat.copy(this.lookAtEndQuat);
          this.lookAtEndQuat.copy(temp);
        }
        // Stay at target orientation while holding (no need to update quaternion)
        return; // Skip rest of lookat update during hold
      }

      // Use appropriate duration based on current phase
      const currentDuration = this.lookAtReturning
        ? this.lookAtReturnDuration
        : this.lookAtDuration;
      this.lookAtProgress += dt / currentDuration;

      // Start DoF and zoom transitions when we reach the configured threshold (only during initial lookat, not return)
      if (!this.lookAtReturning) {
        const transitionStart =
          this.currentZoomConfig?.transitionStart ||
          this.dofTransitionStartProgress;
        if (
          this.lookAtDofActive &&
          !this.dofTransitioning &&
          this.lookAtProgress >= transitionStart
        ) {
          this.dofTransitioning = true;
          this.startFov = this.currentFov; // Capture current FOV as start for zoom
          this.zoomTransitioning = true;
          console.log(
            `CharacterController: Starting DoF and zoom transitions at ${(
              this.lookAtProgress * 100
            ).toFixed(0)}% (threshold: ${(transitionStart * 100).toFixed(0)}%)`
          );
        }
      }

      if (this.lookAtProgress >= 1.0) {
        this.lookAtProgress = 1.0;

        // Check if we need to return to original view
        if (this.lookAtReturnToOriginalView && !this.lookAtReturning) {
          // Check if we should hold before returning
          if (this.lookAtHoldDuration > 0) {
            // Start holding phase
            this.lookAtHolding = true;
            this.lookAtHoldTimer = 0;
            console.log(
              `CharacterController: Holding at target for ${this.lookAtHoldDuration}s before returning`
            );
          } else {
            // No hold, start return immediately
            this.lookAtReturning = true;
            this.lookAtProgress = 0;
            console.log(
              `CharacterController: Starting return to original view (${this.lookAtReturnDuration}s)`
            );

            // Start DoF/zoom reset immediately (so they return to normal as camera returns)
            if (this.sparkRenderer && this.lookAtDofActive) {
              // Manually trigger the reset transition
              this.dofHoldTimer = 0;
              this.targetFocalDistance = this.baseFocalDistance;
              this.targetApertureSize = this.baseApertureSize;
              this.lookAtDofActive = false;
              this.dofTransitioning = true;
              this.dofTransitionProgress = 0; // Reset for return transition

              // Also reset zoom
              this.startFov = this.currentFov; // Capture current FOV for smooth transition
              this.targetFov = this.baseFov;
              this.zoomTransitioning = true;
              this.zoomTransitionProgress = 0; // Reset zoom progress

              // Override transition duration to match return duration
              this.returnTransitionDuration = this.lookAtReturnDuration;

              console.log(
                `CharacterController: Starting DoF/zoom reset during return (${this.lookAtReturnDuration}s)`
              );
            }

            // Swap start and end quaternions for return journey
            const temp = this.lookAtStartQuat.clone();
            this.lookAtStartQuat.copy(this.lookAtEndQuat);
            this.lookAtEndQuat.copy(temp);
          }
        } else {
          // Look-at complete (or return complete)
          this.isLookingAt = false;
          this.lookAtReturning = false;
          this.lookAtHolding = false;
          this.returnTransitionDuration = null; // Clear return transition override

          // Re-enable input manager only if we disabled it
          if (this.lookAtDisabledInput) {
            this.inputManager.enable();
          }

          // Reset glance state
          this.glanceState = null;
          this.glanceTimer = 0;
          this.wasIdleAllowed = false;
          this.currentRoll = 0; // Reset head tilt

          // Start DoF/zoom reset timer (only if NOT returning to original view)
          // If returnToOriginalView was true, the reset already happened during the return phase
          if (
            this.sparkRenderer &&
            this.lookAtDofActive &&
            !this.lookAtReturnToOriginalView
          ) {
            const resetDuration =
              this.currentZoomConfig?.holdDuration || this.dofHoldDuration;
            this.dofHoldTimer = resetDuration;
            console.log(
              `CharacterController: Holding DoF for ${resetDuration}s before resetting`
            );
          }

          // Call completion callback if provided
          if (this.lookAtOnComplete) {
            this.lookAtOnComplete();
            this.lookAtOnComplete = null;
          }
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

      // Update yaw/pitch for smooth handoff to normal control
      const euler = new THREE.Euler().setFromQuaternion(currentQuat, "YXZ");
      this.yaw = euler.y;
      this.pitch = euler.x;
      this.targetYaw = this.yaw;
      this.targetPitch = this.pitch;
    }

    // Handle character move-to sequence
    if (this.isMovingTo) {
      this.moveToProgress += dt / this.moveToDuration;

      if (this.moveToProgress >= 1.0) {
        // Move complete
        this.moveToProgress = 1.0;
        this.isMovingTo = false;

        // Set final position and rotation
        this.character.setTranslation(
          {
            x: this.moveToTargetPos.x,
            y: this.moveToTargetPos.y,
            z: this.moveToTargetPos.z,
          },
          true
        );
        this.yaw = this.moveToTargetYaw;
        this.pitch = this.moveToTargetPitch;
        this.targetYaw = this.yaw;
        this.targetPitch = this.pitch;

        // Input control is NOT automatically restored
        // Caller is responsible for re-enabling via characterController.enableMovement() / enableRotation() / enableInput()
        console.log(
          "CharacterController: Move-to complete (input state unchanged)"
        );

        // Call completion callback if provided
        if (this.moveToOnComplete) {
          this.moveToOnComplete();
          this.moveToOnComplete = null;
        }

        console.log("CharacterController: Move-to complete");
      } else {
        // Interpolate position and rotation
        const t = Math.min(this.moveToProgress, 1.0);
        // Apply ease-in-out for smooth motion
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        // Lerp position
        const currentPos = new THREE.Vector3();
        currentPos.lerpVectors(
          this.moveToStartPos,
          this.moveToTargetPos,
          easedT
        );

        // Update physics body position
        this.character.setTranslation(
          { x: currentPos.x, y: currentPos.y, z: currentPos.z },
          true
        );

        // Interpolate rotation
        this.yaw =
          this.moveToStartYaw +
          (this.moveToTargetYaw - this.moveToStartYaw) * easedT;
        this.pitch =
          this.moveToStartPitch +
          (this.moveToTargetPitch - this.moveToStartPitch) * easedT;
        this.targetYaw = this.yaw;
        this.targetPitch = this.pitch;
      }
    }

    if (!this.isLookingAt) {
      // Normal camera control
      // Get camera input from input manager
      const cameraInput = this.inputManager.getCameraInput(dt);

      // Check if there's any manual camera input and cancel glance if so
      const hasManualInput =
        Math.abs(cameraInput.x) > 0.0001 || Math.abs(cameraInput.y) > 0.0001;
      if (hasManualInput && this.glanceState !== null) {
        // Cancel the glance and reset to current position
        this.glanceState = null;
        this.glanceTimer = 5.0 + Math.random() * 3.0; // Next glance in 5-8 seconds
        this.currentRoll = 0; // Reset head tilt immediately
        console.log(
          "CharacterController: Manual camera input detected, cancelling glance"
        );
      }

      // Apply camera rotation differently based on input source
      if (cameraInput.hasGamepad) {
        // Gamepad: Apply directly to yaw/pitch for immediate response
        // (no target/smoothing to avoid "chasing" behavior)
        this.yaw -= cameraInput.x;
        this.pitch -= cameraInput.y;
        this.pitch = Math.max(
          -Math.PI / 2 + 0.01,
          Math.min(Math.PI / 2 - 0.01, this.pitch)
        );

        // Keep targets in sync
        this.targetYaw = this.yaw;
        this.targetPitch = this.pitch;
      } else if (hasManualInput) {
        // Mouse: Apply to targets with smoothing for precise control (only if there's input)
        this.targetYaw -= cameraInput.x;
        this.targetPitch -= cameraInput.y;
        this.targetPitch = Math.max(
          -Math.PI / 2 + 0.01,
          Math.min(Math.PI / 2 - 0.01, this.targetPitch)
        );

        // Smooth camera rotation to reduce jitter
        this.yaw += (this.targetYaw - this.yaw) * this.cameraSmoothingFactor;
        this.pitch +=
          (this.targetPitch - this.pitch) * this.cameraSmoothingFactor;
      } else {
        // No manual input, still apply smoothing if there's a difference
        this.yaw += (this.targetYaw - this.yaw) * this.cameraSmoothingFactor;
        this.pitch +=
          (this.targetPitch - this.pitch) * this.cameraSmoothingFactor;
      }

      // Reset frame input after processing
      this.inputManager.resetFrameInput();
    }

    // Input -> desired velocity in XZ plane (disabled during look-at)
    let isMoving = false;
    let isSprinting = false;
    if (!this.inputDisabled) {
      const { forward, right } = this.getForwardRightVectors();
      const movementInput = this.inputManager.getMovementInput();
      isSprinting = this.inputManager.isSprinting();
      const moveSpeed = isSprinting
        ? this.baseSpeed * this.sprintMultiplier
        : this.baseSpeed;
      const desired = new THREE.Vector3();

      // Apply movement input (y is forward/back, x is left/right)
      desired.add(forward.clone().multiplyScalar(movementInput.y));
      desired.add(right.clone().multiplyScalar(movementInput.x));

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
    const movementIntensity = isSprinting ? 1.0 : 0.5;
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
        const playbackRate = isSprinting ? 1.5 : 1.0;
        this.footstepSound.rate(playbackRate);
      }
    }

    // Calculate headbob offset (movement + idle)
    const movementHeadbob = this.headbobEnabled
      ? this.calculateHeadbob(isSprinting)
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
        new THREE.Euler(this.pitch, this.yaw, this.currentRoll, "YXZ")
      );
      const lookTarget = new THREE.Vector3()
        .copy(this.camera.position)
        .add(lookDir);
      this.camera.lookAt(lookTarget);
    }
  }
}

export default CharacterController;
