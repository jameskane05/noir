const RAPIER = await import("@dimforge/rapier3d");
import * as THREE from "three";

class PhysicsManager {
  constructor() {
    this.gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(this.gravity);
    this.createFloor();
  }

  createFloor() {
    const floorDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
    const floor = this.world.createRigidBody(floorDesc);
    const floorColliderDesc = RAPIER.ColliderDesc.cuboid(
      200,
      0.1,
      200
    ).setFriction(1.0);
    this.world.createCollider(floorColliderDesc, floor);
    return floor;
  }

  createCharacter(
    position = { x: 0, y: 2, z: 0 },
    rotation = { x: 0, y: 0, z: 0 }
  ) {
    // Convert Euler angles in DEGREES to quaternion
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(rotation.x),
      THREE.MathUtils.degToRad(rotation.y),
      THREE.MathUtils.degToRad(rotation.z)
    );
    const quat = new THREE.Quaternion().setFromEuler(euler);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setLinearDamping(0.2);
    const body = this.world.createRigidBody(bodyDesc);
    // Capsule with full height 1.6m: 2*halfHeight + 2*radius = 1.6 => halfHeight=0.5, radius=0.3
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3)
      .setFriction(0.9)
      .setMass(60);
    this.world.createCollider(colliderDesc, body);
    return body;
  }

  step() {
    this.world.step();
  }
}

export default PhysicsManager;
