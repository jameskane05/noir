import * as THREE from "three";

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

    // Headbob state
    this.headbobTime = 0;
    this.headbobIntensity = 0;

    // Audio
    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener);
    this.footstepSound = null;
    this.isPlayingFootsteps = false;

    // Settings
    this.baseSpeed = 5.0;
    this.sprintMultiplier = 2.0;
    this.cameraHeight = 1.6;
    this.mouseSensitivity = 0.0025;
    this.cameraSmoothingFactor = 0.15;

    this.setupInputListeners();
    this.loadFootstepAudio();
  }

  loadFootstepAudio() {
    const audioLoader = new THREE.AudioLoader();

    audioLoader.load(
      "./audio/sfx/gravel-steps.ogg",
      (buffer) => {
        this.footstepSound = new THREE.Audio(this.audioListener);
        this.footstepSound.setBuffer(buffer);
        this.footstepSound.setLoop(true);
        this.footstepSound.setVolume(0.5);

        // Register with SFX manager if available
        if (this.sfxManager) {
          this.sfxManager.registerSound("footsteps", this.footstepSound, 0.5);
        }

        console.log("Footstep audio loaded successfully");
      },
      undefined,
      (error) => {
        console.warn("Failed to load footstep audio:", error);
      }
    );
  }

  setupInputListeners() {
    // Keyboard input
    window.addEventListener("keydown", (event) => {
      const k = event.key.toLowerCase();
      if (k in this.keys) this.keys[k] = true;
      if (event.key === "Shift") this.keys.shift = true;
    });

    window.addEventListener("keyup", (event) => {
      const k = event.key.toLowerCase();
      if (k in this.keys) this.keys[k] = false;
      if (event.key === "Shift") this.keys.shift = false;
    });

    // Pointer lock + mouse look
    this.renderer.domElement.addEventListener("click", () => {
      this.renderer.domElement.requestPointerLock();
    });

    document.addEventListener("mousemove", (event) => {
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

  calculateHeadbob(isSprinting) {
    // Different parameters for walking vs sprinting
    const walkFrequency = 2.2; // Steps per second
    const sprintFrequency = 3.5;
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
    // Smooth camera rotation to reduce jitter
    this.yaw += (this.targetYaw - this.yaw) * this.cameraSmoothingFactor;
    this.pitch += (this.targetPitch - this.pitch) * this.cameraSmoothingFactor;

    // Input -> desired velocity in XZ plane
    const { forward, right } = this.getForwardRightVectors();
    const moveSpeed = this.keys.shift
      ? this.baseSpeed * this.sprintMultiplier
      : this.baseSpeed;
    const desired = new THREE.Vector3();
    if (this.keys.w) desired.add(forward);
    if (this.keys.s) desired.sub(forward);
    if (this.keys.a) desired.sub(right);
    if (this.keys.d) desired.add(right);
    const isMoving = desired.lengthSq() > 1e-6;
    if (isMoving) desired.normalize().multiplyScalar(moveSpeed);

    // Apply velocity: preserve current Y velocity (gravity)
    const linvel = this.character.linvel();
    this.character.setLinvel({ x: desired.x, y: linvel.y, z: desired.z }, true);

    // Update headbob state
    const targetIntensity = isMoving ? 1.0 : 0.0;
    this.headbobIntensity += (targetIntensity - this.headbobIntensity) * 0.15; // Smooth transition
    if (isMoving) {
      this.headbobTime += dt; // Accumulate time only when moving
    }

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
        this.footstepSound.setPlaybackRate(playbackRate);
      }
    }

    // Calculate headbob offset
    const headbob = this.calculateHeadbob(this.keys.shift);
    const { forward: fwd, right: rgt } = this.getForwardRightVectors();

    // Sync camera to physics body position
    const p = this.character.translation();

    // Camera follow: position slightly behind and above the character with headbob
    const cameraOffset = new THREE.Vector3(0, this.cameraHeight, 0);
    const camFollow = new THREE.Vector3(p.x, p.y, p.z).add(cameraOffset);

    // Apply headbob: vertical (Y) and horizontal (side-to-side relative to view direction)
    camFollow.y += headbob.vertical;
    camFollow.add(rgt.clone().multiplyScalar(headbob.horizontal));

    this.camera.position.copy(camFollow);

    // Build look direction from yaw/pitch
    const lookDir = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(this.pitch, this.yaw, 0, "YXZ")
    );
    const lookTarget = new THREE.Vector3()
      .copy(this.camera.position)
      .add(lookDir);
    this.camera.lookAt(lookTarget);
  }
}

export default CharacterController;
