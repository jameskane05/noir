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
      new THREE.Color(1, 1, 1), // White light (RGB: red=1.0, green=1.0, blue=1.0)
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

    // Create abrupt, randomized jumps instead of smooth transitions
    // Use floor functions to create stepped values that jump suddenly
    const jump1 = Math.floor(Math.sin(timeSeconds * 8.7) * 3) / 3; // Big random jumps
    const jump2 = Math.floor(Math.sin(timeSeconds * 15.3) * 5) / 5; // More frequent jumps
    const jump3 = Math.floor(Math.cos(timeSeconds * 6.2) * 4) / 4; // Another jump pattern

    // Noise that changes abruptly
    const stepNoise =
      Math.floor(
        Math.sin(timeSeconds * 12.5) * Math.cos(timeSeconds * 9.8) * 10
      ) / 10;

    // Base flicker value (reduced by 2/3, then by 4x for brightness)
    const baseFlicker = 0.0425 + jump1 * 0.025 + jump2 * 0.02 + jump3 * 0.015; // 1/4 of previous

    // Combine with big random jumps (no smooth transitions)
    const combinedFlicker = baseFlicker + stepNoise * 0.0375;

    // Random flicker for opacity (stepped, not smooth)
    const randomFlicker = Math.abs(
      Math.floor(Math.sin(timeSeconds * 10.3) * 6) / 6
    );

    for (let i = 0; i < this.lights.length - 1; i++) {
      // Skip flickering for the white light
      if (this.lights[i].color.equals(new THREE.Color(1, 1, 1))) {
        continue;
      }
      const h = baseHue + combinedFlicker * hueVariation; // Slightly varying orange-red hue (dynamic fire colors)
      const s = 0.1 + randomFlicker * 0.3; // High saturation with slight variation (50-80% saturation)
      const l = 0.5 + combinedFlicker * 0.2; // Varying brightness (50-70% lightness)
      this.lights[i].color.setHSL(h, s, l);
    }

    // Apply flickering to the ambient light with fixed saturation
    const lastLight = this.lights[this.lights.length - 1];
    if (lastLight.color.equals(new THREE.Color(1, 1, 1))) {
      // White-only flicker: modulate intensity via opacity (keep color pure white)
      lastLight.opacity = 0.1 * randomFlicker; // 0.7 .. 1.0
    } else {
      // Non-white lights: apply warm flicker in HSL
      lastLight.color.setHSL(baseHue, 0.5, combinedFlicker);
    }
  }
}
