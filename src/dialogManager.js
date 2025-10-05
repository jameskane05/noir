import { Howl } from "howler";
import { textSplats, dyno } from "@sparkjsdev/spark";
import * as THREE from "three";

/**
 * DialogManager - Handles dialog audio playback with synchronized captions
 *
 * Features:
 * - Play dialog audio files
 * - Display synchronized captions (HTML or 3D text splats)
 * - Event-based triggering
 * - Queue multiple dialog sequences
 * - Callback support for dialog completion
 */

class DialogManager {
  constructor(options = {}) {
    this.useSplats = options.useSplats !== undefined ? options.useSplats : true;
    this.scene = options.scene || null;
    this.camera = options.camera || null;
    this.sfxManager = options.sfxManager || null;

    // Caption display (HTML or text splat)
    if (this.useSplats && this.scene && this.camera) {
      this.captionSplat = null;
      this.captionElement = null;
    } else {
      this.captionElement =
        options.captionElement || this.createCaptionElement();
      this.captionSplat = null;
      this.useSplats = false;

      // Apply custom caption styling if provided, otherwise use defaults
      if (options.captionStyle) {
        this.setCaptionStyle(options.captionStyle);
      } else {
        this.applyDefaultCaptionStyle();
      }
    }

    this.baseVolume = options.audioVolume || 0.8;
    this.audioVolume = this.baseVolume;
    this.currentDialog = null;
    this.currentAudio = null;
    this.captionQueue = [];
    this.captionIndex = 0;
    this.captionTimer = 0;
    this.isPlaying = false;
    this.onCompleteCallback = null;

    // Delayed playback support
    this.pendingDialogs = new Map(); // Map of dialogId -> { dialogData, onComplete, timer, delay }

    // Update volume based on SFX manager if available
    if (this.sfxManager) {
      this.audioVolume = this.baseVolume * this.sfxManager.getMasterVolume();
    }

    // Text splat configuration
    this.splatConfig = {
      font: options.splatFont || "LePorsche",
      fontSize: options.splatFontSize || 60,
      color: options.splatColor || new THREE.Color(0xffffff),
      position: options.splatPosition || { x: 0, y: -1.5, z: -10 },
      scale: options.splatScale || 1.0 / 80,
      margin: options.splatMargin || 0.15, // 15% margin from edges (conservative)
    };

    // Camera frustum bounds (will be calculated)
    this.frustumBounds = null;

    // Calculate initial bounds if using splats
    if (this.useSplats && this.camera) {
      this.calculateFrustumBounds();
      this.setupResizeListener();
    }

    // Event listeners
    this.eventListeners = {
      "dialog:play": [],
      "dialog:stop": [],
      "dialog:complete": [],
      "dialog:caption": [],
    };
  }

  /**
   * Calculate visible frustum bounds at the text splat depth
   */
  calculateFrustumBounds() {
    if (!this.camera) return;

    const distance = Math.abs(this.splatConfig.position.z);
    const vFov = this.camera.fov * (Math.PI / 180); // Convert to radians
    const height = 2 * Math.tan(vFov / 2) * distance;
    const width = height * this.camera.aspect;

    // Apply margin (percentage of visible area)
    const marginX = width * this.splatConfig.margin;
    const marginY = height * this.splatConfig.margin;

    this.frustumBounds = {
      minX: -width / 2 + marginX,
      maxX: width / 2 - marginX,
      minY: -height / 2 + marginY,
      maxY: height / 2 - marginY,
      width: width - 2 * marginX,
      height: height - 2 * marginY,
    };
  }

  /**
   * Set up window resize listener to recalculate bounds
   */
  setupResizeListener() {
    this.resizeHandler = () => {
      this.calculateFrustumBounds();
      // If a caption is currently showing, reposition it
      if (this.captionSplat) {
        this.positionCaptionWithinBounds(this.captionSplat);
      }
    };

    window.addEventListener("resize", this.resizeHandler);
  }

