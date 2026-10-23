import { findRepoById } from '../repoDbService.js';
import { getEmbeddingCount } from '../embeddingDbService.js';
import { getVectorStats } from '../vectorService.js';
import { retrieveContext } from '../context/contextRetrievalService.js';
import { generateStructured, LlmError } from '../llm/groqClient.js';
import { buildQaPrompt, QA_RESPONSE_SCHEMA, QA_RESPONSE_SCHEMA_NAME } from './qaPromptBuilder.js';
import { buildCitationAllowlist, validateQaResponse } from './citationValidator.js';
import { LLM_CONFIG, QA_CONFIG } from '../../config/llm.js';

/**
 * Error raised for request validation and retrieval-stage failures.
 */
export class QaError extends Error {
  /**
   * @param {string} code - invalid_question | repo_not_found | index_missing | retrieval_failed | prompt_failed
   * @param {number} status - HTTP status
   * @param {string} message - Safe, user-facing message
   */
  constructor(code, status, message) {
    super(message);
    this.name = 'QaError';
    this.code = code;
    this.status = status;
    this.stage = code === 'retrieval_failed' || code === 'index_missing' ? 'retrieval' : 'request';
  }
}

/**
 * Validates and normalizes the user question.
 *
 * @param {unknown} question
 * @returns {string}
 */
export function validateQuestion(question) {
  if (typeof question !== 'string') {
    throw new QaError('invalid_question', 400, 'Question must be a string.');
  }
  const clean = question.replace(/\s+/g, ' ').trim();
  if (clean.length < QA_CONFIG.MIN_QUESTION_LENGTH) {
    throw new QaError('invalid_question', 400, `Question must be at least ${QA_CONFIG.MIN_QUESTION_LENGTH} characters.`);
  }
  if (clean.length > QA_CONFIG.MAX_QUESTION_LENGTH) {
    throw new QaError('invalid_question', 400, `Question must be at most ${QA_CONFIG.MAX_QUESTION_LENGTH} characters.`);
  }
  return clean;
}

function selectRelationships(relationships, symbolIds) {
  const ids = new Set(symbolIds);
  return (relationships || [])
    .filter((r) => ids.has(r.source) && ids.has(r.target))
    .map((r) => ({ source: r.source, target: r.target, type: r.type, direction: r.direction }));
}

/**
 * Phase 4.6: Retrieval-augmented codebase Q&A.
 * Deterministic retrieval (Phase 4.3/4.4) followed by exactly one LLM generation call,
 * then deterministic citation validation.
 *
 * @param {string} repoId
 * @param {string} rawQuestion
 * @param {Object} [deps] - Injectable dependencies for testing
 * @returns {Promise<Object>} Structured, validated answer
 */
