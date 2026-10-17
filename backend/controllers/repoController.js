import { isValidGithubUrl } from '../utils/validators.js';
import {
  analyzeRepository,
  getRepositoryGraph,
  getRepositoryFile,
  getRecentRepositories,
} from '../services/repoService.js';
import { generateEmbeddingDocuments } from '../services/analysis/embeddingGenerator.js';
import { saveEmbeddings } from '../services/embeddingDbService.js';
import { findRepoById } from '../services/repoDbService.js';
import { generateVectorEmbeddings } from '../services/vectorService.js';
import { hybridSearch } from '../services/search/hybridSearchService.js';
import { retrieveContext } from '../services/context/contextRetrievalService.js';

const addRepository = async (req, res) => {
  const { repoUrl, forceRefresh } = req.body;

  // Validate the repoUrl
  if (!isValidGithubUrl(repoUrl)) {
    return res.status(400).json({ success: false, error: 'Invalid repository URL' });
  }

  try {
    // Call the service to clone and analyze (or return from PostgreSQL cache)
    const result = await analyzeRepository(repoUrl, Boolean(forceRefresh));

    return res.status(200).json({
      success: true,
      message: result.cached
        ? 'Repository loaded from database cache.'
        : 'Repository successfully downloaded, analyzed, and persisted.',
      data: {
        repositoryId: result.repositoryId,
        url: result.url,
        fullName: result.fullName,
        graph: result.graph,
        validation: result.validation,
        cached: result.cached,
      },
    });
  } catch (error) {
    console.error('Repository analysis failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze repository.',
    });
  }
};

const getGraph = async (req, res) => {
  const { id } = req.params;

  try {
    const graph = await getRepositoryGraph(id);
    if (!graph) {
      return res.status(404).json({
        success: false,
        error: `Graph not found for repository ID: ${id}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        repositoryId: id,
        graph,
      },
    });
  } catch (error) {
    console.error('Failed to retrieve graph:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve graph.',
    });
  }
};

const getFile = async (req, res) => {
  const { id } = req.params;
  const { filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({
      success: false,
      error: 'filePath query parameter is required.',
    });
  }

  try {
    const fileData = getRepositoryFile(id, filePath);
    if (!fileData) {
      return res.status(404).json({
        success: false,
        error: `File not found: ${filePath}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: fileData,
    });
  } catch (error) {
    console.error('Failed to retrieve file content:', error);
    return res.status(403).json({
      success: false,
      error: error.message || 'Failed to retrieve file content.',
    });
  }
};

const getRecent = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const repos = await getRecentRepositories(limit);
    return res.status(200).json({
      success: true,
      data: repos,
    });
  } catch (error) {
    console.error('Failed to retrieve recent repositories:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent repositories.',
    });
  }
};

/**
 * Phase 4.1: Generate embedding documents from analyzed repository symbols.
 */
const generateEmbeddings = async (req, res) => {
  const { id } = req.params;

  try {
    const repoRecord = await findRepoById(id);
    if (!repoRecord) {
      return res.status(404).json({ success: false, error: `Repository "${id}" not found.` });
    }

    const symbols = repoRecord.symbols || [];
    const relationships = repoRecord.relationships || [];

    const docs = generateEmbeddingDocuments(symbols, relationships);
    const savedCount = await saveEmbeddings(id, docs);

    return res.status(200).json({
      success: true,
      data: {
        repositoryId: id,
        documentsGenerated: docs.length,
        documentsSaved: savedCount,
      },
    });
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate embedding documents.',
    });
  }
};

/**
 * Phase 4.2: Generate vector embeddings using local BAAI/bge-small-en-v1.5 model.
 */
const generateVectors = async (req, res) => {
  const { id } = req.params;
  const { force } = req.body || {};

  try {
    const result = await generateVectorEmbeddings(id, { force: Boolean(force) });
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Vector generation failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate vector embeddings.',
    });
  }
};

/**
 * Phase 4.3: Hybrid search combining lexical + semantic + RRF.
 */
const searchHybrid = async (req, res) => {
  const { id } = req.params;
  const { query: queryText, limit, k, lexicalLimit, semanticLimit } = req.body || {};

  try {
    const result = await hybridSearch(id, queryText, {
      limit,
      k,
      lexicalLimit,
      semanticLimit,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Hybrid search failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Hybrid search failed.',
    });
  }
};

/**
 * Phase 4.4: Context retrieval with graph expansion.
 */
const searchContext = async (req, res) => {
  const { id } = req.params;
  const {
    query: queryText,
    seedLimit,
    maxDepth,
    maxExpandedNodes,
    maxTotalSymbols,
    maxContextTokens,
  } = req.body || {};

  try {
    const result = await retrieveContext(id, queryText, {
      seedLimit,
      maxDepth,
      maxExpandedNodes,
      maxTotalSymbols,
      maxContextTokens,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Context retrieval failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Context retrieval failed.',
    });
  }
};

export {
  addRepository,
  getGraph,
  getFile,
  getRecent,
  generateEmbeddings,
  generateVectors,
  searchHybrid,
  searchContext,
};