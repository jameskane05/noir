const RAPIER = await import("@dimforge/rapier3d");

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
      50,
      0.1,
      50
    ).setFriction(1.0);
    this.world.createCollider(floorColliderDesc, floor);
    return floor;
  }

  createCharacter(position = { x: 0, y: 2, z: 0 }) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
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
