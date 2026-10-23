import dotenv from 'dotenv';
dotenv.config();

const intFromEnv = (name, fallback) => {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const floatFromEnv = (name, fallback) => {
  const parsed = parseFloat(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Phase 4.6: Centralized Groq / Q&A configuration.
 * The API key is read here only and must never be sent to the frontend or logged.
 */
export const LLM_CONFIG = {
  API_KEY: process.env.GROQ_API_KEY || '',
  MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  // Strict JSON-schema structured outputs are supported by openai/gpt-oss-* on Groq.
  // Set to "false" for models that only support JSON object mode.
  STRICT_SCHEMA: (process.env.GROQ_STRICT_SCHEMA || 'true').toLowerCase() !== 'false',
  TEMPERATURE: floatFromEnv('GROQ_TEMPERATURE', 0.1),
  // Reasoning tokens of gpt-oss count toward this limit, so keep headroom above the answer size.
  MAX_OUTPUT_TOKENS: intFromEnv('GROQ_MAX_OUTPUT_TOKENS', 4096),
  REASONING_EFFORT: process.env.GROQ_REASONING_EFFORT || 'medium',
  CONTEXT_WINDOW_TOKENS: intFromEnv('GROQ_CONTEXT_WINDOW', 131072),
  TIMEOUT_MS: intFromEnv('GROQ_TIMEOUT_MS', 45000),
  MAX_RETRIES: Math.min(intFromEnv('GROQ_MAX_RETRIES', 2), 5),
};

export const QA_CONFIG = {
  MIN_QUESTION_LENGTH: 3,
  MAX_QUESTION_LENGTH: 1000,
  SEED_LIMIT: intFromEnv('QA_SEED_LIMIT', 6),
  MAX_DEPTH: intFromEnv('QA_MAX_DEPTH', 1),
  MAX_EXPANDED_NODES: intFromEnv('QA_MAX_EXPANDED_NODES', 12),
  MAX_TOTAL_SYMBOLS: intFromEnv('QA_MAX_TOTAL_SYMBOLS', 18),
  MAX_CONTEXT_TOKENS: intFromEnv('QA_MAX_CONTEXT_TOKENS', 12000),
  // Fraction of the model context window held back as a safety margin for estimation error.
  PROMPT_SAFETY_MARGIN: 0.1,
  MAX_CONCURRENT_REQUESTS: intFromEnv('QA_MAX_CONCURRENT_REQUESTS', 2),
};
