import { retrieveSymbolSource } from './sourceRetrievalService.js';

export const DEFAULT_MAX_CONTEXT_TOKENS = 12000;
export const DEFAULT_MAX_TOTAL_SYMBOLS = 20;

/**
 * Conservative token estimator for code and structured documentation text.
 * In programming languages and technical Markdown, 1 token averages ~3.8 characters.
 * 
 * @param {string} text
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 3.8);
}

/**
 * Formats a clean header and code block for a symbol context entry.
 * 
 * @param {Object} symbolSource - Retrieved symbol source object
 * @param {boolean} isSeed - Whether this symbol is an original seed
 * @param {Object} [meta] - Ranking or discovery metadata
 * @returns {string} Formatted context text block
 */
export function formatContextBlock(symbolSource, isSeed, meta = {}) {
  const lineRange = symbolSource.start_line
    ? `(Lines ${symbolSource.start_line}${symbolSource.end_line ? `–${symbolSource.end_line}` : ''})`
    : '';

  let headerLine = `// File: ${symbolSource.file} ${lineRange}\n`;
  if (isSeed) {
    headerLine += `// Symbol: ${symbolSource.type} ${symbolSource.name} [SEED #${meta.hybrid_rank || 1}, Score: ${meta.hybrid_score || 0}]\n`;
  } else {
    const fromRels = Array.isArray(meta.discovered_from)
      ? meta.discovered_from.map((d) => `${d.relationship} (${d.direction}) from ${d.seed_symbol_id?.split('::')[2] || d.seed_symbol_id}`).join(', ')
      : 'graph_expansion';
    headerLine += `// Symbol: ${symbolSource.type} ${symbolSource.name} [EXPANDED, Dist: ${meta.distance || 1}, Relevance: ${meta.relevance_score || 0}]\n`;
    headerLine += `// Connection: ${fromRels}\n`;
  }

  return `${headerLine}${symbolSource.source}\n`;
}

/**
 * Assembles a structured, bounded context package respecting the token budget.
 * Seeds are guaranteed priority; expanded nodes fill the remaining budget by relevance score.
 * 
 * @param {string} repoId - Repository identifier
 * @param {string} queryText - User search query
 * @param {Array<Object>} seeds - Seed symbols from hybrid retrieval
 * @param {Array<Object>} expandedSymbols - Expanded symbols from graph expansion
 * @param {Array<Object>} relationships - Connecting graph relationships
 * @param {Object} repoRecord - Full repository record from PostgreSQL
 * @param {Object} [options]
 * @param {number} [options.maxContextTokens=12000] - Token budget ceiling
 * @param {number} [options.maxTotalSymbols=20] - Maximum total symbols to include
 * @returns {Object} Structured Context Package
 */
export function buildContextPackage(
  repoId,
  queryText,
  seeds = [],
  expandedSymbols = [],
  relationships = [],
  repoRecord,
  options = {}
) {
  const maxTokens = options.maxContextTokens || DEFAULT_MAX_CONTEXT_TOKENS;
  const maxTotalSymbols = options.maxTotalSymbols || DEFAULT_MAX_TOTAL_SYMBOLS;

  const contextList = [];
  const omittedSymbols = [];
  let currentTokens = 0;
  let isTruncated = false;

  const fileCache = new Map();

  // 1. Process Seeds First (Priority 1)
  const includedSeeds = [];
  for (const seed of seeds) {
    if (contextList.length >= maxTotalSymbols) {
      omittedSymbols.push({
        symbol_id: seed.symbol_id,
        role: 'seed',
        reason: 'max_total_symbols_reached',
      });
      isTruncated = true;
      continue;
    }

    const srcObj = retrieveSymbolSource(seed, repoRecord, fileCache);
    const blockText = formatContextBlock(srcObj, true, seed);
    const blockTokens = estimateTokens(blockText);

    if (currentTokens + blockTokens > maxTokens && contextList.length > 0) {
      // Seed exceeds budget
      omittedSymbols.push({
        symbol_id: seed.symbol_id,
        role: 'seed',
        reason: 'token_budget_exceeded',
        token_estimate: blockTokens,
      });
      isTruncated = true;
      continue;
    }

    currentTokens += blockTokens;
    includedSeeds.push(seed);
    contextList.push({
      symbol_id: srcObj.symbol_id,
      name: srcObj.name,
      type: srcObj.type,
      file: srcObj.file,
      start_line: srcObj.start_line,
      end_line: srcObj.end_line,
      is_seed: true,
      hybrid_rank: seed.hybrid_rank,
      hybrid_score: seed.hybrid_score,
      source: srcObj.source,
      source_origin: srcObj.source_origin,
      token_estimate: blockTokens,
    });
  }

  // 2. Process Expanded Symbols (Priority 2, by relevance_score)
  const includedExpanded = [];
  for (const exp of expandedSymbols) {
    if (contextList.length >= maxTotalSymbols) {
      omittedSymbols.push({
        symbol_id: exp.symbol_id,
        role: 'expanded',
        reason: 'max_total_symbols_reached',
      });
      isTruncated = true;
      continue;
    }

    const srcObj = retrieveSymbolSource(exp, repoRecord, fileCache);
    const blockText = formatContextBlock(srcObj, false, exp);
    const blockTokens = estimateTokens(blockText);

    if (currentTokens + blockTokens > maxTokens) {
      omittedSymbols.push({
        symbol_id: exp.symbol_id,
        role: 'expanded',
        reason: 'token_budget_exceeded',
        token_estimate: blockTokens,
      });
      isTruncated = true;
      continue;
    }

    currentTokens += blockTokens;
    includedExpanded.push(exp);
    contextList.push({
      symbol_id: srcObj.symbol_id,
      name: srcObj.name,
      type: srcObj.type,
      file: srcObj.file,
      start_line: srcObj.start_line,
      end_line: srcObj.end_line,
      is_seed: false,
      distance: exp.distance,
      relevance_score: exp.relevance_score,
      discovered_from: exp.discovered_from,
      source: srcObj.source,
      source_origin: srcObj.source_origin,
      token_estimate: blockTokens,
    });
  }

  // 3. Filter relationships to only those connecting included symbols
  const includedIds = new Set(contextList.map((c) => c.symbol_id));
  const activeRelationships = relationships.filter(
    (rel) => includedIds.has(rel.source) && includedIds.has(rel.target)
  );

  return {
    query: queryText,
    repository_id: repoId,
    seeds: includedSeeds,
    expanded_symbols: includedExpanded,
    relationships: activeRelationships,
    context: contextList,
    statistics: {
      seed_count: includedSeeds.length,
      expanded_count: includedExpanded.length,
      total_symbols: contextList.length,
      omitted_count: omittedSymbols.length,
      context_token_estimate: currentTokens,
      budget_tokens: maxTokens,
      budget_utilization_pct: parseFloat(((currentTokens / maxTokens) * 100).toFixed(1)),
      truncated: isTruncated,
      omitted_symbols: omittedSymbols.length > 0 ? omittedSymbols : undefined,
    },
  };
}
