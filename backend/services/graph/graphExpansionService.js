import { findRepoById } from '../repoDbService.js';

/**
 * Default relationship weights reflecting semantic value for code context.
 */
export const DEFAULT_RELATIONSHIP_WEIGHTS = {
  CALLS_OUTGOING: 1.0,    // Implementation dependencies (callee)
  INHERITS: 0.95,         // Class inheritance contracts
  IMPLEMENTS: 0.95,       // Interface contracts
  CALLS_INCOMING: 0.70,   // Callers / usages
  IMPORTS: 0.40,          // Module-level imports
  CONTAINS: 0.20,         // Class/method containment (excluding folders)
};

export const DEFAULT_EXPANSION_OPTIONS = {
  maxDepth: 1,
  maxExpandedNodes: 15,
  maxPerSeed: 5,
  relationshipWeights: DEFAULT_RELATIONSHIP_WEIGHTS,
};

/**
 * Checks if a node ID represents a retrievable code entity (symbol or code file, excluding folders and repository root).
 * 
 * @param {string} nodeId
 * @param {Map<string, Object>} symbolsMap
 * @param {Map<string, Object>} nodesMap
 * @returns {boolean}
 */
function isCodeEntity(nodeId, symbolsMap, nodesMap) {
  if (!nodeId || typeof nodeId !== 'string') return false;
  if (symbolsMap.has(nodeId)) return true;

  const node = nodesMap.get(nodeId);
  if (!node) return false;

  // Never expand repository root or folder containers
  if (node.type === 'repository' || node.type === 'folder') return false;

  return true;
}

/**
 * Expands seed symbols across the repository knowledge graph to discover
 * relevant connected symbols with provenance tracking and deterministic scoring.
 * 
 * @param {string} repoId - Repository identifier
 * @param {Array<Object>} seedSymbols - Array of seed symbols from hybrid retrieval
 * @param {Object} [options]
 * @param {number} [options.maxDepth=1] - Maximum graph traversal depth
 * @param {number} [options.maxExpandedNodes=15] - Maximum expanded symbols to return
 * @param {number} [options.maxPerSeed=5] - Maximum expanded symbols per individual seed
 * @param {Object} [options.relationshipWeights] - Custom relationship weights
 * @returns {Promise<{ seeds: Array<Object>, expanded_symbols: Array<Object>, relationships: Array<Object> }>}
 */
