// src/utils/layoutEngine.js
import { Position, MarkerType } from "@xyflow/react";
import { LAYOUT_CONFIG } from "./constants";
import { buildNodeStyle } from "./nodeStyles";

const STACK_INDENT = 36;
const TRUNK_GAP = 16; // Distance between stack node border and trunk line

/**
 * Color and style definitions for distinct relationship types
 */
const RELATIONSHIP_STYLES = {
  // Calls & Execution flow
  CALL: { color: "#10b981", dash: undefined },         // Emerald Green
  CALLS: { color: "#10b981", dash: undefined },

  // Dependency / Imports
  IMPORT: { color: "#ff5722", dash: "5,5" },           // Deep Orange
  IMPORTS: { color: "#ff5722", dash: "5,5" },

  // OOP / Schema Inheritance & Interfaces
  INHERITS: { color: "#8b5cf6", dash: "6,3" },         // Vibrant Purple
  EXTENDS: { color: "#8b5cf6", dash: "6,3" },
  IMPLEMENTS: { color: "#3b82f6", dash: "3,3" },       // Royal Blue

  // Usage / References / Data Flow
  USES: { color: "#f59e0b", dash: "4,4" },             // Amber / Yellow
  REFERENCES: { color: "#f59e0b", dash: "4,4" },
  READS: { color: "#14b8a6", dash: undefined },        // Teal
  WRITES: { color: "#ef4444", dash: undefined },       // Crimson Red

  // Instantiation & Exports
  INSTANTIATES: { color: "#ec4899", dash: "2,2" },     // Pink
  CREATES: { color: "#ec4899", dash: "2,2" },
  EXPORTS: { color: "#06b6d4", dash: "5,5" },          // Cyan
};

// Fallback palette for dynamic or unmapped relationship types
const FALLBACK_PALETTE = [
  "#6366f1", // Indigo
  "#d97706", // Ochre
  "#059669", // Dark Emerald
  "#db2777", // Rose
  "#4f46e5", // Iris
  "#0891b2", // Dark Cyan
  "#84cc16", // Lime
  "#a855f7", // Violet
];

/**
 * Returns color and line style properties based on relationship type
 */
