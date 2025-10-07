import * as THREE from "three";
import { GAME_STATES } from "../gameData.js";

/**
 * VideoPlayer - Manages video playback with alpha channel support
 *
 * Features:
 * - Plays video files with RLE alpha channel transparency
 * - State-based playback control
 * - Positioning and scaling in 3D space
 */
class VideoPlayer {
  constructor(options = {}) {
    this.sceneManager = options.sceneManager;
    this.scene = options.scene;
    this.gameManager = options.gameManager;
    this.camera = options.camera;

    // Video configuration
    this.config = {
      videoPath: options.videoPath || "/video/10075.webm",
      position: options.position || [10, 1, 35], // Position in 3D space
      rotation: options.rotation || [0, -Math.PI / 2, 0], // Face the player
      scale: options.scale || [3, 3, 3], // Size of video plane
      playOnStates: options.playOnStates || [GAME_STATES.DRIVE_BY],
      loop: options.loop !== undefined ? options.loop : false,
      autoplay: options.autoplay !== undefined ? options.autoplay : true,
      billboard: options.billboard !== undefined ? options.billboard : true,
    };

    // Video elements
    this.video = null;
    this.canvas = null;
    this.canvasContext = null;
    this.videoTexture = null;
    this.videoMesh = null;
    this.isPlaying = false;
    this.isInitialized = false;
    this.canvasReady = false;
  }

