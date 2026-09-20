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