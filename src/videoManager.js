import * as THREE from "three";
import { videos } from "./videoData.js";
import { checkCriteria } from "./criteriaHelper.js";

/**
 * VideoManager - Manages video playback with state-based control
 *
 * Features:
 * - State-based video playback
 * - WebM alpha channel support
 * - Multiple video instances
 * - Billboard mode to face camera
 */
class VideoManager {
  constructor(options = {}) {
    this.scene = options.scene;
    this.gameManager = options.gameManager;
    this.camera = options.camera;

    // Track active video players
    this.videoPlayers = new Map(); // id -> VideoPlayer instance
    this.playedOnce = new Set(); // Track videos that have played once
    this.pendingDelays = new Map(); // id -> setTimeout handle for delayed playback

    // Listen for game state changes
    if (this.gameManager) {
      this.gameManager.on("state:changed", (newState, oldState) => {
        this.updateVideosForState(newState);
      });

      // Handle initial state
      const currentState = this.gameManager.getState();
      this.updateVideosForState(currentState);
    }
  }

  /**
   * Update all videos based on current game state
   * Checks criteria for each video and plays/stops accordingly
   * @param {Object} state - Current game state
   */
  updateVideosForState(state) {
    // Check all videos defined in videoData
    for (const [videoId, videoConfig] of Object.entries(videos)) {
      // Check if video has criteria
      if (!videoConfig.criteria) continue;

      const matchesCriteria = checkCriteria(state, videoConfig.criteria);
      const player = this.videoPlayers.get(videoId);
      const isPlaying = player && player.isPlaying;
      const hasPlayedOnce = this.playedOnce.has(videoId);
      const hasPendingDelay = this.pendingDelays.has(videoId);

      // If criteria matches and video is not playing
      if (matchesCriteria && !isPlaying && !hasPendingDelay) {
        // Check once - skip if already played
        if (videoConfig.once && hasPlayedOnce) {
          continue;
        }

        // Auto-play video if configured (with optional delay)
        if (videoConfig.autoPlay) {
          const delay = videoConfig.delay || 0;

          if (delay > 0) {
            // Schedule delayed playback
            const timeoutId = setTimeout(() => {
              this.pendingDelays.delete(videoId);
              this.playVideo(videoId);
            }, delay * 1000); // Convert to milliseconds

            this.pendingDelays.set(videoId, timeoutId);
            console.log(
              `VideoManager: Scheduled video "${videoId}" to play in ${delay}s`
            );
          } else {
            // Play immediately
            this.playVideo(videoId);
          }
        }
      }
      // If criteria doesn't match, stop video and cancel any pending delays
      else if (!matchesCriteria) {
        // Cancel pending delay if exists
        if (hasPendingDelay) {
          clearTimeout(this.pendingDelays.get(videoId));
          this.pendingDelays.delete(videoId);
          console.log(
            `VideoManager: Cancelled delayed playback for "${videoId}"`
          );
        }

        // Stop video if playing
        if (isPlaying) {
          this.stopVideo(videoId);
        }
      }
    }
  }

  /**
   * Play a video by ID
   * @param {string} videoId - Video ID from videoData.js
   */
  playVideo(videoId) {
    const videoConfig = videos[videoId];
    if (!videoConfig) {
      console.warn(`VideoManager: Video not found: ${videoId}`);
      return;
    }

    // Get or create video player
    let player = this.videoPlayers.get(videoId);

    if (!player) {
      player = new VideoPlayer({
        scene: this.scene,
        gameManager: this.gameManager,
        camera: this.camera,
        videoPath: videoConfig.videoPath,
        position: videoConfig.position,
        rotation: videoConfig.rotation,
        scale: videoConfig.scale,
        loop: videoConfig.loop,
        billboard: videoConfig.billboard,
      });

      player.initialize();
      this.videoPlayers.set(videoId, player);

      // Handle video end
      player.video.addEventListener("ended", () => {
        if (videoConfig.once) {
          this.playedOnce.add(videoId);
        }

        if (videoConfig.onComplete) {
          videoConfig.onComplete(this.gameManager);
        }
      });
    }

    player.play();
  }

  /**
   * Stop a video by ID
   * @param {string} videoId - Video ID
   */
  stopVideo(videoId) {
    const player = this.videoPlayers.get(videoId);
    if (player) {
      player.stop();
    }
  }

  /**
   * Stop all videos
   */
  stopAllVideos() {
    this.videoPlayers.forEach((player) => player.stop());
  }

  /**
   * Update all active videos (call in animation loop)
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    this.videoPlayers.forEach((player) => player.update(dt));
  }

  /**
   * Clean up all videos
   */
  destroy() {
    // Clear all pending delays
    this.pendingDelays.forEach((timeoutId) => clearTimeout(timeoutId));
    this.pendingDelays.clear();

    // Destroy all video players
    this.videoPlayers.forEach((player) => player.destroy());
    this.videoPlayers.clear();
    this.playedOnce.clear();
  }
}

/**
 * VideoPlayer - Individual video instance
 * (Internal class used by VideoManager)
 */
class VideoPlayer {
  constructor(options = {}) {
    this.scene = options.scene;
    this.gameManager = options.gameManager;
    this.camera = options.camera;

    // Video configuration
    this.config = {
      videoPath: options.videoPath,
      position: options.position || [0, 0, 0],
      rotation: options.rotation || [0, 0, 0],
      scale: options.scale || [1, 1, 1],
      loop: options.loop !== undefined ? options.loop : false,
      billboard: options.billboard !== undefined ? options.billboard : false,
    };

    // Video elements
    this.video = null;
    this.canvas = null;
    this.canvasContext = null;
    this.videoTexture = null;
    this.videoMesh = null;
    this.videoMaterial = null;
    this.isPlaying = false;
    this.isInitialized = false;
    this.canvasReady = false;
  }

