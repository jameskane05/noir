import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SplatMesh, SparkRenderer, SparkControls } from "@sparkjsdev/spark";
import { getAssetFileURL } from "/src/getAssetUrl.js";
import { LightingSystem } from "/src/lights.js";
import PhysicsManager from "./physicsManager.js";
import CharacterController from "./characterController.js";
import MusicManager from "./musicManager.js";
import SFXManager from "./sfxManager.js";
import OptionsMenu from "./optionsMenu.js";
import DialogManager from "./dialogManager.js";
import GameManager from "./gameManager.js";
import UIManager from "./uiManager.js";
import { dialogSequences } from "./dialogData.js";
import { createAnimatedTextSplat } from "./textSplat.js";
import { TitleSequence } from "./titleSequence.js";
import { IntroSequence } from "./introSequence.js";
import "./optionsMenu.css";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 5, 0);
scene.add(camera); // Add camera to scene so its children render

const renderer = new THREE.WebGLRenderer();
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

// Load and add the SplatMesh
const splatURL = await getAssetFileURL("street.ply");
const factory = new SplatMesh({ url: splatURL });
factory.quaternion.set(1, 0, 0, 0);
factory.position.set(0, 0, 0);
factory.scale.set(5, 5, 5);
scene.add(factory);

// Wait for environment to load
await factory.initialized;

// Removed visible floor mesh; physics floor exists via Rapier collider

// Initialize the physics manager
const physicsManager = new PhysicsManager();

// Create character rigid body (capsule)
// Capsule: halfHeight=0.5, radius=0.3, center to bottom = 0.8
// Floor top at Y=0.1, so character center at Y=0.9 to rest on ground
// Camera will be at Y=0.9+1.6=2.5
const character = physicsManager.createCharacter(
  { x: 10, y: 0.9, z: 15 },
  { x: 0, y: -120, z: 0 }
);
// Removed visual mesh for character;

// Initialize SFX manager
const sfxManager = new SFXManager({ masterVolume: 0.5 });

// Initialize character controller (will be disabled until intro completes)
const characterController = new CharacterController(
  character,
  camera,
  renderer,
  sfxManager
);

// Make character controller globally accessible for options menu
window.characterController = characterController;

let characterControllerEnabled = false;

// Initialize lighting system
const lightingSystem = new LightingSystem(scene);

// Initialize game manager (central coordination)
const gameManager = new GameManager();

// Initialize UI manager (manages all UI elements and z-index)
const uiManager = new UIManager(gameManager);

// Initialize music manager
const musicManager = new MusicManager({ defaultVolume: 0.6 });
musicManager.addTrack("rach1", "./audio/music/rach 3 - mv 1 - 0-40.mp3");
musicManager.addTrack("rach2", "./audio/music/rach 3 - mv 2 - 1-00.mp3");

// Track which music is currently playing for toggling
let currentMusicTrack = "rach1";

// Initialize options menu
const optionsMenu = new OptionsMenu({
  musicManager: musicManager,
  sfxManager: sfxManager,
  gameManager: gameManager,
  uiManager: uiManager,
  sparkRenderer: spark,
});

// Initialize intro sequence
const introSequence = new IntroSequence(camera, {
  circleCenter: new THREE.Vector3(0, 0, 0), // Center point of the circular path
  circleRadius: 8,
  circleHeight: 18,
  circleSpeed: 0.3,
  targetPosition: new THREE.Vector3(10, 2.5, 15), // Match character Y (0.9) + cameraHeight (1.6)
  targetRotation: { yaw: THREE.MathUtils.degToRad(-230), pitch: 0 },
  transitionDuration: 8.0,
  uiManager: uiManager,
});

// Start second track during intro camera animation
musicManager.changeMusic("rach2", 2.0);
currentMusicTrack = "rach2";

// Initialize dialog manager with HTML captions
const dialogManager = new DialogManager({
  audioVolume: 0.8,
  useSplats: false, // Use HTML instead of text splats
});

// Style the HTML captions
dialogManager.setCaptionStyle({
  fontFamily: "LePorsche, Arial, sans-serif",
  fontSize: "28px",
  background: "transparent",
  padding: "20px 40px",
  color: "#ffffff",
  textShadow: "2px 2px 8px rgba(0, 0, 0, 0.9), 0 0 20px rgba(0, 0, 0, 0.7)",
  maxWidth: "90%",
  lineHeight: "1.4",
});

