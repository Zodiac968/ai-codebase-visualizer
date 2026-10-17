import { query } from '../../config/db.js';
import { DEFAULT_MODEL_ID, embedQuery } from '../embedding/modelService.js';
import { formatVectorForPg } from '../vectorService.js';
import { extractContentSnippet } from './lexicalSearchService.js';

/**
 * Searches symbols in PostgreSQL using semantic vector similarity (pgvector cosine distance).
 * 
 * @param {string} repoId - Repository identifier
 * @param {string} queryText - User natural language query
 * @param {number} [limit=20] - Number of candidate results to return
 * @param {string} [modelId=DEFAULT_MODEL_ID] - Model identifier
 * @returns {Promise<Array<Object>>}
 */
export async function searchSemanticSymbols(
  repoId,
  queryText,
  limit = 20,
  modelId = DEFAULT_MODEL_ID
) {
  if (!repoId || !queryText || !queryText.trim()) {
    return [];
  }

  // 1. Generate 384-d normalized query vector using local model
  const queryVec = await embedQuery(queryText.trim(), { modelId });
  const queryVecStr = formatVectorForPg(queryVec);

  const maxLimit = Math.max(1, limit);

  // 2. Query PostgreSQL with exact cosine distance (<=>)
  // Distance: 0 = identical. Cosine Similarity = 1 - distance.
  const sql = `
    SELECT
      symbol_id,
      content,
      metadata,
      1 - (embedding <=> $1::vector) AS similarity
    FROM symbol_embeddings
    WHERE repo_id = $2
      AND model_id = $3
      AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector ASC, symbol_id ASC
    LIMIT $4;
  `;

  try {
    const res = await query(sql, [queryVecStr, repoId, modelId, maxLimit]);

    return res.rows.map((row, idx) => ({
      symbol_id: row.symbol_id,
      name: row.metadata?.name || null,
      type: row.metadata?.type || null,
      file: row.metadata?.file || null,
      start_line: row.metadata?.start_line || null,
      end_line: row.metadata?.end_line || null,
      class_name: row.metadata?.class_name || row.metadata?.class || null,
      semantic_rank: idx + 1,
      semantic_similarity: parseFloat(parseFloat(row.similarity || 0).toFixed(4)),
      content_snippet: extractContentSnippet(row.content),
      metadata: row.metadata,
    }));
  } catch (err) {
    console.error(`[SemanticSearch] Query failed for repo "${repoId}":`, err.message);
    return [];
  }
}
