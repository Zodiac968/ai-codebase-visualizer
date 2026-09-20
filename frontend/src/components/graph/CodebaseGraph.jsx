import React from "react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
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

export default function CodebaseGraph({ graphData, onNodeSelect }) {
  const rawNodes = graphData?.nodes || [];
  const rawEdges = graphData?.edges || [];

  const { nodes, edges, toggleNodeExpansion } = useCodebaseGraph(
    rawNodes,
    rawEdges,
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
        </ReactFlow>
      </SmartEdgeProvider>
    </div>
  );
}
