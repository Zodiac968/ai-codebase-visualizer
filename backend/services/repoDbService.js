import { query } from '../config/db.js';

/**
 * Retrieves a repository record by its normalized ID.
 * 
 * @param {string} id - The normalized ID (e.g. "octocat__hello-world")
 * @returns {Promise<Object|null>}
 */
export async function findRepoById(id) {
  const res = await query('SELECT * FROM repositories WHERE id = $1', [id]);
  return res.rows[0] || null;
}

/**
 * Retrieves only the graph and validation for a repository.
 * 
 * @param {string} id - The normalized ID
 * @returns {Promise<Object|null>}
 */
export async function getRepoGraph(id) {
  const res = await query(
    'SELECT id, full_name, url, graph, validation, node_count, edge_count FROM repositories WHERE id = $1',
    [id]
  );
  return res.rows[0] || null;
}

/**
 * Inserts or updates a repository's complete analysis data in PostgreSQL.
 * 
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function upsertRepo(data) {
  const {
    id,
    fullName,
    owner,
    name,
    url,
    localPath,
    status = 'analyzed',
    fileAnalysis = [],
    symbols = [],
    relationships = [],
    graph = { nodes: [], edges: [] },
    validation = { valid: true, errors: [] },
  } = data;

  const nodeCount = graph?.nodes?.length || 0;
  const edgeCount = graph?.edges?.length || 0;
  const fileCount = Array.isArray(fileAnalysis) ? fileAnalysis.length : 0;

  const sql = `
    INSERT INTO repositories (
      id, full_name, owner, name, url, local_path, status,
      file_analysis, symbols, relationships, graph, validation,
      node_count, edge_count, file_count, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      owner = EXCLUDED.owner,
      name = EXCLUDED.name,
      url = EXCLUDED.url,
      local_path = EXCLUDED.local_path,
      status = EXCLUDED.status,
      file_analysis = EXCLUDED.file_analysis,
      symbols = EXCLUDED.symbols,
      relationships = EXCLUDED.relationships,
      graph = EXCLUDED.graph,
      validation = EXCLUDED.validation,
      node_count = EXCLUDED.node_count,
      edge_count = EXCLUDED.edge_count,
      file_count = EXCLUDED.file_count,
      updated_at = NOW()
    RETURNING *;
  `;

  const values = [
    id,
    fullName,
    owner,
    name,
    url,
    localPath,
    status,
    JSON.stringify(fileAnalysis),
    JSON.stringify(symbols),
    JSON.stringify(relationships),
    JSON.stringify(graph),
    JSON.stringify(validation),
    nodeCount,
    edgeCount,
    fileCount,
  ];

  const res = await query(sql, values);
  return res.rows[0];
}

/**
 * Lists recently analyzed repositories for history and instant navigation.
 * 
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function listRecentRepos(limit = 10) {
  const sql = `
    SELECT id, full_name, owner, name, url, node_count, edge_count, file_count, created_at, updated_at
    FROM repositories
    ORDER BY updated_at DESC
    LIMIT $1;
  `;
  const res = await query(sql, [limit]);
  return res.rows;
}
