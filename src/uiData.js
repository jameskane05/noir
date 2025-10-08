/**
 * UI Data - Centralized UI element definitions
 *
 * This file contains configuration for various UI elements that are
 * managed by the UIManager system.
 */

export const uiElements = {
  FULLSCREEN_BUTTON: {
    id: "fullscreen-button",
    layer: "GAME_HUD",
    image: "/images/fullscreen.png",
    position: {
      bottom: "5%",
      left: "5%",
    },
    size: {
      width: "144px",
      height: "144px",
    },
    style: {
      cursor: "pointer",
      opacity: "1.0",
      transition: "opacity 0.3s ease, transform 0.2s ease",
      pointerEvents: "all",
    },
    hoverStyle: {
      opacity: "1.0",
      transform: "scale(1.15)",
    },
    blocksInput: false,
    pausesGame: false,
  },
};

export default uiElements;
