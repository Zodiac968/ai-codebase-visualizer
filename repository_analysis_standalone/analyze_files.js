import fs from 'fs';
import path from 'path';

// Inline limits replacing external configuration
const LIMITS = {
  MAX_FILE_COUNT: 10000,
  MAX_REPOSITORY_SIZE: 100 * 1024 * 1024, // 100 MB
  MAX_FILE_SIZE: 1 * 1024 * 1024,        // 1 MB
};

// Map common extensions to language names
const LANGUAGE_MAP = {
  '.js': 'javascript',
  '.jsx': 'javascript react',
  '.ts': 'typescript',
  '.tsx': 'typescript react',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.cpp': 'c++',
  '.c': 'c',
  '.cs': 'csharp',
  '.html': 'html',
  '.css': 'css',
  '.json': 'json',
  '.md': 'markdown',
};

const getSupportedExtensions = () => {
  const extEnv = process.env.SUPPORTED_EXTENSIONS || '.js,.ts,.jsx,.tsx,.py,.json';
  return new Set(extEnv.split(',').map((ext) => ext.trim().toLowerCase()));
};

const scanAndAnalyzeRepo = (dirPath) => {
  const supportedExts = getSupportedExtensions();
  const fileResults = [];
  const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'temp_data']);
  let totalRepoSize = 0;

  const walkDirectory = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      // 1. Enforce MAX_FILE_COUNT limit
      if (fileResults.length >= LIMITS.MAX_FILE_COUNT) {
        console.warn(`[Warning] Reached MAX_FILE_COUNT limit (${LIMITS.MAX_FILE_COUNT}). Stopping scan.`);
        return;
      }

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) {
          continue;
        }
        walkDirectory(fullPath);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        totalRepoSize += stats.size;

        // 2. Enforce MAX_REPOSITORY_SIZE limit
        if (totalRepoSize > LIMITS.MAX_REPOSITORY_SIZE) {
          throw new Error(`Repository total size exceeds limit of ${LIMITS.MAX_REPOSITORY_SIZE / (1024 * 1024)}MB.`);
        }

        const ext = path.extname(entry.name).toLowerCase();

        if (supportedExts.has(ext)) {
          let lineCount = 0;

          // 3. Enforce MAX_FILE_SIZE limit before reading contents into memory
          if (stats.size <= LIMITS.MAX_FILE_SIZE) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              lineCount = content.split('\n').length;
            } catch {
              lineCount = 0;
            }
          }

          const relativePath = path.relative(dirPath, fullPath).replace(/\\/g, '/');

          fileResults.push({
            path: relativePath,
            name: entry.name,
            extension: ext,
            language: LANGUAGE_MAP[ext] || 'unknown',
            size: stats.size,
            lineCount: lineCount,
            truncated: stats.size > LIMITS.MAX_FILE_SIZE, // Flag if line counting was skipped
          });
        }
      }
    }
  };

  walkDirectory(dirPath);
  return fileResults;
};

export { scanAndAnalyzeRepo };

// CLI execution wrapper
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const targetDir = process.argv[2] || '.';
  const resolvedTarget = path.resolve(process.cwd(), targetDir);

  if (!fs.existsSync(resolvedTarget)) {
    console.error(`Error: Target directory does not exist: ${resolvedTarget}`);
    process.exit(1);
  }

  console.log(`Scanning repository at: ${resolvedTarget}`);
  const results = scanAndAnalyzeRepo(resolvedTarget);

  const outputPath = path.join(resolvedTarget, 'analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log(`Analysis successfully written to: ${outputPath}`);
  console.log(`Total files scanned: ${results.length}`);
}