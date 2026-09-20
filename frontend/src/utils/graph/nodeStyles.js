// src/utils/graph/nodeStyles.js
import { NODE_TYPE_COLORS, LAYOUT_CONFIG } from "./constants";

export function getNodeColor(type) {
  return NODE_TYPE_COLORS[type] || NODE_TYPE_COLORS.default;
}

export function buildNodeStyle(nodeType, isExpanded, hasChildren) {
  return {
    background: getNodeColor(nodeType),
    border: isExpanded ? "2px solid #2196f3" : "1px solid #777",
    borderRadius: "6px",
    padding: "8px",
    fontSize: "12px",
    fontWeight: hasChildren ? "bold" : "normal",
    cursor: hasChildren ? "pointer" : "default",
    width: LAYOUT_CONFIG.NODE_WIDTH,
  };
}
