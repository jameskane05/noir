import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SplatMesh, SparkRenderer, SparkControls } from "@sparkjsdev/spark";
import { getAssetFileURL } from "/src/getAssetUrl.js";
import { LightingSystem } from "/src/lights.js";
import PhysicsManager from "./physicsManager.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 5, 0);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Create a SparkRenderer and add it to the scene to render all the Gsplats.
const spark = new SparkRenderer({ renderer });
scene.add(spark);

// Load and add the SplatMesh
const splatURL = await getAssetFileURL("street.ply");
const factory = new SplatMesh({ url: splatURL });
factory.quaternion.set(1, 0, 0, 0);
factory.position.set(0, 0, 0);
factory.scale.set(5, 5, 5);
scene.add(factory);

// Removed visible floor mesh; physics floor exists via Rapier collider

// Initialize the physics manager
const physicsManager = new PhysicsManager();

// Create character rigid body (capsule)
const character = physicsManager.createCharacter({ x: 0, y: 1.6, z: 0 });
// Removed visual mesh for character; physics collider only

// Initialize lighting system
const lightingSystem = new LightingSystem(scene);

// Movement state
const keys = { w: false, a: false, s: false, d: false, shift: false };
let yaw = 0; // camera yaw
let pitch = 0; // camera pitch

function getForwardRightVectors() {
  const forward = new THREE.Vector3(0, 0, -1)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    .setY(0)
    .normalize();
  const right = new THREE.Vector3().crossVectors(
    forward,
    new THREE.Vector3(0, 1, 0)
  );
  return { forward, right };
}

window.addEventListener("keydown", (event) => {
  const k = event.key.toLowerCase();
  if (k in keys) keys[k] = true;
  if (event.key === "Shift") keys.shift = true;
});

window.addEventListener("keyup", (event) => {
  const k = event.key.toLowerCase();
  if (k in keys) keys[k] = false;
  if (event.key === "Shift") keys.shift = false;
});

// Pointer lock + mouse look
renderer.domElement.addEventListener("click", () => {
  renderer.domElement.requestPointerLock();
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  const sensitivity = 0.0025;
  yaw -= event.movementX * sensitivity;
  pitch -= event.movementY * sensitivity;
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
});

let lastTime;
renderer.setAnimationLoop(function animate(time) {
  const t = time * 0.001;
  const dt = Math.min(0.033, t - (lastTime ?? t));
  lastTime = t;

  // Input -> desired velocity in XZ plane
  const { forward, right } = getForwardRightVectors();
  const baseSpeed = 5.0;
  const sprintMultiplier = 2.0;
  const moveSpeed = keys.shift ? baseSpeed * sprintMultiplier : baseSpeed;
  const desired = new THREE.Vector3();
  if (keys.w) desired.add(forward);
  if (keys.s) desired.sub(forward);
  if (keys.a) desired.sub(right);
  if (keys.d) desired.add(right);
  if (desired.lengthSq() > 1e-6) desired.normalize().multiplyScalar(moveSpeed);

  // Apply velocity: preserve current Y velocity (gravity)
  const linvel = character.linvel();
  character.setLinvel({ x: desired.x, y: linvel.y, z: desired.z }, true);

  // Physics step
  physicsManager.step();

  // Sync camera to physics body (no visible mesh)
  const p = character.translation();

  // Camera follow: position slightly behind and above the character
  const cameraOffset = new THREE.Vector3(0, 1.6, 0); // camera height
  const camFollow = new THREE.Vector3(p.x, p.y, p.z).add(cameraOffset);
  camera.position.copy(camFollow);
  // Build look direction from yaw/pitch
  const lookDir = new THREE.Vector3(0, 0, -1).applyEuler(
    new THREE.Euler(pitch, yaw, 0, "YXZ")
  );
  const lookTarget = new THREE.Vector3().copy(camera.position).add(lookDir);
  camera.lookAt(lookTarget);

  // Update lighting
  lightingSystem.updateFlickering(t);

  renderer.render(scene, camera);
});
