import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { scanAndAnalyzeRepo } from '../utils/fileAnalyzer.js';
import { runAnalysisPipeline } from './analysis/pipeline.js';
import { normalizeGithubUrl } from '../utils/urlNormalizer.js';
import {
  findRepoById,
  upsertRepo,
  getRepoGraph,
  listRecentRepos,
} from './repoDbService.js';

const execPromise = promisify(exec);

/**
 * Analyzes a GitHub repository with URL normalization, deterministic disk caching,
 * and PostgreSQL persistence.
 * 
 * @param {string} repoUrl - GitHub URL
 * @param {boolean} forceRefresh - If true, re-clones and re-analyzes even if cached
 * @returns {Promise<Object>}
 */
export const analyzeRepository = async (repoUrl, forceRefresh = false) => {
  const norm = normalizeGithubUrl(repoUrl);
  if (!norm) {
    throw new Error('Invalid GitHub repository URL.');
  }

  const { id, fullName, owner, name, canonicalUrl } = norm;

  // 1. Check PostgreSQL Cache
  if (!forceRefresh) {
    try {
      const cachedRecord = await findRepoById(id);
      if (cachedRecord && cachedRecord.graph) {
        console.log(`[Cache Hit] Returning repository from PostgreSQL: ${id}`);
        return {
          repositoryId: id,
          url: cachedRecord.url || canonicalUrl,
          fullName: cachedRecord.full_name || fullName,
          localPath: cachedRecord.local_path,
          graph: cachedRecord.graph,
          validation: cachedRecord.validation,
          cached: true,
        };
      }
    } catch (dbErr) {
      console.warn('[PostgreSQL] Could not read cache, proceeding with fresh analysis:', dbErr.message);
    }
  }

  // 2. Deterministic Disk Storage: repositories/<owner__repo>/
  const targetDir = path.join(process.cwd(), 'repositories', id);
  const parentDir = path.dirname(targetDir);

  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // If re-analyzing and target directory exists, clean it up before re-cloning
  if (fs.existsSync(targetDir)) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch (rmErr) {
      console.warn(`[Warning] Could not fully remove existing directory ${targetDir}:`, rmErr.message);
    }
  }

  console.log(`[Git Clone] Cloning ${canonicalUrl} into ${targetDir}...`);
  await execPromise(`git -c core.longpaths=true clone --depth 1 "${canonicalUrl}" "${targetDir}"`);

  // 3. Scan & Analyze File Metadata
  const fileAnalysisData = scanAndAnalyzeRepo(targetDir);
  const analysisFilePath = path.join(targetDir, 'analysis.json');
  fs.writeFileSync(analysisFilePath, JSON.stringify(fileAnalysisData, null, 2));

  // 4. Execute Multi-stage AST and Graph Analysis Pipeline
  const { graph, validation } = await runAnalysisPipeline(targetDir);

  // Read intermediate artifacts for PostgreSQL storage
  const symbolsFilePath = path.join(targetDir, 'symbols.json');
  const relsFilePath = path.join(targetDir, 'relationships.json');

  let symbols = [];
  if (fs.existsSync(symbolsFilePath)) {
    try {
      symbols = JSON.parse(fs.readFileSync(symbolsFilePath, 'utf8'));
    } catch {
      symbols = [];
    }
  }

  let relationships = [];
  if (fs.existsSync(relsFilePath)) {
    try {
      relationships = JSON.parse(fs.readFileSync(relsFilePath, 'utf8'));
    } catch {
      relationships = [];
    }
  }

  // 5. Persist Everything to PostgreSQL
  try {
    await upsertRepo({
      id,
      fullName,
      owner,
      name,
      url: canonicalUrl,
      localPath: targetDir,
      fileAnalysis: fileAnalysisData,
      symbols,
      relationships,
      graph,
      validation,
      status: 'analyzed',
    });
    console.log(`[PostgreSQL] Successfully saved repository analysis for: ${id}`);
  } catch (dbSaveErr) {
    console.error('[PostgreSQL] Failed to persist repository to database:', dbSaveErr.message);
  }

  return {
    repositoryId: id,
    url: canonicalUrl,
    fullName,
    localPath: targetDir,
    graph,
    validation,
    cached: false,
  };
};

/**
 * Retrieves graph data from PostgreSQL with fallback to disk.
 */
export const getRepositoryGraph = async (repositoryId) => {
  // Try PostgreSQL first
  try {
    const record = await getRepoGraph(repositoryId);
    if (record && record.graph) {
      return record.graph;
    }
  } catch (err) {
    console.warn('[PostgreSQL] DB lookup failed, falling back to disk:', err.message);
  }

  // Fallback to disk
  const graphFilePath = path.join(process.cwd(), 'repositories', repositoryId, 'graph.json');
  if (fs.existsSync(graphFilePath)) {
    return JSON.parse(fs.readFileSync(graphFilePath, 'utf8'));
  }
  return null;
};

/**
 * Streams file content from disk safely with directory traversal protection.
 */
export const getRepositoryFile = (repositoryId, relativeFilePath) => {
  const repoBase = path.resolve(process.cwd(), 'repositories', repositoryId);
  if (!fs.existsSync(repoBase)) {
    return null;
  }

  // Sanitize relative path and prevent directory traversal
  const safePath = path.normalize(relativeFilePath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.resolve(repoBase, safePath);

  // Ensure target path is strictly within the repository base directory
  if (!fullPath.startsWith(repoBase)) {
    throw new Error('Access denied: Invalid file path.');
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return null;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  return {
    path: safePath.replace(/\\/g, '/'),
    content,
  };
};

/**
 * Lists recently analyzed repositories from PostgreSQL.
 */
export const getRecentRepositories = async (limit = 10) => {
  return listRecentRepos(limit);
};