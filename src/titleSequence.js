import { dyno } from "@sparkjsdev/spark";

/**
 * Manages a sequenced intro/outro animation for text splats
 */
export class TitleSequence {
  constructor(splats, options = {}) {
    this.splats = splats;
    this.introDuration = options.introDuration || 2.0; // seconds
    this.holdDuration = options.holdDuration || 4.0; // seconds
    this.outroDuration = options.outroDuration || 2.0; // seconds
    this.staggerDelay = options.staggerDelay || 1.0; // delay between splats
    this.disperseDistance = options.disperseDistance || 5.0;
    this.onComplete = options.onComplete || null; // Callback when sequence completes

    this.time = 0;
    this.completed = false; // Track if completion callback has been called
    this.totalDuration =
      this.introDuration +
      this.staggerDelay * (splats.length - 1) +
      this.holdDuration +
      this.outroDuration;

    // Calculate when outro should start (same for all splats)
    this.outroStartTime =
      this.introDuration +
      this.staggerDelay * (splats.length - 1) +
      this.holdDuration;

    // Apply modifiers to each splat
    this.splats.forEach((splat, i) => {
      const startTime = dyno.dynoFloat(i * this.staggerDelay);
      const globalTime = dyno.dynoFloat(0);

      splat.mesh.worldModifier = this.createModifier(
        globalTime,
        startTime,
        dyno.dynoFloat(this.introDuration),
        dyno.dynoFloat(this.holdDuration),
        dyno.dynoFloat(this.outroDuration),
        dyno.dynoFloat(this.disperseDistance),
        dyno.dynoFloat(this.outroStartTime),
        dyno.dynoInt(i)
      );

      // Store the dyno reference for updates
      splat._globalTime = globalTime;

      if (splat.mesh.updateGenerator) {
        splat.mesh.updateGenerator();
      }
    });
  }

