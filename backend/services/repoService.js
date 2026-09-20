import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { scanAndAnalyzeRepo } from '../utils/fileAnalyzer.js';
import { runAnalysisPipeline } from './analysis/pipeline.js';

const execPromise = promisify(exec);

export const analyzeRepository = async (repoUrl) => {
    const repositoryId = crypto.randomUUID();
    const targetDir = path.join(process.cwd(), 'repositories', repositoryId);

    const parentDir = path.dirname(targetDir);
    if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }
    await execPromise(`git -c core.longpaths=true clone --depth 1 "${repoUrl}" "${targetDir}"`);
    const fileAnalysisData = scanAndAnalyzeRepo(targetDir);
    const analysisFilePath = path.join(targetDir, 'analysis.json');
    fs.writeFileSync(analysisFilePath, JSON.stringify(fileAnalysisData, null, 2));

    // Execute multi-stage AST and graph analysis pipeline
    const { graph, validation } = await runAnalysisPipeline(targetDir);

    return {
        repositoryId,
        url: repoUrl,
        localPath: targetDir,
        graph,
        validation,
    };
};

export const getRepositoryGraph = (repositoryId) => {
    const graphFilePath = path.join(process.cwd(), 'repositories', repositoryId, 'graph.json');
    if (!fs.existsSync(graphFilePath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(graphFilePath, 'utf8'));
};

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