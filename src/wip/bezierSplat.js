import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";

/**
 * Creates a bezier curve made of splats
 * @param {Object} options - Configuration options
 * @returns {SplatMesh} The created bezier curve splat mesh
 */
export function createBezierSplat(options = {}) {
  const {
    start = new THREE.Vector3(-5, 0, 0),
    end = new THREE.Vector3(5, 0, 0),
    controlPoint1 = new THREE.Vector3(-2, 3, 0),
    controlPoint2 = new THREE.Vector3(2, 3, 0),
    segments = 50,
    splatRadius = 0.1,
    color = new THREE.Color(0xffffff),
    opacity = 1.0,
  } = options;

  // Create bezier curve
  const curve = new THREE.CubicBezierCurve3(
    start,
    controlPoint1,
    controlPoint2,
    end
  );

  // Generate points along the curve
  const points = curve.getPoints(segments);

  // Create splat data
  const positions = [];
  const rotations = [];
  const scales = [];
  const colors = [];

  points.forEach((point, i) => {
    // Position
    positions.push(point.x, point.y, point.z);

    // Rotation (align to curve direction if possible)
    if (i < points.length - 1) {
      const nextPoint = points[i + 1];
      const direction = new THREE.Vector3()
        .subVectors(nextPoint, point)
        .normalize();
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      rotations.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    } else {
      // Last point uses same rotation as previous
      const prevIdx = (i - 1) * 4;
      rotations.push(
        rotations[prevIdx],
        rotations[prevIdx + 1],
        rotations[prevIdx + 2],
        rotations[prevIdx + 3]
      );
    }

    // Scale
    scales.push(splatRadius, splatRadius, splatRadius);

    // Color with opacity
    colors.push(color.r, color.g, color.b, opacity);
  });

  // Create Float32Arrays
  const positionsArray = new Float32Array(positions);
  const rotationsArray = new Float32Array(rotations);
  const scalesArray = new Float32Array(scales);
  const colorsArray = new Float32Array(colors);

  // Create SplatMesh from primitive data
  const splatMesh = new SplatMesh({
    positions: positionsArray,
    rotations: rotationsArray,
    scales: scalesArray,
    colors: colorsArray,
  });

  return splatMesh;
}

/**
 * Creates a hanging chain/rope effect using bezier curve
 * @param {Object} options - Configuration options
 * @returns {SplatMesh} The created chain splat mesh
 */
export function createHangingChain(options = {}) {
  const {
    startPoint = new THREE.Vector3(-3, 2, 0),
    endPoint = new THREE.Vector3(3, 2, 0),
    sag = 2.0, // How much the chain sags down
    segments = 60,
    thickness = 0.08,
    color = new THREE.Color(0xcccccc),
  } = options;

  // Calculate control points for natural hanging curve (catenary approximation)
  const midX = (startPoint.x + endPoint.x) / 2;
  const midY = (startPoint.y + endPoint.y) / 2 - sag;

  const control1 = new THREE.Vector3(
    startPoint.x + (midX - startPoint.x) * 0.5,
    startPoint.y - sag * 0.3,
    (startPoint.z + endPoint.z) / 2
  );

  const control2 = new THREE.Vector3(
    endPoint.x - (endPoint.x - midX) * 0.5,
    endPoint.y - sag * 0.3,
    (startPoint.z + endPoint.z) / 2
  );

  return createBezierSplat({
    start: startPoint,
    end: endPoint,
    controlPoint1: control1,
    controlPoint2: control2,
    segments,
    splatRadius: thickness,
    color,
  });
}
