/**
 * Example: How to use the Dialog System
 *
 * This file demonstrates how to integrate and use the DialogManager
 * with your game. Copy the relevant parts into your main.js
 */

import DialogManager from "./dialogManager.js";
import GameManager from "./gameManager.js";
import MusicManager from "./musicManager.js";
import { dialogSequences, dialogTriggers } from "./dialogData.js";

// =============================================================================
// SETUP (add to your initialization code)
// =============================================================================

// Create managers
const dialogManager = new DialogManager({
  audioVolume: 0.8,

  // Use text splats for captions (recommended)
  useSplats: true,
  scene: scene, // Your THREE.Scene
  camera: camera, // Your THREE.Camera

  // Optional: customize text splat appearance
  splatFont: "LePorsche",
  splatFontSize: 60,
  splatColor: new THREE.Color(0xffffff),
  splatPosition: { x: 0, y: -1.5, z: -10 }, // Position relative to camera
  splatScale: 1.0 / 80,

  // OR use HTML captions instead:
  // useSplats: false,
  // captionElement: document.getElementById('my-caption')
});

const gameManager = new GameManager();
const musicManager = new MusicManager({ defaultVolume: 0.6 });

// Initialize game manager with other managers
gameManager.initialize({
  dialogManager,
  musicManager,
});

// =============================================================================
// CUSTOM CAPTION STYLING (only for HTML mode)
// =============================================================================

// If using HTML captions (useSplats: false), you can customize styling:
// dialogManager.setCaptionStyle({
//   fontFamily: "LePorsche, Arial, sans-serif",
//   fontSize: "28px",
//   background: "rgba(0, 0, 0, 0.9)",
//   padding: "25px 50px",
//   borderRadius: "12px",
//   color: "#ffffff",
//   textShadow: "2px 2px 4px rgba(0, 0, 0, 0.8)",
// });

// =============================================================================
// EVENT LISTENERS
// =============================================================================

// Listen for dialog events
dialogManager.on("dialog:play", (dialogData) => {
  console.log("Dialog started:", dialogData.id);
});

dialogManager.on("dialog:complete", (dialogData) => {
  console.log("Dialog completed:", dialogData.id);
});

dialogManager.on("dialog:caption", (caption) => {
  console.log("Showing caption:", caption.text);
});

// Listen for game events
gameManager.on("game:started", () => {
  console.log("Game started!");
  // Play intro dialog when game starts
  const introDialog = dialogSequences[dialogTriggers.onGameStart];
  if (introDialog) {
    gameManager.playDialog(introDialog.id, introDialog);
  }
});

// =============================================================================
// PLAYING DIALOG - Method 1: Direct
// =============================================================================

function playIntroDialog() {
  dialogManager.playDialog(dialogSequences.intro, (completed) => {
    console.log("Intro finished, starting game...");
    gameManager.start();
  });
}

// =============================================================================
// PLAYING DIALOG - Method 2: Through GameManager
// =============================================================================

function playGreetingDialog() {
  gameManager.playDialog("greeting", dialogSequences.greeting, (completed) => {
    console.log("Greeting finished!");
    // Maybe start tutorial next?
    gameManager.playDialog("tutorial", dialogSequences.tutorial);
  });
}

// =============================================================================
// PLAYING DIALOG - Method 3: Event-based triggers
// =============================================================================

// Example: Trigger dialog when player enters a zone
function checkPlayerPosition(playerPos) {
  // If player near specific location, play dialog
  if (playerPos.x > 10 && playerPos.z < 5) {
    if (!gameManager.getState().hasSeenWarning) {
      gameManager.playDialog("warning", dialogSequences.warning, () => {
        gameManager.setState({ hasSeenWarning: true });
      });
    }
  }
}

// =============================================================================
// KEYBOARD SHORTCUTS FOR TESTING
// =============================================================================

window.addEventListener("keydown", (event) => {
  switch (event.key.toLowerCase()) {
    case "1":
      // Play intro dialog
      dialogManager.playDialog(dialogSequences.intro);
      break;
    case "2":
      // Play greeting dialog
      dialogManager.playDialog(dialogSequences.greeting);
      break;
    case "3":
      // Play tutorial dialog
      dialogManager.playDialog(dialogSequences.tutorial);
      break;
    case "4":
      // Play warning dialog
      dialogManager.playDialog(dialogSequences.warning);
      break;
    case "escape":
      // Stop current dialog
      dialogManager.stopDialog();
      break;
  }
});

// =============================================================================
// UPDATE LOOP (add to your animation loop)
// =============================================================================

function animate(time) {
  const dt = getDeltaTime(); // Your delta time calculation

  // Update dialog manager (handles caption timing)
  dialogManager.update(dt);

  // Update game manager if needed
  gameManager.update(dt);

  // ... rest of your update code
}

// =============================================================================
// CLEANUP (call when shutting down)
// =============================================================================

function cleanup() {
  dialogManager.destroy();
  musicManager.destroy();
}

// Export for use in other files
export {
  dialogManager,
  gameManager,
  musicManager,
  playIntroDialog,
  playGreetingDialog,
};