  createModifier(
    globalTime,
    startTime,
    introDuration,
    holdDuration,
    outroDuration,
    disperseDistance,
    outroStartTime,
    splatIndex
  ) {
    const dyn = new dyno.Dyno({
      inTypes: {
        gsplat: dyno.Gsplat,
        globalTime: "float",
        startTime: "float",
        introDuration: "float",
        holdDuration: "float",
        outroDuration: "float",
        disperseDistance: "float",
        outroStartTime: "float",
        splatIndex: "int",
      },
      outTypes: { gsplat: dyno.Gsplat },
      globals: () => [
        dyno.unindent(`
        float hash13(vec3 p3) { 
          p3 = fract(p3 * .1031); 
          p3 += dot(p3, p3.yzx + 33.33); 
          return fract((p3.x + p3.y) * p3.z); 
        }
        float easeInOut(float t) {
          return t * t * (3.0 - 2.0 * t);
        }
        `),
      ],
      statements: ({ inputs, outputs }) =>
        dyno.unindentLines(`
        ${outputs.gsplat} = ${inputs.gsplat};
        
        float id = float(${inputs.gsplat}.index);
        
        // ID-based delay for wave effects (predictable, independent of camera position)
        // Use hash to create smooth wave pattern across particles
        float waveOffset = hash13(vec3(id * 0.05, id * 0.03, 0.0)) * 0.3;
        
        float localTime = ${inputs.globalTime} - ${inputs.startTime} - waveOffset;
        float introEnd = ${inputs.introDuration};
        
        // Outro uses global time with wave effect
        float outroTime = ${inputs.globalTime} - ${inputs.outroStartTime} - waveOffset;
        
        float phase = 1.0; // 0=pre-intro, 1=visible, 2=post-outro
        float t = 0.0;
        
        if (localTime < 0.0) {
          phase = 0.0;
        } else if (localTime < introEnd) {
          phase = 1.0;
          t = localTime / ${inputs.introDuration};
        } else if (outroTime < 0.0) {
          // Hold phase: fully visible
          phase = 1.0;
          t = 1.0;
        } else if (outroTime < ${inputs.outroDuration}) {
          // Outro phase: fade out with wave
          phase = 2.0;
          t = 1.0 - (outroTime / ${inputs.outroDuration});
        } else {
          phase = 0.0;
        }
        
        // Calculate dispersion - wind-driven effect (all ID-based, no position dependency)
        // Main wind direction - reverse for outro
        vec3 windDir = phase == 2.0 
          ? vec3(-1.0, 0.3, -0.5)  // Outro: opposite direction
          : vec3(1.0, 0.3, 0.5);    // Intro: original direction
        
        // Add turbulence per particle (small random variation, ID-based only)
        vec3 turbulence = vec3(
          hash13(vec3(id * 0.1, id * 0.2, id * 0.3)) * 0.4 - 0.2,
          hash13(vec3(id * 0.3, id * 0.4, id * 0.5)) * 0.4 - 0.2,
          hash13(vec3(id * 0.5, id * 0.6, id * 0.7)) * 0.4 - 0.2
        );
        
        // ID-based offset (no position dependency)
        float h1 = hash13(vec3(id * 0.11, id * 0.22, id * 0.33));
        float h2 = hash13(vec3(id * 0.44, id * 0.55, id * 0.66));
        float h3 = hash13(vec3(id * 0.77, id * 0.88, id * 0.99));
        vec3 idOffset = vec3(h1 * 2.0 - 1.0, h2 * 2.0 - 1.0, h3 * 2.0 - 1.0) * 0.2;
        
        // Combine: strong wind + turbulence + ID-based offset
        vec3 disperseDir = normalize(windDir + turbulence + idOffset);
        
        // Add random distance variation per particle
        float randomDist = 0.7 + hash13(vec3(id * 0.7, id * 0.8, id * 0.9)) * 0.6;
        
        float easedT = easeInOut(t);
        
        // Intro: disperse inward from offset position
        // Outro: disperse outward to offset position
        float disperseFactor = phase == 1.0 ? (1.0 - easedT) : 1.0;
        if (phase == 2.0) {
          disperseFactor = 1.0 - easedT;
        }
        
        vec3 offset = disperseDir * ${inputs.disperseDistance} * randomDist * disperseFactor;
        ${outputs.gsplat}.center = ${outputs.gsplat}.center + offset;
        
        // Scale effect
        float scale = phase == 1.0 ? mix(0.2, 1.0, easedT) : (phase == 0.0 ? 0.2 : mix(1.0, 0.2, 1.0 - easedT));
        ${outputs.gsplat}.scales = ${outputs.gsplat}.scales * scale;
        
        // Opacity
        float opacity = phase == 1.0 ? easedT : (phase == 0.0 ? 0.0 : easedT);
        ${outputs.gsplat}.rgba.a *= opacity;
      `),
    });

    return dyno.dynoBlock(
      { gsplat: dyno.Gsplat },
      { gsplat: dyno.Gsplat },
      ({ gsplat }) => ({
        gsplat: dyn.apply({
          gsplat,
          globalTime,
          startTime,
          introDuration,
          holdDuration,
          outroDuration,
          disperseDistance,
          outroStartTime,
          splatIndex,
        }).gsplat,
      })
    );
  }

  update(dt) {
    this.time += dt;

    // Update global time for all splats
    this.splats.forEach((splat) => {
      if (splat._globalTime) {
        splat._globalTime.value = this.time;
      }

      // Update individual splat animations
      if (splat.update) {
        splat.update(this.time * 1000);
      }
    });

    // Check if sequence just completed
    if (this.isComplete() && !this.completed) {
      this.completed = true;
      if (this.onComplete) {
        this.onComplete();
      }
    }
  }

  isComplete() {
    return this.time >= this.totalDuration;
  }

  hasOutroStarted() {
    return this.time >= this.outroStartTime && this.time < this.totalDuration;
  }

  reset() {
    this.time = 0;
    this.splats.forEach((splat) => {
      if (splat._globalTime) {
        splat._globalTime.value = 0;
      }
    });
  }
}
