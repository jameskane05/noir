import * as THREE from "three";
import { GAME_STATES } from "../gameData.js";

/**
 * PhoneBooth - Manages phonebooth-specific interactions and animations
 *
 * Features:
 * - Receiver reparenting and lerp animation
 * - Physics-based telephone cord simulation
 * - Audio-reactive light integration
 * - Phone booth state management
 * - Animation callbacks
 */
class PhoneBooth {
  constructor(options = {}) {
    this.sceneManager = options.sceneManager;
    this.lightManager = options.lightManager;
    this.sfxManager = options.sfxManager;
    this.physicsManager = options.physicsManager;
    this.scene = options.scene;
    this.camera = options.camera;

    // Receiver animation state
    this.receiverLerp = null;
    this.receiver = null;
    this.cordAttach = null;

    // Phone cord physics simulation
    this.cordLinks = []; // Array of { rigidBody, mesh, joint }
    this.cordLineMesh = null; // Visual line representation
    this.receiverAnchor = null; // Kinematic body that follows the receiver

    // Configuration
    this.config = {
      receiverTargetPos: new THREE.Vector3(-1, 0, -1.5), // Position relative to camera
      receiverLerpDuration: 1.0,
      receiverLerpEase: (t) => 1 - Math.pow(1 - t, 3), // Cubic ease-out

      // Cord configuration
      cordSegments: 32, // Number of links in the chain
      cordSegmentLength: 0.08, // Length of each segment (longer for slack)
      cordSegmentRadius: 0.002, // Radius of each segment (very slender)
      cordMass: 0.01, // Mass of each segment (lighter for natural droop)
      cordDamping: 1.5, // Linear damping
      cordAngularDamping: 1.5, // Angular damping
      cordDroopAmount: 5, // How much the cord droops in the middle (0 = straight, 1+ = more droop)
    };
  }

  /**
   * Initialize the phonebooth
   * Sets up event listeners and creates the phone cord
   */
  initialize() {
    if (!this.sceneManager) {
      console.warn("PhoneBooth: No SceneManager provided");
      return;
    }

    // Listen for animation finished events
    this.sceneManager.on("animation:finished", (animId) => {
      if (animId === "phonebooth-ring") {
        this.handleAnimationFinished();
      }
    });

    // Find the CordAttach and Receiver meshes
    this.cordAttach = this.sceneManager.findChildByName(
      "phonebooth",
      "CordAttach"
    );
    this.receiver = this.sceneManager.findChildByName("phonebooth", "Receiver");

    if (this.cordAttach && this.receiver && this.physicsManager) {
      // Create the phone cord chain
      this.createPhoneCord();
    } else {
      console.warn(
        "PhoneBooth: Cannot create phone cord - missing CordAttach, Receiver, or PhysicsManager"
      );
    }

    console.log("PhoneBooth: Initialized");
  }

