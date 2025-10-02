import * as THREE from "three";
import { textSplats } from "@sparkjsdev/spark";

/**
 * Creates and adds a text splat to the scene
 * @param {THREE.Scene} scene - The scene to add the text splat to
 * @returns {SplatMesh} The created text splat mesh
 */
export function createTextSplat(scene) {
  // Create a big text splat
  const textMesh = textSplats({
    text: "WELCOME TO SPARK!",
    font: "Arial",
    fontSize: 80,
    color: new THREE.Color(0x00ffff), // Cyan color
  });

  // Scale the text splat
  textMesh.scale.setScalar(0.8 / 80);

  // Position it in front of the camera (adjust as needed)
  textMesh.position.set(0, 5.5, -3);

  // Add the text splat to the scene
  scene.add(textMesh);

  return textMesh;
}

/**
 * Creates an animated text splat with optional animation
 * @param {THREE.Scene} scene - The scene to add the text splat to
 * @param {Object} options - Configuration options
 * @returns {Object} Object with mesh and update function
 */
export function createAnimatedTextSplat(scene, options = {}) {
  const {
    text = "HELLO WORLD",
    font = "Arial",
    fontSize = 60,
    color = new THREE.Color(0xff00ff),
    position = { x: 0, y: 5, z: -2.5 },
    scale = 0.6 / 80,
    animate = true,
  } = options;

  const textMesh = textSplats({
    text,
    font,
    fontSize,
    color,
  });

  textMesh.scale.setScalar(scale);
  textMesh.position.set(position.x, position.y, position.z);

  scene.add(textMesh);

  // Return mesh and update function for animation
  return {
    mesh: textMesh,
    update: (time) => {
      if (!animate) return;

      // Gentle floating animation
      textMesh.position.y = position.y + 0.1 * Math.sin(time / 500);

      // Gentle rotation
      textMesh.rotation.y = 0.2 * Math.sin(time / 1000);

      // Optional pulsing opacity
      // textMesh.opacity = 0.7 + 0.3 * Math.abs(Math.sin(time / 1000));
    },
  };
}
