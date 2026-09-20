import { isValidGithubUrl } from '../utils/validators.js';
import {
  analyzeRepository,
  getRepositoryGraph,
  getRepositoryFile,
  getRecentRepositories,
} from '../services/repoService.js';

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

export { addRepository, getGraph, getFile, getRecent };