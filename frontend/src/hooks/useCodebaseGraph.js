// src/hooks/useCodebaseGraph.js
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { computeHierarchyLayout } from "../utils/graph/layoutEngine";

export function useCodebaseGraph(
  rawNodes = [],
  rawEdges = [],
  highlightContext = null,
  searchRevealSet = null
) {
  const [expandedNodes, setExpandedNodes] = useState(new Set(["repository"]));
  const preSearchExpandedRef = useRef(null);

  // Reset expansion state when repository changes
  useEffect(() => {
    setExpandedNodes(new Set(["repository"]));
    preSearchExpandedRef.current = null;
  }, [rawNodes]);

  // Handle Search Reveal & Restoration
  useEffect(() => {
    if (searchRevealSet && searchRevealSet.size > 0 && highlightContext?.isActive) {
      // Save current exploration state before search expansion
      if (preSearchExpandedRef.current === null) {
        preSearchExpandedRef.current = new Set(expandedNodes);
      }
      // Expand required ancestor containers without losing base state
      setExpandedNodes((prev) => {
        const base = preSearchExpandedRef.current || prev;
        const merged = new Set(base);
        searchRevealSet.forEach((id) => merged.add(String(id)));
        return merged;
      });
    } else if (!highlightContext?.isActive && preSearchExpandedRef.current !== null) {
      // Restore pre-search manual expansion state
      setExpandedNodes(new Set(preSearchExpandedRef.current));
      preSearchExpandedRef.current = null;
    }
  }, [searchRevealSet, highlightContext?.isActive]);

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
    return computeHierarchyLayout(rawNodes, rawEdges, expandedNodes, highlightContext);
  }, [rawNodes, rawEdges, expandedNodes, highlightContext]);

  return {
    nodes,
    edges,
    expandedNodes,
    toggleNodeExpansion,
  };
}