  /**
   * Position caption within safe bounds and scale if necessary
   */
  positionCaptionWithinBounds(captionSplat) {
    if (!this.frustumBounds) return;

    // Estimate text dimensions based on character count and font size
    const text = captionSplat.userData?.text || "";

    if (!text) {
      captionSplat.position.set(
        0,
        this.splatConfig.position.y,
        this.splatConfig.position.z
      );
      return;
    }

    const lines = text.split("\n");
    const maxLineLength = Math.max(...lines.map((line) => line.length), 1);

    // Conservative estimate: each character is about 0.7 * fontSize in width
    const charWidth = this.splatConfig.fontSize * 0.7;
    const lineHeight = this.splatConfig.fontSize * 1.2;

    const estimatedWidth = maxLineLength * charWidth * this.splatConfig.scale;
    const estimatedHeight = lines.length * lineHeight * this.splatConfig.scale;

    // Calculate required scale to fit within bounds
    let scale = this.splatConfig.scale;
    const availableWidth = this.frustumBounds.width;
    const availableHeight = this.frustumBounds.height;

    // Scale down if text is too wide or too tall
    if (estimatedWidth > availableWidth) {
      const widthScale = availableWidth / (maxLineLength * charWidth);
      scale = Math.min(scale, widthScale);
    }

    if (estimatedHeight > availableHeight) {
      const heightScale = availableHeight / (lines.length * lineHeight);
      scale = Math.min(scale, heightScale);
    }

    // Apply the calculated scale
    captionSplat.scale.setScalar(scale);

    // Center the text horizontally (x: 0)
    const x = 0;

    // Position vertically within bounds
    const scaledHeight = lines.length * lineHeight * scale;
    const halfHeight = scaledHeight / 2;

    let y = this.splatConfig.position.y;
    y = Math.max(
      this.frustumBounds.minY + halfHeight,
      Math.min(this.frustumBounds.maxY - halfHeight, y)
    );

    captionSplat.position.set(x, y, this.splatConfig.position.z);
  }

  /**
   * Create default caption element if none provided
   */
  createCaptionElement() {
    const caption = document.createElement("div");
    caption.id = "dialog-caption";
    caption.style.cssText = `
      position: fixed;
      bottom: 15%;
      left: 50%;
      transform: translateX(-50%);
      background: transparent;
      color: white;
      padding: 20px 40px;
      font-family: Arial, sans-serif;
      font-size: clamp(18px, 3vw, 28px);
      max-width: 90%;
      width: auto;
      text-align: center;
      display: none;
      z-index: 1000;
      pointer-events: none;
      line-height: 1.4;
      box-sizing: border-box;
      text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.9), 0 0 20px rgba(0, 0, 0, 0.7);
    `;
    document.body.appendChild(caption);
    return caption;
  }

  /**
   * Play a dialog sequence
   * @param {Object} dialogData - Dialog data object with audio and captions
   * @param {Function} onComplete - Optional callback when dialog finishes
   */
  playDialog(dialogData, onComplete = null) {
    // Check if this dialog has a delay
    const delay = dialogData.delay || 0;

    if (delay > 0) {
      // Schedule delayed playback
      this.scheduleDelayedDialog(dialogData, onComplete, delay);
      return;
    }

    // Play immediately
    this._playDialogImmediate(dialogData, onComplete);
  }

  /**
   * Schedule a dialog to play after a delay
   * @param {Object} dialogData - Dialog data object
   * @param {Function} onComplete - Optional callback
   * @param {number} delay - Delay in seconds
   * @private
   */
  scheduleDelayedDialog(dialogData, onComplete, delay) {
    // Don't schedule if already pending or playing
    if (this.pendingDialogs.has(dialogData.id)) {
      console.warn(
        `DialogManager: Dialog "${dialogData.id}" is already scheduled`
      );
      return;
    }

    if (this.isPlaying && this.currentDialog?.id === dialogData.id) {
      console.warn(
        `DialogManager: Dialog "${dialogData.id}" is already playing`
      );
      return;
    }

    console.log(
      `DialogManager: Scheduling dialog "${dialogData.id}" with ${delay}s delay`
    );

    this.pendingDialogs.set(dialogData.id, {
      dialogData,
      onComplete,
      timer: 0,
      delay,
    });
  }

