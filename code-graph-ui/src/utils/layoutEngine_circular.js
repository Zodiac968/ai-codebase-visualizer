// src/utils/layoutEngine.js
import { Position, MarkerType } from "@xyflow/react";
import { LAYOUT_CONFIG } from "./constants";
import { buildNodeStyle } from "./nodeStyles";

const BASE_RING_GAP = 280;   // Distance between concentric rings
const MIN_ARC_SPACING = 200; // Minimum arc distance (px) reserved per leaf node

/**
 * Color and style definitions for relationship types
 */
const RELATIONSHIP_STYLES = {
  CALL: { color: "#10b981", dash: undefined },
  CALLS: { color: "#10b981", dash: undefined },
  IMPORT: { color: "#ff5722", dash: "5,5" },
  IMPORTS: { color: "#ff5722", dash: "5,5" },
  INHERITS: { color: "#8b5cf6", dash: "6,3" },
  EXTENDS: { color: "#8b5cf6", dash: "6,3" },
  IMPLEMENTS: { color: "#3b82f6", dash: "3,3" },
  USES: { color: "#f59e0b", dash: "4,4" },
  REFERENCES: { color: "#f59e0b", dash: "4,4" },
  READS: { color: "#14b8a6", dash: undefined },
  WRITES: { color: "#ef4444", dash: undefined },
  INSTANTIATES: { color: "#ec4899", dash: "2,2" },
  CREATES: { color: "#ec4899", dash: "2,2" },
  EXPORTS: { color: "#06b6d4", dash: "5,5" },
};

const FALLBACK_PALETTE = [
  "#6366f1", "#d97706", "#059669", "#db2777",
  "#4f46e5", "#0891b2", "#84cc16", "#a855f7",
];

