import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pool, query } from '../config/db.js';
import {
  DEFAULT_MODEL_ID,
  EXPECTED_VECTOR_DIMENSIONS,
  DEFAULT_BATCH_SIZE,
  embedDocuments,
  embedQuery,
} from './embedding/modelService.js';
import { getEmbeddingsByRepoId } from './embeddingDbService.js';

/**
 * Computes a deterministic SHA-256 hash of text content.
 * 
 * @param {string} content
 * @returns {string} Hexadecimal hash
 */
export function computeContentHash(content) {
  return crypto.createHash('sha256').update(content || '', 'utf8').digest('hex');
}

/**
 * Loads embedding documents for a repository, trying PostgreSQL first with fallback to disk.
 * 
 * @param {string} repoId
 * @returns {Promise<Array<{ symbol_id: string, content: string, metadata: Object }>>}
 */
async function loadEmbeddingDocuments(repoId) {
  // 1. Try PostgreSQL
  try {
    const docs = await getEmbeddingsByRepoId(repoId);
    if (docs && docs.length > 0) {
      return docs;
    }
  } catch (err) {
    console.warn(`[VectorService] DB lookup for documents failed for ${repoId}:`, err.message);
  }

  // 2. Try disk embeddings.json
  const diskPath = path.join(process.cwd(), 'repositories', repoId, 'embeddings.json');
  if (fs.existsSync(diskPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(diskPath, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (parseErr) {
      console.warn(`[VectorService] Could not parse disk embeddings.json for ${repoId}:`, parseErr.message);
    }
  }

  return [];
}

/**
 * Formats a JavaScript float array into a PostgreSQL pgvector literal string: [0.1,0.2,...]
 * 
 * @param {Array<number>} vector
 * @returns {string}
 */
export function formatVectorForPg(vector) {
  return `[${vector.join(',')}]`;
}

/**
 * Generates and persists numerical vector embeddings for all symbols of a repository.
 * 
 * @param {string} repoId - Repository slug identifier
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - Force re-generation of all vectors even if hashes match
 * @param {number} [options.batchSize] - Inference batch size
 * @param {string} [options.modelId] - Model ID
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<{ success: boolean, total: number, generated: number, skipped: number, failed: number, model: string, dimensions: number }>}
 */
export async function generateVectorEmbeddings(repoId, options = {}) {
  if (!repoId) {
    throw new Error('Repository ID is required.');
  }

  const modelId = options.modelId || DEFAULT_MODEL_ID;
  const force = Boolean(options.force);
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;

  // 1. Load existing semantic embedding documents
  const documents = await loadEmbeddingDocuments(repoId);
  if (!documents || documents.length === 0) {
    throw new Error(
      `No embedding documents found for repository "${repoId}". Please generate embedding documents first.`
    );
  }

  // 2. Fetch existing stored vector hashes to skip unchanged symbols
  const existingVectorsMap = new Map();
  if (!force) {
    try {
      const existingRes = await query(
        `SELECT symbol_id, content_hash
         FROM symbol_embeddings
         WHERE repo_id = $1 AND model_id = $2 AND embedding IS NOT NULL`,
        [repoId, modelId]
      );
      for (const row of existingRes.rows) {
        existingVectorsMap.set(row.symbol_id, row.content_hash);
      }
    } catch (err) {
      console.warn('[VectorService] Could not query existing vectors; proceeding with full generation:', err.message);
    }
  }

  // 3. Determine which documents need embedding calculation
  const toGenerate = [];
  let skippedCount = 0;

  for (const doc of documents) {
    const hash = computeContentHash(doc.content);
    doc._contentHash = hash;

    if (!force && existingVectorsMap.has(doc.symbol_id) && existingVectorsMap.get(doc.symbol_id) === hash) {
      skippedCount++;
    } else {
      toGenerate.push(doc);
    }
  }

  console.log(
    `[VectorService] Repo "${repoId}": ${documents.length} total docs, ${toGenerate.length} to vectorize, ${skippedCount} skipped (cached).`
  );

  // If all vectors are up to date and no force refresh requested, return immediately
  if (toGenerate.length === 0) {
    return {
      success: true,
      total: documents.length,
      generated: 0,
      skipped: skippedCount,
      failed: 0,
      model: modelId,
      dimensions: EXPECTED_VECTOR_DIMENSIONS,
    };
  }

  // 4. Run model inference for required documents
  const texts = toGenerate.map((d) => d.content);
  let generatedVectors;

  try {
    generatedVectors = await embedDocuments(texts, {
      batchSize,
      modelId,
      onProgress: options.onProgress,
    });
  } catch (inferenceErr) {
    console.error(`[VectorService] Inference error for repo "${repoId}":`, inferenceErr);
    throw new Error(`Embedding model inference failed: ${inferenceErr.message}`);
  }

  // 5. Persist vectors and metadata in PostgreSQL in transaction chunks
  const client = await pool.connect();
  const dbChunkSize = 50;

  try {
    await client.query('BEGIN');

    for (let i = 0; i < toGenerate.length; i += dbChunkSize) {
      const chunkDocs = toGenerate.slice(i, i + dbChunkSize);
      const chunkVectors = generatedVectors.slice(i, i + dbChunkSize);

      const valueClauses = [];
      const params = [];
      let paramIdx = 1;

      for (let j = 0; j < chunkDocs.length; j++) {
        const doc = chunkDocs[j];
        const vec = chunkVectors[j];
        const id = `${repoId}::${doc.symbol_id}`;
        const vecStr = formatVectorForPg(vec);

        valueClauses.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::jsonb, $${paramIdx++}::vector, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW())`
        );

        params.push(
          id,
          repoId,
          doc.symbol_id,
          doc.content,
          JSON.stringify(doc.metadata || {}),
          vecStr,
          modelId,
          doc._contentHash,
          EXPECTED_VECTOR_DIMENSIONS
        );
      }

      const upsertSql = `
        INSERT INTO symbol_embeddings (
          id, repo_id, symbol_id, content, metadata, embedding, model_id, content_hash, vector_dimensions, updated_at
        )
        VALUES ${valueClauses.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          embedding = EXCLUDED.embedding,
          model_id = EXCLUDED.model_id,
          content_hash = EXCLUDED.content_hash,
          vector_dimensions = EXCLUDED.vector_dimensions,
          updated_at = NOW();
      `;

      await client.query(upsertSql, params);
    }

    await client.query('COMMIT');
    console.log(`[VectorService] Successfully persisted ${toGenerate.length} vectors to PostgreSQL.`);
  } catch (dbErr) {
    await client.query('ROLLBACK');
    console.error(`[VectorService] Database persistence failed for repo "${repoId}":`, dbErr);
    throw new Error(`Database error saving vector embeddings: ${dbErr.message}`);
  } finally {
    client.release();
  }

  return {
    success: true,
    total: documents.length,
    generated: toGenerate.length,
    skipped: skippedCount,
    failed: 0,
    model: modelId,
    dimensions: EXPECTED_VECTOR_DIMENSIONS,
  };
}

/**
 * Performs semantic similarity search on stored symbol vectors using pgvector cosine distance (<=>).
 * 
 * @param {string} repoId
 * @param {string} queryText
 * @param {number} [limit=5]
 * @param {string} [modelId=DEFAULT_MODEL_ID]
 * @returns {Promise<Array<Object>>} Top similar symbols
 */
export async function searchSimilarSymbols(repoId, queryText, limit = 5, modelId = DEFAULT_MODEL_ID) {
  if (!repoId || !queryText || !queryText.trim()) {
    return [];
  }

  // 1. Embed search query
  const queryVec = await embedQuery(queryText.trim(), { modelId });
  const queryVecStr = formatVectorForPg(queryVec);

  // 2. Query PostgreSQL with exact cosine distance (<=>)
  // Cosine distance is in [0, 2], where 0 is identical.
  // Cosine similarity = 1 - distance.
  const sql = `
    SELECT
      symbol_id,
      content,
      metadata,
      1 - (embedding <=> $1::vector) AS similarity
    FROM symbol_embeddings
    WHERE repo_id = $2 AND model_id = $3 AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector ASC
    LIMIT $4;
  `;

  const res = await query(sql, [queryVecStr, repoId, modelId, Math.max(1, limit)]);

  return res.rows.map((row) => ({
    symbol_id: row.symbol_id,
    name: row.metadata?.name || null,
    type: row.metadata?.type || null,
    file: row.metadata?.file || null,
    className: row.metadata?.class_name || null,
    similarity: parseFloat(parseFloat(row.similarity).toFixed(4)),
    content: row.content,
    metadata: row.metadata,
  }));
}

/**
 * Returns vector storage status and count for a repository.
 * 
 * @param {string} repoId
 * @param {string} [modelId=DEFAULT_MODEL_ID]
 * @returns {Promise<{ total: number, vectorized: number, model: string, dimensions: number }>}
 */
export async function getVectorStats(repoId, modelId = DEFAULT_MODEL_ID) {
  if (!repoId) return { total: 0, vectorized: 0, model: modelId, dimensions: EXPECTED_VECTOR_DIMENSIONS };

  const sql = `
    SELECT
      COUNT(*) AS total,
      COUNT(embedding) AS vectorized
    FROM symbol_embeddings
    WHERE repo_id = $1 AND model_id = $2;
  `;

  try {
    const res = await query(sql, [repoId, modelId]);
    return {
      total: parseInt(res.rows[0]?.total || '0', 10),
      vectorized: parseInt(res.rows[0]?.vectorized || '0', 10),
      model: modelId,
      dimensions: EXPECTED_VECTOR_DIMENSIONS,
    };
  } catch (err) {
    console.error(`[VectorService] Failed to fetch stats for ${repoId}:`, err.message);
    return { total: 0, vectorized: 0, model: modelId, dimensions: EXPECTED_VECTOR_DIMENSIONS };
  }
}