  /**
   * Cancel a pending delayed dialog
   * @param {string} dialogId - Dialog ID to cancel
   */
  cancelDelayedDialog(dialogId) {
    if (this.pendingDialogs.has(dialogId)) {
      console.log(`DialogManager: Cancelled delayed dialog "${dialogId}"`);
      this.pendingDialogs.delete(dialogId);
    }
  }

  /**
   * Immediately play a dialog (internal method)
   * @param {Object} dialogData - Dialog data object
   * @param {Function} onComplete - Optional callback
   * @private
   */
  _playDialogImmediate(dialogData, onComplete) {
    if (this.isPlaying) {
      console.warn("DialogManager: Already playing dialog");
      return;
    }

    this.currentDialog = dialogData;
    this.onCompleteCallback = onComplete;
    this.captionQueue = dialogData.captions || [];
    this.captionIndex = 0;
    this.captionTimer = 0;
    this.isPlaying = true;

    // Load and play audio
    if (dialogData.audio) {
      this.currentAudio = new Howl({
        src: [dialogData.audio],
        volume: this.audioVolume,
        onend: () => {
          this.handleDialogComplete();
        },
        onloaderror: (id, error) => {
          console.error("DialogManager: Failed to load audio", error);
          this.handleDialogComplete();
        },
      });

      this.currentAudio.play();
    }

    // Start first caption if available
    if (this.captionQueue.length > 0) {
      this.showCaption(this.captionQueue[0]);
    }

    this.emit("dialog:play", dialogData);
  }

  /**
   * Stop current dialog
   */
  stopDialog() {
    if (this.currentAudio) {
      this.currentAudio.stop();
      this.currentAudio.unload();
      this.currentAudio = null;
    }

    this.hideCaption();
    this.isPlaying = false;
    this.currentDialog = null;
    this.captionQueue = [];
    this.captionIndex = 0;
    this.captionTimer = 0;

    this.emit("dialog:stop");
  }

  /**
   * Show a caption
   * @param {Object} caption - Caption object with text and duration
   */
  showCaption(caption) {
    if (this.useSplats) {
      // Remove existing splat if any
      if (this.captionSplat) {
        this.camera.remove(this.captionSplat);
        this.captionSplat = null;
      }

      // Create new text splat for caption
      this.captionSplat = textSplats({
        text: caption.text,
        font: this.splatConfig.font,
        fontSize: this.splatConfig.fontSize,
        color: this.splatConfig.color,
      });

      // Store text in userData for positioning calculations
      this.captionSplat.userData.text = caption.text;

      // Position with bounds checking and automatic scaling
      // This will set both position and scale
      this.positionCaptionWithinBounds(this.captionSplat);

      // Add to camera so it moves with view
      this.camera.add(this.captionSplat);
    } else {
      // HTML caption
      this.captionElement.textContent = caption.text;
      this.captionElement.style.display = "block";
    }

    this.captionTimer = 0;
    this.emit("dialog:caption", caption);
  }

  /**
   * Hide caption
   */
  hideCaption() {
    if (this.useSplats) {
      if (this.captionSplat) {
        this.camera.remove(this.captionSplat);
        this.captionSplat = null;
      }
    } else {
      this.captionElement.style.display = "none";
    }
  }

  /**
   * Handle dialog completion
   */
  handleDialogComplete() {
    this.hideCaption();
    this.isPlaying = false;

    const completedDialog = this.currentDialog;
    this.currentDialog = null;
    this.currentAudio = null;

    this.emit("dialog:complete", completedDialog);

    if (this.onCompleteCallback) {
      this.onCompleteCallback(completedDialog);
      this.onCompleteCallback = null;
    }
  }

