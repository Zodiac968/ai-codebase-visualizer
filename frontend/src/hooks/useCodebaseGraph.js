// src/hooks/useCodebaseGraph.js
import { useState, useMemo, useCallback } from "react";
import { computeHierarchyLayout } from "../utils/graph/layoutEngine";

export function useCodebaseGraph(rawNodes = [], rawEdges = []) {
  const [expandedNodes, setExpandedNodes] = useState(new Set(["repository"]));

  const toggleNodeExpansion = useCallback((nodeId) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const { nodes, edges } = useMemo(() => {
    if (!rawNodes || rawNodes.length === 0) {
      return { nodes: [], edges: [] };
    }
    return computeHierarchyLayout(rawNodes, rawEdges, expandedNodes);
  }, [rawNodes, rawEdges, expandedNodes]);

  return {
    nodes,
    edges,
    expandedNodes,
    toggleNodeExpansion,
  };
}
