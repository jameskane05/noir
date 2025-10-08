import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

/**
 * GizmoManager - Debug tool for positioning assets in 3D space
 *
 * Features:
 * - Auto-attaches gizmo to objects with gizmo: true
 * - Drag gizmo arrows/rings to move/rotate/scale
 * - Switch between translate/rotate/scale modes
 * - Log position/rotation/scale on release
 * - Works with meshes, splats, and video planes
 *
 * Usage:
 * - Set gizmo: true in object data (videoData.js, sceneData.js, etc.)
 * - Gizmo appears automatically on first registered object
 * - Click other gizmo objects to switch between them
 * - G = translate, R = rotate, S = scale
 * - W = world space, L = local space
 * - Drag to manipulate, release to log position
 */
class GizmoManager {
  constructor(scene, camera, renderer, options = {}) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.enabled = false;

    // Configurable objects
    this.objects = []; // Objects that can be selected
    this.control = null;
    this.controlHelper = null; // Object3D returned by TransformControls.getHelper()
    this.isGizmoDragging = false;
    this.isGizmoHovering = false;
    this.isVisible = true;
    this.hasGizmoInDefinitions = false; // from data definitions (even if not instantiated)
    // Integration targets for standardized global effects
    this.idleHelper = null;
    this.inputManager = null;
    this.selectedObject = null;