function getRelationshipStyle(relType, sourceNodeType) {
  if (!relType) return { color: "#64748b", dash: undefined };
  const normType = String(relType).toUpperCase();

  if (RELATIONSHIP_STYLES[normType]) return RELATIONSHIP_STYLES[normType];
  if (sourceNodeType === "function" || sourceNodeType === "method") {
    return RELATIONSHIP_STYLES.CALLS;
  }

  let hash = 0;
  for (let i = 0; i < normType.length; i++) {
    hash = normType.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % FALLBACK_PALETTE.length;
  return { color: FALLBACK_PALETTE[colorIndex], dash: "5,5" };
}

/**
 * Maps a polar angle (radians) to standard React Flow Position enum.
 * Canvas orientation: 0 = Right, PI/2 = Down, PI = Left, 3PI/2 = Up
 */
function angleToPosition(angle) {
  let norm = angle % (2 * Math.PI);
  if (norm < 0) norm += 2 * Math.PI;

  if (norm >= (7 * Math.PI) / 4 || norm < Math.PI / 4) return Position.Right;
  if (norm >= Math.PI / 4 && norm < (3 * Math.PI) / 4) return Position.Bottom;
  if (norm >= (3 * Math.PI) / 4 && norm < (5 * Math.PI) / 4) return Position.Left;
  return Position.Top;
}

export function computeHierarchyLayout(
  allNodes = [],
  allEdges = [],
  expandedNodes = new Set()
) {
  if (!allNodes || allNodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodeMap = new Map();
  const childrenMap = new Map();
  const expandedSet = new Set(Array.from(expandedNodes || []).map(String));

  // 1. Index Nodes and Parent-Child Relationships
  allNodes.forEach((node) => {
    nodeMap.set(String(node.id), node);
  });

  allNodes.forEach((node) => {
    const id = String(node.id);
    const parentId = node.parent_id ? String(node.parent_id) : null;
    if (parentId && nodeMap.has(parentId)) {
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId).push(node);
    }
  });

  // 2. Identify Primary Root Node (Center)
  let rootNode = allNodes.find((n) => !n.parent_id || !nodeMap.has(String(n.parent_id)));
  if (!rootNode) rootNode = allNodes[0];
  const rootId = String(rootNode.id);

  // 3. Mark Visible Nodes & Determine Node Depths
  const visibleNodeIds = new Set();
  const nodeDepths = new Map();

  function markVisible(nodeId, depth = 0) {
    const id = String(nodeId);
    visibleNodeIds.add(id);
    nodeDepths.set(id, depth);

    if (expandedSet.has(id)) {
      const children = childrenMap.get(id) || [];
      children.forEach((c) => markVisible(c.id, depth + 1));
    }
  }

  markVisible(rootId, 0);

  // 4. Initial Ring Radii Calculation
  let maxDepth = 0;
  nodeDepths.forEach((d) => {
    if (d > maxDepth) maxDepth = d;
  });

  const ringRadii = new Map();
  ringRadii.set(0, 0); // Root at (0,0)
  for (let d = 1; d <= maxDepth + 1; d++) {
    ringRadii.set(d, d * BASE_RING_GAP);
  }

  // 5. Bottom-Up Calculation of Required Angular Spans
  const requiredAngles = new Map();

  function computeRequiredAngle(nodeId) {
    const id = String(nodeId);
    const depth = nodeDepths.get(id) || 0;
    const radius = ringRadii.get(depth) || depth * BASE_RING_GAP;

    const children = expandedSet.has(id) ? childrenMap.get(id) || [] : [];

    if (children.length === 0) {
      const minAngle = radius > 0 ? MIN_ARC_SPACING / radius : 2 * Math.PI;
      requiredAngles.set(id, minAngle);
      return minAngle;
    }

    let childrenAngleSum = 0;
    children.forEach((child) => {
      childrenAngleSum += computeRequiredAngle(child.id);
    });

    const minAngleSelf = radius > 0 ? MIN_ARC_SPACING / radius : 2 * Math.PI;
    const finalAngle = Math.max(childrenAngleSum, minAngleSelf);
    requiredAngles.set(id, finalAngle);
    return finalAngle;
  }

  const rootChildren = childrenMap.get(rootId) || [];
  let totalRootRequiredAngle = 0;
  if (expandedSet.has(rootId)) {
    rootChildren.forEach((child) => {
      totalRootRequiredAngle += computeRequiredAngle(child.id);
    });
  }

  // 6. Scale Ring Radii dynamically if total required angle exceeds 360 degrees
  if (totalRootRequiredAngle > 2 * Math.PI) {
    const scaleFactor = totalRootRequiredAngle / (2 * Math.PI);
    for (let d = 1; d <= maxDepth + 1; d++) {
      ringRadii.set(d, ringRadii.get(d) * scaleFactor);
    }
    totalRootRequiredAngle = 0;
    rootChildren.forEach((child) => {
      totalRootRequiredAngle += computeRequiredAngle(child.id);
    });
  }

  // 7. Recursive Position Assignment (Polar to Cartesian)
  const layoutedNodes = [];
  const nodeCenters = new Map();

  const nodeWidth = LAYOUT_CONFIG?.NODE_WIDTH || 180;
  const nodeHeight = LAYOUT_CONFIG?.NODE_HEIGHT || 50;

  function positionNode(nodeId, depth, angleStart, angleEnd) {
    const id = String(nodeId);
    const node = nodeMap.get(id);
    if (!node) return;

    const radius = ringRadii.get(depth) || 0;
    const midAngle = (angleStart + angleEnd) / 2;

    const centerX = depth === 0 ? 0 : radius * Math.cos(midAngle);
    const centerY = depth === 0 ? 0 : radius * Math.sin(midAngle);

    nodeCenters.set(id, { x: centerX, y: centerY, angle: midAngle });

    const children = childrenMap.get(id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedSet.has(id);
    const prefix = hasChildren ? (isExpanded ? "[-] " : "[+] ") : "";

    const targetPosition = depth === 0 ? Position.Top : angleToPosition(midAngle + Math.PI);
    const sourcePosition = depth === 0 ? Position.Bottom : angleToPosition(midAngle);

    layoutedNodes.push({
      id,
      data: { label: `${prefix}${node.type ? node.type.toUpperCase() + ": " : ""}${node.name || id}` },
      position: { x: centerX - nodeWidth / 2, y: centerY - nodeHeight / 2 },
      width: nodeWidth,
      height: nodeHeight,
      measured: { width: nodeWidth, height: nodeHeight },
      targetPosition,
      sourcePosition,
      style: buildNodeStyle(node.type, isExpanded, hasChildren),
    });

    if (isExpanded && hasChildren) {
      const parentAllocatedSpan = angleEnd - angleStart;
      const parentRequiredSpan = requiredAngles.get(id) || parentAllocatedSpan;

      let currentAngle = angleStart;

      children.forEach((child) => {
        const childId = String(child.id);
        const childRequired = requiredAngles.get(childId) || (2 * Math.PI / children.length);

        const childSpan = (childRequired / parentRequiredSpan) * parentAllocatedSpan;
        const childAngleEnd = currentAngle + childSpan;

        positionNode(childId, depth + 1, currentAngle, childAngleEnd);
        currentAngle = childAngleEnd;
      });
    }
  }

  // Position Root at center (0,0) allocating full 360° space
  positionNode(rootId, 0, 0, 2 * Math.PI);

  // 8. Build Straight Hierarchy Edges
  const layoutedEdges = [];

  visibleNodeIds.forEach((parentId) => {
    if (!expandedSet.has(parentId)) return;

    const children = childrenMap.get(parentId) || [];

    children.forEach((child) => {
      const childId = String(child.id);
      if (!visibleNodeIds.has(childId)) return;

      layoutedEdges.push({
        id: `hierarchy:${parentId}->${childId}`,
        source: parentId,
        target: childId,
        type: "straight",
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
      });
    });
  });

  // 9. Build Straight Cross-Relationship Edges (ONLY FOR EXPANDED NODES)
  function getLowestVisibleAncestor(nodeId) {
    let curr = String(nodeId);
    while (curr) {
      if (visibleNodeIds.has(curr)) return curr;
      const node = nodeMap.get(curr);
      curr = node && node.parent_id ? String(node.parent_id) : null;
    }
    return null;
  }

  const processedRelKeys = new Set();

  allEdges.forEach((rawEdge) => {
    if (!rawEdge.source || !rawEdge.target) return;
    if (rawEdge.type === "CONTAINS" || rawEdge.type === "hierarchy") return;

    const srcId = String(rawEdge.source);
    const tgtId = String(rawEdge.target);

    // Filter: Only process if the source or target node is explicitly in an expanded state
    const isSourceExpanded = expandedSet.has(srcId);
    const isTargetExpanded = expandedSet.has(tgtId);

    if (!isSourceExpanded && !isTargetExpanded) return;

    const effSrc = getLowestVisibleAncestor(srcId);
    const effTgt = getLowestVisibleAncestor(tgtId);

    if (effSrc && effTgt && effSrc !== effTgt) {
      const edgeKey = `${rawEdge.type || "rel"}:${effSrc}->${effTgt}`;
      if (processedRelKeys.has(edgeKey)) return;
      processedRelKeys.add(edgeKey);

      const srcNode = nodeMap.get(srcId);
      const { color: strokeColor, dash: strokeDasharray } = getRelationshipStyle(
        rawEdge.type,
        srcNode?.type
      );

      layoutedEdges.push({
        id: `rel:${rawEdge.id || edgeKey}`,
        source: effSrc,
        target: effTgt,
        type: "straight",
        animated: true,
        style: {
          stroke: strokeColor,
          strokeWidth: 2,
          strokeDasharray,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 16,
          height: 16,
        },
      });
    }
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
}