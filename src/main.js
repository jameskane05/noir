import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SplatMesh, SparkRenderer, SparkControls } from "@sparkjsdev/spark";
//import { LightingSystem } from "/src/lights.js";
import PhysicsManager from "./physicsManager.js";
import CharacterController from "./characterController.js";
import MusicManager from "./musicManager.js";
import SFXManager from "./sfxManager.js";
import OptionsMenu from "./optionsMenu.js";
import DialogManager from "./dialogManager.js";
import GameManager from "./gameManager.js";
import UIManager from "./uiManager.js";
import ColliderSystem from "./colliderSystem.js";
import { dialogSequences } from "./dialogData.js";
import colliders from "./colliderData.js";
import { createAnimatedTextSplat } from "./textSplat.js";
import { TitleSequence } from "./titleSequence.js";
import { IntroSequence } from "./introSequence.js";
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
const factory = new SplatMesh({ url: "/exterior-test.ply" });
factory.quaternion.set(1, 0, 0, 0);
factory.position.set(0, 0, 0);
factory.scale.set(5, 5, 5);
scene.add(factory);

// Wait for environment to load
await factory.initialized;

// Load phonebooth GLTF model
const gltfLoader = new GLTFLoader();
gltfLoader.load(
  "/gltf/phonebooth.glb",
  (gltf) => {
    const phonebooth = gltf.scene;

    // Traverse all children and ensure they inherit scale properly
    phonebooth.traverse((child) => {
      if (child.isMesh) {
        // Ensure materials are visible
        if (child.material) {
          child.material.needsUpdate = true;
        }
      }
    });

    // Create a container group for proper scaling
    const phoneboothContainer = new THREE.Group();
    phoneboothContainer.add(phonebooth);
    phoneboothContainer.position.set(10, -1.65, 35);
    phoneboothContainer.rotation.set(0, Math.PI / 2, 0);
    phoneboothContainer.scale.set(2.75, 2.75, 2.75);

    scene.add(phoneboothContainer);
    console.log("Phonebooth loaded successfully");
  },
  undefined,
  (error) => {
    console.error("Error loading phonebooth:", error);
  }
);

// Removed visible floor mesh; physics floor exists via Rapier collider

// Add lighting for standard meshes
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft white ambient light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Main directional light
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Optional: Add a subtle fill light from the opposite direction
const fillLight = new THREE.DirectionalLight(0x4466ff, 0.3); // Blueish fill
fillLight.position.set(-10, 10, -10);
scene.add(fillLight);

console.log("Scene lighting initialized");

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

// Load city ambiance audio (use character controller's audio listener)
const audioLoader = new THREE.AudioLoader();
let cityAmbianceSound = null;
let cityAmbianceLoaded = false;
audioLoader.load(
  "/audio/sfx/city-ambiance.mp3",
  (buffer) => {
    cityAmbianceSound = new THREE.Audio(characterController.audioListener);
    cityAmbianceSound.setBuffer(buffer);
    cityAmbianceSound.setLoop(true);
    cityAmbianceSound.setVolume(1.0); // Base volume

    // Register with SFX manager
    sfxManager.registerSound("city-ambiance", cityAmbianceSound, 1.0);

    cityAmbianceLoaded = true;

    // Attempt immediate autoplay (like music does)
    if (characterController.audioListener.context.state === "suspended") {
      characterController.audioListener.context
        .resume()
        .then(() => {
          cityAmbianceSound.play();
          console.log(
            "City ambiance started immediately (autoplay successful)"
          );
        })
        .catch(() => {
          console.log(
            "City ambiance autoplay blocked, waiting for user interaction"
          );
        });
    } else {
      cityAmbianceSound.play();
      console.log("City ambiance started immediately");
    }
  },
  undefined,
  (error) => {
    console.warn("Failed to load city ambiance audio:", error);
  }
);

// Fallback: Start city ambiance on first user interaction if autoplay failed
const startCityAmbianceOnInteraction = () => {
  if (cityAmbianceLoaded && cityAmbianceSound && !cityAmbianceSound.isPlaying) {
    if (characterController.audioListener.context.state === "suspended") {
      characterController.audioListener.context.resume().then(() => {
        cityAmbianceSound.play();
        console.log("City ambiance started (user interaction fallback)");
      });
    } else {
      cityAmbianceSound.play();
      console.log("City ambiance started (user interaction fallback)");
    }
    // Remove listener after first play
    document.removeEventListener("click", startCityAmbianceOnInteraction);
  }
};
document.addEventListener("click", startCityAmbianceOnInteraction);

// Make character controller globally accessible for options menu
window.characterController = characterController;

let characterControllerEnabled = false;

// Initialize lighting system
//const lightingSystem = new LightingSystem(scene);

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

// Check if we should skip intro based on URL params
const skipIntro = gameManager.shouldSkipIntro();

// Initialize intro sequence (only if not skipping)
let introSequence = null;
if (!skipIntro) {
  introSequence = new IntroSequence(camera, {
    circleCenter: new THREE.Vector3(12, 0, 5), // Center point of the circular path
    circleRadius: 12,
    circleHeight: 8,
    circleSpeed: 0.05,
    targetPosition: new THREE.Vector3(10, 2.5, 15), // Match character Y (0.9) + cameraHeight (1.6)
    targetRotation: { yaw: THREE.MathUtils.degToRad(-230), pitch: 0 },
    transitionDuration: 8.0,
    uiManager: uiManager,
  });

  // Start second track during intro camera animation
  musicManager.changeMusic("rach2", 2.0);
  currentMusicTrack = "rach2";
} else {
  // Skip intro - start first track immediately
  musicManager.changeMusic("rach1", 0);
  currentMusicTrack = "rach1";

  // Enable character controller immediately
  characterControllerEnabled = true;
  characterController.headbobEnabled = true;

  console.log("Skipping intro sequence - starting at spawn");
}

