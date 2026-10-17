import fs from 'fs';
import path from 'path';

/**
 * Normalizes a file path using forward slashes.
 */
const normPath = (p) => (typeof p === 'string' ? p.replace(/\\/g, '/') : p);

/**
 * Attempts to resolve the repository clone root path on disk.
 * Checks repoRecord.local_path, process.cwd()/repositories/:id, and process.cwd()/backend/repositories/:id.
 * 
 * @param {string} repoId
 * @param {Object} repoRecord
 * @returns {string|null}
 */
export function getRepoDiskPath(repoId, repoRecord) {
  if (repoRecord?.local_path && fs.existsSync(repoRecord.local_path)) {
    return repoRecord.local_path;
  }

  const candidate1 = path.resolve(process.cwd(), 'backend', 'repositories', repoId);
  if (fs.existsSync(candidate1)) return candidate1;

  const candidate2 = path.resolve(process.cwd(), 'repositories', repoId);
  if (fs.existsSync(candidate2)) return candidate2;

  return null;
}

/**
 * Retrieves the source code for a symbol using either pre-extracted AST source
 * or bounded line slicing from the repository clone on disk.
 * 
 * @param {Object} symbol - Symbol metadata { id, symbol_id, file, start_line, end_line, source, ... }
 * @param {Object} repoRecord - Full repository record from PostgreSQL
 * @param {Map<string, string>} [fileContentCache] - In-memory file cache to avoid re-reading files from disk
 * @returns {{ symbol_id: string, file: string, name: string, type: string, start_line: number|null, end_line: number|null, source: string, line_count: number, source_origin: string }}
 */
export function retrieveSymbolSource(symbol, repoRecord, fileContentCache = new Map()) {
  const symId = symbol.symbol_id || symbol.id;
  const filePath = normPath(symbol.file || symbol.path || (symId ? symId.split('::')[0] : ''));
  const name = symbol.name || (symId ? symId.split('::')[2] : 'unknown');
  const type = symbol.type || 'symbol';
  const startLine = symbol.start_line || null;
  const endLine = symbol.end_line || null;

  // 1. Check if symbol already has valid source code stored in metadata
  if (symbol.source && typeof symbol.source === 'string' && symbol.source.trim().length > 0) {
    const lines = symbol.source.split('\n');
    return {
      symbol_id: symId,
      file: filePath,
      name,
      type,
      start_line: startLine,
      end_line: endLine || (startLine ? startLine + lines.length - 1 : null),
      source: symbol.source.trim(),
      line_count: lines.length,
      source_origin: 'ast_metadata',
    };
  }

  // 2. Check if repoRecord.symbols contains this symbol with source
  if (Array.isArray(repoRecord?.symbols)) {
    const match = repoRecord.symbols.find((s) => s.id === symId);
    if (match?.source && match.source.trim().length > 0) {
      const lines = match.source.split('\n');
      return {
        symbol_id: symId,
        file: filePath,
        name,
        type,
        start_line: match.start_line || startLine,
        end_line: match.end_line || endLine,
        source: match.source.trim(),
        line_count: lines.length,
        source_origin: 'db_symbols',
      };
    }
  }

  // 3. Fallback: Read line slice from repository clone on disk
  const repoDiskPath = getRepoDiskPath(repoRecord?.id || '', repoRecord);
  if (repoDiskPath && filePath && startLine) {
    try {
      let fileText = fileContentCache.get(filePath);
      if (!fileText) {
        const fullFilePath = path.resolve(repoDiskPath, filePath);
        // Ensure path remains strictly within the repo root directory
        if (fullFilePath.startsWith(path.resolve(repoDiskPath)) && fs.existsSync(fullFilePath)) {
          fileText = fs.readFileSync(fullFilePath, 'utf8');
          fileContentCache.set(filePath, fileText);
        }
      }

      if (fileText) {
        const allLines = fileText.split('\n');
        const sLine = Math.max(1, startLine);
        const eLine = endLine && endLine >= sLine ? Math.min(allLines.length, endLine) : sLine;
        const sliced = allLines.slice(sLine - 1, eLine).join('\n');

        return {
          symbol_id: symId,
          file: filePath,
          name,
          type,
          start_line: sLine,
          end_line: eLine,
          source: sliced.trim(),
          line_count: eLine - sLine + 1,
          source_origin: 'disk_slice',
        };
      }
    } catch (err) {
      console.warn(`[SourceRetrieval] Failed to read disk slice for ${symId}:`, err.message);
    }
  }

  // 4. Fallback if source could not be resolved
  return {
    symbol_id: symId,
    file: filePath,
    name,
    type,
    start_line: startLine,
    end_line: endLine,
    source: `// Source code unavailable for ${symId}`,
    line_count: 1,
    source_origin: 'unavailable',
  };
}
