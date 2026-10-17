// src/utils/graph/nodeStyles.js
import { NODE_TYPE_COLORS, LAYOUT_CONFIG } from "./constants.js";

export function getNodeColor(type) {
  return NODE_TYPE_COLORS[type] || NODE_TYPE_COLORS.default;
}

/**
 * Builds node style and zIndex according to node state and Phase 4.5 search highlight context.
 * 
 * @param {string} nodeType
 * @param {boolean} isExpanded
 * @param {boolean} hasChildren
 * @param {Object} [highlightState]
 * @param {boolean} [highlightState.isPrimary=false]
 * @param {boolean} [highlightState.isRelated=false]
 * @param {boolean} [highlightState.isFocused=false]
 * @param {boolean} [highlightState.isSearchActive=false]
 * @returns {{ style: Object, zIndex: number }}
 */
export function buildNodeStyle(nodeType, isExpanded, hasChildren, highlightState = {}) {
  const {
    isPrimary = false,
    isRelated = false,
    isFocused = false,
    isSearchActive = false,
  } = highlightState;

  const baseColor = getNodeColor(nodeType);

  let border = isExpanded ? "2px solid #2196f3" : "1px solid #777";
  let background = baseColor;
  let boxShadow = "none";
  let opacity = 1;
  let zIndex = 1;
  let outline = "none";
  let outlineOffset = "0px";

  if (isSearchActive) {
    if (isPrimary) {
      border = "3px solid #ec4899";
      background = "#fdf2f8";
      boxShadow = "0 0 16px rgba(236, 72, 153, 0.5)";
      zIndex = 15;
      opacity = 1;
    } else if (isRelated) {
      border = "2.5px solid #0284c7";
      background = "#f0f9ff";
      boxShadow = "0 0 12px rgba(2, 132, 199, 0.4)";
      zIndex = 10;
      opacity = 1;
    } else {
      // Unrelated nodes when search is active are de-emphasized
      opacity = 0.35;
      zIndex = 1;
    }

    if (isFocused) {
      outline = "3px solid #f59e0b";
      outlineOffset = "3px";
      zIndex = 25;
      opacity = 1;
    }
  }

  const style = {
    background,
    border,
    boxShadow,
    opacity,
    outline,
    outlineOffset,
    borderRadius: "6px",
    padding: "8px",
    fontSize: "12px",
    fontWeight: hasChildren || isPrimary || isRelated ? "bold" : "normal",
    cursor: hasChildren ? "pointer" : "default",
    width: LAYOUT_CONFIG.NODE_WIDTH,
    transition: "all 0.25s ease-in-out",
  };

  return { style, zIndex };
}
