import fs from 'fs';
import path from 'path';

const normPath = (p) => (p || '').replace(/\\/g, '/');

/**
 * Validates graph.json against structural rules and raw analysis data.
 * 
 * @param {string} analysisDir - Directory containing graph.json and analysis files
 * @returns {{ valid: boolean, errors: string[], nodeCount: number, edgeCount: number }}
 */
export const validateGraph = (analysisDir) => {
  const readJson = (fileName) => {
    const filePath = path.join(analysisDir, fileName);
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
  };

  const graph = readJson('graph.json');
  const relData = readJson('relationships.json');

  if (!graph) {
    const errorMsg = `Graph validation failed: graph.json not found in ${analysisDir}`;
    console.error(`❌ ${errorMsg}`);
    return { valid: false, errors: [errorMsg], nodeCount: 0, edgeCount: 0 };
  }

  const { nodes = [], edges = [] } = graph;
  const errors = [];

  const nodeIds = new Set();
  const edgeIds = new Set();
  const containsEdgeSet = new Set();
  const semanticEdgeSet = new Set();

  // 1. Node ID Uniqueness
  for (const node of nodes) {
    if (!node.id) {
      errors.push(`Node missing ID property: ${JSON.stringify(node)}`);
      continue;
    }
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate Node ID: "${node.id}"`);
    } else {
      nodeIds.add(node.id);
    }
  }

  // 2. Edge ID Uniqueness, Source/Target Existence, and Duplicate Checks
  for (const edge of edges) {
    if (!edge.id) {
      errors.push(`Edge missing ID property: ${JSON.stringify(edge)}`);
      continue;
    }

    // Check edge ID uniqueness
    if (edgeIds.has(edge.id)) {
      errors.push(`Duplicate Edge ID: "${edge.id}"`);
    } else {
      edgeIds.add(edge.id);
    }

    // Check edge source exists as a node
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge "${edge.id}" source does not exist as a node: "${edge.source}"`);
    }

    // Check edge target exists as a node (unless unresolved external relationship where target = null)
    if (edge.target !== null && !nodeIds.has(edge.target)) {
      errors.push(`Edge "${edge.id}" target does not exist as a node: "${edge.target}"`);
    }

    // Duplicate CONTAINS and Semantic Edge checks
    if (edge.type === 'CONTAINS') {
      const pairKey = `${edge.source} ->${edge.target}`;
      if (containsEdgeSet.has(pairKey)) {
        errors.push(`Duplicate CONTAINS edge detected: ${pairKey}`);
      }
      containsEdgeSet.add(pairKey);
    } else {
      const key = `${edge.type}:${edge.source}->${edge.target}:${edge.target_name || ''}`;
      if (semanticEdgeSet.has(key)) {
        errors.push(`Duplicate semantic edge detected (${edge.type}):${key}`);
      }
      semanticEdgeSet.add(key);
    }
  }

  // 3. Hierarchy & Parent Validation
  for (const node of nodes) {
    if (node.id === 'repository') continue;

    // Check file nodes parent is correct folder (or root repository)
    if (node.type === 'file') {
      const pathParts = node.id.split('/');
      const expectedParent = pathParts.length > 1 
        ? pathParts.slice(0, -1).join('/') 
        : 'repository';

      if (node.parent_id !== expectedParent) {
        errors.push(`File node "${node.id}" parent_id is "${node.parent_id}", expected "${expectedParent}"`);
      }
    }

    // Check symbol parent_id exists in nodes
    if (['class', 'function', 'method', 'variable'].includes(node.type)) {
      if (!node.parent_id) {
        errors.push(`Symbol node "${node.id}" is missing parent_id`);
      } else if (!nodeIds.has(node.parent_id)) {
        errors.push(`Symbol node "${node.id}" points to non-existent parent_id "${node.parent_id}"`);
      }
    }

    // Check CONTAINS edge agreement with node parent_id
    if (node.parent_id) {
      const expectedContainsPair = `${node.parent_id} ->${node.id}`;
      if (!containsEdgeSet.has(expectedContainsPair)) {
        errors.push(`Missing CONTAINS edge from parent "${node.parent_id}" to child "${node.id}"`);
      }
    }
  }

  // 4. Presence of relationships.json entries in graph.json
  if (relData) {
    const rawRels = Array.isArray(relData) ? relData : (relData.relationships || []);
    for (const rel of rawRels) {
      const sourceId = normPath(rel.source);
      const targetId = (rel.resolved && rel.target_symbol_id) ? normPath(rel.target_symbol_id) : null;
      const targetName = rel.target || rel.target_name;

      const found = edges.some((e) => 
        e.type === rel.type &&
        e.source === sourceId &&
        e.target === targetId &&
        (targetId !== null || e.target_name === targetName)
      );

      if (!found) {
        errors.push(`Relationship from relationships.json not found in graph.json: type="${rel.type}", source="${sourceId}", target="${targetId || targetName}"`);
      }
    }
  }

  const isValid = errors.length === 0;

  console.log(`\n========================================`);
  console.log(`       Graph Validation Report          `);
  console.log(`========================================`);
  console.log(`Nodes checked : ${nodes.length}`);
  console.log(`Edges checked : ${edges.length}`);

  if (isValid) {
    console.log(`\n✅ SUCCESS: All graph validation checks passed cleanly!\n`);
  } else {
    console.warn(`\n⚠️ Found ${errors.length} validation issues in generated graph:\n`);
    errors.slice(0, 10).forEach((err, idx) => console.warn(`  ${idx + 1}. ${err}`));
    if (errors.length > 10) {
      console.warn(`  ... and ${errors.length - 10} more issues.`);
    }
  }

  return {
    valid: isValid,
    errors,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
};
