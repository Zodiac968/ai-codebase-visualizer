import fs from 'fs';
import path from 'path';

// Helper to normalize backslashes to forward slashes
const normPath = (p) => (p || '').replace(/\\/g, '/');

/**
 * Builds a graph data model from analysis files.
 * 
 * @param {Array} fileInfoList - Data from fileinfo.json or analysis.json
 * @param {Array} symbolsList - Data from symbols.json
 * @param {Array} relationshipsList - Data from relationships.json
 * @returns {Object} Graph representation containing nodes and edges
 */
export const generateGraphData = (fileInfoList = [], symbolsList = [], relationshipsList = []) => {
  const nodesMap = new Map();
  const edgesMap = new Map();

  const addNode = (node) => {
    if (node && node.id && !nodesMap.has(node.id)) {
      nodesMap.set(node.id, node);
    }
  };

  const addEdge = (edge) => {
    if (edge && edge.id && !edgesMap.has(edge.id)) {
      edgesMap.set(edge.id, edge);
    }
  };

  // 1. Root Repository Node
  addNode({
    id: 'repository',
    type: 'repository',
    name: 'repository',
    parent_id: null,
  });

  // 2. Build Directory & File Hierarchy
  for (const fileItem of fileInfoList) {
    const rawPath = typeof fileItem === 'string' ? fileItem : (fileItem.path || fileItem.file);
    if (!rawPath) continue;

    const normalizedPath = normPath(rawPath);
    const pathParts = normalizedPath.split('/');

    let currentParentId = 'repository';
    let currentPathAccumulator = '';

    // Process folders
    for (let i = 0; i < pathParts.length - 1; i++) {
      const folderName = pathParts[i];
      currentPathAccumulator = currentPathAccumulator
        ? `${currentPathAccumulator}/${folderName}`
        : folderName;

      const folderId = currentPathAccumulator;

      addNode({
        id: folderId,
        type: 'folder',
        name: folderName,
        parent_id: currentParentId,
      });

      addEdge({
        id: `contains:${currentParentId}:${folderId}`,
        type: 'CONTAINS',
        source: currentParentId,
        target: folderId,
      });

      currentParentId = folderId;
    }

    // Process file node
    const fileName = pathParts[pathParts.length - 1];
    const fileId = normalizedPath;

    addNode({
      id: fileId,
      type: 'file',
      name: fileName,
      parent_id: currentParentId,
    });

    addEdge({
      id: `contains:${currentParentId}:${fileId}`,
      type: 'CONTAINS',
      source: currentParentId,
      target: fileId,
    });
  }

  // Map to resolve symbol names to full IDs per file
  const symbolLookupByFileAndName = new Map();

  // 3. Process Code Symbols
  for (const symbol of symbolsList) {
    const symId = normPath(symbol.id);
    const filePath = normPath(symbol.file || symbol.path);
    
    // Fallback: If file node didn't exist in fileInfo, add it
    if (filePath && !nodesMap.has(filePath)) {
      addNode({
        id: filePath,
        type: 'file',
        name: filePath.split('/').pop(),
        parent_id: 'repository',
      });
      addEdge({
        id: `contains:repository:${filePath}`,
        type: 'CONTAINS',
        source: 'repository',
        target: filePath,
      });
    }

    // Index symbol for parent lookup resolution
    if (filePath && symbol.name) {
      const key = `${filePath}:${symbol.name}`;
      symbolLookupByFileAndName.set(key, symId);
    }

    addNode({
      id: symId,
      type: symbol.type,
      name: symbol.name,
      path: filePath,
      parent_id: symbol.parent ? normPath(symbol.parent) : filePath,
    });
  }

  // Create CONTAINS edges for symbols after indexing
  for (const symbol of symbolsList) {
    const symId = normPath(symbol.id);
    const filePath = normPath(symbol.file || symbol.path);
    let rawParent = symbol.parent ? normPath(symbol.parent) : null;

    let resolvedParentId = filePath; // Default parent is the file node

    if (rawParent) {
      if (nodesMap.has(rawParent)) {
        resolvedParentId = rawParent;
      } else {
        // Try looking up parent symbol by file + parent name
        const parentLookupKey = `${filePath}:${rawParent}`;
        if (symbolLookupByFileAndName.has(parentLookupKey)) {
          resolvedParentId = symbolLookupByFileAndName.get(parentLookupKey);
        }
      }
    }

    // Update parent_id on the node if resolved
    const node = nodesMap.get(symId);
    if (node) {
      node.parent_id = resolvedParentId;
    }

    if (resolvedParentId) {
      addEdge({
        id: `contains:${resolvedParentId}:${symId}`,
        type: 'CONTAINS',
        source: resolvedParentId,
        target: symId,
      });
    }
  }

  // 4. Process Semantic Relationships
  for (const rel of relationshipsList) {
    const sourceId = normPath(rel.source);
    
    // Target is valid only if resolved with a target_symbol_id
    const targetSymbolId = rel.target_symbol_id ? normPath(rel.target_symbol_id) : null;
    const isResolved = Boolean(rel.resolved && targetSymbolId);
    
    const targetId = isResolved ? targetSymbolId : null;
    const targetName = rel.target || rel.target_name || 'unknown';
    const edgeTypeLower = (rel.type || 'rel').toLowerCase();

    let edgeId;
    if (targetId) {
      edgeId = `${edgeTypeLower}:${sourceId}:${targetId}`;
    } else {
      edgeId = `${edgeTypeLower}:${sourceId}:unresolved:${targetName}`;
    }

    const edgeObj = {
      id: edgeId,
      type: rel.type,
      source: sourceId,
      target: targetId,
      resolved: isResolved,
      revealed: rel.revealed ?? false,
    };

    if (!targetId) {
      edgeObj.target_name = targetName;
    }

    addEdge(edgeObj);
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges: Array.from(edgesMap.values()),
  };
};

/**
 * Reads analysis files from target directory, builds graph.json, and writes it back.
 */
export const buildAndSaveGraph = (analysisDir) => {
  const readJson = (fileName) => {
    const filePath = path.join(analysisDir, fileName);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return null;
  };

  const fileInfoData = readJson('analysis.json') || readJson('fileinfo.json') || [];
  const fileInfo = Array.isArray(fileInfoData) ? fileInfoData : (fileInfoData.files || fileInfoData.file_info || []);

  const symbolsData = readJson('symbols.json') || readJson('basic_structure.json') || [];
  const symbols = Array.isArray(symbolsData) ? symbolsData : (symbolsData.symbols || []);

  const relData = readJson('relationships.json');
  const relationships = Array.isArray(relData) ? relData : (relData?.relationships || []);

  const graphData = generateGraphData(fileInfo, symbols, relationships);

  const outputPath = path.join(analysisDir, 'graph.json');
  fs.writeFileSync(outputPath, JSON.stringify(graphData, null, 2));

  console.log(`Successfully generated ${outputPath} with ${graphData.nodes.length} nodes and ${graphData.edges.length} edges.`);
  return { outputPath, graphData };
};
