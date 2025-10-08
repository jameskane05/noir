import * as THREE from "three";
import { SparkRenderer, SparkControls } from "@sparkjsdev/spark";
import { Howl, Howler } from "howler";
//import { LightingSystem } from "/src/lights.js";
import PhysicsManager from "./physicsManager.js";
import CharacterController from "./characterController.js";
import InputManager from "./inputManager.js";
import MusicManager from "./musicManager.js";
import SFXManager from "./sfxManager.js";
import LightManager from "./lightManager.js";
import OptionsMenu from "./ui/optionsMenu.js";
import DialogManager from "./dialogManager.js";
import DialogChoiceUI from "./ui/dialogChoiceUI.js";
import GameManager from "./gameManager.js";
import UIManager from "./uiManager.js";
import ColliderManager from "./colliderManager.js";
import SceneManager from "./sceneManager.js";
import colliders from "./colliderData.js";
import { musicTracks } from "./musicData.js";
import { sceneObjects } from "./sceneData.js";
import { createAnimatedTextSplat } from "./textSplat.js";
import { TitleSequence } from "./titleSequence.js";
import { StartScreen } from "./startScreen.js";
import { GAME_STATES } from "./gameData.js";
import CameraAnimationManager from "./cameraAnimationManager.js";
import cameraAnimations from "./cameraAnimationData.js";
import { IdleHelper } from "./ui/idleHelper.js";
import "./styles/optionsMenu.css";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(0, 5, 0);
scene.add(camera); // Add camera to scene so its children render

const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Handle window resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Create a SparkRenderer with depth of field effect
const apertureSize = 0.01; // Very small aperture for subtle DoF
const focalDistance = 6.0;
const apertureAngle = 2 * Math.atan((0.5 * apertureSize) / focalDistance);

const spark = new SparkRenderer({
  renderer,
  apertureAngle: apertureAngle,
  focalDistance: focalDistance,
});
scene.add(spark);

// Initialize scene manager (objects will be loaded by gameManager based on state)
const sceneManager = new SceneManager(scene);

// Make scene manager globally accessible for mesh lookups
window.sceneManager = sceneManager;

// Initialize light manager
const lightManager = new LightManager(scene);

// Add standard scene lighting
lightManager.createAmbientLight({
  id: "ambient",
  color: 0xffffff,
  intensity: 0.5,
});

lightManager.createDirectionalLight({
  id: "main-directional",
  color: 0xffffff,
  intensity: 0.8,
  position: [10, 20, 10],
  castShadow: true,
});

console.log("Scene lighting initialized");

// Initialize the physics manager
const physicsManager = new PhysicsManager();

// Initialize game manager early to check for debug spawn
const gameManager = new GameManager();

// Create character rigid body (capsule)
// Capsule: halfHeight=0.5, radius=0.3, center to bottom = 0.8
// Floor top at Y=0.1, so character center at Y=0.9 to rest on ground
// Camera will be at Y=0.9+1.6=2.5
// Use debug spawn position if available, otherwise default
const spawnPos = gameManager.getDebugSpawnPosition() || {
  x: 10,
  y: 0.9,
  z: 15,
};
const character = physicsManager.createCharacter(spawnPos, {
  x: 0,
  y: -120,
  z: 0,
});
// Removed visual mesh for character;

// Initialize SFX manager (pass lightManager for audio-reactive lights)
const sfxManager = new SFXManager({
  masterVolume: 0.5,
  lightManager: lightManager,
});

// Initialize input manager (handles keyboard, mouse, and gamepad)
const inputManager = new InputManager(renderer.domElement);

// Initialize character controller (will be disabled until intro completes)
const characterController = new CharacterController(
  character,
  camera,
  renderer,
  inputManager,
  sfxManager,
  spark // Pass spark renderer for DoF control
);

// Register SFX from data
import { sfxSounds } from "./sfxData.js";
sfxManager._data = sfxSounds; // Keep a reference to definitions for state-based autoplay/stop
sfxManager.registerSoundsFromData(sfxSounds);

// Make character controller and input manager globally accessible for options menu
window.characterController = characterController;
window.inputManager = inputManager;

// Initialize camera animation manager now that all dependencies exist
const cameraAnimationManager = new CameraAnimationManager(
  camera,
  characterController,
  gameManager
);

// Load camera animations from data
cameraAnimationManager.loadAnimationsFromData(cameraAnimations);

// Make it globally accessible for debugging/scripting
window.cameraAnimationManager = cameraAnimationManager;

// Initialize lighting system
//const lightingSystem = new LightingSystem(scene);

// Initialize UI manager (manages all UI elements and z-index)
const uiManager = new UIManager(gameManager);

// Initialize music manager and load tracks from musicData
const musicManager = new MusicManager({ defaultVolume: 0.6 });
Object.values(musicTracks).forEach((track) => {
  musicManager.addTrack(track.id, track.path);
});

// Initialize options menu
const optionsMenu = new OptionsMenu({
  musicManager: musicManager,
  sfxManager: sfxManager,
  gameManager: gameManager,
  uiManager: uiManager,
  sparkRenderer: spark,
  characterController: characterController,
});

// Initialize start screen only if we're in START_SCREEN state
let startScreen = null;
if (gameManager.state.currentState === GAME_STATES.START_SCREEN) {
  startScreen = new StartScreen(camera, scene, {
    circleCenter: new THREE.Vector3(12, 0, 5), // Center point of the circular path
    circleRadius: 12,
    circleHeight: 8,
    circleSpeed: 0.05,
    targetPosition: new THREE.Vector3(10, 2.5, 15), // Match character Y (0.9) + cameraHeight (1.6)
    targetRotation: { yaw: THREE.MathUtils.degToRad(-230), pitch: 0 },
    transitionDuration: 8.0,
    uiManager: uiManager,
  });
}