// Initialize dialog manager with HTML captions
const dialogManager = new DialogManager({
  audioVolume: 1.0,
  useSplats: false, // Use HTML instead of text splats
  sfxManager: sfxManager, // Link to SFX manager for volume control
});

// Register dialog manager with SFX manager
sfxManager.registerDialogManager(dialogManager);

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

// Register dialog manager with SFX manager
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

// Initialize gameManager with all managers
gameManager.initialize({
  dialogManager: dialogManager,
  musicManager: musicManager,
  sfxManager: sfxManager,
  uiManager: uiManager,
});

// Set up event listener to stop city ambiance
gameManager.on("stop-city-ambiance", () => {
  if (cityAmbianceSound && cityAmbianceSound.isPlaying) {
    cityAmbianceSound.stop();
    console.log("City ambiance stopped");
  }
});

// Set up event listener to start city ambiance
gameManager.on("start-city-ambiance", () => {
  if (cityAmbianceSound && !cityAmbianceSound.isPlaying) {
    // Resume audio context if suspended
    if (characterController.audioListener.context.state === "suspended") {
      characterController.audioListener.context.resume().then(() => {
        cityAmbianceSound.play();
        console.log("City ambiance started (audio context resumed)");
      });
    } else {
      cityAmbianceSound.play();
      console.log("City ambiance started");
    }
  }
});

// Initialize collider system
const colliderSystem = new ColliderSystem(
  physicsManager,
  gameManager,
  colliders
);

// Make collider system globally accessible for debugging
window.colliderSystem = colliderSystem;

// Create debug visualization meshes for colliders
const debugColliderMeshes = [];
colliders.forEach((colliderData) => {
  if (!colliderData.enabled) return;

  let geometry;
  switch (colliderData.type) {
    case "box":
      geometry = new THREE.BoxGeometry(
        colliderData.dimensions.x * 2,
        colliderData.dimensions.y * 2,
        colliderData.dimensions.z * 2
      );
      break;
    case "sphere":
      geometry = new THREE.SphereGeometry(
        colliderData.dimensions.radius,
        16,
        16
      );
      break;
    case "capsule":
      geometry = new THREE.CapsuleGeometry(
        colliderData.dimensions.radius,
        colliderData.dimensions.halfHeight * 2,
        8,
        16
      );
      break;
  }

  if (geometry) {
    // Semi-transparent debug material
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      wireframe: false,
    });
    const mesh = new THREE.Mesh(geometry, material);

    // Apply position
    mesh.position.set(
      colliderData.position.x,
      colliderData.position.y,
      colliderData.position.z
    );

    // Apply rotation (convert degrees to radians)
    mesh.rotation.set(
      THREE.MathUtils.degToRad(colliderData.rotation.x),
      THREE.MathUtils.degToRad(colliderData.rotation.y),
      THREE.MathUtils.degToRad(colliderData.rotation.z)
    );

    scene.add(mesh);
    debugColliderMeshes.push(mesh);
    console.log(`Added debug mesh for collider: ${colliderData.id}`);
  }
});

// Global escape key handler for options menu (only works when game is active, not during intro)
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (!introSequence || !introSequence.isActive)) {
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
  if (!introSequence) return; // Skip if no intro sequence

  if (introSequence.hasStarted && !introStartTriggered) {
    introStartTriggered = true;

    // Start city ambiance on first user interaction (button click)
    if (
      cityAmbianceLoaded &&
      cityAmbianceSound &&
      !cityAmbianceSound.isPlaying
    ) {
      // Resume audio context (user interaction unlocks it)
      if (characterController.audioListener.context.state === "suspended") {
        characterController.audioListener.context.resume().then(() => {
          cityAmbianceSound.play();
          console.log(
            "City ambiance started (audio context unlocked by user interaction)"
          );
        });
      } else {
        cityAmbianceSound.play();
        console.log("City ambiance started");
      }
    }

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
    musicManager.changeMusic("rach1", 0.25);
    currentMusicTrack = "rach1";
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

  // Test camera look-at with P key
  if (event.key.toLowerCase() === "p" && characterControllerEnabled) {
    const testPosition = new THREE.Vector3(10, 5, -20);
    characterController.lookAt(testPosition, 2.0, () => {
      console.log("Look-at test complete, restoring control");
      characterController.inputDisabled = false;
    });
  }
});

let lastTime;
renderer.setAnimationLoop(function animate(time) {
  const t = time * 0.001;
  const dt = Math.min(0.033, t - (lastTime ?? t));
  lastTime = t;

  // Update intro sequence (camera animation and transition)
  if (introSequence && introSequence.isActive) {
    introSequence.update(dt);
    checkIntroStart(); // Check if start button was clicked
  }

  // Don't update game logic if options menu is open or intro is active
  if (!optionsMenu.isOpen && (!introSequence || !introSequence.isActive)) {
    // Update character controller (handles input, physics, camera, headbob)
    if (characterControllerEnabled) {
      characterController.update(dt);
    }

    // Physics step
    physicsManager.step();

    // Update collider system (check for trigger intersections)
    if (characterControllerEnabled) {
      colliderSystem.update(character);
    }
  }

  // Update title sequence (pass dt in seconds)
  if (titleSequence) {
    titleSequence.update(dt);

    // Enable character controller when the title outro begins
    if (!characterControllerEnabled && titleSequence.hasOutroStarted()) {
      characterControllerEnabled = true;
      characterController.headbobEnabled = true;
      console.log("Title outro started, enabling character controller");
    }

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
  //lightingSystem.updateFlickering(t);

  renderer.render(scene, camera);
});