  /**
   * Create the physics-based phone cord
   * Creates a chain of rigid bodies connected by spherical joints
   */
  createPhoneCord() {
    if (!this.physicsManager || !this.cordAttach || !this.receiver) {
      console.warn("PhoneBooth: Cannot create cord - missing components");
      return;
    }

    const world = this.physicsManager.world;
    const RAPIER = this.physicsManager.RAPIER;

    // Get world positions of cord attachment points
    const cordAttachPos = new THREE.Vector3();
    const receiverPos = new THREE.Vector3();
    this.cordAttach.getWorldPosition(cordAttachPos);
    this.receiver.getWorldPosition(receiverPos);

    // Calculate cord direction
    const cordDirection = new THREE.Vector3()
      .subVectors(receiverPos, cordAttachPos)
      .normalize();
    const segmentLength = this.config.cordSegmentLength;

    // Calculate total cord length (longer than straight distance for natural droop)
    const straightDistance = cordAttachPos.distanceTo(receiverPos);
    const totalCordLength = this.config.cordSegments * segmentLength;
    const slackFactor = totalCordLength / straightDistance;

    console.log(
      "PhoneBooth: Creating phone cord with",
      this.config.cordSegments,
      "segments"
    );
    console.log(
      "  Slack factor:",
      slackFactor.toFixed(2),
      "(>1 means cord will droop)"
    );

    // Create cord segments with initial droop/curve
    for (let i = 0; i < this.config.cordSegments; i++) {
      // Calculate position along the cord with a catenary-like curve for natural droop
      const t = (i + 0.5) / this.config.cordSegments;

      // Base position along straight line
      const pos = new THREE.Vector3().lerpVectors(
        cordAttachPos,
        receiverPos,
        t
      );

      // Add vertical droop in the middle (parabolic curve)
      // Maximum droop at t=0.5 (middle of cord)
      const droopCurve = Math.sin(t * Math.PI); // 0 at ends, 1 at middle
      const droopOffset = droopCurve * this.config.cordDroopAmount;
      pos.y -= droopOffset; // Pull down by droop amount

      // Create rigid body for this segment
      const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinearDamping(this.config.cordDamping)
        .setAngularDamping(this.config.cordAngularDamping);

      const rigidBody = world.createRigidBody(rigidBodyDesc);

      // Create collider (small sphere)
      const colliderDesc = RAPIER.ColliderDesc.ball(
        this.config.cordSegmentRadius
      )
        .setMass(this.config.cordMass)
        .setCollisionGroups(0x00020002); // Group 2, only collides with environment (not other cord segments)

      world.createCollider(colliderDesc, rigidBody);

      // No visual mesh per segment - we'll use the line renderer instead
      const mesh = null;

      // Create joint to previous segment or anchor point
      let joint = null;
      if (i === 0) {
        // First segment - attach to CordAttach with a fixed anchor
        // We'll create a "virtual" kinematic body at the cord attach point
        const anchorBodyDesc =
          RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
            cordAttachPos.x,
            cordAttachPos.y,
            cordAttachPos.z
          );
        const anchorBody = world.createRigidBody(anchorBodyDesc);

        // Create FIXED joint for first segment (rigid connection, sticks out from phone)
        const params = RAPIER.JointData.fixed(
          { x: 0, y: 0, z: 0 }, // Anchor on the fixed point
          { w: 1.0, x: 0, y: 0, z: 0 }, // Rotation at anchor
          { x: 0, y: 0, z: 0 }, // Anchor on the segment
          { w: 1.0, x: 0, y: 0, z: 0 } // Rotation at segment
        );

        joint = world.createImpulseJoint(params, anchorBody, rigidBody, true);

        // Store anchor body reference
        this.cordLinks.push({
          rigidBody: anchorBody,
          mesh: null,
          joint: null,
          isAnchor: true,
        });
      } else if (i === 1) {
        // Second segment - connect to first (rigid) segment with rope joint
        // This is where the flexible part starts
        const prevLink = this.cordLinks[this.cordLinks.length - 1];

        const params = RAPIER.JointData.rope(
          segmentLength * 1.2, // Max length (20% longer than segment for slack)
          { x: 0, y: 0, z: 0 }, // Center of previous segment
          { x: 0, y: 0, z: 0 } // Center of current segment
        );

        joint = world.createImpulseJoint(
          params,
          prevLink.rigidBody,
          rigidBody,
          true
        );
      } else {
        // Connect remaining segments with rope joints
        const prevLink = this.cordLinks[this.cordLinks.length - 1];

        // Use a rope joint (distance constraint with max length only)
        const params = RAPIER.JointData.rope(
          segmentLength * 1.2, // Max length (20% longer than segment for slack)
          { x: 0, y: 0, z: 0 }, // Center of previous segment
          { x: 0, y: 0, z: 0 } // Center of current segment
        );

        joint = world.createImpulseJoint(
          params,
          prevLink.rigidBody,
          rigidBody,
          true
        );
      }

      this.cordLinks.push({
        rigidBody,
        mesh,
        joint,
        isAnchor: false,
      });
    }

