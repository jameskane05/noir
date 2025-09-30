import * as THREE from "three";
import {
  SplatEdit,
  SplatEditSdf,
  SplatEditSdfType,
  SplatEditRgbaBlendMode,
} from "@sparkjsdev/spark";

export class LightingSystem {
  constructor(scene) {
    this.scene = scene;
    this.lights = [];
    this.helpers = [];

    // Create lighting layers
    this.emberLayer = new SplatEdit({
      rgbaBlendMode: SplatEditRgbaBlendMode.ADD_RGBA,
      sdfSmooth: 0.1,
      softEdge: 0.8,
    });
    scene.add(this.emberLayer);

    this.lightingLayer = new SplatEdit({
      rgbaBlendMode: SplatEditRgbaBlendMode.ADD_RGBA,
      sdfSmooth: 0.1,
      softEdge: 1.4,
    });
    scene.add(this.lightingLayer);

    this.ambientLayer = new SplatEdit({
      rgbaBlendMode: SplatEditRgbaBlendMode.DARKEN,
      sdfSmooth: 0.1,
      softEdge: 0.05,
    });
    scene.add(this.ambientLayer);

    // Initialize the lights
    this.setupLights();
  }

  createLight(lightingLayer, position, color, radius, opacity) {
    const light = new SplatEditSdf({
      type: SplatEditSdfType.SPHERE,
      color: color,
      radius: radius,
      opacity: opacity,
    });
    light.position.copy(position);

    // create a wireframe helper
    const helper = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 16),
      new THREE.MeshBasicMaterial({ wireframe: true, color: color })
    );
    helper.position.copy(light.position);
    helper.visible = false;
    this.scene.add(helper);
    this.helpers.push(helper);

    lightingLayer.add(light);
    this.lights.push(light);

    return light;
  }

  setupLights() {
    // glowing embers around the factory
    this.createLight(
      this.emberLayer,
      new THREE.Vector3(0.5, 1.0, -20),
      new THREE.Color(1, 0.6, 0.4), // Warm orange-red ember glow (RGB: red=1.0, green=0.6, blue=0.4)
      10,
      1
    );

    // // Main industrial light source
    // this.createLight(
    //   this.lightingLayer,
    //   new THREE.Vector3(0.3, 1.1, 0.6),
    //   new THREE.Color(1, 0.95, 0.2), // Bright yellow industrial light (RGB: red=1.0, green=0.95, blue=0.2)
    //   1.6,
    //   0
    // );

    // // ambient light throughout the scene
    // this.createLight(
    //   this.ambientLayer,
    //   new THREE.Vector3(0, 1, 1),
    //   new THREE.Color(1, 0.8, 0.6), // Warm white ambient light (RGB: red=1.0, green=0.8, blue=0.6)
    //   6,
    //   0.8
    // );
  }

  updateFlickering(timeSeconds) {
    // Create flickering fire effect
    const baseHue = 0.04; // Orange-red base hue (HSL hue: 0.04 = ~14.4°, orange-red range)
    const fireHue = 0.03; // Yellow base hue (HSL hue: 0.03 = ~10.8°, yellow-orange range)
    const hueVariation = 0.03; // Slight variation in hue (±10.8° color shift)

    // Add some randomness to the flicker
    const randomFlicker = Math.sin(timeSeconds * 4) * 0.5 + 0.5;

    // we'll combine these to make a more natural flickering effect
    const mediumFlicker = Math.sin(timeSeconds * 13) * 0.1 + 0.1; // Medium flicker
    const fastFlicker = Math.sin(timeSeconds * 20) * 0.1 + 0.1; // Fast flicker
    const slowFlicker = Math.sin(timeSeconds * 6) * 0.04 + 0.5; // Slow base flicker
    // Combine the flickers
    const combinedFlicker = (slowFlicker + mediumFlicker + fastFlicker) / 3;

    for (let i = 0; i < this.lights.length - 1; i++) {
      const h = baseHue + combinedFlicker * hueVariation; // Slightly varying orange-red hue (dynamic fire colors)
      const s = 0.5 + randomFlicker * 0.3; // High saturation with slight variation (50-80% saturation)
      const l = 0.5 + combinedFlicker * 0.2; // Varying brightness (50-70% lightness)
      this.lights[i].color.setHSL(h, s, l);
    }

    // Apply flickering to the ambient light with fixed saturation
    this.lights[this.lights.length - 1].color.setHSL(
      baseHue, // Orange-red base hue
      0.5, // Fixed 50% saturation
      combinedFlicker // Variable brightness based on flicker
    );
  }
}
