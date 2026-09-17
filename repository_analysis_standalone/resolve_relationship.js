import fs from 'fs';
import path from 'path';

/**
 * Symbol Index for O(1) lookups during resolution
 */
class SymbolIndex {
  constructor(symbols) {
    this.byId = new Map();
    this.byFileAndName = new Map();
    this.byFileAndParent = new Map();
    this.byName = new Map();

    for (const sym of symbols) {
      this.byId.set(sym.id, sym);

      // Map by file and symbol name
      const fileNameKey = `${sym.file}:${sym.name}`;
      if (!this.byFileAndName.has(fileNameKey)) {
        this.byFileAndName.set(fileNameKey, []);
      }
      this.byFileAndName.get(fileNameKey).push(sym);

      // Map by parent scope (e.g. methods inside a class)
      if (sym.parent) {
        const parentKey = `${sym.file}:${sym.parent}`;
        if (!this.byFileAndParent.has(parentKey)) {
          this.byFileAndParent.set(parentKey, []);
        }
        this.byFileAndParent.get(parentKey).push(sym);
      }

      // Map globally by symbol name
      if (!this.byName.has(sym.name)) {
        this.byName.set(sym.name, []);
      }
      this.byName.get(sym.name).push(sym);
    }
  }

  getInFile(file, name) {
    return this.byFileAndName.get(`${file}:${name}`) || [];
  }

  getChildrenOf(file, parentName) {
    return this.byFileAndParent.get(`${file}:${parentName}`) || [];
  }

  getByName(name) {
    return this.byName.get(name) || [];
  }
}

/**
 * Parses source reference string (e.g., "src/Controller.ts:Controller.getUser")
 */
function parseSourceRef(sourceRef) {
  const lastColon = sourceRef.lastIndexOf(':');
  if (lastColon === -1) return { file: sourceRef, scope: '' };

  const file = sourceRef.slice(0, lastColon);
  const scope = sourceRef.slice(lastColon + 1);
  const parts = scope.split('.');
  
  const className = parts.length > 1 ? parts[0] : null;
  const functionName = parts.length > 1 ? parts[1] : parts[0];

  return { file, scope, className, functionName };
}

/**
 * Builds lookup tables for imports and inheritance hierarchies.
 */
function buildContextMaps(relationships) {
  const importsByFile = new Map();
  const inheritsByClass = new Map();

  for (const rel of relationships) {
    if (rel.type === 'IMPORTS') {
      if (!importsByFile.has(rel.source)) {
        importsByFile.set(rel.source, []);
      }
      importsByFile.get(rel.source).push(rel);
    } else if (rel.type === 'INHERITS') {
      if (!inheritsByClass.has(rel.source)) {
        inheritsByClass.set(rel.source, []);
      }
      inheritsByClass.get(rel.source).push(rel.target);
    }
  }

  return { importsByFile, inheritsByClass };
}

/**
 * Attemps confident and unique resolution for a single CALLS relationship target.
 */
function resolveCallTarget(callRel, index, importsByFile, inheritsByClass) {
  const { file, className } = parseSourceRef(callRel.source);
  const targetRaw = callRel.target;

  // Handle object.method() calls vs direct method() calls
  const targetParts = targetRaw.split('.');
  const isQualified = targetParts.length > 1;
  const callMemberName = isQualified ? targetParts[targetParts.length - 1] : targetRaw;
  const callQualifier = isQualified ? targetParts[0] : null;

  // Layer 1: Same File & Class Scope (Local methods / methods in enclosing class)
  if (className) {
    const classMethods = index.getChildrenOf(file, className);
    const match = classMethods.find(sym => sym.name === callMemberName);
    if (match) return match.id;

    // Inheritance resolution: check inherited base classes
    const baseClasses = inheritsByClass.get(`${file}:${className}`) || [];
    for (const base of baseClasses) {
      const baseMatches = index.getByName(base);
      for (const baseSym of baseMatches) {
        const baseMethods = index.getChildrenOf(baseSym.file, baseSym.name);
        const inheritedMatch = baseMethods.find(sym => sym.name === callMemberName);
        if (inheritedMatch) return inheritedMatch.id;
      }
    }
  }

  // Layer 2: Same File Scope (Module-level functions)
  if (!isQualified) {
    const fileMatches = index.getInFile(file, callMemberName);
    if (fileMatches.length === 1) {
      return fileMatches[0].id;
    }
  }

  // Layer 3: Import-based Resolution
  const fileImports = importsByFile.get(file) || [];
  for (const imp of fileImports) {
    // Case 3a: Symbol import (e.g. import { calculateScore } from './utils')
    if (imp.import_kind === 'symbol') {
      const impSymbolName = imp.target.split('.').pop();
      if (impSymbolName === callMemberName) {
        const targetModule = imp.target.substring(0, imp.target.lastIndexOf('.'));
        const candidates = index.getByName(callMemberName);
        const resolved = candidates.find(c => c.file.includes(targetModule) || targetModule.includes(c.file));
        if (resolved) return resolved.id;
      }
    }

    // Case 3b: Module import (e.g. import * as utils from './utils' -> utils.calculateScore())
    if (imp.import_kind === 'module' && isQualified && callQualifier) {
      if (imp.target.endsWith(callQualifier) || imp.target === callQualifier) {
        const candidates = index.getByName(callMemberName);
        if (candidates.length === 1) return candidates[0].id;
      }
    }
  }

  // Layer 4: Global Unique Match (Strict fallback: resolve ONLY if name is globally unique)
  const globalCandidates = index.getByName(callMemberName);
  if (globalCandidates.length === 1) {
    return globalCandidates[0].id;
  }

  // Ambiguous, external, or built-in: Return null (do not guess)
  return null;
}

/**
 * Main resolution workflow
 */
export function resolveRelationships(symbolsPath = './basic_structure.json', relsPath = './relationships.json') {
  if (!fs.existsSync(symbolsPath) || !fs.existsSync(relsPath)) {
    console.error(`Error: Missing ${symbolsPath} or ${relsPath}`);
    return;
  }

  const symbols = JSON.parse(fs.readFileSync(symbolsPath, 'utf8'));
  const relData = JSON.parse(fs.readFileSync(relsPath, 'utf8'));
  const relationships = relData.relationships || relData;

  const symbolIndex = new SymbolIndex(symbols);
  const { importsByFile, inheritsByClass } = buildContextMaps(relationships);

  let resolvedCount = 0;
  let totalCalls = 0;

  const updatedRelationships = relationships.map(rel => {
    if (rel.type !== 'CALLS') return rel;

    totalCalls++;
    const resolvedId = resolveCallTarget(rel, symbolIndex, importsByFile, inheritsByClass);

    if (resolvedId) {
      resolvedCount++;
      return {
        ...rel,
        target_symbol_id: resolvedId,
        resolved: true
      };
    }

    return {
      ...rel,
      resolved: false
    };
  });

  const outputData = { relationships: updatedRelationships };
  fs.writeFileSync(relsPath, JSON.stringify(outputData, null, 2));

  console.log(`Resolution completed: ${resolvedCount}/${totalCalls} CALLS resolved confidently.`);
}

resolveRelationships();