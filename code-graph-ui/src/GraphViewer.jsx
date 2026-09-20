import React, { useMemo } from "react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";

// 1. BFS Function to extract graph elements up to a max depth
function getSubgraphUpToDepth(graphData, rootId = "repository", maxDepth = 5) {
  const { nodes = [], edges = [] } = graphData;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency list (source -> array of targets)
  const adj = new Map();
  edges.forEach((e) => {
    if (e.target) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source).push(e.target);
    }
  });

  const visitedNodes = new Set([rootId]);
  const queue = [{ id: rootId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    if (depth >= maxDepth) continue;

    const neighbors = adj.get(id) || [];
    for (const targetId of neighbors) {
      if (!visitedNodes.has(targetId) && nodeMap.has(targetId)) {
        visitedNodes.add(targetId);
        queue.push({ id: targetId, depth: depth + 1 });
      }
    }
  }

  const filteredNodes = nodes.filter((n) => visitedNodes.has(n.id));
  const filteredEdges = edges.filter(
    (e) => e.target && visitedNodes.has(e.source) && visitedNodes.has(e.target),
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}

// 2. Auto-layout engine using Dagre to assign x,y coordinates
function getLayoutedElements(nodes, edges, direction = "TB") {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 100 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 180, height: 40 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    return {
      id: node.id,
      data: { label: `${node.type.toUpperCase()}: ${node.name || node.id}` },
      position: { x: pos.x - 90, y: pos.y - 20 },
      style: {
        background:
          node.type === "file"
            ? "#e1f5fe"
            : node.type === "folder"
              ? "#fff3e0"
              : "#f3e5f5",
        border: "1px solid #999",
        borderRadius: "5px",
        fontSize: "12px",
        padding: "8px",
      },
    };
  });

  const layoutedEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: e.type !== "CONTAINS",
    label: e.type !== "CONTAINS" ? e.type : undefined,
  }));

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

// 3. React Flow Canvas Component
export default function GraphViewer({ rawGraphData }) {
  const { nodes, edges } = useMemo(() => {
    if (!rawGraphData) return { nodes: [], edges: [] };

    // Filter to 5 levels deep from root
    const subset = getSubgraphUpToDepth(rawGraphData, "repository", 5);

    // Calculate diagram positions
    return getLayoutedElements(subset.nodes, subset.edges, "TB");
  }, [rawGraphData]);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
