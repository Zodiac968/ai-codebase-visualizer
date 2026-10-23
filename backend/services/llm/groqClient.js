import Groq from 'groq-sdk';
import { LLM_CONFIG } from '../../config/llm.js';

/**
 * Error raised for any failure of the generation step, classified so callers can
 * distinguish LLM failures from retrieval failures without leaking provider details.
 */
export class LlmError extends Error {
  /**
   * @param {string} code - not_configured | auth | rate_limited | timeout | model_unavailable | bad_request | upstream | malformed_response
   * @param {string} message - Safe, user-facing message
   */
  constructor(code, message) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
  }
}

let client = null;

function getClient() {
  if (!LLM_CONFIG.API_KEY) {
    throw new LlmError('not_configured', 'The Q&A service is not configured (missing GROQ_API_KEY on the server).');
  }
  if (!client) {
    // The SDK retries connection errors, timeouts, 408/409/429 and 5xx with exponential
    // backoff (honouring retry-after), bounded by maxRetries.
    client = new Groq({
      apiKey: LLM_CONFIG.API_KEY,
      timeout: LLM_CONFIG.TIMEOUT_MS,
      maxRetries: LLM_CONFIG.MAX_RETRIES,
    });
  }
  return client;
}

/**
 * Maps SDK errors to LlmError codes. Provider messages are not forwarded verbatim.
 */
function classifyError(err) {
  if (err instanceof LlmError) return err;

  if (err instanceof Groq.APIConnectionTimeoutError) {
    return new LlmError('timeout', 'The language model did not respond in time. Please try again.');
  }
  if (err instanceof Groq.APIConnectionError) {
    return new LlmError('upstream', 'Could not reach the language model service.');
  }
  if (err instanceof Groq.AuthenticationError || err instanceof Groq.PermissionDeniedError) {
    return new LlmError('auth', 'The language model service rejected the server credentials.');
  }
  if (err instanceof Groq.RateLimitError) {
    return new LlmError('rate_limited', 'The language model is rate limited right now. Please wait a moment and try again.');
  }
  if (err instanceof Groq.NotFoundError) {
    return new LlmError('model_unavailable', `The configured model "${LLM_CONFIG.MODEL}" is not available.`);
  }
  if (err instanceof Groq.BadRequestError || err instanceof Groq.UnprocessableEntityError) {
    const msg = String(err?.error?.error?.message || err?.message || '');
    if (/model/i.test(msg) && /(not exist|decommission|not found|not supported)/i.test(msg)) {
      return new LlmError('model_unavailable', `The configured model "${LLM_CONFIG.MODEL}" is not available.`);
    }
    if (/json|schema|response_format/i.test(msg)) {
      return new LlmError('malformed_response', 'The language model failed to produce a valid structured response.');
    }
    return new LlmError('bad_request', 'The language model rejected the request.');
  }
  if (err instanceof Groq.APIError && (err.status === 413 || /request too large|tokens per minute/i.test(String(err.message)))) {
    return new LlmError('rate_limited', 'The question context exceeds the language model token-per-minute limit for this account. Lower QA_MAX_CONTEXT_TOKENS or upgrade the Groq tier.');
  }
  if (err instanceof Groq.APIError) {
    return new LlmError('upstream', 'The language model service returned an error.');
  }
  return new LlmError('upstream', 'Unexpected failure while generating the answer.');
}

function isSchemaUnsupported(err) {
  if (!(err instanceof Groq.BadRequestError)) return false;
  const msg = String(err?.error?.error?.message || err?.message || '');
  return /response_format|json_schema/i.test(msg) && /support/i.test(msg);
}

/**
 * Single structured generation call. No tools, no streaming, no follow-up turns.
 *
 * @param {Object} params
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {string} params.schemaName
 * @param {Object} params.schema - JSON schema (strict-mode compatible)
 * @returns {Promise<{ data: Object, model: string, usage: Object|null, mode: string }>}
 */
export async function generateStructured({ messages, schemaName, schema }) {
  const groq = getClient();

  const baseRequest = {
    model: LLM_CONFIG.MODEL,
    messages,
    temperature: LLM_CONFIG.TEMPERATURE,
    max_completion_tokens: LLM_CONFIG.MAX_OUTPUT_TOKENS,
    stream: false,
  };
  if (/gpt-oss/i.test(LLM_CONFIG.MODEL)) {
    baseRequest.reasoning_effort = LLM_CONFIG.REASONING_EFFORT;
    baseRequest.include_reasoning = false;
  }

  const schemaFormat = {
    type: 'json_schema',
    json_schema: { name: schemaName, strict: true, schema },
  };

  let mode = LLM_CONFIG.STRICT_SCHEMA ? 'json_schema' : 'json_object';
  let completion;

  try {
    completion = await groq.chat.completions.create({
      ...baseRequest,
      response_format: mode === 'json_schema' ? schemaFormat : { type: 'json_object' },
    });
  } catch (err) {
    if (mode === 'json_schema' && isSchemaUnsupported(err)) {
      // Model without strict schema support: fall back once to JSON object mode.
      // The response is still validated deterministically by the caller.
      mode = 'json_object';
      try {
        completion = await groq.chat.completions.create({
          ...baseRequest,
          response_format: { type: 'json_object' },
        });
      } catch (fallbackErr) {
        throw classifyError(fallbackErr);
      }
    } else {
      throw classifyError(err);
    }
  }

  const choice = completion?.choices?.[0];
  const content = choice?.message?.content;
  if (!content || typeof content !== 'string') {
    const reason = choice?.finish_reason === 'length'
      ? 'The language model ran out of output tokens before finishing its answer.'
      : 'The language model returned an empty response.';
    throw new LlmError('malformed_response', reason);
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch {
    throw new LlmError('malformed_response', 'The language model returned a response that is not valid JSON.');
  }

  return {
    data,
    model: completion.model || LLM_CONFIG.MODEL,
    usage: completion.usage
      ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        }
      : null,
    mode,
  };
}