  /**
   * Initialize the video player
   */
  initialize() {
    if (this.isInitialized) return;

    // Create video element
    this.video = document.createElement("video");
    this.video.src = this.config.videoPath;
    this.video.crossOrigin = "anonymous";
    this.video.loop = this.config.loop;
    this.video.muted = true; // Mute for autoplay to work (browser restriction)
    this.video.playsInline = true;
    this.video.preload = "auto";

    // Create canvas for WebM alpha extraction
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.canvasContext = this.canvas.getContext("2d", {
      alpha: true,
      willReadFrequently: false,
    });

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

    // Create plane geometry
    const geometry = new THREE.PlaneGeometry(3, 3);

    // Create mesh
    this.videoMesh = new THREE.Mesh(geometry, material);
    this.videoMesh.position.set(...this.config.position);
    this.videoMesh.rotation.set(...this.config.rotation);
    this.videoMesh.scale.set(...this.config.scale);
    this.videoMesh.renderOrder = 999;

    // Store material reference
    this.videoMaterial = material;
    this.videoMesh.name = "video-player";

    // Store initial rotation for billboarding offset
    this.initialRotation = {
      x: this.config.rotation[0],
      y: this.config.rotation[1],
      z: this.config.rotation[2],
    };

    // Add to scene
    if (this.scene) {
      this.scene.add(this.videoMesh);
    }

    // Video event listeners
    this.video.addEventListener("loadeddata", () => {
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

        // If video is already playing, draw the first frame immediately
        // (This handles the case where play() was called before loadeddata)
        if (
          this.isPlaying &&
          this.video.readyState >= this.video.HAVE_CURRENT_DATA
        ) {
          this.canvasContext.clearRect(
            0,
            0,
            this.canvas.width,
            this.canvas.height
          );
          this.canvasContext.drawImage(this.video, 0, 0);
          this.videoTexture.needsUpdate = true;
        }
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
      this.isPlaying = false;
    });

    this.video.addEventListener("play", () => {
      this.isPlaying = true;

      // Force texture update
      if (this.videoTexture) {
        this.videoTexture.needsUpdate = true;
      }

      // Force material update
      if (this.videoMaterial) {
        this.videoMaterial.needsUpdate = true;
      }
    });

    this.video.addEventListener("pause", () => {
      this.isPlaying = false;
    });

    // Use requestVideoFrameCallback for efficient frame updates (only draw when new frame available)
    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      this.useVideoFrameCallback = true;
      this.pendingVideoFrame = false;
    } else {
      this.useVideoFrameCallback = false;
    }

    this.isInitialized = true;
  }

  /**
   * Play the video
   */
  async play() {
    if (!this.video) return;

    try {
      // Only reset to beginning if video has ended
      if (this.video.ended) {
        this.video.currentTime = 0;
      }

      await this.video.play();

      // Start video frame callback loop if supported
      if (this.useVideoFrameCallback && !this.pendingVideoFrame) {
        this.scheduleVideoFrameCallback();
      }
    } catch (error) {
      console.error("VideoPlayer: Failed to play video", error);
    }
  }

  /**
   * Schedule next video frame callback
   */
  scheduleVideoFrameCallback() {
    if (!this.video || !this.useVideoFrameCallback) return;

    this.pendingVideoFrame = true;
    this.video.requestVideoFrameCallback(() => {
      this.pendingVideoFrame = false;

      // Draw the new frame
      if (
        this.canvasReady &&
        this.isPlaying &&
        this.video.readyState >= this.video.HAVE_CURRENT_DATA
      ) {
        this.canvasContext.clearRect(
          0,
          0,
          this.canvas.width,
          this.canvas.height
        );
        this.canvasContext.drawImage(this.video, 0, 0);
        this.videoTexture.needsUpdate = true;
      }

      // Schedule next frame if still playing
      if (this.isPlaying) {
        this.scheduleVideoFrameCallback();
      }
    });
  }

  /**
   * Pause the video
   */
  pause() {
    if (this.video) {
      this.video.pause();
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
      this.pendingVideoFrame = false; // Cancel any pending frame callback
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
    // Draw video to canvas only if not using video frame callback
    // (If using callback, frames are drawn in scheduleVideoFrameCallback instead)
    if (!this.useVideoFrameCallback) {
      if (
        this.canvasReady &&
        this.isPlaying &&
        this.video &&
        this.video.readyState >= this.video.HAVE_CURRENT_DATA
      ) {
        this.canvasContext.clearRect(
          0,
          0,
          this.canvas.width,
          this.canvas.height
        );
        this.canvasContext.drawImage(this.video, 0, 0);
        this.videoTexture.needsUpdate = true;
      }
    }

    // Billboard to camera if enabled (Y-axis only)
    if (this.config.billboard && this.videoMesh && this.camera) {
      // Calculate angle to camera in XZ plane only
      const dx = this.camera.position.x - this.videoMesh.position.x;
      const dz = this.camera.position.z - this.videoMesh.position.z;
      const angle = Math.atan2(dx, dz);

      // Apply only Y rotation, preserve original X and Z rotations
      this.videoMesh.rotation.y = angle;
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
  }
}

export default VideoManager;
