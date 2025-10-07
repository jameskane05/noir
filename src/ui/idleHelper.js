import * as THREE from "three";

export class IdleHelper {
  constructor() {
    this.helperElement = null;
    this.lastMovementTime = Date.now();
    this.idleThreshold = 5000; // 5 seconds
    this.cycleInterval = 20000; // 20 seconds
    this.isAnimating = false;
    this.animationTimeout = null;
    this.cycleTimeout = null;

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
    this.helperElement.style.transition = "opacity 0.5s ease-in-out";

    // Create the image
    const img = document.createElement("img");
    img.src = "/images/wasd.png";
    img.style.width = "200px";
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

    // Also listen for mouse movement (for looking around)
    let mouseMoveTimeout;
    window.addEventListener("mousemove", () => {
      clearTimeout(mouseMoveTimeout);
      mouseMoveTimeout = setTimeout(() => {
        this.onMovement();
      }, 100); // Debounce mouse movement
    });
  }

  onMovement() {
    this.lastMovementTime = Date.now();

    // If currently animating, hide the helper
    if (this.isAnimating) {
      this.stopAnimation();
      this.helperElement.style.opacity = "0";
    }
  }

  startIdleCheck() {
    // Check every second if user is idle
    setInterval(() => {
      const timeSinceLastMovement = Date.now() - this.lastMovementTime;

      if (timeSinceLastMovement >= this.idleThreshold && !this.isAnimating) {
        this.startAnimation();
      }
    }, 1000);
  }

  startAnimation() {
    this.isAnimating = true;

    // Phase 1: Fade in from 0 to 1
    this.helperElement.style.transition = "opacity 0.5s ease-in-out";
    this.helperElement.style.opacity = "1";

    // Phase 2: Flash between 1 and 0.75 for a few seconds
    this.animationTimeout = setTimeout(() => {
      this.startFlashing();
    }, 500); // Wait for fade in to complete
  }

  startFlashing() {
    let flashCount = 0;
    const maxFlashes = 8; // 4 seconds of flashing (500ms per flash)
    const flashDuration = 500;

    const flash = () => {
      if (flashCount >= maxFlashes) {
        // Phase 3: Fade out to 0
        this.helperElement.style.transition = "opacity 0.5s ease-in-out";
        this.helperElement.style.opacity = "0";

        // Reset and schedule next cycle
        this.animationTimeout = setTimeout(() => {
          this.isAnimating = false;

          // Schedule next cycle in 20 seconds from the start of this animation
          this.cycleTimeout = setTimeout(() => {
            const timeSinceLastMovement = Date.now() - this.lastMovementTime;
            if (timeSinceLastMovement >= this.idleThreshold) {
              this.startAnimation();
            }
          }, this.cycleInterval - (Date.now() - (this.lastMovementTime + this.idleThreshold)));
        }, 500); // Wait for fade out to complete

        return;
      }

      // Toggle between 1 and 0.75
      this.helperElement.style.transition = `opacity ${
        flashDuration / 2
      }ms ease-in-out`;
      const targetOpacity = flashCount % 2 === 0 ? "0.75" : "1";
      this.helperElement.style.opacity = targetOpacity;

      flashCount++;
      this.animationTimeout = setTimeout(flash, flashDuration);
    };

    flash();
  }

  stopAnimation() {
    // Clear all timeouts
    if (this.animationTimeout) {
      clearTimeout(this.animationTimeout);
      this.animationTimeout = null;
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
