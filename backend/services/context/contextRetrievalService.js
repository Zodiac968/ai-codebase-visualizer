import { findRepoById } from '../repoDbService.js';
import { hybridSearch } from '../search/hybridSearchService.js';
import { expandGraph } from '../graph/graphExpansionService.js';
import { buildContextPackage, DEFAULT_MAX_CONTEXT_TOKENS } from './contextBudgetService.js';

export const DEFAULT_SEED_LIMIT = 5;

/**
 * Orchestrates Phase 4.4 Graph Expansion and Context Retrieval:
 * 1. Executes hybrid retrieval to gather high-relevance seed symbols.
 * 2. Traverses knowledge graph to discover semantically connected symbols.
 * 3. Retrieves exact source code for symbols from AST records or disk slices.
 * 4. Assembles a bounded, structured context package conforming to the token budget.
 * 
 * @param {string} repoId - Repository identifier
 * @param {string} queryText - User natural language or technical query
 * @param {Object} [options]
 * @param {number} [options.seedLimit=5] - Number of seed symbols to retrieve from hybrid search
 * @param {number} [options.maxDepth=1] - Maximum graph traversal depth (hops)
 * @param {number} [options.maxExpandedNodes=15] - Maximum expanded symbols
 * @param {number} [options.maxTotalSymbols=20] - Maximum total symbols to budget
 * @param {number} [options.maxContextTokens=12000] - Token budget ceiling
 * @param {Object} [options.relationshipWeights] - Custom weights for relationship types
 * @returns {Promise<Object>} Structured Context Package
 */
export async function retrieveContext(repoId, queryText, options = {}) {
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

  const seedLimit = Math.max(1, options.seedLimit || DEFAULT_SEED_LIMIT);
  const maxDepth = Math.max(1, options.maxDepth || 1);
  const maxExpandedNodes = Math.max(1, options.maxExpandedNodes || 15);
  const maxTotalSymbols = Math.max(1, options.maxTotalSymbols || 20);
  const maxContextTokens = Math.max(500, options.maxContextTokens || DEFAULT_MAX_CONTEXT_TOKENS);

  // 2. Gather seed symbols via Hybrid Retrieval (Lexical + Semantic + RRF)
  const hybridResult = await hybridSearch(repoId, queryClean, {
    limit: seedLimit,
  });

  const rawSeeds = hybridResult.results || [];
  if (rawSeeds.length === 0) {
    return {
      query: queryClean,
      repository_id: repoId,
      seeds: [],
      expanded_symbols: [],
      relationships: [],
      context: [],
      statistics: {
        seed_count: 0,
        expanded_count: 0,
        total_symbols: 0,
        omitted_count: 0,
        context_token_estimate: 0,
        budget_tokens: maxContextTokens,
        budget_utilization_pct: 0,
        truncated: false,
      },
    };
  }

  // 3. Expand graph around seed symbols
  const expansionResult = await expandGraph(repoId, rawSeeds, {
    maxDepth,
    maxExpandedNodes,
    relationshipWeights: options.relationshipWeights,
  });

  // 4. Retrieve source and assemble bounded context package
  const contextPackage = buildContextPackage(
    repoId,
    queryClean,
    expansionResult.seeds,
    expansionResult.expanded_symbols,
    expansionResult.relationships,
    repoRecord,
    {
      maxContextTokens,
      maxTotalSymbols,
    }
  );

  return contextPackage;
}