export async function expandGraph(repoId, seedSymbols = [], options = {}) {
  if (!repoId || typeof repoId !== 'string') {
    throw new Error('Repository ID is required for graph expansion.');
  }

  if (!Array.isArray(seedSymbols) || seedSymbols.length === 0) {
    return { seeds: [], expanded_symbols: [], relationships: [] };
  }

  // 1. Fetch repository record from PostgreSQL
  const repoRecord = await findRepoById(repoId);
  if (!repoRecord || !repoRecord.graph) {
    throw new Error(`Repository "${repoId}" not found or lacks graph data.`);
  }

  const maxDepth = Math.max(1, options.maxDepth || DEFAULT_EXPANSION_OPTIONS.maxDepth);
  const maxExpandedNodes = Math.max(1, options.maxExpandedNodes || DEFAULT_EXPANSION_OPTIONS.maxExpandedNodes);
  const maxPerSeed = Math.max(1, options.maxPerSeed || DEFAULT_EXPANSION_OPTIONS.maxPerSeed);
  const weights = { ...DEFAULT_RELATIONSHIP_WEIGHTS, ...(options.relationshipWeights || {}) };

  // 2. Build index maps for symbols and nodes
  const nodes = repoRecord.graph.nodes || [];
  const edges = repoRecord.graph.edges || [];
  const rawSymbols = repoRecord.symbols || [];

  const nodesMap = new Map();
  for (const n of nodes) {
    if (n && n.id) nodesMap.set(n.id, n);
  }

  const symbolsMap = new Map();
  for (const s of rawSymbols) {
    if (s && s.id) symbolsMap.set(s.id, s);
  }

  // Also include any nodes that represent symbols in symbolsMap
  for (const n of nodes) {
    if (n && n.id && isCodeEntity(n.id, symbolsMap, nodesMap) && !symbolsMap.has(n.id)) {
      symbolsMap.set(n.id, {
        id: n.id,
        name: n.name,
        type: n.type,
        file: n.path || n.file,
        start_line: n.start_line,
        end_line: n.end_line,
      });
    }
  }

  // 3. Build adjacency lists for resolved edges
  const outgoingEdges = new Map(); // source -> Edge[]
  const incomingEdges = new Map(); // target -> Edge[]

  for (const edge of edges) {
    if (!edge.resolved || !edge.source || !edge.target) continue;

    // Index outgoing
    if (!outgoingEdges.has(edge.source)) outgoingEdges.set(edge.source, []);
    outgoingEdges.get(edge.source).push(edge);

    // Index incoming
    if (!incomingEdges.has(edge.target)) incomingEdges.set(edge.target, []);
    incomingEdges.get(edge.target).push(edge);
  }

  // 4. Format seeds and initialize visited set
  const visited = new Set();
  const seedRecords = [];
  const frontier = [];

  seedSymbols.forEach((s, idx) => {
    const symId = s.symbol_id || s.id;
    if (!symId) return;

    visited.add(symId);

    const seedObj = {
      symbol_id: symId,
      name: s.name || symbolsMap.get(symId)?.name || symId.split('::')[2] || symId,
      type: s.type || symbolsMap.get(symId)?.type || 'symbol',
      file: s.file || symbolsMap.get(symId)?.file || symId.split('::')[0],
      start_line: s.start_line || symbolsMap.get(symId)?.start_line || null,
      end_line: s.end_line || symbolsMap.get(symId)?.end_line || null,
      hybrid_rank: s.hybrid_rank || idx + 1,
      hybrid_score: s.rrf_score !== undefined ? s.rrf_score : (s.hybrid_score || 0),
    };

    seedRecords.push(seedObj);
    frontier.push({
      symbol_id: symId,
      seed_symbol_id: symId,
      base_score: seedObj.hybrid_score || (1 / (60 + seedObj.hybrid_rank)),
      depth: 0,
    });
  });

  // Track discovered candidates: Map<symbol_id, Candidate>
  const candidateMap = new Map();
  const collectedEdges = [];
  const edgeDedupe = new Set();

  const addEdgeRecord = (source, target, type, direction) => {
    const edgeKey = `${type}:${source}->${target}`;
    if (!edgeDedupe.has(edgeKey)) {
      edgeDedupe.add(edgeKey);
      collectedEdges.push({ source, target, type, direction });
    }
  };

  // 5. Breadth-First Search up to maxDepth
  let currentFrontier = [...frontier];
  let currentDepth = 1;

  while (currentDepth <= maxDepth && currentFrontier.length > 0) {
    const nextFrontier = [];
    const seedExpansionCounts = new Map();

    for (const item of currentFrontier) {
      const u = item.symbol_id;
      const seedId = item.seed_symbol_id;
      const baseScore = item.base_score;

      const currentCount = seedExpansionCounts.get(seedId) || 0;
      if (currentCount >= maxPerSeed && currentDepth > 1) {
        continue;
      }

      // --- Traverse OUTGOING edges ---
      const outList = outgoingEdges.get(u) || [];
      for (const edge of outList) {
        const v = edge.target;
        if (!v || !isCodeEntity(v, symbolsMap, nodesMap)) continue;

        // Prevent CONTAINS from expanding all symbols in a file or directory
        if (edge.type === 'CONTAINS') {
          const sNode = nodesMap.get(u);
          const tNode = nodesMap.get(v);
          if (sNode?.type === 'file' || sNode?.type === 'folder' || sNode?.type === 'repository' ||
              tNode?.type === 'file' || tNode?.type === 'folder' || tNode?.type === 'repository') {
            continue;
          }
        }

        let weight = weights.CALLS_OUTGOING;
        if (edge.type === 'INHERITS') weight = weights.INHERITS;
        else if (edge.type === 'IMPLEMENTS') weight = weights.IMPLEMENTS;
        else if (edge.type === 'IMPORTS') weight = weights.IMPORTS;
        else if (edge.type === 'CONTAINS') weight = weights.CONTAINS;

        const targetNode = nodesMap.get(v);
        if (targetNode?.type === 'file') {
          weight *= 0.85; // Slight attenuation for whole-file targets vs granular symbols
        }

        const distance = currentDepth;
        const relevance = baseScore * weight * Math.pow(0.8, distance - 1);

        addEdgeRecord(u, v, edge.type, 'outgoing');

        if (!visited.has(v)) {
          if (!candidateMap.has(v)) {
            const symMeta = symbolsMap.get(v) || nodesMap.get(v) || {};
            candidateMap.set(v, {
              symbol_id: v,
              name: symMeta.name || v.split('::')[2] || v,
              type: symMeta.type || 'symbol',
              file: symMeta.file || symMeta.path || v.split('::')[0],
              start_line: symMeta.start_line || null,
              end_line: symMeta.end_line || null,
              distance,
              relevance_score: relevance,
              discovered_from: [],
            });
            nextFrontier.push({
              symbol_id: v,
              seed_symbol_id: seedId,
              base_score: baseScore,
              depth: currentDepth,
            });
            seedExpansionCounts.set(seedId, currentCount + 1);
          }

          const cand = candidateMap.get(v);
          cand.relevance_score = Math.max(cand.relevance_score, relevance);
          cand.distance = Math.min(cand.distance, distance);
          cand.discovered_from.push({
            seed_symbol_id: seedId,
            connected_from: u,
            relationship: edge.type,
            direction: 'outgoing',
            distance,
          });
        }
      }

      // --- Traverse INCOMING edges ---
      const inList = incomingEdges.get(u) || [];
      for (const edge of inList) {
        const v = edge.source;
        if (!v || !isCodeEntity(v, symbolsMap, nodesMap)) continue;

        // Prevent CONTAINS from expanding all symbols in a file or directory
        if (edge.type === 'CONTAINS') {
          const sNode = nodesMap.get(v);
          const tNode = nodesMap.get(u);
          if (sNode?.type === 'file' || sNode?.type === 'folder' || sNode?.type === 'repository' ||
              tNode?.type === 'file' || tNode?.type === 'folder' || tNode?.type === 'repository') {
            continue;
          }
        }

        let weight = weights.CALLS_INCOMING;
        if (edge.type === 'INHERITS') weight = weights.INHERITS;
        else if (edge.type === 'IMPLEMENTS') weight = weights.IMPLEMENTS;
        else if (edge.type === 'IMPORTS') weight = weights.IMPORTS;
        else if (edge.type === 'CONTAINS') weight = weights.CONTAINS;

        const sourceNode = nodesMap.get(v);
        if (sourceNode?.type === 'file') {
          weight *= 0.85; // Slight attenuation for whole-file callers vs granular symbols
        }

        const distance = currentDepth;
        const relevance = baseScore * weight * Math.pow(0.8, distance - 1);

        addEdgeRecord(v, u, edge.type, 'incoming');

        if (!visited.has(v)) {
          if (!candidateMap.has(v)) {
            const symMeta = symbolsMap.get(v) || nodesMap.get(v) || {};
            candidateMap.set(v, {
              symbol_id: v,
              name: symMeta.name || v.split('::')[2] || v,
              type: symMeta.type || 'symbol',
              file: symMeta.file || symMeta.path || v.split('::')[0],
              start_line: symMeta.start_line || null,
              end_line: symMeta.end_line || null,
              distance,
              relevance_score: relevance,
              discovered_from: [],
            });
            nextFrontier.push({
              symbol_id: v,
              seed_symbol_id: seedId,
              base_score: baseScore,
              depth: currentDepth,
            });
            seedExpansionCounts.set(seedId, currentCount + 1);
          }

          const cand = candidateMap.get(v);
          cand.relevance_score = Math.max(cand.relevance_score, relevance);
          cand.distance = Math.min(cand.distance, distance);
          cand.discovered_from.push({
            seed_symbol_id: seedId,
            connected_from: u,
            relationship: edge.type,
            direction: 'incoming',
            distance,
          });
        }
      }
    }

    currentFrontier = nextFrontier;
    currentDepth++;
  }

  // 6. Deterministic Sorting:
  // - Higher relevance_score
  // - Lower graph distance
  // - More discovery paths (greater degree)
  // - Canonical symbol_id ascending (alphabetical)
  const sortedExpanded = Array.from(candidateMap.values()).sort((a, b) => {
    if (Math.abs(b.relevance_score - a.relevance_score) > 1e-6) {
      return b.relevance_score - a.relevance_score;
    }
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    if (b.discovered_from.length !== a.discovered_from.length) {
      return b.discovered_from.length - a.discovered_from.length;
    }
    return a.symbol_id.localeCompare(b.symbol_id);
  });

  // 7. Limit to maxExpandedNodes and format scores
  const finalExpanded = sortedExpanded.slice(0, maxExpandedNodes).map((item) => ({
    ...item,
    relevance_score: parseFloat(item.relevance_score.toFixed(6)),
  }));

  // Filter collected relationships to those involving selected seeds and expanded nodes
  const includedIds = new Set([
    ...seedRecords.map((s) => s.symbol_id),
    ...finalExpanded.map((e) => e.symbol_id),
  ]);

  const finalRelationships = collectedEdges.filter(
    (rel) => includedIds.has(rel.source) && includedIds.has(rel.target)
  );

  return {
    seeds: seedRecords,
    expanded_symbols: finalExpanded,
    relationships: finalRelationships,
  };
}
