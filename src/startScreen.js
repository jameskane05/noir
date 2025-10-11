import * as THREE from "three";
import { createAnimatedTextSplat } from "./textSplat.js";
import { TitleSequence } from "./titleSequence.js";
import { GAME_STATES } from "./gameData.js";

/**
 * StartScreen - Manages the intro camera animation and start button
 */
export class StartScreen {
  constructor(camera, scene, options = {}) {
    this.camera = camera;
    this.scene = scene;
    this.isActive = true;
    this.hasStarted = false;
    this.transitionProgress = 0;
    this.uiManager = options.uiManager || null;

    // Additional state
    this.introStartTriggered = false;
    this.titleSequence = null;
    this.textSplat1 = null;
    this.textSplat2 = null;

    // Circle animation settings
    this.circleCenter = options.circleCenter || new THREE.Vector3(0, 0, 0);
    this.circleRadius = options.circleRadius || 15;
    this.circleHeight = options.circleHeight || 10;
    this.circleSpeed = options.circleSpeed || 0.3;
    this.circleTime = 0;

    // Target position (where camera should end up)
    this.targetPosition =
      options.targetPosition || new THREE.Vector3(10, 1.6, 15);
    this.targetRotation = options.targetRotation || {
      yaw: THREE.MathUtils.degToRad(-210),
      pitch: 0,
    };

    // Transition settings
    this.transitionDuration = options.transitionDuration || 2.0; // seconds

    // Store initial camera state for transition
    this.startPosition = new THREE.Vector3();
    this.startLookAt = new THREE.Vector3();

    // Create start button
    this.createStartButton();

    // Create text splats
    const { textSplat1, textSplat2 } = this.createTextSplats();
    this.textSplat1 = textSplat1;
    this.textSplat2 = textSplat2;
  }

