import { query } from '../../config/db.js';

/**
 * Normalizes and splits a code identifier (camelCase, PascalCase, snake_case, dotted paths)
 * into its individual component tokens while preserving the compound token.
 * 
 * @param {string} ident
 * @returns {Array<string>}
 */
export function splitCodeIdentifier(ident) {
  if (!ident || typeof ident !== 'string') return [];

  // Split on dots, underscores, dashes, colons, slashes
  const parts = ident.split(/[\._\-\/\\:]+/).filter(Boolean);
  const words = new Set();

  for (const part of parts) {
    if (!part) continue;
    words.add(part);

    // Split camelCase & PascalCase (e.g. resetPassword -> reset, Password; JWTAuth -> JWT, Auth)
    const subWords = part
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z\d]+)/g, '$1 $2')
      .split(/\s+/)
      .filter(Boolean);

    for (const w of subWords) {
      if (w.length > 1) {
        words.add(w);
      }
    }
  }

  return Array.from(words);
}

/**
 * Builds safe tsquery terms from user query text.
 * 
 * @param {string} rawQuery
 * @returns {{ webQuery: string, orQuery: string, exactTarget: string }}
 */
export function buildLexicalQuery(rawQuery) {
  const exactTarget = (rawQuery || '').trim();
  const cleaned = exactTarget.replace(/['":*&|!()]/g, ' ');

  // Extract all sub-tokens using the code identifier splitter
  const rawWords = cleaned.split(/\s+/).filter(Boolean);
  const allTokens = new Set();

  for (const w of rawWords) {
    const splits = splitCodeIdentifier(w);
    for (const s of splits) {
      // Only keep alphanumeric tokens of length >= 2 for prefix matching
      const alphaOnly = s.replace(/[^a-zA-Z0-9]/g, '');
      if (alphaOnly.length >= 2) {
        allTokens.add(alphaOnly);
      }
    }
  }

  const tokenList = Array.from(allTokens);
  // Construct prefix OR query for PostgreSQL to_tsquery (e.g. "listen:* | port:*")
  const orQuery = tokenList.slice(0, 15).map((t) => `${t}:*`).join(' | ');

  return {
    webQuery: cleaned,
    orQuery: orQuery || '',
    exactTarget,
  };
}

/**
 * Extracts a concise human-readable summary snippet from document content,
 * prioritizing Purpose, Signature, or leading lines without embedding full source.
 * 
 * @param {string} content
 * @returns {string}
 */
export function extractContentSnippet(content) {
  if (!content) return '';

  // Look for Purpose: section
  const purposeMatch = content.match(/Purpose:\s*\n([\s\S]*?)(?=\n[A-Z][a-zA-Z]+:|$)/);
  if (purposeMatch && purposeMatch[1].trim()) {
    const lines = purposeMatch[1].trim().split('\n').filter(Boolean);
    return lines.slice(0, 3).join(' ').slice(0, 200);
  }

  // Look for Signature: section
  const sigMatch = content.match(/Signature:\s*\n([\s\S]*?)(?=\n[A-Z][a-zA-Z]+:|$)/);
  if (sigMatch && sigMatch[1].trim()) {
    return sigMatch[1].trim().slice(0, 150);
  }

  // Fallback: first 150 characters
  return content.slice(0, 150).replace(/\n/g, ' ').trim();
}

/**
 * Searches symbols in PostgreSQL using weighted lexical full-text search.
 * 
 * @param {string} repoId - Repository identifier
 * @param {string} queryText - User search query
 * @param {number} [limit=20] - Number of candidate results to return
 * @returns {Promise<Array<Object>>}
 */
export async function searchLexicalSymbols(repoId, queryText, limit = 20) {
  if (!repoId || !queryText || !queryText.trim()) {
    return [];
  }

  const { webQuery, orQuery, exactTarget } = buildLexicalQuery(queryText);
  const maxLimit = Math.max(1, limit);

  const sql = `
    WITH search_queries AS (
      SELECT
        websearch_to_tsquery('english', $2) AS q_web,
        CASE
          WHEN $3 != '' THEN to_tsquery('english', $3)
          ELSE websearch_to_tsquery('english', $2)
        END AS q_or
    )
    SELECT
      se.symbol_id,
      se.metadata,
      se.content,
      (
        COALESCE(ts_rank_cd('{0.1, 0.2, 0.4, 1.0}', se.tsv, sq.q_web), 0) * 3.0
        +
        COALESCE(ts_rank(se.tsv, sq.q_or), 0)
        +
        (CASE WHEN LOWER(COALESCE(se.metadata->>'name', '')) = LOWER($4) THEN 5.0 ELSE 0.0 END)
        +
        (CASE WHEN COALESCE(se.metadata->>'name', '') ILIKE '%' || $4 || '%' THEN 1.5 ELSE 0.0 END)
      ) AS lexical_score
    FROM symbol_embeddings se, search_queries sq
    WHERE se.repo_id = $1
      AND (
        (sq.q_web != ''::tsquery AND se.tsv @@ sq.q_web)
        OR (sq.q_or != ''::tsquery AND se.tsv @@ sq.q_or)
        OR COALESCE(se.metadata->>'name', '') ILIKE '%' || $4 || '%'
        OR se.symbol_id ILIKE '%' || $4 || '%'
      )
    ORDER BY lexical_score DESC, se.symbol_id ASC
    LIMIT $5;
  `;

  try {
    const res = await query(sql, [repoId, webQuery, orQuery, exactTarget, maxLimit]);

    return res.rows.map((row, idx) => ({
      symbol_id: row.symbol_id,
      name: row.metadata?.name || null,
      type: row.metadata?.type || null,
      file: row.metadata?.file || null,
      start_line: row.metadata?.start_line || null,
      end_line: row.metadata?.end_line || null,
      class_name: row.metadata?.class_name || row.metadata?.class || null,
      lexical_rank: idx + 1,
      lexical_score: parseFloat(parseFloat(row.lexical_score || 0).toFixed(4)),
      content_snippet: extractContentSnippet(row.content),
      metadata: row.metadata,
    }));
  } catch (err) {
    console.error(`[LexicalSearch] Query failed for repo "${repoId}":`, err.message);
    return [];
  }
}