// Initialize dialog choice UI
const dialogChoiceUI = new DialogChoiceUI({
  gameManager: gameManager,
  sfxManager: sfxManager,
});

// Initialize dialog manager with HTML captions
const dialogManager = new DialogManager({
  audioVolume: 1.0,
  useSplats: false, // Use HTML instead of text splats
  sfxManager: sfxManager, // Link to SFX manager for volume control
  gameManager: gameManager, // Link to game manager for state updates
  dialogChoiceUI: dialogChoiceUI, // Link to dialog choice UI
});

// Link dialog manager to choice UI
dialogChoiceUI.dialogManager = dialogManager;

// Register dialog manager with SFX manager
sfxManager.registerDialogManager(dialogManager);

// Register dialog volume control with SFX manager
if (sfxManager && dialogManager) {
  // Create a proxy object that implements the setVolume interface
  const dialogVolumeControl = {
    setVolume: (volume) => {
      dialogManager.setVolume(volume);
    },
  };
  // Boost dialog base volume so it is louder relative to SFX master
  sfxManager.registerSound("dialog", dialogVolumeControl, 2.0);
}

// Initialize gameManager with all managers (async - loads initial scene objects)
await gameManager.initialize({
  dialogManager: dialogManager,
  musicManager: musicManager,
  sfxManager: sfxManager,
  uiManager: uiManager,
  characterController: characterController,
  cameraAnimationManager: cameraAnimationManager,
  sceneManager: sceneManager,
  lightManager: lightManager,
  physicsManager: physicsManager,
  scene: scene,
  camera: camera,
});

// Listen for character controller enable/disable to show/hide touch controls
gameManager.on("character-controller:enabled", () => {
  inputManager.showTouchControls();
});

gameManager.on("character-controller:disabled", () => {
  inputManager.hideTouchControls();
});

// Initialize collider manager with scene and sceneManager references
const colliderManager = new ColliderManager(
  physicsManager,
  gameManager,
  colliders,
  scene,
  sceneManager
);

// Make collider manager globally accessible for debugging
window.colliderManager = colliderManager;

// Initialize idle helper (shows WASD controls when player is idle)
const idleHelper = new IdleHelper(
  dialogManager,
  cameraAnimationManager,
  dialogChoiceUI,
  gameManager,
  inputManager
);

// Wire up idle helper to character controller for glance system
characterController.setIdleHelper(idleHelper);

// Global escape key handler for options menu (only works when game is active, not during intro)
// Track ESC key press time to distinguish between quick press (menu) and held (exit fullscreen)
let escapeKeyDownTime = null;

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (!startScreen || !startScreen.isActive)) {
    // Record when ESC was first pressed (ignore repeat events)
    if (!e.repeat && escapeKeyDownTime === null) {
      escapeKeyDownTime = Date.now();
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.key === "Escape" && (!startScreen || !startScreen.isActive)) {
    e.preventDefault();

    // Only toggle menu if ESC was pressed for less than 200ms (short press)
    if (escapeKeyDownTime !== null) {
      const pressDuration = Date.now() - escapeKeyDownTime;

      if (pressDuration < 200) {
        optionsMenu.toggle();
      }

      escapeKeyDownTime = null;
    }
  }
});

let lastTime;
renderer.setAnimationLoop(function animate(time) {
  const t = time * 0.001;
  const dt = Math.min(0.033, t - (lastTime ?? t));
  lastTime = t;

  // Update start screen (camera animation and transition)
  if (startScreen && startScreen.isActive) {
    startScreen.update(dt);
    startScreen.checkIntroStart(null, sfxManager, gameManager);
  }

  // Don't update game logic if options menu is open or start screen is active
  if (!optionsMenu.isOpen && (!startScreen || !startScreen.isActive)) {
    // Update input manager (gamepad state)
    inputManager.update(dt);

    // Update camera animation manager
    cameraAnimationManager.update(dt);

    // Update character controller (handles input, physics, camera, headbob)
    if (gameManager.isControlEnabled() && !cameraAnimationManager.playing) {
      characterController.update(dt);
    }

    // Physics step
    physicsManager.step();

    // Update collider manager (check for trigger intersections)
    if (gameManager.isControlEnabled()) {
      colliderManager.update(character);
    }

    // Update video manager (billboard to camera, frame updates)
    if (gameManager.videoManager) {
      gameManager.videoManager.update(dt);
    }

    // Update Howler listener position for spatial audio
    Howler.pos(camera.position.x, camera.position.y, camera.position.z);

    // Update Howler listener orientation (forward and up vectors)
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    Howler.orientation(
      cameraDirection.x,
      cameraDirection.y,
      cameraDirection.z,
      camera.up.x,
      camera.up.y,
      camera.up.z
    );
  }

  // Update title sequence (pass dt in seconds)
  const titleSequence = startScreen ? startScreen.getTitleSequence() : null;
  if (titleSequence) {
    titleSequence.update(dt);

    // Enable character controller when the title outro begins
    if (!gameManager.isControlEnabled() && titleSequence.hasOutroStarted()) {
      gameManager.setState({ controlEnabled: true });
    }
  }

  // Always update music manager (handles fades)
  musicManager.update(dt);

  // Always update dialog manager (handles caption timing)
  dialogManager.update(dt);

  // Always update scene manager (handles GLTF animations)
  sceneManager.update(dt);

  // Always update game manager (handles receiver lerp, etc.)
  gameManager.update(dt);

  // Always update audio-reactive lights
  lightManager.updateReactiveLights(dt);

  // Update lighting
  //lightingSystem.updateFlickering(t);

  renderer.render(scene, camera);
});
