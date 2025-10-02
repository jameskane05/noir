import * as THREE from "three";
import { dyno } from "@sparkjsdev/spark";

/**
 * Manages GPU-based flow transitions between splat meshes using Spark's dyno system
 */
export class SplatTransition {
  constructor(splats = [], options = {}) {
    this.splats = splats;
    this.pauseSeconds = options.pauseSeconds || 2.0;
    this.speedMultiplier = options.speedMultiplier || 0.5;
    this.waves = options.waves || 0.5;
    this.fixedMinScale = options.fixedMinScale || false;

    this.time = dyno.dynoFloat(0.0);
    this.period = dyno.dynoFloat(splats.length);

    // Use the same center for all splats so they transition in place
    this.centers = this.splats.map(() => new THREE.Vector3(0, 0, 0));

    // Generate GLSL code for centers
    const centerGLSL = this.generateCenterGLSL();

    // Apply world modifiers to each splat
    this.splats.forEach((splat, i) => {
      const { inTransition, isFadeIn, normT } = this.getTransitionState(
        this.time,
        dyno.dynoFloat(i),
        dyno.dynoFloat((i + 1) % splats.length),
        this.period
      );

      splat.mesh.worldModifier = this.getTransitionModifier(
        inTransition,
        isFadeIn,
        normT,
        dyno.dynoInt(i),
        this.time,
        centerGLSL,
        dyno.dynoBool(this.fixedMinScale),
        dyno.dynoFloat(this.waves)
      );

      if (splat.mesh.updateGenerator) {
        splat.mesh.updateGenerator();
      }
    });
  }

  generateCenterGLSL() {
    const lines = this.centers
      .map((c, i) => `if (idx == ${i}) return vec3(${c.x}, ${c.y}, ${c.z});`)
      .join("\n      ");

    return `
    vec3 getCenterOfMass(int idx) {
      ${lines}
      return vec3(0.0);
    }
  `;
  }

  getTransitionState(t, fadeInTime, fadeOutTime, period) {
    const one = dyno.dynoFloat(1.0);
    const pauseTime = dyno.dynoFloat(this.pauseSeconds);
    const cycleTime = dyno.add(one, pauseTime);
    const total = dyno.mul(period, cycleTime);
    const wrapT = dyno.mod(t, total);
    const pos = dyno.mod(wrapT, cycleTime);
    const inPause = dyno.greaterThan(pos, one);
    const normT = dyno.select(inPause, one, pos);
    const fadeIn = dyno.and(
      dyno.greaterThan(wrapT, dyno.mul(fadeInTime, cycleTime)),
      dyno.lessThan(wrapT, dyno.mul(dyno.add(fadeInTime, one), cycleTime))
    );
    const fadeOut = dyno.and(
      dyno.greaterThan(wrapT, dyno.mul(fadeOutTime, cycleTime)),
      dyno.lessThan(wrapT, dyno.mul(dyno.add(fadeOutTime, one), cycleTime))
    );
    return { inTransition: dyno.or(fadeIn, fadeOut), isFadeIn: fadeIn, normT };
  }

  contractionDyno(centerGLSL) {
    return new dyno.Dyno({
      inTypes: {
        gsplat: dyno.Gsplat,
        inTransition: "bool",
        fadeIn: "bool",
        t: "float",
        gt: "float",
        objectIndex: "int",
        fixedMinScale: "bool",
        waves: "float",
      },
      outTypes: { gsplat: dyno.Gsplat },
      globals: () => [
        dyno.unindent(`
        float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float hash11(float p) { p = fract(p * .1031); p += dot(p, p + 33.33); return fract(p * p); }
        float fadeInOut(float t) { return abs(mix(-1., 1., t)); }
        ${centerGLSL}
        float applyBrightness(float t) { return .5 + fadeInOut(t) * .5; }
        vec3 applyCenter(vec3 center, float t, float id, int idx, float waves) {
          int next = (idx + 1) % ${this.splats.length};
          vec3 cNext = getCenterOfMass(next);
          vec3 cOwn = getCenterOfMass(idx);
          float f = fadeInOut(t);
          float v = .5 + hash11(id) * 2.;
          // Make splats flow between their original position and a dispersed state
          vec3 disperseDir = normalize(center + vec3(hash13(center + vec3(id)), hash13(center.yzx + vec3(id)), hash13(center.zxy + vec3(id))) - 0.5);
          float disperseDistance = 5.0 + hash11(id) * 3.0; // More dramatic dispersion with variation
          vec3 dispersed = center + disperseDir * disperseDistance * (1.0 - f);
          return mix(dispersed, center, f) + length(sin(center*2.5)) * waves * (1.-f)*smoothstep(0.5,0.,t) * 3.;
        }
        vec3 applyScale(vec3 s, float t, bool fixedMin) { return mix(fixedMin ? vec3(.02) : s * .2, s, pow(fadeInOut(t), 3.)); }
        float applyOpacity(float t, float gt, int idx) {
          float p = float(${this.pauseSeconds});
          float c = 1.0 + p;
          float tot = ${this.splats.length}.0 * c;
          float w = mod(gt + p + .5, tot);
          int cur = int(floor(w / c));
          return cur == idx ? .1+fadeInOut(t) : 0.0;
        }
      `),
      ],
      statements: ({ inputs, outputs }) =>
        dyno.unindentLines(`
        ${outputs.gsplat} = ${inputs.gsplat};
        ${outputs.gsplat}.center = applyCenter(${inputs.gsplat}.center, ${inputs.t}, float(${inputs.gsplat}.index), ${inputs.objectIndex}, ${inputs.waves});
        ${outputs.gsplat}.scales = applyScale(${inputs.gsplat}.scales, ${inputs.t}, ${inputs.fixedMinScale});
        ${outputs.gsplat}.rgba.a *= applyOpacity(${inputs.t}, ${inputs.gt}, ${inputs.objectIndex});
        ${outputs.gsplat}.rgba.rgb *= applyBrightness(${inputs.t});
      `),
    });
  }

  getTransitionModifier(
    inTrans,
    fadeIn,
    t,
    idx,
    gt,
    centerGLSL,
    fixedMinScale,
    waves
  ) {
    const dyn = this.contractionDyno(centerGLSL);
    return dyno.dynoBlock(
      { gsplat: dyno.Gsplat },
      { gsplat: dyno.Gsplat },
      ({ gsplat }) => ({
        gsplat: dyn.apply({
          gsplat,
          inTransition: inTrans,
          fadeIn,
          t,
          gt,
          objectIndex: idx,
          fixedMinScale,
          waves,
        }).gsplat,
      })
    );
  }

  update(dt) {
    // dt is in seconds
    this.time.value += dt * this.speedMultiplier;

    // Update individual splat animations
    this.splats.forEach((splat) => {
      if (splat.update) {
        splat.update(this.time.value * 1000);
      }
    });
  }

  setTiming(speedMultiplier, pauseSeconds) {
    this.speedMultiplier = speedMultiplier;
    this.pauseSeconds = pauseSeconds;
  }
}