function getRelationshipStyle(relType, sourceNodeType) {
  if (!relType) return { color: "#64748b", dash: undefined };

  const normType = String(relType).toUpperCase();

  // 1. Direct match in dictionary
  if (RELATIONSHIP_STYLES[normType]) {
    return RELATIONSHIP_STYLES[normType];
  }

  // 2. Infer CALL relationship based on source node type if ambiguous
  if (sourceNodeType === "function" || sourceNodeType === "method") {
    return RELATIONSHIP_STYLES.CALLS;
  }

  // 3. Deterministic color generation for custom/unknown relationship types
  let hash = 0;
  for (let i = 0; i < normType.length; i++) {
    hash = normType.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % FALLBACK_PALETTE.length;

  return {
    color: FALLBACK_PALETTE[colorIndex],
    dash: "5,5",
  };
}

function getLowestVisibleAncestor(nodeId, visibleNodeIds, nodeMap) {
  let curr = String(nodeId);
  while (curr) {
    if (visibleNodeIds.has(curr)) return curr;
    const node = nodeMap.get(curr);
    curr = node && node.parent_id ? String(node.parent_id) : null;
  }
  return null;
}

export function computeHierarchyLayout(
  allNodes,
  allEdges = [],
  expandedNodes
) {
  const childrenMap = new Map();
  const parentIds = new Set();
  const nodeMap = new Map(allNodes.map((n) => [String(n.id), n]));
  const expandedSet = new Set(Array.from(expandedNodes).map(String));

  const outgoingTargetsMap = new Map();
  allNodes.forEach((n) => outgoingTargetsMap.set(String(n.id), new Set()));

  allEdges.forEach((edge) => {
    if (!edge.source || !edge.target) return;
    if (edge.type === "CONTAINS" || edge.type === "hierarchy") return;

    const srcId = String(edge.source);
    const tgtId = String(edge.target);

    if (srcId !== tgtId) {
      if (!outgoingTargetsMap.has(srcId)) {
        outgoingTargetsMap.set(srcId, new Set());
      }
      outgoingTargetsMap.get(srcId).add(tgtId);
    }
  });

  const getTargetCount = (nodeId) => {
    const targets = outgoingTargetsMap.get(String(nodeId));
    return targets ? targets.size : 0;
  };

  allNodes.forEach((node) => {
    if (node.parent_id) {
      const parentId = String(node.parent_id);
      parentIds.add(parentId);
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId).push(node);
    }
  });

  const isExpandedWithChildren = (nodeId) => {
    const strId = String(nodeId);
    return expandedSet.has(strId) && (childrenMap.get(strId) || []).length > 0;
  };

  const subtreeMetrics = new Map();
  const visibleNodeIds = new Set();

  // PASS 1: Calculate bounding boxes
  function measureSubtree(nodeId) {
    const strNodeId = String(nodeId);
    visibleNodeIds.add(strNodeId);
    const children = expandedSet.has(strNodeId)
      ? childrenMap.get(strNodeId) || []
      : [];

    if (children.length === 0) {
      const metrics = {
        w: LAYOUT_CONFIG.NODE_WIDTH,
        h: LAYOUT_CONFIG.NODE_HEIGHT,
        groups: [],
        totalChildrenW: 0,
      };
      subtreeMetrics.set(strNodeId, metrics);
      return metrics;
    }

    const typeGroups = new Map();
    children.forEach((child) => {
      if (!typeGroups.has(child.type)) {
        typeGroups.set(child.type, []);
      }
      typeGroups.get(child.type).push(child);
    });

    const groupMetrics = [];
    typeGroups.forEach((childList, type) => {
      childList.sort((a, b) => {
        const countA = getTargetCount(a.id);
        const countB = getTargetCount(b.id);
        if (countB !== countA) return countB - countA;
        return String(a.name || a.id).localeCompare(String(b.name || b.id));
      });

      const isVertical = childList.length > LAYOUT_CONFIG.THRESHOLD_IN_GROUP;
      let groupW = 0;
      let groupH = 0;

      if (isVertical) {
        const stackedChildren = [];
        const standaloneChildren = [];

        childList.forEach((child, index) => {
          if (isExpandedWithChildren(child.id)) {
            standaloneChildren.push({ child, index });
          } else {
            stackedChildren.push({ child, index });
          }
        });

        const columns = [];

        if (stackedChildren.length > 0) {
          const minIndex = stackedChildren[0].index;
          columns.push({
            type: "stack",
            childList: stackedChildren.map((s) => s.child),
            minIndex,
          });
        }

        standaloneChildren.forEach(({ child, index }) => {
          columns.push({
            type: "standalone",
            child,
            minIndex: index,
          });
        });

        columns.sort((a, b) => a.minIndex - b.minIndex);

        columns.forEach((col) => {
          let colW = 0;
          let colH = 0;

          if (col.type === "stack") {
            col.childList.forEach((child, index) => {
              const cm = measureSubtree(child.id);
              colW = Math.max(colW, cm.w + STACK_INDENT);
              colH += cm.h + (index > 0 ? LAYOUT_CONFIG.VERTICAL_GAP : 0);
            });
          } else {
            const cm = measureSubtree(col.child.id);
            colW = cm.w;
            colH = cm.h;
          }

          col.w = colW;
          col.h = colH;
        });

        groupW =
          columns.reduce((sum, c) => sum + c.w, 0) +
          (columns.length - 1) * LAYOUT_CONFIG.HORIZONTAL_GAP;
        groupH = Math.max(...columns.map((c) => c.h), 0);

        groupMetrics.push({ type, childList, isVertical, columns, groupW, groupH });
      } else {
        childList.forEach((child, index) => {
          const cm = measureSubtree(child.id);
          groupW += cm.w + (index > 0 ? LAYOUT_CONFIG.HORIZONTAL_GAP : 0);
          groupH = Math.max(groupH, cm.h);
        });

        groupMetrics.push({ type, childList, isVertical, groupW, groupH });
      }
    });

    const totalChildrenW =
      groupMetrics.reduce((sum, g) => sum + g.groupW, 0) +
      (groupMetrics.length - 1) * LAYOUT_CONFIG.GROUP_GAP;
    const maxChildrenH = Math.max(...groupMetrics.map((g) => g.groupH));

    const w = Math.max(LAYOUT_CONFIG.NODE_WIDTH, totalChildrenW);
    const h = LAYOUT_CONFIG.NODE_HEIGHT + LAYOUT_CONFIG.LEVEL_GAP + maxChildrenH;

    const metrics = { w, h, groups: groupMetrics, totalChildrenW };
    subtreeMetrics.set(strNodeId, metrics);
    return metrics;
  }

  // PASS 2: Position visible nodes
  const layoutedNodes = [];

  function positionSubtree(nodeId, x, y) {
    const strNodeId = String(nodeId);
    const node = nodeMap.get(strNodeId);
    const metrics = subtreeMetrics.get(strNodeId);
    if (!node || !metrics) return;

    const hasChildren = parentIds.has(strNodeId);
    const isExpanded = expandedSet.has(strNodeId);
    const prefix = hasChildren ? (isExpanded ? "[-] " : "[+] ") : "";

    const nodeX = x + (metrics.w - LAYOUT_CONFIG.NODE_WIDTH) / 2;
    const nodeY = y;
    const parentCenterX = nodeX + LAYOUT_CONFIG.NODE_WIDTH / 2;

    layoutedNodes.push({
      id: strNodeId,
      data: { label: `${prefix}${node.type.toUpperCase()}: ${node.name}` },
      position: { x: nodeX, y: nodeY },
      width: LAYOUT_CONFIG.NODE_WIDTH || 180,
      height: LAYOUT_CONFIG.NODE_HEIGHT || 50,
      measured: {
        width: LAYOUT_CONFIG.NODE_WIDTH || 180,
        height: LAYOUT_CONFIG.NODE_HEIGHT || 50,
      },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      style: buildNodeStyle(node.type, isExpanded, hasChildren),
    });

    if (metrics.groups.length === 0) return;

    const childrenStartY = y + LAYOUT_CONFIG.NODE_HEIGHT + LAYOUT_CONFIG.LEVEL_GAP;
    let currGroupX = x + (metrics.w - metrics.totalChildrenW) / 2;

    metrics.groups.forEach((group) => {
      if (group.isVertical && group.columns) {
        let currColX = currGroupX;

        group.columns.forEach((col) => {
          const colCenterX = currColX + col.w / 2;
          const isColToRight = colCenterX >= parentCenterX;

          if (col.type === "stack") {
            const stackChildX = isColToRight
              ? currColX + STACK_INDENT
              : currColX;

            let currChildY = childrenStartY;
            col.childList.forEach((child) => {
              const childId = String(child.id);
              const childMetric = subtreeMetrics.get(childId);

              positionSubtree(child.id, stackChildX, currChildY);
              currChildY += childMetric.h + LAYOUT_CONFIG.VERTICAL_GAP;
            });
          } else {
            positionSubtree(col.child.id, currColX, childrenStartY);
          }

          currColX += col.w + LAYOUT_CONFIG.HORIZONTAL_GAP;
        });
      } else {
        let currChildX = currGroupX;
        group.childList.forEach((child) => {
          const childId = String(child.id);
          const childMetric = subtreeMetrics.get(childId);

          positionSubtree(child.id, currChildX, childrenStartY);
          currChildX += childMetric.w + LAYOUT_CONFIG.HORIZONTAL_GAP;
        });
      }

      currGroupX += group.groupW + LAYOUT_CONFIG.GROUP_GAP;
    });
  }

  const rootId = allNodes[0] ? String(allNodes[0].id) : "repository";
  measureSubtree(rootId);
  positionSubtree(rootId, 0, 0);

  const layoutedEdges = [];
  const layoutedNodeMap = new Map(layoutedNodes.map((n) => [n.id, n]));

  // PASS 3: Hierarchy Edges (Dynamic trunkX based on rendered stack positions)
  expandedSet.forEach((parentId) => {
    if (!visibleNodeIds.has(parentId)) return;
    const parentNode = layoutedNodeMap.get(parentId);
    const metrics = subtreeMetrics.get(parentId);
    if (!parentNode || !metrics || !metrics.groups) return;

    const parentCenterX =
      parentNode.position.x +
      (parentNode.width || LAYOUT_CONFIG.NODE_WIDTH) / 2;

    metrics.groups.forEach((group) => {
      if (group.isVertical && group.columns) {
        group.columns.forEach((col) => {
          if (col.type === "stack") {
            const childNodes = col.childList
              .map((c) => layoutedNodeMap.get(String(c.id)))
              .filter(Boolean);

            if (childNodes.length === 0) return;

            const stackMinX = Math.min(...childNodes.map((n) => n.position.x));
            const stackMaxX = Math.max(
              ...childNodes.map(
                (n) => n.position.x + (n.width || LAYOUT_CONFIG.NODE_WIDTH)
              )
            );
            const stackCenterX = (stackMinX + stackMaxX) / 2;

            const isGroupToRight = stackCenterX >= parentCenterX;

            let trunkX;
            let targetHandle;

            if (isGroupToRight) {
              targetHandle = "left";
              trunkX = stackMinX - TRUNK_GAP;
            } else {
              targetHandle = "right";
              trunkX = stackMaxX + TRUNK_GAP;
            }

            col.childList.forEach((child) => {
            const childId = String(child.id);

            layoutedEdges.push({
                id: `hierarchy:${parentId}->${childId}`,
                source: parentId,
                target: childId,
                sourceHandle: "bottom",
                targetHandle: targetHandle, // Ensure "left" / "right" match <Handle id="..." /> on your node
                type: "trunkStep",
                data: { trunkX },
                style: { stroke: "#cccccc", strokeWidth: 1.5 },
            });
            });
          } else {
            const childId = String(col.child.id);

            layoutedEdges.push({
              id: `hierarchy:${parentId}->${childId}`,
              source: parentId,
              target: childId,
              sourceHandle: "bottom",
              targetHandle: "top",
              type: "smoothstep",
              style: { stroke: "#cccccc", strokeWidth: 1.5 },
            });
          }
        });
      } else {
        group.childList.forEach((child) => {
          const childId = String(child.id);

          layoutedEdges.push({
            id: `hierarchy:${parentId}->${childId}`,
            source: parentId,
            target: childId,
            sourceHandle: "bottom",
            targetHandle: "top",
            type: "smoothstep",
            style: { stroke: "#cccccc", strokeWidth: 1.5 },
          });
        });
      }
    });
  });

  // PASS 4: Outgoing Relationships
  const outgoingEdgeKeys = new Set();

  allEdges.forEach((rawEdge) => {
    if (!rawEdge.source || !rawEdge.target) return;
    if (rawEdge.type === "CONTAINS" || rawEdge.type === "hierarchy") return;

    const srcId = String(rawEdge.source);
    const tgtId = String(rawEdge.target);

    const isSourceVisible = visibleNodeIds.has(srcId);
    const isSourceExpanded = expandedSet.has(srcId);

    // Render outgoing edges ONLY when the source node is both visible AND expanded
    if (isSourceVisible && isSourceExpanded) {
      const effectiveSource = getLowestVisibleAncestor(srcId, visibleNodeIds, nodeMap);
      const effectiveTarget = getLowestVisibleAncestor(tgtId, visibleNodeIds, nodeMap);

      if (effectiveSource && effectiveTarget && effectiveSource !== effectiveTarget) {
        const edgeKey = `${rawEdge.type || "rel"}:${effectiveSource}->${effectiveTarget}`;

        if (!outgoingEdgeKeys.has(edgeKey)) {
          outgoingEdgeKeys.add(edgeKey);

          const srcNode = layoutedNodeMap.get(effectiveSource);
          const tgtNode = layoutedNodeMap.get(effectiveTarget);

          const srcCenterX = srcNode
            ? srcNode.position.x + (srcNode.width || LAYOUT_CONFIG.NODE_WIDTH) / 2
            : 0;
          const tgtCenterX = tgtNode
            ? tgtNode.position.x + (tgtNode.width || LAYOUT_CONFIG.NODE_WIDTH) / 2
            : 0;

          const isTargetToRight = tgtCenterX >= srcCenterX;

          // Distinct Handle IDs:
          // Outgoing edges dock slightly higher (top half of side)
          // Incoming edges dock slightly lower (bottom half of side)
          const sourceHandle = isTargetToRight ? "right-out" : "left-out";
          const targetHandle = isTargetToRight ? "left-in" : "right-in";

          // Resolve relationship color and line pattern dynamically
          const sourceNodeType = nodeMap.get(srcId)?.type;
          const { color: strokeColor, dash: strokeDasharray } = getRelationshipStyle(
            rawEdge.type,
            sourceNodeType
          );

          layoutedEdges.push({
            id: `rel-${rawEdge.id || edgeKey}:${effectiveSource}->${effectiveTarget}`,
            source: effectiveSource,
            target: effectiveTarget,
            type: "smartStep",
            sourceHandle: sourceHandle,
            targetHandle: targetHandle,
            sourcePosition: isTargetToRight ? Position.Right : Position.Left,
            targetPosition: isTargetToRight ? Position.Left : Position.Right,
            pathOptions: {
              borderRadius: 12,
              offset: 20,
            },
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
      }
    }
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
}