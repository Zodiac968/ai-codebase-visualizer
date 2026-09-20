// src/utils/graph/constants.js

export const LAYOUT_CONFIG = {
  NODE_WIDTH: 200,
  NODE_HEIGHT: 50,
  THRESHOLD_IN_GROUP: 3,
  VERTICAL_GAP: 40,   // Clearance between vertically stacked function nodes
  HORIZONTAL_GAP: 60, // Clearance between horizontal groups
  GROUP_GAP: 80,      // Clearance between type groups
  LEVEL_GAP: 100,     // Vertical gap between hierarchy levels
};

export const NODE_TYPE_COLORS = {
  repository: "#ffe0b2",
  folder: "#fff9c4",
  file: "#e1f5fe",
  class: "#e8f5e9",
  function: "#f3e5f5",
  method: "#fce4ec",
  import: "#f5f5f5",
  default: "#ffffff",
};