    // Raycaster for object picking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Always enable (will only affect objects with gizmo: true)
    this.enable();
  }

  /**
   * Wire integrations so gizmo presence can standardize global effects
   * @param {Object} idleHelper
   * @param {Object} inputManager
   */
  setIntegration(idleHelper, inputManager) {
    this.idleHelper = idleHelper || null;
    this.inputManager = inputManager || null;
    this.updateGlobalBlocks();
  }

  /**
   * Apply or clear global blocks based on whether any gizmo objects are registered
   */
  updateGlobalBlocks() {
    const hasGizmoRuntime = this.objects && this.objects.length > 0;
    const hasGizmo = this.hasGizmoInDefinitions || hasGizmoRuntime;
    if (
      this.idleHelper &&
      typeof this.idleHelper.setGlobalDisable === "function"
    ) {
      this.idleHelper.setGlobalDisable(hasGizmo);
    }
    if (
      this.inputManager &&
      typeof this.inputManager.setPointerLockBlocked === "function"
    ) {
      this.inputManager.setPointerLockBlocked(hasGizmo);
    }
  }

  /**
   * Evaluate gizmo flags directly from data definitions (scene/video/etc.)
   * and standardize global side-effects regardless of instantiation status
   * @param {Object} options
   * @param {Object|Array} options.sceneDefs - map or array of scene defs
   * @param {Object|Array} options.videoDefs - map or array of video defs
   */
  applyGlobalBlocksFromDefinitions({
    sceneDefs = null,
    videoDefs = null,
  } = {}) {
    const collect = (defs) => {
      if (!defs) return [];
      if (Array.isArray(defs)) return defs;
      if (typeof defs === "object") return Object.values(defs);
      return [];
    };
    const all = [...collect(sceneDefs), ...collect(videoDefs)];
    this.hasGizmoInDefinitions = all.some((d) => d && d.gizmo === true);
    // Inform gameManager (if available via window) so all managers share the same flag
    try {
      if (
        window?.gameManager &&
        typeof window.gameManager.setState === "function"
      ) {
        window.gameManager.setState({
          hasGizmoInData: this.hasGizmoInDefinitions,
        });
      }
    } catch {}
    this.updateGlobalBlocks();
  }

  /**
   * Register all gizmo-enabled scene objects from a SceneManager
   * @param {Object} sceneManager - Instance of SceneManager
   */
  registerSceneObjects(sceneManager) {
    if (!sceneManager || !sceneManager.objects || !sceneManager.objectData) {
      return;
    }
    try {
      sceneManager.objects.forEach((obj, id) => {
        const data = sceneManager.objectData.get(id);
        if (data && data.gizmo) {
          this.registerObject(obj, id, data.type || "scene");
        }
      });
    } catch (e) {
      console.warn("GizmoManager: registerSceneObjects failed:", e);
    }
  }

  /**
   * Check whether any scene object is gizmo-enabled
   * @param {Object} sceneManager - Instance of SceneManager
   * @returns {boolean}
   */
  hasAnyGizmoObjects(sceneManager) {
    try {
      const values = Array.from(sceneManager?.objectData?.values() || []);
      return values.some((d) => d && d.gizmo === true);
    } catch {
      return false;
    }
  }

  /**
   * If any gizmo-enabled object exists, disable idle behaviors globally
   * @param {Object} idleHelper - Instance of IdleHelper
   * @param {Object} sceneManager - Instance of SceneManager
   */
  applyIdleBlockIfNeeded(idleHelper, sceneManager) {
    if (!idleHelper) return;
    if (this.hasAnyGizmoObjects(sceneManager)) {
      if (typeof idleHelper.setGlobalDisable === "function") {
        idleHelper.setGlobalDisable(true);
        console.log(
          "IdleHelper: Globally disabled due to gizmo-enabled object(s)"
        );
      }
    }
  }

  /**
   * If any gizmo-enabled object exists, block pointer lock for easier gizmo manipulation
   * @param {Object} inputManager - Instance of InputManager
   * @param {Object} sceneManager - Instance of SceneManager
   */
  applyPointerLockBlockIfNeeded(inputManager, sceneManager) {
    if (
      !inputManager ||
      typeof inputManager.setPointerLockBlocked !== "function"
    )
      return;
    const shouldBlock = this.hasAnyGizmoObjects(sceneManager);
    inputManager.setPointerLockBlocked(shouldBlock);
    if (shouldBlock) {
      console.log(
        "InputManager: Pointer lock blocked due to gizmo-enabled object(s)"
      );
    }
  }

  /**
   * Enable the gizmo system
   */
  enable() {
    if (this.enabled) return;
    this.enabled = true;

    // Create TransformControls
    this.control = new TransformControls(this.camera, this.renderer.domElement);
    this.control.setMode("translate");
    this.control.setSpace("world");
    // Add the visual helper Object3D (recommended in docs)
    if (typeof this.control.getHelper === "function") {
      this.controlHelper = this.control.getHelper();
      if (this.controlHelper) {
        this.scene.add(this.controlHelper);
        console.log("GizmoManager: Added TransformControls helper to scene");
        // Start hidden until we actually select/attach
        this.controlHelper.visible = false;
      }
    }

    // Setup event listeners
    this.setupEventListeners();

    console.log("GizmoManager: Enabled");
    console.log("  - Gizmo auto-attaches to objects with gizmo: true");
    console.log("  - G = Translate, R = Rotate, S = Scale");
    console.log("  - W = World space, L = Local space");
    console.log("  - Drag gizmo to manipulate, release to log position");
  }

  /**
   * Disable the gizmo system
   */
  disable() {
    if (!this.enabled) return;
    this.enabled = false;

    if (this.control) {
      this.control.dispose();
      this.control = null;
    }

    if (this.controlHelper) {
      if (this.controlHelper.parent) {
        this.controlHelper.parent.remove(this.controlHelper);
      }
      this.controlHelper = null;
    }

    this.removeEventListeners();
    console.log("GizmoManager: Disabled");
  }

  /**
   * Register an object that can be selected and manipulated
   * Auto-attaches gizmo immediately (no click required)
   * @param {THREE.Object3D} object - The object to register
   * @param {string} id - Optional identifier for logging
   * @param {string} type - Optional type (mesh, splat, video)
   */
  registerObject(object, id = null, type = "object") {
    if (!object) {
      console.warn("GizmoManager: Attempted to register null object");
      return;
    }

    const item = {
      object,
      id: id || object.name || "unnamed",
      type,
    };

    this.objects.push(item);

    console.log(`GizmoManager: Registered "${id}" (${type})`, object);
    console.log(`  Total registered objects: ${this.objects.length}`);

    // Auto-select the first object (or if only one object, attach to it)
    if (this.objects.length === 1) {
      this.selectObject(item);
      console.log(`GizmoManager: Auto-attached gizmo to "${id}"`);
    }

    // Standardize side-effects when any gizmo is present
    this.updateGlobalBlocks();
  }

  /**
   * Select an already-registered object by id and attach the gizmo
   * @param {string} id
   */
  selectObjectById(id) {
    if (!id) return;
    const item = this.objects.find((it) => it.id === id);
    if (item) {
      this.selectObject(item);
    }
  }

  /**
   * Unregister an object
   * @param {THREE.Object3D} object - The object to unregister
   */
  unregisterObject(object) {
    const index = this.objects.findIndex((item) => item.object === object);
    if (index !== -1) {
      this.objects.splice(index, 1);
    }
    // Update global effects when gizmo set changes
    this.updateGlobalBlocks();
  }

  /**
   * Setup event listeners for gizmo interaction
   */
  setupEventListeners() {
    // Mouse click for object selection
    this.onMouseDown = this.handleMouseDown.bind(this);
    this.renderer.domElement.addEventListener("mousedown", this.onMouseDown);

    // Mouse up for logging position
    this.onMouseUp = this.handleMouseUp.bind(this);
    this.renderer.domElement.addEventListener("mouseup", this.onMouseUp);

    // Keyboard shortcuts
    this.onKeyDown = this.handleKeyDown.bind(this);
    window.addEventListener("keydown", this.onKeyDown);

    // Track gizmo drag/hover state
    this.control.addEventListener("dragging-changed", (event) => {
      // Emit event for other systems to pause (e.g., character controller)
      if (event.value) {
        this.isGizmoDragging = true;
        console.log("GizmoManager: Dragging started");
      } else {
        this.isGizmoDragging = false;
        console.log("GizmoManager: Dragging ended");
        this.logObjectTransform();
      }
    });

    // Hover state over gizmo handles
    if (typeof this.control.addEventListener === "function") {
      this.control.addEventListener("hoveron", () => {
        this.isGizmoHovering = true;
      });
      this.control.addEventListener("hoveroff", () => {
        this.isGizmoHovering = false;
      });
    }
  }

  /**
   * Returns true if pointer is interacting with the gizmo (hovering or dragging)
   */
  isPointerOverGizmo() {
    return this.isGizmoHovering || this.isGizmoDragging;
  }

  /**
   * Remove event listeners
   */
  removeEventListeners() {
    if (this.onMouseDown) {
      this.renderer.domElement.removeEventListener(
        "mousedown",
        this.onMouseDown
      );
    }
    if (this.onMouseUp) {
      this.renderer.domElement.removeEventListener("mouseup", this.onMouseUp);
    }
    if (this.onKeyDown) {
      window.addEventListener("keydown", this.onKeyDown);
    }
  }

  /**
   * Handle mouse down for object selection
   */
  handleMouseDown(event) {
    // Ignore if dragging gizmo
    if (this.control && this.control.dragging) return;

    // Calculate mouse position in normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycast to find intersected objects
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Get all selectable objects
    const selectableObjects = this.objects.map((item) => item.object);
    const intersects = this.raycaster.intersectObjects(selectableObjects, true);

    if (intersects.length > 0) {
      // Find the top-level registered object
      let selectedObj = null;
      for (const item of this.objects) {
        if (
          intersects[0].object === item.object ||
          intersects[0].object.parent === item.object ||
          item.object.children.includes(intersects[0].object)
        ) {
          selectedObj = item;
          break;
        }
      }

      if (selectedObj) {
        this.selectObject(selectedObj);
      }
    }
  }

  /**
   * Handle mouse up
   */
  handleMouseUp(event) {
    // Log position when releasing after drag
    if (this.selectedObject && this.control && !this.control.dragging) {
      // Position was already logged in dragging-changed event
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyDown(event) {
    if (!this.enabled || !this.control) return;

    // Ignore if typing in an input
    if (
      document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA"
    ) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case "g":
        this.control.setMode("translate");
        console.log("GizmoManager: Mode = Translate");
        break;
      case "r":
        this.control.setMode("rotate");
        console.log("GizmoManager: Mode = Rotate");
        break;
      case "s":
        this.control.setMode("scale");
        console.log("GizmoManager: Mode = Scale");
        break;
      case "w":
        this.control.setSpace("world");
        console.log("GizmoManager: Space = World");
        break;
      case "l":
        this.control.setSpace("local");
        console.log("GizmoManager: Space = Local");
        break;
      case "h":
        this.setVisible(!this.isVisible);
        console.log(`GizmoManager: ${this.isVisible ? "Shown" : "Hidden"}`);
        break;
      case "escape":
        this.deselectObject();
        break;
    }
  }

  /**
   * Show/hide gizmo visuals and interaction
   */
  setVisible(visible) {
    this.isVisible = !!visible;
    if (this.controlHelper) {
      // Only show helper when we have a selected object
      this.controlHelper.visible = this.isVisible && !!this.selectedObject;
    }
    if (this.control) {
      this.control.enabled = this.isVisible;
    }
  }

  /**
   * Select an object
   */
  selectObject(item) {
    this.selectedObject = item;
    this.control.attach(item.object);
    if (this.controlHelper) this.controlHelper.visible = this.isVisible;

    console.log(`GizmoManager: Selected "${item.id}" (${item.type})`);
    this.logObjectTransform();
  }

  /**
   * Deselect current object
   */
  deselectObject() {
    if (this.selectedObject) {
      console.log(`GizmoManager: Deselected "${this.selectedObject.id}"`);
      this.selectedObject = null;
    }
    this.control.detach();
    if (this.controlHelper) this.controlHelper.visible = false;
  }

  /**
   * Log the current object's transform
   */
  logObjectTransform() {
    if (!this.selectedObject) return;

    const obj = this.selectedObject.object;
    const pos = obj.position;
    const rot = obj.rotation;
    const scale = obj.scale;

    console.log(
      `\n=== ${this.selectedObject.id} (${this.selectedObject.type}) ===`
    );
    console.log(
      `position: [${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(
        2
      )}],`
    );
    console.log(
      `rotation: [${rot.x.toFixed(4)}, ${rot.y.toFixed(4)}, ${rot.z.toFixed(
        4
      )}],`
    );
    console.log(
      `scale: [${scale.x.toFixed(2)}, ${scale.y.toFixed(2)}, ${scale.z.toFixed(
        2
      )}],`
    );
    console.log("");
  }

  /**
   * Update method (call in animation loop if needed)
   */
  update(dt) {
    // TransformControls handles its own updates
  }

  /**
   * Clean up
   */
  destroy() {
    this.disable();
    this.objects = [];
  }
}

export default GizmoManager;
