import { findRepoById } from '../repoDbService.js';
import { searchLexicalSymbols } from './lexicalSearchService.js';
import { searchSemanticSymbols } from './semanticSearchService.js';
import { DEFAULT_MODEL_ID } from '../embedding/modelService.js';

export const DEFAULT_RRF_K = 60;
export const DEFAULT_LEXICAL_CANDIDATE_LIMIT = 20;
export const DEFAULT_SEMANTIC_CANDIDATE_LIMIT = 20;
export const DEFAULT_FINAL_LIMIT = 10;

/**
 * Executes a hybrid retrieval combining PostgreSQL lexical full-text search,
 * pgvector semantic cosine similarity search, and Reciprocal Rank Fusion (RRF).
 * 
 * @param {string} repoId - Repository identifier
 * @param {string} queryText - User search query
 * @param {Object} [options]
 * @param {number} [options.limit=10] - Number of final ranked results to return
 * @param {number} [options.k=60] - RRF constant k
 * @param {number} [options.lexicalLimit=20] - Number of lexical candidates
 * @param {number} [options.semanticLimit=20] - Number of semantic candidates
 * @param {string} [options.modelId=DEFAULT_MODEL_ID] - Embedding model ID
 * @returns {Promise<Object>} Hybrid search response
 */
export async function hybridSearch(repoId, queryText, options = {}) {
  if (!repoId || typeof repoId !== 'string') {
    throw new Error('Repository ID is required.');
  }

  const queryClean = (queryText || '').trim();
  if (!queryClean) {
    throw new Error('Search query must be a non-empty string.');
  }

  // 1. Verify repository exists
  const repoRecord = await findRepoById(repoId);
  if (!repoRecord) {
    throw new Error(`Repository "${repoId}" not found. Please analyze the repository first.`);
  }

  const k = options.k || DEFAULT_RRF_K;
  const lexicalLimit = options.lexicalLimit || DEFAULT_LEXICAL_CANDIDATE_LIMIT;
  const semanticLimit = options.semanticLimit || DEFAULT_SEMANTIC_CANDIDATE_LIMIT;
  const finalLimit = Math.max(1, options.limit || DEFAULT_FINAL_LIMIT);
  const modelId = options.modelId || DEFAULT_MODEL_ID;

  // 2. Concurrently execute lexical and semantic searches
  const [lexicalResults, semanticResults] = await Promise.all([
    searchLexicalSymbols(repoId, queryClean, lexicalLimit),
    searchSemanticSymbols(repoId, queryClean, semanticLimit, modelId),
  ]);

  // 3. Merge candidates using Reciprocal Rank Fusion (RRF)
  // RRF(d) = sum( 1 / (k + rank(d)) )
  const candidateMap = new Map();

  // Process Lexical Candidates
  for (const item of lexicalResults) {
    const symId = item.symbol_id;
    if (!candidateMap.has(symId)) {
      candidateMap.set(symId, {
        symbol_id: symId,
        name: item.name,
        type: item.type,
        file: item.file,
        start_line: item.start_line,
        end_line: item.end_line,
        class_name: item.class_name,
        content_snippet: item.content_snippet,
        lexical_rank: item.lexical_rank,
        lexical_score: item.lexical_score,
        semantic_rank: null,
        semantic_similarity: null,
        rrf_score: 0,
        metadata: item.metadata,
      });
    }

    const cand = candidateMap.get(symId);
    cand.lexical_rank = item.lexical_rank;
    cand.lexical_score = item.lexical_score;
    cand.rrf_score += 1 / (k + item.lexical_rank);
  }

  // Process Semantic Candidates
  for (const item of semanticResults) {
    const symId = item.symbol_id;
    if (!candidateMap.has(symId)) {
      candidateMap.set(symId, {
        symbol_id: symId,
        name: item.name,
        type: item.type,
        file: item.file,
        start_line: item.start_line,
        end_line: item.end_line,
        class_name: item.class_name,
        content_snippet: item.content_snippet,
        lexical_rank: null,
        lexical_score: null,
        semantic_rank: item.semantic_rank,
        semantic_similarity: item.semantic_similarity,
        rrf_score: 0,
        metadata: item.metadata,
      });
    }

    const cand = candidateMap.get(symId);
    cand.semantic_rank = item.semantic_rank;
    cand.semantic_similarity = item.semantic_similarity;
    cand.rrf_score += 1 / (k + item.semantic_rank);
  }

  // 4. Sort with deterministic tie-breaking:
  // - Higher RRF score first
  // - Candidates matching both modalities first (lexical_rank != null && semantic_rank != null)
  // - Higher semantic similarity
  // - Higher lexical score
  // - Canonical symbol_id ascending (alphabetical)
  const rankedCandidates = Array.from(candidateMap.values()).sort((a, b) => {
    // RRF Score comparison (descending)
    if (Math.abs(b.rrf_score - a.rrf_score) > 1e-7) {
      return b.rrf_score - a.rrf_score;
    }

    // Both modalities matched bonus
    const aBoth = a.lexical_rank !== null && a.semantic_rank !== null ? 1 : 0;
    const bBoth = b.lexical_rank !== null && b.semantic_rank !== null ? 1 : 0;
    if (bBoth !== aBoth) {
      return bBoth - aBoth;
    }

    // Semantic score comparison
    const aSem = a.semantic_similarity || 0;
    const bSem = b.semantic_similarity || 0;
    if (Math.abs(bSem - aSem) > 1e-4) {
      return bSem - aSem;
    }

    // Lexical score comparison
    const aLex = a.lexical_score || 0;
    const bLex = b.lexical_score || 0;
    if (Math.abs(bLex - aLex) > 1e-4) {
      return bLex - aLex;
    }

    // Alphabetical tie-breaker
    return a.symbol_id.localeCompare(b.symbol_id);
  });

  // 5. Slice to top requested limit and format output
  const finalResults = rankedCandidates.slice(0, finalLimit).map((item) => ({
    symbol_id: item.symbol_id,
    name: item.name,
    type: item.type,
    file: item.file,
    start_line: item.start_line,
    end_line: item.end_line,
    class_name: item.class_name,
    rrf_score: parseFloat(item.rrf_score.toFixed(6)),
    lexical_rank: item.lexical_rank,
    semantic_rank: item.semantic_rank,
    lexical_score: item.lexical_score,
    semantic_similarity: item.semantic_similarity,
    content_snippet: item.content_snippet,
  }));

  return {
    query: queryClean,
    repository_id: repoId,
    total_lexical_candidates: lexicalResults.length,
    total_semantic_candidates: semanticResults.length,
    results: finalResults,
  };
}
