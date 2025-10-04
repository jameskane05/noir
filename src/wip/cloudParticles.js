import * as THREE from "three";

/**
 * Cloud Particles System
 * Creates a slow drifting fog animation similar to the Spark.js particle animation example
 */

class CloudParticles {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = {
      particleCount: options.particleCount || 1000,
      cloudSize: options.cloudSize || 50,
      particleSize: options.particleSize || 2.0,
      windSpeed: options.windSpeed || -0.3,
      opacity: options.opacity || 0.4,
      color: options.color || 0xffffff,
      fluffiness: options.fluffiness || 0.5,
      turbulence: options.turbulence || 0.3,
      cloudDensity: options.cloudDensity || 1.0,
      // Noise parameters for realistic fog movement
      octaves: options.octaves || 4,
      frequency: options.frequency || 0.3,
      amplitude: options.amplitude || 0.5,
      lacunarity: options.lacunarity || 2.0,
      persistence: options.persistence || 0.5,
      phase: options.phase || 0.1,
      ...options,
    };

    // Fog bounds
    this.bounds = {
      MIN_X: -this.options.cloudSize,
      MAX_X: this.options.cloudSize,
      MIN_Y: -this.options.cloudSize * 0.2,
      MAX_Y: this.options.cloudSize * 0.2,
      MIN_Z: -this.options.cloudSize,
      MAX_Z: this.options.cloudSize,
    };

    this.particles = null;
    this.particleSystem = null;
    this.time = 0;