  /**
   * Update method - call in animation loop
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // Update pending delayed dialogs
    if (this.pendingDialogs.size > 0) {
      for (const [dialogId, pending] of this.pendingDialogs) {
        pending.timer += dt;

        // Check if delay has elapsed and no dialog is currently playing
        if (pending.timer >= pending.delay && !this.isPlaying) {
          console.log(`DialogManager: Playing delayed dialog "${dialogId}"`);
          this.pendingDialogs.delete(dialogId);
          this._playDialogImmediate(pending.dialogData, pending.onComplete);
          break; // Only play one dialog per frame
        }
      }
    }

    // Update current dialog captions
    if (!this.isPlaying || this.captionQueue.length === 0) {
      return;
    }

    this.captionTimer += dt;

    const currentCaption = this.captionQueue[this.captionIndex];
    if (currentCaption && this.captionTimer >= currentCaption.duration) {
      // Move to next caption
      this.captionIndex++;

      if (this.captionIndex < this.captionQueue.length) {
        this.showCaption(this.captionQueue[this.captionIndex]);
      } else {
        // No more captions - hide the last one
        this.hideCaption();
      }
    }
  }

  /**
   * Set caption styling
   * @param {Object} styles - CSS style object
   */
  setCaptionStyle(styles) {
    Object.assign(this.captionElement.style, styles);
  }

  /**
   * Apply default caption styling
   */
  applyDefaultCaptionStyle() {
    this.setCaptionStyle({
      fontFamily: "LePorsche, Arial, sans-serif",
      fontSize: "28px",
      background: "transparent",
      padding: "20px 40px",
      color: "#ffffff",
      textShadow: "2px 2px 8px rgba(0, 0, 0, 0.9), 0 0 20px rgba(0, 0, 0, 0.7)",
      maxWidth: "90%",
      lineHeight: "1.4",
    });
  }

  /**
   * Set audio volume
   * @param {number} volume - Volume level (0-1)
   */
  setVolume(volume) {
    const clamped = Math.max(0, Math.min(1, volume));
    this.baseVolume = clamped;
    this.updateVolume();
  }

  /**
   * Update volume based on SFX manager
   */
  updateVolume() {
    if (this.sfxManager) {
      this.audioVolume = this.baseVolume * this.sfxManager.getMasterVolume();
    } else {
      this.audioVolume = this.baseVolume;
    }

    if (this.currentAudio) {
      this.currentAudio.volume(this.audioVolume);
    }
  }

  /**
   * Check if dialog is currently playing
   * @returns {boolean}
   */
  isDialogPlaying() {
    return this.isPlaying;
  }

  /**
   * Check if a dialog is pending (scheduled with delay)
   * @param {string} dialogId - Dialog ID to check
   * @returns {boolean}
   */
  isDialogPending(dialogId) {
    return this.pendingDialogs.has(dialogId);
  }

  /**
   * Check if any dialog is pending
   * @returns {boolean}
   */
  hasDialogsPending() {
    return this.pendingDialogs.size > 0;
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {function} callback - Callback function
   */
  on(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {function} callback - Callback function
   */
  off(event, callback) {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event].indexOf(callback);
      if (index > -1) {
        this.eventListeners[event].splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {...any} args - Arguments to pass to callbacks
   */
  emit(event, ...args) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach((callback) => callback(...args));
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopDialog();

    // Clear pending dialogs
    this.pendingDialogs.clear();

    // Remove resize listener
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }

    if (this.useSplats && this.captionSplat) {
      this.camera.remove(this.captionSplat);
      this.captionSplat = null;
    }

    if (this.captionElement && this.captionElement.parentNode) {
      this.captionElement.parentNode.removeChild(this.captionElement);
    }

    this.eventListeners = {};
  }
}

export default DialogManager;
