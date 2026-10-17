import { pipeline } from '@huggingface/transformers';

/**
 * Default embedding model configuration.
 */
export const DEFAULT_MODEL_ID = process.env.EMBEDDING_MODEL || 'BAAI/bge-small-en-v1.5';
export const EXPECTED_VECTOR_DIMENSIONS = 384;
export const DEFAULT_BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE || '32', 10);

/**
 * Singleton model pipeline cache.
 */
let featureExtractorPromise = null;
let activeModelId = null;

/**
 * Loads and returns the Hugging Face feature-extraction pipeline singleton.
 * 
 * @param {string} [modelId=DEFAULT_MODEL_ID] - Hugging Face model identifier
 * @returns {Promise<Function>} Pipeline function
 */
export async function getModelPipeline(modelId = DEFAULT_MODEL_ID) {
  if (featureExtractorPromise && activeModelId === modelId) {
    return featureExtractorPromise;
  }

  activeModelId = modelId;
  featureExtractorPromise = (async () => {
    console.log(`[EmbeddingModel] Initializing local model: ${modelId}...`);
    const startTime = Date.now();

    try {
      const extractor = await pipeline('feature-extraction', modelId, {
        dtype: 'fp32',
      });
      console.log(`[EmbeddingModel] Model ${modelId} loaded in ${Date.now() - startTime}ms.`);
      return extractor;
    } catch (err) {
      // Clear cache on failure so future attempts can retry
      featureExtractorPromise = null;
      activeModelId = null;
      console.error(`[EmbeddingModel] Failed to load model ${modelId}:`, err);
      throw new Error(`Failed to load embedding model ${modelId}: ${err.message}`);
    }
  })();

  return featureExtractorPromise;
}

/**
 * Validates that a generated vector is exactly 384 finite numbers.
 * 
 * @param {Array<number>} vector
 * @param {number} expectedDims
 */
function validateVector(vector, expectedDims = EXPECTED_VECTOR_DIMENSIONS) {
  if (!Array.isArray(vector)) {
    throw new Error(`Expected array vector, got ${typeof vector}`);
  }
  if (vector.length !== expectedDims) {
    throw new Error(`Invalid vector dimensions: expected ${expectedDims}, got ${vector.length}`);
  }
  for (let i = 0; i < vector.length; i++) {
    if (!Number.isFinite(vector[i])) {
      throw new Error(`Vector contains non-finite value at index ${i}: ${vector[i]}`);
    }
  }
}

/**
 * Embeds a batch of texts using the local model with mean pooling and L2 normalization.
 * Yields cooperatively to the event loop between chunks.
 * 
 * @param {Array<string>} texts - Array of document text contents
 * @param {Object} [options]
 * @param {number} [options.batchSize=DEFAULT_BATCH_SIZE] - Batch size for inference
 * @param {string} [options.modelId=DEFAULT_MODEL_ID] - Model identifier
 * @param {Function} [options.onProgress] - Optional progress callback ({ processed, total })
 * @returns {Promise<Array<Array<number>>>} Array of 384-dimensional normalized vectors
 */
export async function embedDocuments(texts, options = {}) {
  if (!texts || texts.length === 0) {
    return [];
  }

  const modelId = options.modelId || DEFAULT_MODEL_ID;
  const batchSize = Math.max(1, options.batchSize || DEFAULT_BATCH_SIZE);
  const extractor = await getModelPipeline(modelId);

  const vectors = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);

    // Run inference for current chunk
    const output = await extractor(chunk, {
      pooling: 'mean',
      normalize: true,
    });

    const chunkVectors = output.tolist();

    for (let j = 0; j < chunkVectors.length; j++) {
      const vec = chunkVectors[j];
      validateVector(vec, EXPECTED_VECTOR_DIMENSIONS);
      vectors.push(vec);
    }

    if (typeof options.onProgress === 'function') {
      options.onProgress({
        processed: Math.min(i + batchSize, texts.length),
        total: texts.length,
      });
    }

    // Yield to Node.js event loop to avoid starving incoming HTTP requests
    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  return vectors;
}

/**
 * Generates an embedding for a search query.
 * 
 * @param {string} queryText - Query string
 * @param {Object} [options]
 * @param {string} [options.modelId=DEFAULT_MODEL_ID]
 * @returns {Promise<Array<number>>} 384-dimensional normalized vector
 */
export async function embedQuery(queryText, options = {}) {
  if (!queryText || typeof queryText !== 'string' || !queryText.trim()) {
    throw new Error('Query text must be a non-empty string');
  }

  const modelId = options.modelId || DEFAULT_MODEL_ID;
  const extractor = await getModelPipeline(modelId);

  // BGE models can optionally use an instruction prefix for retrieval queries
  const formattedQuery = `Represent this sentence for searching relevant passages: ${queryText.trim()}`;

  const output = await extractor([formattedQuery], {
    pooling: 'mean',
    normalize: true,
  });

  const raw = output.tolist()[0];
  validateVector(raw, EXPECTED_VECTOR_DIMENSIONS);
  return raw;
}