    this.init();
  }

  // fBM noise implementation from the Spark example
  noise(x, y, z, t) {
    let value = 0;
    let amp = this.options.amplitude;
    let freq = this.options.frequency;

    for (let i = 0; i < this.options.octaves; i++) {
      const to = t * this.options.phase * (i + 1);

      // 3D grid of sines
      value +=
        amp *
        Math.sin(x * freq + to) *
        Math.sin(y * freq + to) *
        Math.sin(z * freq + to);

      freq *= this.options.lacunarity;
      amp *= this.options.persistence;
    }

    return value;
  }

  wrap(val, min, max) {
    const range = max - min;
    return ((((val - min) % range) + range) % range) + min;
  }

  createCloudTexture() {
    // Create a canvas for the cloud texture
    const canvas = document.createElement("canvas");
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");

    // Create gradient for cloud-like appearance
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );

    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.2, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.4)");
    gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.1)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    // Add some noise for more realistic cloud texture
    const imageData = context.getImageData(0, 0, size, size);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = Math.random() * 0.1;
      data[i + 3] *= 1 - noise; // Modify alpha channel with noise
    }

    context.putImageData(imageData, 0, 0);

    // Create THREE.js texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return texture;
  }

  init() {
    // Apply cloud density to particle count
    const actualParticleCount = Math.floor(
      this.options.particleCount * this.options.cloudDensity
    );

    // Create particle geometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(actualParticleCount * 3);
    const velocities = new Float32Array(actualParticleCount * 3);
    const scales = new Float32Array(actualParticleCount);
    const initialZ = new Float32Array(actualParticleCount); // Store initial Z for wind animation
    const seeds = new Float32Array(actualParticleCount); // Store random seeds

    // Initialize fog particles similar to the Spark example
    for (let i = 0; i < actualParticleCount; i++) {
      const i3 = i * 3;

      // Generate consistent randomness per particle (prevents flickering)
      const seed = i * 0.12345;
      const random = {
        x: Math.abs((Math.sin(seed * 12.9898) * 43758.5453) % 1),
        y: Math.abs((Math.sin(seed * 78.233) * 43758.5453) % 1),
        z: Math.abs((Math.sin(seed * 37.719) * 43758.5453) % 1),
        w: Math.abs((Math.sin(seed * 93.989) * 43758.5453) % 1),
      };

      // Set base positions within fog bounds
      let x = THREE.MathUtils.lerp(
        this.bounds.MIN_X,
        this.bounds.MAX_X,
        random.x
      );
      let y = THREE.MathUtils.lerp(
        this.bounds.MIN_Y,
        this.bounds.MAX_Y,
        random.y
      );
      let z = THREE.MathUtils.lerp(
        this.bounds.MIN_Z,
        this.bounds.MAX_Z,
        random.z
      );

      // Apply vertical variation (fluffiness)
      const fluffiness =
        Math.sin(random.w * Math.PI * 2) * this.options.fluffiness * 0.5;
      y += fluffiness;

      // Apply horizontal variation (turbulence)
      const turbulence =
        Math.sin(random.w * Math.PI * 8) * this.options.turbulence * 0.3;
      x += turbulence;

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      // Store initial Z position for wind animation
      initialZ[i] = z;
      seeds[i] = seed;

      // Very slow random drift for fog-like movement
      velocities[i3] = (random.x - 0.5) * 0.005;
      velocities[i3 + 1] = random.y * 0.002; // Very subtle vertical drift
      velocities[i3 + 2] = (random.z - 0.5) * 0.005;

      // Random scales for variety
      scales[i] = 0.8 + random.w * 0.4; // 0.8 to 1.2 range
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("velocity", new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute("scale", new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute("initialZ", new THREE.BufferAttribute(initialZ, 1));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));

    // Create cloud texture programmatically
    const cloudTexture = this.createCloudTexture();

    // Create particle material with fog-like appearance
    const material = new THREE.PointsMaterial({
      color: this.options.color,
      size: this.options.particleSize,
      opacity: this.options.opacity,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      vertexColors: false,
      sizeAttenuation: true,
      map: cloudTexture,
      alphaTest: 0.001,
    });

    // Create particle system
    this.particleSystem = new THREE.Points(geometry, material);
    this.particleSystem.renderOrder = -1; // Render before splats to reduce z-fighting
    this.particleSystem.frustumCulled = false; // Prevent culling issues
    this.scene.add(this.particleSystem);

    // Store references for animation
    this.particles = {
      positions: positions,
      velocities: velocities,
      scales: scales,
      initialZ: initialZ,
      seeds: seeds,
      geometry: geometry,
      actualParticleCount: actualParticleCount,
    };
  }

  update(deltaTime = 0.016) {
    if (!this.particles) return;

    this.time += deltaTime;
    const positions = this.particles.positions;
    const velocities = this.particles.velocities;
    const scales = this.particles.scales;
    const initialZ = this.particles.initialZ;
    const seeds = this.particles.seeds;

    const now = this.time * 0.2; // Slow time scale like the example

    for (let i = 0; i < this.particles.actualParticleCount; i++) {
      const i3 = i * 3;

      // Get the seed for this particle
      const seed = seeds[i];
      const randomZ = Math.abs((Math.sin(seed * 37.719) * 43758.5453) % 1);
      const zZero = THREE.MathUtils.lerp(
        this.bounds.MIN_Z,
        this.bounds.MAX_Z,
        randomZ
      );

      // Implement wind drift like the Spark example
      const displacement = this.options.windSpeed * this.time;
      const range = this.bounds.MAX_Z - this.bounds.MIN_Z;
      let newZ = zZero + displacement;
      newZ = this.wrap(newZ, this.bounds.MIN_Z, this.bounds.MAX_Z);

      // Add fBM noise for realistic fog movement
      const noiseValue =
        this.noise(positions[i3], positions[i3 + 1], newZ, now) *
        this.options.fluffiness *
        0.1;

      // Apply very subtle random drift
      positions[i3] += velocities[i3] * deltaTime * 10;
      positions[i3 + 1] += velocities[i3 + 1] * deltaTime * 10 + noiseValue;
      positions[i3 + 2] = newZ;

      // Wrap particles within bounds
      positions[i3] = this.wrap(
        positions[i3],
        this.bounds.MIN_X,
        this.bounds.MAX_X
      );
      positions[i3 + 1] = this.wrap(
        positions[i3 + 1],
        this.bounds.MIN_Y,
        this.bounds.MAX_Y
      );
    }

    // Update the geometry
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  setColor(color) {
    if (this.particleSystem && this.particleSystem.material) {
      this.particleSystem.material.color.setHex(color);
    }
  }

  setOpacity(opacity) {
    if (this.particleSystem && this.particleSystem.material) {
      this.particleSystem.material.opacity = opacity;
    }
  }

  setSize(size) {
    if (this.particleSystem && this.particleSystem.material) {
      this.particleSystem.material.size = size;
    }
  }

  dispose() {
    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
      this.particles.geometry.dispose();
      this.particleSystem.material.dispose();
    }
  }
}

// Factory function to create and return a cloud particle system
export function createCloudParticles(scene, options = {}) {
  return new CloudParticles(scene, options);
}

// Utility function to create multiple cloud layers
export function createCloudLayers(scene, layerCount = 3, options = {}) {
  const clouds = [];

  for (let i = 0; i < layerCount; i++) {
    const layerOptions = {
      particleCount: 300 + i * 200,
      cloudSize: 30 + i * 20,
      particleSize: 0.05 + i * 0.03,
      speed: 0.0005 + i * 0.0003,
      opacity: 0.3 + i * 0.1,
      color: options.colors ? options.colors[i] : 0xffffff,
      ...options,
    };

    const cloud = new CloudParticles(scene, layerOptions);
    cloud.particleSystem.position.y = i * 10;
    clouds.push(cloud);
  }

  return clouds;
}

// Export the CloudParticles class as default
export default CloudParticles;