export async function answerRepositoryQuestion(repoId, rawQuestion, deps = {}) {
  const generate = deps.generateStructured || generateStructured;
  const totalStart = Date.now();
  const question = validateQuestion(rawQuestion);

  // 1. Repository and retrieval index checks
  const repoRecord = await findRepoById(repoId);
  if (!repoRecord) {
    throw new QaError('repo_not_found', 404, `Repository "${repoId}" not found. Please analyze it first.`);
  }

  const [docCount, vectorStats] = await Promise.all([getEmbeddingCount(repoId), getVectorStats(repoId)]);
  if (docCount === 0) {
    throw new QaError(
      'index_missing',
      409,
      'This repository has no search index yet. Generate embedding documents (and vectors) before asking questions.'
    );
  }
  const semanticAvailable = vectorStats.vectorized > 0;

  // 2. Deterministic retrieval: hybrid search -> graph expansion -> source -> budget
  let contextPackage;
  try {
    contextPackage = await retrieveContext(repoId, question, {
      seedLimit: QA_CONFIG.SEED_LIMIT,
      maxDepth: QA_CONFIG.MAX_DEPTH,
      maxExpandedNodes: QA_CONFIG.MAX_EXPANDED_NODES,
      maxTotalSymbols: QA_CONFIG.MAX_TOTAL_SYMBOLS,
      maxContextTokens: QA_CONFIG.MAX_CONTEXT_TOKENS,
    });
  } catch (err) {
    console.error(`[QA] Retrieval failed for ${repoId}:`, err.message);
    throw new QaError('retrieval_failed', 500, 'Code retrieval failed for this question.');
  }

  const stats = contextPackage.statistics || {};
  const retrievalTimings = stats.timings_ms || { hybrid_retrieval: 0, expansion_and_context: 0 };
  const retrieval = {
    seed_count: stats.seed_count || 0,
    expanded_count: stats.expanded_count || 0,
    total_symbols: stats.total_symbols || 0,
    context_token_estimate: stats.context_token_estimate || 0,
    truncated: Boolean(stats.truncated),
    semantic_available: semanticAvailable,
  };

  const baseResponse = {
    question,
    repository_id: repoId,
    model: null,
    retrieval,
  };

  // 3. Nothing retrieved: answer deterministically without calling the LLM
  if (!contextPackage.context || contextPackage.context.length === 0) {
    return {
      ...baseResponse,
      answer: 'No code in this repository matched the question, so it cannot be answered from the repository source. Try rephrasing with feature names, identifiers, or file names.',
      citations: [],
      line_citations: {},
      related_symbol_ids: [],
      relationships: [],
      insufficient_context: true,
      limitations: 'Retrieval returned no matching symbols.',
      invalid_citations: [],
      warnings: [],
      timings_ms: {
        ...retrievalTimings,
        prompt_construction: 0,
        llm_inference: 0,
        validation: 0,
        total: Date.now() - totalStart,
      },
    };
  }

  // 4. Prompt construction with context window guard
  const promptStart = Date.now();
  let prompt;
  try {
    prompt = buildQaPrompt({
      repository: { id: repoId, fullName: repoRecord.full_name },
      question,
      contextPackage,
      limits: {
        contextWindowTokens: LLM_CONFIG.CONTEXT_WINDOW_TOKENS,
        maxOutputTokens: LLM_CONFIG.MAX_OUTPUT_TOKENS,
        safetyMargin: QA_CONFIG.PROMPT_SAFETY_MARGIN,
      },
    });
  } catch (err) {
    console.error(`[QA] Prompt construction failed for ${repoId}:`, err.message);
    throw new QaError('prompt_failed', 500, 'Could not build a prompt within the model context limits.');
  }
  const promptMs = Date.now() - promptStart;

  // 5. Single LLM generation step
  const llmStart = Date.now();
  const generation = await generate({
    messages: prompt.messages,
    schemaName: QA_RESPONSE_SCHEMA_NAME,
    schema: QA_RESPONSE_SCHEMA,
  });
  const llmMs = Date.now() - llmStart;

  // 6. Deterministic citation validation
  const validationStart = Date.now();
  const allowlist = buildCitationAllowlist(prompt.citations);
  const validated = validateQaResponse(generation.data, allowlist);
  if (!validated.ok) {
    throw new LlmError('malformed_response', `The language model response was malformed: ${validated.reason}`);
  }
  const result = validated.result;

  const highlightIds = [
    ...new Set([...result.citations.map((c) => c.symbol_id), ...result.related_symbol_ids]),
  ];
  const validationMs = Date.now() - validationStart;

  if (prompt.droppedForWindow.length > 0) {
    retrieval.dropped_for_context_window = prompt.droppedForWindow.length;
  }

  const timings = {
    ...retrievalTimings,
    prompt_construction: promptMs,
    llm_inference: llmMs,
    validation: validationMs,
    total: Date.now() - totalStart,
  };

  console.log(
    `[QA] repo=${repoId} model=${generation.model} symbols=${retrieval.total_symbols} ` +
      `citations=${result.citations.length} invalid=${result.invalid_citations.length} ` +
      `prompt_tokens~${prompt.promptTokenEstimate} usage=${generation.usage ? generation.usage.total_tokens : 'n/a'} ` +
      `timings=${JSON.stringify(timings)}`
  );

  return {
    ...baseResponse,
    model: generation.model,
    ...result,
    relationships: selectRelationships(contextPackage.relationships, highlightIds),
    retrieval,
    usage: generation.usage,
    timings_ms: timings,
  };
}
