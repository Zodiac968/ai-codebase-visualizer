// src/utils/graph/highlightUtils.js

/**
 * Computes the exact set of ancestor container node IDs (folders, files, classes)
 * required to reveal all target symbol IDs in the hierarchical layout,
 * without expanding unrelated branches.
 * 
 * @param {Array<string>} targetSymbolIds - Array of symbol node IDs to reveal
 * @param {Array<Object>} allNodes - Full array of raw nodes in repository graph
 * @returns {Set<string>} Set of ancestor node IDs that must be expanded
 */
export function computeAncestorRevealSet(targetSymbolIds = [], allNodes = []) {
  const nodeMap = new Map();
  allNodes.forEach((n) => {
    if (n && n.id) nodeMap.set(String(n.id), n);
  });

  const revealSet = new Set(['repository']);

  for (const symId of targetSymbolIds) {
    if (!symId) continue;
    // Include target symbol itself in the expanded state to reveal its connections
    revealSet.add(String(symId));

    let curr = nodeMap.get(String(symId));

    // Climb the parent_id chain all the way up to 'repository'
    while (curr && curr.parent_id) {
      revealSet.add(String(curr.parent_id));
      curr = nodeMap.get(String(curr.parent_id));
    }
  }

  return revealSet;
}

/**
 * Constructs a structured HighlightContext object from Feature Search / Context retrieval results.
 * 
 * @param {Object} searchData - Structured context package or search result
 * @param {string|null} [focusedNodeId] - Currently focused node ID
 * @returns {Object} Highlight context for layout engine and node styles
 */
export function buildHighlightContext(searchData = null, focusedNodeId = null) {
  if (!searchData || (!searchData.seeds?.length && !searchData.results?.length && !searchData.expanded_symbols?.length)) {
    return {
      isActive: false,
      primaryNodeIds: new Set(),
      relatedNodeIds: new Set(),
      relevantEdgeKeys: new Set(),
      focusedNodeId: null,
      seedCount: 0,
      expandedCount: 0,
    };
  }

  const primaryNodeIds = new Set();
  const relatedNodeIds = new Set();
  const relevantEdgeKeys = new Set();

  // Seeds / primary matches (e.g. from context retrieval or hybrid results)
  const seeds = searchData.seeds || searchData.results || [];
  seeds.forEach((item) => {
    const id = item.symbol_id || item.id;
    if (id) primaryNodeIds.add(String(id));
  });

  // Expanded / connected symbols
  const expandedSymbols = searchData.expanded_symbols || [];
  expandedSymbols.forEach((item) => {
    const id = item.symbol_id || item.id;
    if (id && !primaryNodeIds.has(String(id))) {
      relatedNodeIds.add(String(id));
    }
  });

  // Relevant relationships
  const relationships = searchData.relationships || [];
  relationships.forEach((rel) => {
    if (rel.source && rel.target) {
      const type = (rel.type || 'rel').toUpperCase();
      relevantEdgeKeys.add(`${type}:${rel.source}->${rel.target}`);
      // Also index with bidirectional check
      relevantEdgeKeys.add(`${rel.source}->${rel.target}`);
    }
  });

  return {
    isActive: primaryNodeIds.size > 0 || relatedNodeIds.size > 0,
    primaryNodeIds,
    relatedNodeIds,
    relevantEdgeKeys,
    focusedNodeId: focusedNodeId ? String(focusedNodeId) : null,
    seedCount: primaryNodeIds.size,
    expandedCount: relatedNodeIds.size,
  };
}
