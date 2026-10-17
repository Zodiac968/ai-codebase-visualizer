import React, { useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import {
  SmartEdgeProvider,
  createSmartEdge,
} from "@tisoap/react-flow-smart-edge";
import "@xyflow/react/dist/style.css";
import CustomNode from "./CustomNode";
import TrunkEdge from "./TrunkEdge";

import { useCodebaseGraph } from "../../hooks/useCodebaseGraph";

const nodeTypes = {
  default: CustomNode,
  file: CustomNode,
  function: CustomNode,
  class: CustomNode,
  method: CustomNode,
  repository: CustomNode,
  directory: CustomNode,
  folder: CustomNode,
};

// Map the smart edge component
const edgeTypes = {
  smartStep: createSmartEdge("step", {
    nodePadding: 18, // Distance (px) to stay away from node edges
    gridRatio: 8,    // Grid precision
  }),
  trunkStep: TrunkEdge, // Custom edge for vertical trunk routing
};

/**
 * Inner controller managing camera viewport transitions:
 * - Saves previous viewport when search is activated
 * - Centers the graph on screen when reverting back to previous state
 * - Pans and zooms to focused target nodes
 */
function ViewportController({ nodes, highlightContext }) {
  const { setCenter, fitView, getViewport } = useReactFlow();
  const prevFocusedRef = useRef(null);
  const prevActiveRef = useRef(false);
  const savedViewportRef = useRef(null);

  // Focus camera smoothly on selected search node
  useEffect(() => {
    const focusedId = highlightContext?.focusedNodeId;
    if (focusedId && focusedId !== prevFocusedRef.current) {
      prevFocusedRef.current = focusedId;
      const targetNode = nodes.find((n) => n.id === focusedId);
      if (targetNode && targetNode.position) {
        const w = targetNode.width || 180;
        const h = targetNode.height || 50;
        const cx = targetNode.position.x + w / 2;
        const cy = targetNode.position.y + h / 2;
        setCenter(cx, cy, { zoom: 1.15, duration: 500 });
      }
    } else if (!focusedId) {
      prevFocusedRef.current = null;
    }
  }, [highlightContext?.focusedNodeId, nodes, setCenter]);

  // Frame view when search is activated, and center on screen when reverting back
  useEffect(() => {
    if (highlightContext?.isActive && !prevActiveRef.current) {
      prevActiveRef.current = true;
      // Save current exploration viewport
      try {
        savedViewportRef.current = getViewport();
      } catch {
        savedViewportRef.current = null;
      }
      const timer = setTimeout(() => {
        fitView({ duration: 500, padding: 0.25 });
      }, 60);
      return () => clearTimeout(timer);
    } else if (!highlightContext?.isActive && prevActiveRef.current) {
      prevActiveRef.current = false;
      // Reverting back: center the restored graph exploration on the screen
      const timer = setTimeout(() => {
        fitView({ duration: 500, padding: 0.25 });
      }, 60);
      savedViewportRef.current = null;
      return () => clearTimeout(timer);
    }
  }, [highlightContext?.isActive, fitView, getViewport]);

  return null;
}

function InnerGraph({
  graphData,
  onNodeSelect,
  highlightContext = null,
  searchRevealSet = null,
  onClearHighlight = null,
}) {
  const rawNodes = graphData?.nodes || [];
  const rawEdges = graphData?.edges || [];

  const { nodes, edges, toggleNodeExpansion } = useCodebaseGraph(
    rawNodes,
    rawEdges,
    highlightContext,
    searchRevealSet
  );

  const handleNodeClick = (_, flowNode) => {
    // 1. Toggle expansion for hierarchical navigation
    toggleNodeExpansion(flowNode.id);

    // 2. If node is a code symbol or file, notify parent to display in Code Viewer
    const raw = flowNode?.data?.rawNode;
    if (raw && onNodeSelect) {
      const codeEntityTypes = new Set([
        'file',
        'class',
        'function',
        'method',
        'variable',
        'interface',
        'type',
      ]);

      const targetPath = raw.path || (raw.type === 'file' ? raw.id : null);

      if (targetPath && (codeEntityTypes.has(raw.type) || raw.start_line)) {
        onNodeSelect({
          id: raw.id,
          type: raw.type,
          name: raw.name,
          path: targetPath,
          startLine: raw.start_line || 1,
          endLine: raw.end_line || raw.start_line || 1,
        });
      }
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Floating Search Highlight Banner */}
      {highlightContext?.isActive && (
        <div className="graph-highlight-banner" role="status" aria-live="polite">
          <div className="banner-content">
            <span className="banner-icon">🔍</span>
            <span className="banner-text">
              <strong>Feature Search Active:</strong>{" "}
              {highlightContext.seedCount} Primary Match{highlightContext.seedCount === 1 ? "" : "es"}
              {highlightContext.expandedCount > 0
                ? `, ${highlightContext.expandedCount} Related Symbol${highlightContext.expandedCount === 1 ? "" : "s"}`
                : ""}
            </span>
          </div>
          {onClearHighlight && (
            <button
              className="banner-clear-btn"
              onClick={onClearHighlight}
              title="Clear search highlights and restore graph state"
              aria-label="Clear Search Highlights"
            >
              ✕ Clear Highlight
            </button>
          )}
        </div>
      )}

      <SmartEdgeProvider nodes={nodes}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          nodesConnectable={false}
          fitView
        >
          <Background />
          <Controls />
          <ViewportController
            nodes={nodes}
            highlightContext={highlightContext}
          />
        </ReactFlow>
      </SmartEdgeProvider>
    </div>
  );
}

export default function CodebaseGraph(props) {
  return (
    <ReactFlowProvider>
      <InnerGraph {...props} />
    </ReactFlowProvider>
  );
}