  /**
   * Initialize the video player
   */
  initialize() {
    if (this.isInitialized) return;

    console.log("VideoPlayer: Initializing video player");
    console.log("VideoPlayer: Video path:", this.config.videoPath);
    console.log("VideoPlayer: Position:", this.config.position);
    console.log("VideoPlayer: Play on states:", this.config.playOnStates);

    // Create video element
    this.video = document.createElement("video");
    this.video.src = this.config.videoPath;
    this.video.crossOrigin = "anonymous";
    this.video.loop = this.config.loop;
    this.video.muted = true; // Mute for autoplay to work (browser restriction)
    this.video.playsInline = true;
    this.video.preload = "auto";

    // Add to DOM for debugging (hidden)
    this.video.style.position = "fixed";
    this.video.style.bottom = "10px";
    this.video.style.right = "10px";
    this.video.style.width = "200px";
    this.video.style.zIndex = "10000";
    this.video.style.border = "2px solid red";
    this.video.style.backgroundColor = "magenta"; // Show magenta behind to verify alpha
    document.body.appendChild(this.video);

    // Create canvas for VP9 alpha extraction
    // This is necessary because VideoTexture doesn't properly handle WebM alpha
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1920; // Default size, will be resized when video loads
    this.canvas.height = 1080;
    this.canvasContext = this.canvas.getContext("2d", {
      alpha: true,
      willReadFrequently: false,
    });

    // Debug: Add canvas to DOM to visualize what's being drawn
    this.canvas.style.position = "fixed";
    this.canvas.style.bottom = "220px";
    this.canvas.style.right = "10px";
    this.canvas.style.width = "200px";
    this.canvas.style.zIndex = "10000";
    this.canvas.style.border = "2px solid blue";
    this.canvas.style.backgroundColor = "cyan"; // Show cyan behind to verify alpha
    document.body.appendChild(this.canvas);

    // Don't create texture yet - wait for video to load
    this.videoTexture = null;

    // Create material with transparent support for WebM alpha
    const material = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      transparent: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      depthTest: true,
      depthWrite: false,
    });

    console.log(
      "VideoPlayer: Material created with canvas-based VP9 alpha support"
    );
    console.log("VideoPlayer: Video texture:", this.videoTexture);
    console.log("VideoPlayer: Video element:", this.video);
    console.log("VideoPlayer: Material:", material);

    // Create plane geometry
    const geometry = new THREE.PlaneGeometry(3, 3);

    // Create mesh
    this.videoMesh = new THREE.Mesh(geometry, material);
    this.videoMesh.position.set(...this.config.position);
    this.videoMesh.rotation.set(...this.config.rotation);
    this.videoMesh.scale.set(...this.config.scale);
    this.videoMesh.renderOrder = 999; // Render on top

    // Store material reference for potential adjustment
    this.videoMaterial = material;
    this.videoMesh.name = "video-player";

    console.log("VideoPlayer: Video mesh created");
    console.log("VideoPlayer: Position:", this.videoMesh.position);
    console.log("VideoPlayer: Rotation:", this.videoMesh.rotation);
    console.log("VideoPlayer: Scale:", this.videoMesh.scale);

    // Add a helper box to visualize position (disabled)
    this.helperMesh = null;
    if (false) {
      const helperGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const helperMaterial = new THREE.MeshBasicMaterial({
        color: 0xff00ff,
        wireframe: true,
      });
      this.helperMesh = new THREE.Mesh(helperGeometry, helperMaterial);
      this.helperMesh.position.copy(this.videoMesh.position);
    }

    // Add a test background plane to see if alpha is working
    this.testBgMesh = null;
    if (false) {
      // Green background to verify chroma key transparency
      const bgGeometry = new THREE.PlaneGeometry(1, 1);
      const bgMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00, // Bright green to test alpha
        side: THREE.DoubleSide,
      });
      this.testBgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
      this.testBgMesh.position.copy(this.videoMesh.position);
      this.testBgMesh.position.z -= 0.1; // Slightly behind video
      this.testBgMesh.rotation.copy(this.videoMesh.rotation);
      this.testBgMesh.scale.copy(this.videoMesh.scale);
    }

    // Add to scene
    if (this.scene) {
      if (this.testBgMesh) {
        this.scene.add(this.testBgMesh); // Add background first
      }
      this.scene.add(this.videoMesh);
      if (this.helperMesh) {
        this.scene.add(this.helperMesh);
      }
      console.log(
        "VideoPlayer: Added video mesh to scene at position:",
        this.config.position
      );
      console.log(
        "VideoPlayer: Video mesh world position:",
        this.videoMesh.position
      );
      console.log("VideoPlayer: Video mesh visible:", this.videoMesh.visible);
      console.log("VideoPlayer: Video mesh scale:", this.videoMesh.scale);
      console.log("VideoPlayer: Video mesh rendering enabled");
    }

    // Listen for game state changes
    if (this.gameManager) {
      this.gameManager.on("state:changed", (newState, oldState) => {
        this.handleStateChange(newState, oldState);
      });
    }

    // Video event listeners
    this.video.addEventListener("loadeddata", () => {
      console.log("VideoPlayer: Video data loaded successfully");
      console.log(
        "VideoPlayer: Video dimensions:",
        this.video.videoWidth,
        "x",
        this.video.videoHeight
      );
      console.log("VideoPlayer: Video duration:", this.video.duration);

      // Resize canvas to match video dimensions
      if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;

        // Create texture now that canvas has proper dimensions
        if (!this.videoTexture) {
          this.videoTexture = new THREE.CanvasTexture(this.canvas);
          this.videoTexture.minFilter = THREE.LinearFilter;
          this.videoTexture.magFilter = THREE.LinearFilter;
          this.videoTexture.colorSpace = THREE.SRGBColorSpace;

          // Update material with texture
          if (this.videoMesh && this.videoMesh.material) {
            this.videoMesh.material.map = this.videoTexture;
            this.videoMesh.material.needsUpdate = true;
          }
        }

        this.canvasReady = true;
        console.log(
          "VideoPlayer: Canvas resized to",
          this.canvas.width,
          "x",
          this.canvas.height
        );
      }
    });

    this.video.addEventListener("error", (e) => {
      console.error("VideoPlayer: Video error:", e);
      console.error("VideoPlayer: Video error code:", this.video.error?.code);
      console.error(
        "VideoPlayer: Video error message:",
        this.video.error?.message
      );
    });

    this.video.addEventListener("ended", () => {
      console.log("VideoPlayer: Video ended");
      this.isPlaying = false;
    });

    this.video.addEventListener("play", () => {
      console.log("VideoPlayer: Video started playing");
      console.log("VideoPlayer: Video readyState:", this.video.readyState);
      console.log("VideoPlayer: Video paused:", this.video.paused);
      this.isPlaying = true;

      // Force texture update
      if (this.videoTexture) {
        this.videoTexture.needsUpdate = true;
        console.log("VideoPlayer: Texture needsUpdate flag set");
        console.log("VideoPlayer: Texture image:", this.videoTexture.image);
      }

      // Force material update
      if (this.videoMaterial) {
        this.videoMaterial.needsUpdate = true;
        console.log("VideoPlayer: Material updated");
      }
    });

    this.video.addEventListener("pause", () => {
      console.log("VideoPlayer: Video paused");
      this.isPlaying = false;
    });

    this.video.addEventListener("canplay", () => {
      console.log("VideoPlayer: Video can play");
    });

    this.isInitialized = true;
    console.log("VideoPlayer: Initialization complete");
    console.log(
      "VideoPlayer: Video mesh added to scene at:",
      this.videoMesh.position
    );

    // Check if we should play immediately based on current state
    if (this.gameManager) {
      const currentState = this.gameManager.state;
      console.log(
        "VideoPlayer: Current game state:",
        currentState.currentState
      );
      console.log(
        "VideoPlayer: Should play on states:",
        this.config.playOnStates
      );

      if (
        this.config.playOnStates.includes(currentState.currentState) &&
        this.config.autoplay
      ) {
        console.log(
          "VideoPlayer: Current state matches, attempting to play immediately"
        );
        // Small delay to ensure everything is loaded
        setTimeout(() => this.play(), 500);
      }
    }
  }

  /**
   * Handle game state changes
   */
  handleStateChange(newState, oldState) {
    console.log(
      "VideoPlayer: State changed from",
      oldState.currentState,
      "to",
      newState.currentState
    );
    const shouldPlay = this.config.playOnStates.includes(newState.currentState);
    console.log(
      "VideoPlayer: Should play?",
      shouldPlay,
      "Is playing?",
      this.isPlaying
    );

    if (shouldPlay && !this.isPlaying && this.config.autoplay) {
      console.log(
        `VideoPlayer: State changed to ${newState.currentState}, playing video`
      );
      this.play();
    }
  }

  /**
   * Play the video
   */
  async play() {
    if (!this.video) {
      console.warn("VideoPlayer: Video not initialized");
      return;
    }

    try {
      console.log(
        "VideoPlayer: Attempting to play video from:",
        this.video.src
      );
      console.log(
        "VideoPlayer: Video readyState before play:",
        this.video.readyState
      );
      this.video.currentTime = 0; // Start from beginning
      await this.video.play();
      console.log("VideoPlayer: Playing video successfully");
      console.log(
        "VideoPlayer: Video dimensions:",
        this.video.videoWidth,
        "x",
        this.video.videoHeight
      );
    } catch (error) {
      console.error("VideoPlayer: Failed to play video", error);
      console.error("VideoPlayer: Video error state:", this.video.error);
    }
  }

  /**
   * Pause the video
   */
  pause() {
    if (this.video) {
      this.video.pause();
      console.log("VideoPlayer: Paused video");
    }
  }

  /**
   * Stop the video
   */
  stop() {
    if (this.video) {
      this.video.pause();
      this.video.currentTime = 0;
      this.isPlaying = false;
      console.log("VideoPlayer: Stopped video");
    }
  }

  /**
   * Set video position
   */
  setPosition(x, y, z) {
    if (this.videoMesh) {
      this.videoMesh.position.set(x, y, z);
    }
  }

  /**
   * Set video rotation
   */
  setRotation(x, y, z) {
    if (this.videoMesh) {
      this.videoMesh.rotation.set(x, y, z);
    }
  }

  /**
   * Set video scale
   */
  setScale(x, y, z) {
    if (this.videoMesh) {
      this.videoMesh.scale.set(x, y, z);
    }
  }

  /**
   * Show/hide video mesh
   */
  setVisible(visible) {
    if (this.videoMesh) {
      this.videoMesh.visible = visible;
    }
  }

  /**
   * Update method - call in animation loop
   */
  update(dt) {
    // Draw video to canvas to extract alpha channel (for VP9 alpha support)
    if (
      this.canvasReady &&
      this.isPlaying &&
      this.video &&
      this.video.readyState >= this.video.HAVE_CURRENT_DATA
    ) {
      this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.canvasContext.drawImage(this.video, 0, 0);
      this.videoTexture.needsUpdate = true;

      // Debug: Check alpha values once
      if (!this._alphaChecked && this.video.currentTime > 0.5) {
        this._alphaChecked = true;
        const imageData = this.canvasContext.getImageData(
          0,
          0,
          this.canvas.width,
          this.canvas.height
        );
        const data = imageData.data;
        let hasAlpha = false;
        let transparentPixels = 0;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 255) {
            hasAlpha = true;
            if (data[i] === 0) transparentPixels++;
          }
        }
        console.log("VideoPlayer: Canvas has alpha data:", hasAlpha);
        console.log(
          "VideoPlayer: Transparent pixels:",
          transparentPixels,
          "/",
          data.length / 4
        );
        console.log(
          "VideoPlayer: Sample alpha values:",
          data[3],
          data[7],
          data[11],
          data[15],
          data[19]
        );
      }
    }

    // Billboard to camera if enabled
    if (this.config.billboard && this.videoMesh && this.camera) {
      this.videoMesh.lookAt(this.camera.position);

      // Also update helper and background if billboarding
      if (this.helperMesh) {
        this.helperMesh.rotation.copy(this.videoMesh.rotation);
      }
      if (this.testBgMesh) {
        this.testBgMesh.rotation.copy(this.videoMesh.rotation);
      }
    }
  }

  /**
   * Clean up
   */
  destroy() {
    this.stop();

    if (this.videoMesh) {
      if (this.videoMesh.parent) {
        this.videoMesh.parent.remove(this.videoMesh);
      }
      if (this.videoMesh.geometry) {
        this.videoMesh.geometry.dispose();
      }
      if (this.videoMesh.material) {
        this.videoMesh.material.dispose();
      }
    }

    if (this.videoTexture) {
      this.videoTexture.dispose();
    }

    if (this.video) {
      this.video.src = "";
      this.video.load();
    }

    console.log("VideoPlayer: Destroyed");
  }
}

export default VideoPlayer;