  /**
   * Create the start button overlay
   */
  createStartButton() {
    // Create overlay container
    this.overlay = document.createElement("div");
    this.overlay.id = "intro-overlay";
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      pointer-events: none;
      background: rgba(0, 0, 0, 0.0);
    `;

    // Create tagline
    this.tagline = document.createElement("div");
    this.tagline.innerHTML = `In this town<br>it's hard to stray far from...`;
    this.tagline.style.cssText = `
      font-family: 'LePorsche', Arial, sans-serif;
      font-size: 42px;
      color: #fff;
      text-align: center;
      line-height: 1.4;
      margin-bottom: 40px;
      text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.9);
      letter-spacing: 2px;
    `;

    // Create start button
    this.startButton = document.createElement("button");
    this.startButton.textContent = "START";
    this.startButton.style.cssText = `
      font-family: 'LePorsche', Arial, sans-serif;
      font-size: 48px;
      color: #fff;
      background: transparent;
      border: 3px solid #fff;
      padding: 20px 60px;
      cursor: pointer;
      letter-spacing: 4px;
      transition: all 0.3s ease;
      text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.9);
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
      min-width: 400px;
      pointer-events: all;
    `;

    // Hover effects for start button
    this.startButton.addEventListener("mouseenter", () => {
      this.startButton.style.background = "rgba(255, 255, 255, 0.1)";
      this.startButton.style.transform = "scale(1.05)";
      this.startButton.style.boxShadow = "0 0 30px rgba(255, 255, 255, 0.4)";
    });

    this.startButton.addEventListener("mouseleave", () => {
      this.startButton.style.background = "transparent";
      this.startButton.style.transform = "scale(1)";
      this.startButton.style.boxShadow = "0 0 20px rgba(255, 255, 255, 0.2)";
    });

    // Click handler for start button
    this.startButton.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent click from reaching canvas
      this.startGame();

      // Request pointer lock when game starts (input will be disabled until control is enabled)
      const canvas = document.querySelector("canvas");
      if (canvas && canvas.requestPointerLock) {
        canvas.requestPointerLock();
      }
    });

    // Create options button
    this.optionsButton = document.createElement("button");
    this.optionsButton.textContent = "OPTIONS";
    this.optionsButton.style.cssText = `
      font-family: 'LePorsche', Arial, sans-serif;
      font-size: 48px;
      color: #fff;
      background: transparent;
      border: 3px solid #fff;
      padding: 20px 60px;
      cursor: pointer;
      letter-spacing: 4px;
      transition: all 0.3s ease;
      text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.9);
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
      min-width: 400px;
      pointer-events: all;
    `;

    // Hover effects for options button
    this.optionsButton.addEventListener("mouseenter", () => {
      this.optionsButton.style.background = "rgba(255, 255, 255, 0.1)";
      this.optionsButton.style.transform = "scale(1.05)";
      this.optionsButton.style.boxShadow = "0 0 30px rgba(255, 255, 255, 0.4)";
    });

    this.optionsButton.addEventListener("mouseleave", () => {
      this.optionsButton.style.background = "transparent";
      this.optionsButton.style.transform = "scale(1)";
      this.optionsButton.style.boxShadow = "0 0 20px rgba(255, 255, 255, 0.2)";
    });

    // Click handler for options button
    this.optionsButton.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent click from reaching canvas
      if (this.uiManager) {
        this.uiManager.show("options-menu");
      }
    });

    this.overlay.appendChild(this.tagline);
    this.overlay.appendChild(this.startButton);
    this.overlay.appendChild(this.optionsButton);
    document.body.appendChild(this.overlay);

    // Register with UI manager if available
    if (this.uiManager) {
      this.uiManager.registerElement(
        "intro-screen",
        this.overlay,
        "MAIN_MENU",
        {
          blocksInput: true,
          pausesGame: false, // Game hasn't started yet
        }
      );
    }
  }

  /**
   * Create text splats for the start screen
   */
  createTextSplats() {
    // Create first text splat
    const textSplat1 = createAnimatedTextSplat(this.scene, {
      text: "THE SHADOW\nof the Czar",
      font: "LePorsche",
      fontSize: 120,
      color: new THREE.Color(0xffffff), // White
      position: { x: 0, y: 0, z: -10 }, // Base position for animation
      scale: 1.0 / 80,
      animate: true,
    });
    this.scene.remove(textSplat1.mesh);
    this.camera.add(textSplat1.mesh);
    textSplat1.mesh.userData.baseScale = 1.0 / 80;
    textSplat1.mesh.visible = false; // Hide initially

    // Create second text splat (positioned below first)
    const textSplat2 = createAnimatedTextSplat(this.scene, {
      text: "by JAMES C. KANE",
      font: "LePorsche",
      fontSize: 30,
      color: new THREE.Color(0xffffff), // White
      position: { x: 0, y: -1.8, z: -10 }, // Base position lower for animation
      scale: 1.0 / 80,
      animate: true,
    });
    this.scene.remove(textSplat2.mesh);
    this.camera.add(textSplat2.mesh);
    textSplat2.mesh.userData.baseScale = 1.0 / 80;
    textSplat2.mesh.visible = false; // Hide initially

    return { textSplat1, textSplat2 };
  }

  /**
   * Start the game - begin transition
   */
  startGame() {
    if (this.hasStarted) return;

    this.hasStarted = true;

    // Flip high-level state from startScreen -> titleSequence
    if (this.uiManager && this.uiManager.gameManager) {
      this.uiManager.gameManager.setState({
        currentState: GAME_STATES.TITLE_SEQUENCE,
      });
    }

    // Store current camera position as transition start
    this.startPosition.copy(this.camera.position);

    // Calculate where camera is currently looking
    const lookDirection = new THREE.Vector3(0, 0, -1);
    lookDirection.applyQuaternion(this.camera.quaternion);
    this.startLookAt.copy(this.camera.position).add(lookDirection);

    // Immediately fade out start menu
    this.overlay.style.opacity = "0";
    this.overlay.style.transition = "opacity 0.15s ease";
    setTimeout(() => {
      this.overlay.style.display = "none";
      if (this.uiManager) {
        this.uiManager.hide("intro-screen");
      }
    }, 150);
  }

  /**
   * Update camera position for circling or transition
   * @param {number} dt - Delta time in seconds
   * @returns {boolean} - True if still active, false if complete
   */
  update(dt) {
    if (!this.hasStarted) {
      // Circle animation
      this.circleTime += dt * this.circleSpeed;

      const x =
        this.circleCenter.x + Math.cos(this.circleTime) * this.circleRadius;
      const z =
        this.circleCenter.z + Math.sin(this.circleTime) * this.circleRadius;
      const y = this.circleHeight;

      this.camera.position.set(x, y, z);

      // Calculate forward direction (tangent to circle)
      // Derivative of circle: dx/dt = -sin(t), dz/dt = cos(t)
      const forwardX = -Math.sin(this.circleTime);
      const forwardZ = Math.cos(this.circleTime);

      // Look forward along the circular path
      const lookTarget = new THREE.Vector3(
        x + forwardX,
        y, // Same height
        z + forwardZ
      );
      this.camera.lookAt(lookTarget);

      return true;
    } else if (this.transitionProgress < 1.0) {
      // Transition from circle to start position
      this.transitionProgress += dt / this.transitionDuration;
      const t = Math.min(this.transitionProgress, 1.0);

      // Smooth easing (ease-in-out)
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      // Interpolate position
      this.camera.position.lerpVectors(
        this.startPosition,
        this.targetPosition,
        eased
      );

      // Interpolate look direction
      const currentLookAt = new THREE.Vector3();
      const targetLookDirection = new THREE.Vector3(0, 0, -1).applyEuler(
        new THREE.Euler(
          this.targetRotation.pitch,
          this.targetRotation.yaw,
          0,
          "YXZ"
        )
      );
      const targetLookAt = this.targetPosition.clone().add(targetLookDirection);

      currentLookAt.lerpVectors(this.startLookAt, targetLookAt, eased);
      this.camera.lookAt(currentLookAt);

      if (this.transitionProgress >= 1.0) {
        this.isActive = false;
        this.cleanup();
        return false;
      }

      return true;
    }

    this.isActive = false;
    return false;
  }

  /**
   * Check if intro is complete
   */
  isComplete() {
    return !this.isActive;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }

  /**
   * Monitor start screen for start button click and trigger title sequence
   */
  checkIntroStart(sfxManager, gameManager) {
    if (!this.hasStarted) return; // Skip if start button not clicked

    if (this.hasStarted && !this.introStartTriggered) {
      this.introStartTriggered = true;

      // Ensure ambiance is on and attempt playback on first interaction
      if (sfxManager && !sfxManager.isPlaying("city-ambiance")) {
        sfxManager.play("city-ambiance");
      }

      // Make text visible before starting sequence
      this.textSplat1.mesh.visible = true;
      this.textSplat2.mesh.visible = true;

      this.titleSequence = new TitleSequence(
        [this.textSplat1, this.textSplat2],
        {
          introDuration: 5.0,
          staggerDelay: 2.0,
          holdDuration: 4.0,
          outroDuration: 2.0,
          disperseDistance: 5.0,
          onComplete: () => {
            console.log("Title sequence complete");
            gameManager.setState({
              currentState: GAME_STATES.TITLE_SEQUENCE_COMPLETE,
            });
          },
        }
      );

      // Update game state - intro is ending, transitioning to gameplay
      gameManager.setState({
        currentState: GAME_STATES.TITLE_SEQUENCE,
      });
    }
  }

  /**
   * Get the title sequence
   */
  getTitleSequence() {
    return this.titleSequence;
  }
}
