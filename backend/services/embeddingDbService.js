import { pool, query } from '../config/db.js';

/**
 * Batch saves symbol embedding documents into PostgreSQL with upsert, replacing the
 * repository's previous document set (documents for symbols not in embeddingDocs are deleted).
 * 
 * @param {string} repoId - Repository identifier (slug)
 * @param {Array<{ symbol_id: string, content: string, metadata: Object }>} embeddingDocs
 * @returns {Promise<number>} Number of saved documents
 */
export async function saveEmbeddings(repoId, embeddingDocs) {
  if (!repoId || !embeddingDocs || embeddingDocs.length === 0) {
    return 0;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Batch in chunks of 50 to avoid parameter limit
    const chunkSize = 50;
    for (let i = 0; i < embeddingDocs.length; i += chunkSize) {
      const chunk = embeddingDocs.slice(i, i + chunkSize);

      const valueClauses = [];
      const params = [];
      let paramIdx = 1;

      for (const doc of chunk) {
        const id = `${repoId}::${doc.symbol_id}`;
        valueClauses.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::jsonb, NOW())`);
        params.push(
          id,
          repoId,
          doc.symbol_id,
          doc.content,
          JSON.stringify(doc.metadata || {})
        );
      }

      const sql = `
        INSERT INTO symbol_embeddings (id, repo_id, symbol_id, content, metadata, updated_at)
        VALUES ${valueClauses.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `;

      await client.query(sql, params);
    }

    // embeddingDocs is the repository's complete document set. Remove rows for symbols
    // that no longer exist (e.g. after re-analysis shifted symbol IDs) so search never
    // returns symbols missing from the current graph.
    const prunedRes = await client.query(
      `DELETE FROM symbol_embeddings WHERE repo_id = $1 AND NOT (symbol_id = ANY($2::text[]))`,
      [repoId, embeddingDocs.map((doc) => doc.symbol_id)]
    );
    if (prunedRes.rowCount > 0) {
      console.log(`[PostgreSQL] Pruned ${prunedRes.rowCount} stale embedding documents for ${repoId}.`);
    }

    await client.query('COMMIT');
    return embeddingDocs.length;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[PostgreSQL] Failed to save symbol embeddings:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Retrieves all symbol embeddings for a repository from PostgreSQL.
 * 
 * @param {string} repoId - Repository identifier
 * @returns {Promise<Array<{ symbol_id: string, content: string, metadata: Object }>>}
 */
export async function getEmbeddingsByRepoId(repoId) {
  if (!repoId) return [];

  const sql = `
    SELECT symbol_id, content, metadata
    FROM symbol_embeddings
    WHERE repo_id = $1
    ORDER BY symbol_id ASC
  `;

  try {
    const res = await query(sql, [repoId]);
    return res.rows.map(row => ({
      symbol_id: row.symbol_id,
      content: row.content,
      metadata: row.metadata,
    }));
  } catch (error) {
    console.error(`[PostgreSQL] Failed to fetch embeddings for repo ${repoId}:`, error.message);
    return [];
  }
}

/**
 * Gets the count of symbol embeddings for a repository.
 * 
 * @param {string} repoId
 * @returns {Promise<number>}
 */
export async function getEmbeddingCount(repoId) {
  if (!repoId) return 0;

  const sql = `SELECT COUNT(*) as count FROM symbol_embeddings WHERE repo_id = $1`;
  try {
    const res = await query(sql, [repoId]);
    return parseInt(res.rows[0]?.count || '0', 10);
  } catch (error) {
    console.error(`[PostgreSQL] Failed to count embeddings for repo ${repoId}:`, error.message);
    return 0;
  }
}
