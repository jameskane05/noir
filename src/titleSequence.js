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

    this.time = 0;
    this.totalDuration =
      this.introDuration +
      this.staggerDelay * (splats.length - 1) +
      this.holdDuration +
      this.outroDuration;

    // Calculate when outro should start (same for all splats)
    const outroStartTime =
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
        dyno.dynoFloat(outroStartTime),
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
        
        // Position-based delay for wave effects
        // Intro: right to left (more pronounced)
        float introWaveDelay = (${outputs.gsplat}.center.x - 10.0) * -0.2;
        // Outro: left to right
        float outroWaveDelay = (${outputs.gsplat}.center.x + 10.0) * 0.1;
        
        float localTime = ${inputs.globalTime} - ${inputs.startTime} - introWaveDelay;
        float introEnd = ${inputs.introDuration};
        
        // Outro uses global time with wave effect
        float outroTime = ${inputs.globalTime} - ${inputs.outroStartTime} - outroWaveDelay;
        
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
        
        // Calculate dispersion - wind-driven effect
        float id = float(${inputs.gsplat}.index);
        
        // Main wind direction - reverse for outro
        vec3 windDir = phase == 2.0 
          ? normalize(vec3(-1.0, 0.3, -0.5))  // Outro: opposite direction
          : normalize(vec3(1.0, 0.3, 0.5));    // Intro: original direction
        
        // Add turbulence per particle (small random variation)
        vec3 turbulence = vec3(
          hash13(vec3(id * 0.1, id * 0.2, id * 0.3)) * 0.4 - 0.2,
          hash13(vec3(id * 0.3, id * 0.4, id * 0.5)) * 0.4 - 0.2,
          hash13(vec3(id * 0.5, id * 0.6, id * 0.7)) * 0.4 - 0.2
        );
        
        // Position-based offset (subtle letter structure)
        vec3 posOffset = normalize(
          ${outputs.gsplat}.center + 
          vec3(
            hash13(${outputs.gsplat}.center + vec3(id)),
            hash13(${outputs.gsplat}.center.yzx + vec3(id)),
            hash13(${outputs.gsplat}.center.zxy + vec3(id))
          ) - 0.5
        ) * 0.2;
        
        // Combine: strong wind + turbulence + slight position offset
        vec3 disperseDir = normalize(windDir + turbulence + posOffset);
        
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
  }

  isComplete() {
    return this.time >= this.totalDuration;
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
