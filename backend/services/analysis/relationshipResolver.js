import fs from 'fs';
import path from 'path';

/**
 * Normalizes backslashes to forward slashes for cross-platform consistency.
 */
const normPath = (p) => (typeof p === 'string' ? p.replace(/\\/g, '/') : p);

/**
 * Symbol Index for O(1) lookups during resolution
 */
class SymbolIndex {
  constructor(symbols) {
    this.byId = new Map();
    this.byFileAndName = new Map();
    this.byFileAndParent = new Map();
    this.byName = new Map();
    this.fileSet = new Set();
    this.byFile = new Map();

    for (const sym of symbols) {
      const filePath = normPath(sym.file || '');
      const normalizedSym = { ...sym, file: filePath };

      if (normalizedSym.id) {
        this.byId.set(normalizedSym.id, normalizedSym);
      }

      if (filePath) {
        this.fileSet.add(filePath);
        if (!this.byFile.has(filePath)) {
          this.byFile.set(filePath, []);
        }
        this.byFile.get(filePath).push(normalizedSym);

        // Map by file and symbol name
        if (normalizedSym.name) {
          const fileNameKey = `${filePath}:${normalizedSym.name}`;
          if (!this.byFileAndName.has(fileNameKey)) {
            this.byFileAndName.set(fileNameKey, []);
          }
          this.byFileAndName.get(fileNameKey).push(normalizedSym);
        }

        // Map by parent scope or parent ID
        if (normalizedSym.parent) {
          const parentKey = `${filePath}:${normalizedSym.parent}`;
          if (!this.byFileAndParent.has(parentKey)) {
            this.byFileAndParent.set(parentKey, []);
          }
          this.byFileAndParent.get(parentKey).push(normalizedSym);
        }
      }

      // Map globally by symbol name
      if (normalizedSym.name) {
        if (!this.byName.has(normalizedSym.name)) {
          this.byName.set(normalizedSym.name, []);
        }
        this.byName.get(normalizedSym.name).push(normalizedSym);
      }
    }
  }

  getById(id) {
    return this.byId.get(id);
  }

  getInFile(file, name) {
    return this.byFileAndName.get(`${normPath(file)}:${name}`) || [];
  }

  getChildrenOf(file, parentNameOrId) {
    return this.byFileAndParent.get(`${normPath(file)}:${parentNameOrId}`) || [];
  }

  getByName(name) {
    return this.byName.get(name) || [];
  }

  getSymbolsInFile(file) {
    return this.byFile.get(normPath(file)) || [];
  }
}

/**
 * Robustly parses source reference strings and symbol IDs.
 * Handles both "src/Controller.ts:Controller.getUser" and "src/Controller.ts::method::Controller->getUser::L15"
 */
function parseSourceRef(sourceRef) {
  if (!sourceRef) return { file: '', scope: '', className: null, functionName: null };

  const normRef = normPath(sourceRef);

  // Symbol ID format: file::type::name::Lline or file::type::parent->name::Lline
  if (normRef.includes('::')) {
    const parts = normRef.split('::');
    const file = parts[0];
    const namePart = parts[2] || '';
    
    if (namePart.includes('->')) {
      const [className, functionName] = namePart.split('->');
      return { file, scope: namePart, className, functionName };
    }
    
    return { file, scope: namePart, className: null, functionName: namePart };
  }

  // Source ref format: file:ClassName.functionName
  const lastColon = normRef.lastIndexOf(':');
  if (lastColon === -1) return { file: normRef, scope: '', className: null, functionName: null };

  const file = normRef.slice(0, lastColon);
  const scope = normRef.slice(lastColon + 1);
  const parts = scope.split('.');

  const className = parts.length > 1 ? parts[0] : null;
  const functionName = parts.length > 1 ? parts[1] : parts[0];

  return { file, scope, className, functionName };
}

/**
 * Resolves relative module import paths (e.g., "./models/PrintedBook") to actual files in the symbol index.
 */