// Initialize gameManager with all managers
gameManager.initialize({
  dialogManager: dialogManager,
  musicManager: musicManager,
  sfxManager: sfxManager,
  uiManager: uiManager,
});

// Global escape key handler for options menu (only works when game is active, not during intro)
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !introSequence.isActive) {
    e.preventDefault();
    optionsMenu.toggle();
  }
});

// Create first text splat
const textSplat1 = createAnimatedTextSplat(scene, {
  text: "THE SHADOW\nof the Czar",
  font: "LePorsche",
  fontSize: 120,
  color: new THREE.Color(0xffffff), // White
  position: { x: 0, y: 0, z: -10 }, // Base position for animation
  scale: 1.0 / 80,
  animate: true,
});
scene.remove(textSplat1.mesh);
camera.add(textSplat1.mesh);
textSplat1.mesh.userData.baseScale = 1.0 / 80;
textSplat1.mesh.visible = false; // Hide initially

// Create second text splat (positioned below first)
const textSplat2 = createAnimatedTextSplat(scene, {
  text: "by JAMES C. KANE",
  font: "LePorsche",
  fontSize: 30,
  color: new THREE.Color(0xffffff), // White
  position: { x: 0, y: -1.8, z: -10 }, // Base position lower for animation
  scale: 1.0 / 80,
  animate: true,
});
scene.remove(textSplat2.mesh);
camera.add(textSplat2.mesh);
textSplat2.mesh.userData.baseScale = 1.0 / 80;
textSplat2.mesh.visible = false; // Hide initially

// Title sequence (will start when intro button is clicked)
let titleSequence = null;
let sequenceStarted = false;
let introDialogTriggered = false;
let introStartTriggered = false;

// Monitor intro sequence for start
const checkIntroStart = () => {
  if (introSequence.hasStarted && !introStartTriggered) {
    introStartTriggered = true;

    // Delay title sequence and music by 1 second
    setTimeout(() => {
      // Make text visible before starting sequence
      textSplat1.mesh.visible = true;
      textSplat2.mesh.visible = true;

      titleSequence = new TitleSequence([textSplat1, textSplat2], {
        introDuration: 5.0,
        staggerDelay: 2.0,
        holdDuration: 4.0,
        outroDuration: 2.0,
        disperseDistance: 5.0,
      });
      sequenceStarted = true;

      // Rapidly crossfade from rach2 to rach1
      musicManager.changeMusic("rach1", 1.0);
      currentMusicTrack = "rach1";
    }, 1000);
  }
};

// Add O key listener to toggle music tracks
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "o") {
    // Toggle between tracks with 2 second crossfade
    if (currentMusicTrack === "rach1") {
      musicManager.changeMusic("rach2", 2.0);
      currentMusicTrack = "rach2";
      console.log("Switching to Rachmaninoff 3 - Movement 2");
    } else {
      musicManager.changeMusic("rach1", 2.0);
      currentMusicTrack = "rach1";
      console.log("Switching to Rachmaninoff 3 - Movement 1");
    }
  }
});

let lastTime;
renderer.setAnimationLoop(function animate(time) {
  const t = time * 0.001;
  const dt = Math.min(0.033, t - (lastTime ?? t));
  lastTime = t;

  // Update intro sequence (camera animation and transition)
  if (introSequence.isActive) {
    introSequence.update(dt);
    checkIntroStart(); // Check if start button was clicked

    // Enable character controller when intro is complete
    if (introSequence.isComplete() && !characterControllerEnabled) {
      characterControllerEnabled = true;
      console.log("Intro complete, enabling character controller");
    }
  }

  // Don't update game logic if options menu is open or intro is active
  if (!optionsMenu.isOpen && !introSequence.isActive) {
    // Update character controller (handles input, physics, camera, headbob)
    if (characterControllerEnabled) {
      characterController.update(dt);
    }

    // Physics step
    physicsManager.step();
  }

  // Update title sequence (pass dt in seconds)
  if (titleSequence) {
    titleSequence.update(dt);

    // Check if title sequence is complete and trigger intro dialog
    if (titleSequence.isComplete() && !introDialogTriggered) {
      introDialogTriggered = true;
      console.log("Title sequence complete, starting intro dialog...");
      dialogManager.playDialog(dialogSequences.intro);
    }
  }

  // Always update music manager (handles fades)
  musicManager.update(dt);

  // Always update dialog manager (handles caption timing)
  dialogManager.update(dt);

  // Update lighting
  lightingSystem.updateFlickering(t);

  renderer.render(scene, camera);
});
