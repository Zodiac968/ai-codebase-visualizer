// src/components/CodebaseGraph.jsx
import React from "react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import {
  SmartEdgeProvider,
  createSmartEdge,
} from "@tisoap/react-flow-smart-edge";
import "@xyflow/react/dist/style.css";
import CustomNode from "./CustomNode";
import TrunkEdge from "./TrunkEdge";

import { useCodebaseGraph } from "../hooks/useCodebaseGraph";
import graphData from "../graph.json";

const nodeTypes = {
  default: CustomNode,
  file: CustomNode,
  function: CustomNode,
  class: CustomNode,
  repository: CustomNode,
  directory: CustomNode,
};

// Map the smart edge component
const edgeTypes = {
  smartStep: createSmartEdge("step", {
    nodePadding: 18, // Distance (px) to stay away from node edges
    gridRatio: 8, // Grid precision
  }),
  trunkStep: TrunkEdge, // Custom edge for vertical trunk routing
};

export default function CodebaseGraph() {
  const { nodes, edges, toggleNodeExpansion } = useCodebaseGraph(
    graphData.nodes,
    graphData.edges,
  );

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <SmartEdgeProvider nodes={nodes}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_, node) => toggleNodeExpansion(node.id)}
          nodesConnectable={false}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </SmartEdgeProvider>
    </div>
  );
}