function resolveModuleFile(sourceFile, targetModule, symbolIndex) {
  if (!sourceFile || !targetModule) return null;

  const cleanModule = targetModule.replace(/['"]/g, '').trim();
  const sourceDir = path.dirname(sourceFile);
  const resolvedPath = normPath(path.normalize(path.join(sourceDir, cleanModule)));

  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.py', '/index.ts', '/index.js', '/__init__.py'];
  
  for (const ext of extensions) {
    const candidate = `${resolvedPath}${ext}`;
    if (symbolIndex.fileSet.has(candidate)) {
      return candidate;
    }
  }

  // Fallback: search by filename match across index
  const baseName = path.basename(cleanModule);
  for (const file of symbolIndex.fileSet) {
    const fileBase = path.basename(file, path.extname(file));
    if (fileBase === baseName) {
      return file;
    }
  }

  return null;
}

/**
 * Builds lookup maps for imports and inheritance hierarchies.
 */
function buildContextMaps(relationships) {
  const importsByFile = new Map();
  const inheritsByClass = new Map();

  for (const rel of relationships) {
    const { file } = parseSourceRef(rel.source);

    if (rel.type === 'IMPORTS') {
      if (!importsByFile.has(file)) {
        importsByFile.set(file, []);
      }
      importsByFile.get(file).push(rel);
    } else if (rel.type === 'INHERITS') {
      const classKey = `${file}:${rel.source}`;
      if (!inheritsByClass.has(classKey)) {
        inheritsByClass.set(classKey, []);
      }
      inheritsByClass.get(classKey).push(rel.target);
    }
  }

  return { importsByFile, inheritsByClass };
}

/**
 * 1. Resolves IMPORTS relationships
 */
function resolveImportTarget(rel, index) {
  const { file: sourceFile } = parseSourceRef(rel.source);
  const targetRaw = rel.target;

  if (!targetRaw) return null;

  // Split module path and symbol name if formatted as "module.Symbol"
  let modulePath = targetRaw;
  let symbolName = null;

  if (targetRaw.includes('.') && !targetRaw.startsWith('.')) {
    const parts = targetRaw.split('.');
    symbolName = parts.pop();
    modulePath = parts.join('.');
  } else if (rel.import_kind === 'symbol') {
    const parts = targetRaw.split('/');
    const lastPart = parts[parts.length - 1];
    if (lastPart.includes('.')) {
      const subParts = lastPart.split('.');
      symbolName = subParts.pop();
      parts[parts.length - 1] = subParts.join('.');
      modulePath = parts.join('/');
    } else {
      symbolName = lastPart;
    }
  }

  // Find target module file
  const targetFile = resolveModuleFile(sourceFile, modulePath, index) || resolveModuleFile(sourceFile, targetRaw, index);

  if (targetFile) {
    // If importing a specific symbol, find declaration in target file
    if (symbolName) {
      const fileSymbols = index.getSymbolsInFile(targetFile);
      const matchedSym = fileSymbols.find(s => s.name === symbolName && s.type !== 'import');
      if (matchedSym) return matchedSym.id;
    }

    // Direct match for file or primary exported class/declaration in target file
    const fileSymbols = index.getSymbolsInFile(targetFile);
    const mainDecl = fileSymbols.find(s => s.type !== 'import' && (s.name === path.basename(targetFile, path.extname(targetFile))));
    if (mainDecl) return mainDecl.id;

    return targetFile; // Fallback to resolved target file path
  }

  // Global unique symbol candidate fallback
  if (symbolName || targetRaw) {
    const nameToLook = symbolName || targetRaw;
    const candidates = index.getByName(nameToLook).filter(s => s.type !== 'import');
    if (candidates.length === 1) {
      return candidates[0].id;
    }
  }

  return null;
}

/**
 * 2. Resolves INHERITS and IMPLEMENTS relationships
 */
function resolveInheritsOrImplementsTarget(rel, index, importsByFile) {
  const { file: sourceFile } = parseSourceRef(rel.source);
  const targetName = rel.target;

  if (!targetName) return null;

  // Layer 1: Local file match
  const localMatches = index.getInFile(sourceFile, targetName).filter(s => s.type !== 'import');
  if (localMatches.length === 1) {
    return localMatches[0].id;
  }

  // Layer 2: Import-based resolution
  const fileImports = importsByFile.get(sourceFile) || [];
  for (const imp of fileImports) {
    const impTarget = imp.target || '';
    if (impTarget.endsWith(targetName) || impTarget.endsWith(`.${targetName}`)) {
      const resolvedImportId = resolveImportTarget(imp, index);
      if (resolvedImportId) return resolvedImportId;
    }
  }

  // Layer 3: Global unique match
  const globalCandidates = index.getByName(targetName).filter(s => s.type !== 'import');
  if (globalCandidates.length === 1) {
    return globalCandidates[0].id;
  }

  return null;
}

/**
 * 3. Resolves CALLS relationships
 */
function resolveCallTarget(callRel, index, importsByFile, inheritsByClass) {
  const { file, className } = parseSourceRef(callRel.source);
  const targetRaw = callRel.target;

  if (!targetRaw) return null;

  const targetParts = targetRaw.split('.');
  const isQualified = targetParts.length > 1;
  const callMemberName = isQualified ? targetParts[targetParts.length - 1] : targetRaw;
  const callQualifier = isQualified ? targetParts[0] : null;

  // Layer 1: Enclosing class & inherited base class methods
  if (className) {
    const classMethods = index.getChildrenOf(file, className);
    const match = classMethods.find(sym => sym.name === callMemberName);
    if (match) return match.id;

    const baseClasses = inheritsByClass.get(`${file}:${className}`) || [];
    for (const base of baseClasses) {
      const baseMatches = index.getByName(base);
      for (const baseSym of baseMatches) {
        const baseMethods = index.getChildrenOf(baseSym.file, baseSym.name || baseSym.id);
        const inheritedMatch = baseMethods.find(sym => sym.name === callMemberName);
        if (inheritedMatch) return inheritedMatch.id;
      }
    }
  }

  // Layer 2: Same file declarations
  if (!isQualified) {
    const fileMatches = index.getInFile(file, callMemberName).filter(s => s.type !== 'import');
    if (fileMatches.length === 1) {
      return fileMatches[0].id;
    }
  }

  // Layer 3: Import-based Resolution
  const fileImports = importsByFile.get(file) || [];
  for (const imp of fileImports) {
    if (imp.import_kind === 'symbol' || imp.target.endsWith(callMemberName)) {
      const impSymbolName = imp.target.split('.').pop();
      if (impSymbolName === callMemberName) {
        const candidates = index.getByName(callMemberName).filter(s => s.type !== 'import');
        if (candidates.length === 1) return candidates[0].id;

        const resolvedId = resolveImportTarget(imp, index);
        if (resolvedId) return resolvedId;
      }
    }

    if (imp.import_kind === 'module' && isQualified && callQualifier) {
      if (imp.target.endsWith(callQualifier) || imp.target === callQualifier) {
        const candidates = index.getByName(callMemberName).filter(s => s.type !== 'import');
        if (candidates.length === 1) return candidates[0].id;
      }
    }
  }

  // Layer 4: Global Unique Match
  const globalCandidates = index.getByName(callMemberName).filter(s => s.type !== 'import');
  if (globalCandidates.length === 1) {
    return globalCandidates[0].id;
  }

  return null;
}

/**
 * Main resolution workflow
 */
export function resolveRelationships(symbolsPath = './symbols.json', relsPath = './relationships.json') {
  if (!fs.existsSync(symbolsPath) || !fs.existsSync(relsPath)) {
    console.error(`Error: Missing ${symbolsPath} or ${relsPath}`);
    return null;
  }

  const symbols = JSON.parse(fs.readFileSync(symbolsPath, 'utf8'));
  const relData = JSON.parse(fs.readFileSync(relsPath, 'utf8'));
  const relationships = relData.relationships || relData;

  const symbolIndex = new SymbolIndex(symbols);
  const { importsByFile, inheritsByClass } = buildContextMaps(relationships);

  const stats = {
    IMPORTS: { resolved: 0, total: 0 },
    INHERITS: { resolved: 0, total: 0 },
    IMPLEMENTS: { resolved: 0, total: 0 },
    CALLS: { resolved: 0, total: 0 },
    OTHER: { resolved: 0, total: 0 },
  };

  const updatedRelationships = relationships.map(rel => {
    // Skip if already resolved
    if (rel.resolved && rel.target_symbol_id) {
      const typeKey = stats[rel.type] ? rel.type : 'OTHER';
      stats[typeKey].total++;
      stats[typeKey].resolved++;
      return rel;
    }

    const typeKey = stats[rel.type] ? rel.type : 'OTHER';
    stats[typeKey].total++;

    let resolvedId = null;

    switch (rel.type) {
      case 'IMPORTS':
        resolvedId = resolveImportTarget(rel, symbolIndex);
        break;

      case 'INHERITS':
      case 'IMPLEMENTS':
        resolvedId = resolveInheritsOrImplementsTarget(rel, symbolIndex, importsByFile);
        break;

      case 'CALLS':
        resolvedId = resolveCallTarget(rel, symbolIndex, importsByFile, inheritsByClass);
        break;

      default:
        resolvedId = resolveInheritsOrImplementsTarget(rel, symbolIndex, importsByFile);
        break;
    }

    if (resolvedId) {
      stats[typeKey].resolved++;
      return {
        ...rel,
        target_symbol_id: resolvedId,
        resolved: true,
      };
    }

    return {
      ...rel,
      resolved: false,
    };
  });

  const outputData = { relationships: updatedRelationships };
  fs.writeFileSync(relsPath, JSON.stringify(outputData, null, 2));

  console.log('--- Resolution Summary ---');
  for (const [type, data] of Object.entries(stats)) {
    if (data.total > 0) {
      console.log(`${type}: ${data.resolved}/${data.total} resolved`);
    }
  }

  return outputData;
}