    // Create receiver anchor (kinematic body that will follow the receiver)
    const receiverAnchorDesc =
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        receiverPos.x,
        receiverPos.y,
        receiverPos.z
      );
    this.receiverAnchor = world.createRigidBody(receiverAnchorDesc);

    // Attach last segment to receiver anchor with rope joint
    const lastLink = this.cordLinks[this.cordLinks.length - 1];
    const lastJointParams = RAPIER.JointData.rope(
      segmentLength * 1.2, // Max length (20% longer for slack)
      { x: 0, y: 0, z: 0 }, // Last segment center
      { x: 0, y: 0, z: 0 } // Receiver anchor center
    );
    const lastJoint = world.createImpulseJoint(
      lastJointParams,
      lastLink.rigidBody,
      this.receiverAnchor,
      true
    );

    // Store reference to last joint
    this.cordLinks.push({
      rigidBody: this.receiverAnchor,
      mesh: null,
      joint: lastJoint,
      isAnchor: true,
      isReceiverAnchor: true,
    });

    // Create visual line to represent the cord
    this.createCordLine();

    console.log("PhoneBooth: Phone cord created successfully");
  }

  /**
   * Create a visual line mesh for the phone cord
   */
  createCordLine() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((this.config.cordSegments + 2) * 3);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Use TubeGeometry for a thicker, 3D cord
    const material = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.3,
      roughness: 0.8,
    });

    // We'll update this to use a tube in the update method
    // For now, create a basic line that we'll replace
    this.cordLineMesh = new THREE.Line(geometry, material);
    this.cordLineMesh.renderOrder = 1; // Render after most objects
    this.scene.add(this.cordLineMesh);
  }

  /**
   * Update the visual line to match physics simulation
   */
  updateCordLine() {
    if (!this.cordLineMesh || !this.cordAttach || !this.receiver) return;

    // Collect all points along the cord
    const points = [];

    // Start point (CordAttach)
    const cordAttachPos = new THREE.Vector3();
    this.cordAttach.getWorldPosition(cordAttachPos);
    points.push(cordAttachPos.clone());

    // Cord segments (skip the anchor, start from actual segments)
    for (let i = 1; i < this.cordLinks.length; i++) {
      const link = this.cordLinks[i];
      if (link.isAnchor) continue;

      const translation = link.rigidBody.translation();
      points.push(
        new THREE.Vector3(translation.x, translation.y, translation.z)
      );
    }

    // End point (Receiver)
    const receiverPos = new THREE.Vector3();
    this.receiver.getWorldPosition(receiverPos);
    points.push(receiverPos.clone());

    // Create a smooth curve through the points
    const curve = new THREE.CatmullRomCurve3(points);

    // Create tube geometry along the curve
    const tubeGeometry = new THREE.TubeGeometry(
      curve,
      points.length * 2, // segments
      0.008, // radius (thicker than the physics collider)
      8, // radial segments
      false // not closed
    );

    // Replace the old geometry
    if (this.cordLineMesh.geometry) {
      this.cordLineMesh.geometry.dispose();
    }
    this.cordLineMesh.geometry = tubeGeometry;
  }

  /**
   * Destroy the phone cord physics and visuals
   */
  destroyPhoneCord() {
    if (!this.physicsManager) return;

    const world = this.physicsManager.world;

    // Remove all cord links
    for (const link of this.cordLinks) {
      if (link.joint) {
        world.removeImpulseJoint(link.joint, true);
      }
      if (link.rigidBody) {
        world.removeRigidBody(link.rigidBody);
      }
      if (link.mesh) {
        this.scene.remove(link.mesh);
        link.mesh.geometry.dispose();
        link.mesh.material.dispose();
      }
    }

    this.cordLinks = [];
    this.receiverAnchor = null;

    // Remove line mesh
    if (this.cordLineMesh) {
      this.scene.remove(this.cordLineMesh);
      this.cordLineMesh.geometry.dispose();
      this.cordLineMesh.material.dispose();
      this.cordLineMesh = null;
    }

    console.log("PhoneBooth: Phone cord destroyed");
  }

  /**
   * Handle phonebooth animation finished
   * Called when the phone booth ring animation completes
   */
  handleAnimationFinished() {
    console.log("PhoneBooth: Ring animation finished, reparenting receiver");

    // Keep the cord - it will follow the receiver as it moves
    this.reparentReceiver();
  }

  /**
   * Reparent the receiver from the phone booth to the camera
   * Preserves world position and smoothly lerps to target position
   */
  reparentReceiver() {
    if (!this.sceneManager || !this.camera) {
      console.warn("PhoneBooth: Cannot reparent receiver - missing managers");
      return;
    }

    // Reparent the "Receiver" mesh from phonebooth to camera
    // This preserves world position using THREE.js attach()
    this.receiver = this.sceneManager.reparentChild(
      "phonebooth",
      "Receiver",
      this.camera
    );

    if (this.receiver) {
      // Log receiver transform info for debugging
      const worldPos = new THREE.Vector3();
      this.receiver.getWorldPosition(worldPos);

      console.log("PhoneBooth: Receiver successfully attached to camera");
      console.log("  Local position:", this.receiver.position.toArray());
      console.log(
        "  Local rotation:",
        this.receiver.rotation.toArray().slice(0, 3)
      );
      console.log("  Local scale:", this.receiver.scale.toArray());
      console.log("  World position:", worldPos.toArray());
      console.log("  Parent:", this.receiver.parent?.type || "none");

      // Start lerp animation to move receiver to target position
      this.startReceiverLerp();
    } else {
      console.warn("PhoneBooth: Failed to attach receiver to camera");
    }
  }

  /**
   * Start the receiver lerp animation
   * Smoothly moves receiver from its current position to the target position
   */
  startReceiverLerp() {
    if (!this.receiver) {
      console.warn("PhoneBooth: Cannot start lerp - no receiver");
      return;
    }

    this.receiverLerp = {
      object: this.receiver,
      startPos: this.receiver.position.clone(),
      targetPos: this.config.receiverTargetPos,
      duration: this.config.receiverLerpDuration,
      elapsed: 0,
    };

    console.log("PhoneBooth: Starting receiver lerp animation");
  }

  /**
   * Update receiver lerp animation
   * @param {number} dt - Delta time in seconds
   */
  updateReceiverLerp(dt) {
    if (!this.receiverLerp) return;

    this.receiverLerp.elapsed += dt;
    const t = Math.min(
      1,
      this.receiverLerp.elapsed / this.receiverLerp.duration
    );

    // Apply easing
    const eased = this.config.receiverLerpEase(t);

    // Lerp position only (keep original rotation from animation)
    this.receiverLerp.object.position.lerpVectors(
      this.receiverLerp.startPos,
      this.receiverLerp.targetPos,
      eased
    );

    // Complete animation
    if (t >= 1) {
      console.log("PhoneBooth: Receiver lerp animation complete");
      this.receiverLerp = null;
    }
  }

  /**
   * Update method - call in animation loop
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    this.updateReceiverLerp(dt);

    // Update receiver anchor position to follow the receiver
    if (this.receiverAnchor && this.receiver) {
      const receiverPos = new THREE.Vector3();
      this.receiver.getWorldPosition(receiverPos);
      this.receiverAnchor.setTranslation(
        { x: receiverPos.x, y: receiverPos.y, z: receiverPos.z },
        true
      );
    }

    // Update the visual cord (no individual meshes to update)
    if (this.cordLinks.length > 0) {
      this.updateCordLine();
    }
  }

  /**
   * Set receiver target position
   * @param {THREE.Vector3} position - Target position relative to camera
   */
  setReceiverTargetPosition(position) {
    this.config.receiverTargetPos.copy(position);
  }

  /**
   * Set receiver lerp duration
   * @param {number} duration - Duration in seconds
   */
  setReceiverLerpDuration(duration) {
    this.config.receiverLerpDuration = duration;
  }

  /**
   * Get receiver object
   * @returns {THREE.Object3D|null}
   */
  getReceiver() {
    return this.receiver;
  }

  /**
   * Check if receiver is attached to camera
   * @returns {boolean}
   */
  isReceiverAttached() {
    return this.receiver !== null && this.receiver.parent === this.camera;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.destroyPhoneCord();

    if (this.receiver && this.receiver.parent) {
      this.receiver.parent.remove(this.receiver);
    }
    this.receiver = null;
    this.receiverLerp = null;
    this.cordAttach = null;
    this.receiverAnchor = null;
  }
}

export default PhoneBooth;
