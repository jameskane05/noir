export class IdleHelper {
  constructor(
    dialogManager = null,
    cameraAnimationSystem = null,
    dialogChoiceUI = null,
    gameManager = null
  ) {
    this.helperElement = null;
    this.lastMovementTime = null; // Don't start tracking until controls are enabled
    this.idleThreshold = 5000; // 5 seconds
    this.cycleInterval = 20000; // 20 seconds
    this.isAnimating = false;
    this.currentAnimation = null; // Store the Web Animation instance
    this.cycleTimeout = null;
    this.dialogManager = dialogManager;
    this.cameraAnimationSystem = cameraAnimationSystem;
    this.dialogChoiceUI = dialogChoiceUI;
    this.gameManager = gameManager;
    this.wasControlEnabled = false; // Track previous control state

    this.init();
    this.setupMovementListeners();
    this.startIdleCheck();
  }

  init() {
    // Create the helper image element
    this.helperElement = document.createElement("div");
    this.helperElement.id = "idle-helper";
    this.helperElement.style.position = "fixed";
    this.helperElement.style.bottom = "60px";
    this.helperElement.style.left = "50%";
    this.helperElement.style.transform = "translateX(-50%)";
    this.helperElement.style.opacity = "0";
    this.helperElement.style.pointerEvents = "none";
    this.helperElement.style.zIndex = "1000";

    // Create the image
    const img = document.createElement("img");
    img.src = "/images/wasdmouse.png";
    img.style.width = "300px";
    img.style.height = "auto";
    img.style.display = "block";

    this.helperElement.appendChild(img);
    document.body.appendChild(this.helperElement);
  }

  setupMovementListeners() {
    // Listen for WASD and arrow keys
    const movementKeys = [
      "w",
      "a",
      "s",
      "d",
      "W",
      "A",
      "S",
      "D",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ];

    window.addEventListener("keydown", (e) => {
      if (movementKeys.includes(e.key)) {
        this.onMovement();
      }
    });

    // Count mouse movement as activity when pointer is locked (in gameplay)
    let lastMouseMoveTime = 0;
    const mouseMoveThrottle = 100; // Throttle to once per 100ms

    window.addEventListener("mousemove", () => {
      // Only reset idle timer if pointer is locked (actively playing)
      if (document.pointerLockElement) {
        const now = Date.now();
        if (now - lastMouseMoveTime >= mouseMoveThrottle) {
          lastMouseMoveTime = now;
          this.onMovement();
        }
      }
    });
  }

  onMovement() {
    // Only track movement if controls are enabled
    const isControlEnabled =
      this.gameManager && this.gameManager.isControlEnabled();

    if (!isControlEnabled) {
      return;
    }

    this.lastMovementTime = Date.now();

    // If currently animating, smoothly fade out from current position
    if (this.isAnimating) {
      this.interruptWithFadeOut();
    }
  }

  /**
   * Check if idle behaviors should be allowed (glances, etc.)
   * @returns {boolean} True if player is idle and no blocking conditions are active
   */
  shouldAllowIdleBehavior() {
    // Check if controls are enabled
    const isControlEnabled =
      this.gameManager && this.gameManager.isControlEnabled();

    if (!isControlEnabled || this.lastMovementTime === null) {
      return false;
    }

    // Check time since last movement
    const timeSinceLastMovement = Date.now() - this.lastMovementTime;
    if (timeSinceLastMovement < this.idleThreshold) {
      return false;
    }

    // Check blocking conditions
    const isDialogPlaying = this.dialogManager && this.dialogManager.isPlaying;
    const hasPendingDialog =
      this.dialogManager &&
      this.dialogManager.pendingDialogs &&
      this.dialogManager.pendingDialogs.size > 0;
    const isCameraAnimating =
      this.cameraAnimationSystem && this.cameraAnimationSystem.isPlaying;
    const isChoiceUIOpen = this.dialogChoiceUI && this.dialogChoiceUI.isVisible;

    // Return true only if no blocking conditions are active
    return (
      !isDialogPlaying &&
      !hasPendingDialog &&
      !isCameraAnimating &&
      !isChoiceUIOpen
    );
  }

  interruptWithFadeOut() {
    // Cancel the current animation
    if (this.currentAnimation) {
      this.currentAnimation.cancel();
      this.currentAnimation = null;
    }

    // Get current opacity (from computed style for accuracy)
    const computedStyle = window.getComputedStyle(this.helperElement);
    const startOpacity = parseFloat(computedStyle.opacity) || 0;

    if (startOpacity === 0) {
      this.isAnimating = false;
      return;
    }

    const fadeOutDuration = 300; // 0.3 seconds

    // Use Web Animations API for hardware-accelerated animation
    this.currentAnimation = this.helperElement.animate(
      [{ opacity: startOpacity }, { opacity: 0 }],
      {
        duration: fadeOutDuration,
        easing: "ease-in",
        fill: "forwards",
      }
    );

    this.currentAnimation.onfinish = () => {
      this.isAnimating = false;
      this.currentAnimation = null;
    };
  }

  startIdleCheck() {
    // Check every second if user is idle
    setInterval(() => {
      // Check if character controller is enabled
      const isControlEnabled =
        this.gameManager && this.gameManager.isControlEnabled();

      // If controls just got enabled, reset the idle timer
      if (isControlEnabled && !this.wasControlEnabled) {
        this.lastMovementTime = Date.now();
      }

      // If controls got disabled, hide any active animation and stop tracking
      if (!isControlEnabled && this.wasControlEnabled) {
        if (this.isAnimating) {
          this.stopAnimation();
          this.helperElement.style.opacity = "0";
        }
        // Don't reset lastMovementTime here - it will be reset when controls are re-enabled
      }

      // Update the previous control state
      this.wasControlEnabled = isControlEnabled;

      // Don't check idle state if controls haven't been enabled yet
      if (!isControlEnabled || this.lastMovementTime === null) {
        return;
      }

      const timeSinceLastMovement = Date.now() - this.lastMovementTime;

      // Don't show helper if dialog is playing (isPlaying is a property, not a method)
      const isDialogPlaying =
        this.dialogManager && this.dialogManager.isPlaying;

      // Don't show helper if there are pending delayed dialogs
      const hasPendingDialog =
        this.dialogManager &&
        this.dialogManager.pendingDialogs &&
        this.dialogManager.pendingDialogs.size > 0;

      // Don't show helper if camera animation is playing
      const isCameraAnimating =
        this.cameraAnimationSystem && this.cameraAnimationSystem.isPlaying;

      // Don't show helper if dialog choice UI is open
      const isChoiceUIOpen =
        this.dialogChoiceUI && this.dialogChoiceUI.isVisible;

      if (
        timeSinceLastMovement >= this.idleThreshold &&
        !this.isAnimating &&
        !isDialogPlaying &&
        !hasPendingDialog &&
        !isCameraAnimating &&
        !isChoiceUIOpen
      ) {
        this.startAnimation();
      }

      // Hide helper if dialog starts playing, has pending dialog, camera animation starts, or choice UI opens while it's showing
      if (
        (isDialogPlaying ||
          hasPendingDialog ||
          isCameraAnimating ||
          isChoiceUIOpen) &&
        this.isAnimating
      ) {
        this.stopAnimation();
        this.helperElement.style.opacity = "0";
      }
    }, 1000);
  }

  startAnimation() {
    this.isAnimating = true;

    // Animation timings
    const fadeInDuration = 1500; // 1.5s fade in
    const pulseDuration = 4000; // 4s pulsing
    const fadeOutDuration = 1500; // 1.5s fade out
    const totalDuration = fadeInDuration + pulseDuration + fadeOutDuration;

    // Pulse opacity range (easy to adjust)
    const pulseMin = 0.4; // Low end of pulse
    const pulseMax = 1.0; // High end of pulse

    // Generate keyframes for the animation
    const keyframes = this.generateAnimationKeyframes(
      fadeInDuration,
      pulseDuration,
      fadeOutDuration,
      pulseMin,
      pulseMax
    );

    // Use Web Animations API for hardware-accelerated animation
    this.currentAnimation = this.helperElement.animate(keyframes, {
      duration: totalDuration,
      easing: "linear", // We bake easing into the keyframes
      fill: "forwards",
    });

    this.currentAnimation.onfinish = () => {
      this.isAnimating = false;
      this.currentAnimation = null;
    };
  }

  generateAnimationKeyframes(
    fadeInDuration,
    pulseDuration,
    fadeOutDuration,
    pulseMin,
    pulseMax
  ) {
    const totalDuration = fadeInDuration + pulseDuration + fadeOutDuration;
    const keyframes = [];

    // Calculated pulse parameters
    const midPoint = (pulseMin + pulseMax) / 2;
    const amplitude = (pulseMax - pulseMin) / 2;
    const frequency = (Math.PI * 2) / 2000; // One complete cycle per 2 seconds

    // Unified easing function (smooth cubic ease-in-out)
    const easeInOutCubic = (t) => {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    // Generate keyframes at regular intervals for smooth animation
    const frameInterval = 50; // Generate a keyframe every 50ms

    for (let time = 0; time <= totalDuration; time += frameInterval) {
      let opacity;
      let offset = time / totalDuration; // Normalized time (0 to 1)

      if (time < fadeInDuration) {
        // Phase 1: Fade in from 0 to the peak of the pulse
        const progress = time / fadeInDuration;
        opacity = pulseMax * easeInOutCubic(progress);
      } else if (time < fadeInDuration + pulseDuration) {
        // Phase 2: Pulse between pulseMin and pulseMax
        const pulseElapsed = time - fadeInDuration;
        const phaseOffset = Math.PI / 2; // Start at peak of sine wave
        const pulseValue = Math.sin(pulseElapsed * frequency + phaseOffset);
        opacity = midPoint + amplitude * pulseValue;
      } else {
        // Phase 3: Fade out from current pulse value to 0
        const fadeOutElapsed = time - fadeInDuration - pulseDuration;
        const progress = fadeOutElapsed / fadeOutDuration;

        // Calculate where the pulse was at the transition point
        const pulseEndTime = pulseDuration;
        const phaseOffset = Math.PI / 2;
        const pulseEndValue = Math.sin(pulseEndTime * frequency + phaseOffset);
        const startOpacity = midPoint + amplitude * pulseEndValue;

        opacity = startOpacity * (1 - easeInOutCubic(progress));
      }

      keyframes.push({ opacity, offset });
    }

    // Ensure we end at opacity 0
    keyframes.push({ opacity: 0, offset: 1 });

    return keyframes;
  }

  startFlashing() {
    // This method is no longer needed as everything is unified in startAnimation
    // Kept for backward compatibility but does nothing
  }

  stopAnimation() {
    // Cancel Web Animation
    if (this.currentAnimation) {
      this.currentAnimation.cancel();
      this.currentAnimation = null;
    }
    if (this.cycleTimeout) {
      clearTimeout(this.cycleTimeout);
      this.cycleTimeout = null;
    }

    this.isAnimating = false;
  }

  destroy() {
    this.stopAnimation();
    if (this.helperElement && this.helperElement.parentNode) {
      this.helperElement.parentNode.removeChild(this.helperElement);
    }
  }
}
