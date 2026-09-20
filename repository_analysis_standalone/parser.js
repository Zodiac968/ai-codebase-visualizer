import fs from 'fs';
import path from 'path';
import Parser from 'tree-sitter';

import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import treeSitterTypescript from 'tree-sitter-typescript';

const TypeScript = treeSitterTypescript.typescript;
const TSX = treeSitterTypescript.tsx;

const GRAMMAR_MAP = {
  '.js': { grammar: JavaScript, lang: 'javascript' },
  '.jsx': { grammar: JavaScript, lang: 'javascript' },
  '.ts': { grammar: TypeScript, lang: 'typescript' },
  '.tsx': { grammar: TSX, lang: 'typescript' },
  '.py': { grammar: Python, lang: 'python' },
};

/**
 * Extracts node name across all languages and node types.
 */
function getNodeName(node, sourceCode) {
  const nameNode = node.childForFieldName('name');
  if (nameNode) {
    return sourceCode.slice(nameNode.startIndex, nameNode.endIndex);
  }

  const idNode = node.children.find(c =>
    ['identifier', 'property_identifier', 'type_identifier', 'property_name'].includes(c.type)
  );

  return idNode ? sourceCode.slice(idNode.startIndex, idNode.endIndex) : null;
}

/**
 * Generates a clean, deterministic unique ID for a symbol without duplicating file paths.
 */
export function generateSymbolId(file, type, name, startLine, parentId = null) {
  const normFile = file.replace(/\\/g, '/');
  const safeName = name || 'anonymous';

  if (parentId) {
    const filePrefix = `${normFile}::`;
    const cleanParent = parentId.startsWith(filePrefix)
      ? parentId.slice(filePrefix.length)
      : parentId;

    return `${normFile}::${cleanParent}->${type}::${safeName}::L${startLine}`;
  }

  return `${normFile}::${type}::${safeName}::L${startLine}`;
}

/**
 * Helper to extract imported symbol names/specifiers from import AST nodes.
 */
function getImportedSpecifiers(node, sourceCode) {
  const specifiers = [];

  if (node.type === 'import_from_statement') {
    const importKwIndex = node.children.findIndex(
      c => c.type === 'import' || sourceCode.slice(c.startIndex, c.endIndex) === 'import'
    );

    if (importKwIndex !== -1) {
      const nameNodes = node.children
        .slice(importKwIndex + 1)
        .flatMap(c => (c.type === 'import_list' ? c.children : [c]))
        .filter(c => ['identifier', 'dotted_name', 'aliased_import', 'wildcard_import'].includes(c.type));

      for (const n of nameNodes) {
        let symbolName = sourceCode.slice(n.startIndex, n.endIndex).trim();
        if (n.type === 'aliased_import') {
          const nameChild = n.children[0];
          if (nameChild) symbolName = sourceCode.slice(nameChild.startIndex, nameChild.endIndex).trim();
        }
        if (symbolName && symbolName !== ',') {
          specifiers.push(symbolName);
        }
      }
    }
  } else if (['import_statement', 'import_declaration'].includes(node.type)) {
    const importSpecifiers = node.descendantsOfType('import_specifier');
    const importClause = node.children.find(c => c.type === 'import_clause');

    if (importSpecifiers.length > 0) {
      for (const spec of importSpecifiers) {
        const idNode = spec.children.find(c => c.type === 'identifier') || spec;
        const name = sourceCode.slice(idNode.startIndex, idNode.endIndex).trim();
        if (name) specifiers.push(name);
      }
    } else if (importClause) {
      const defaultId = importClause.children.find(c => c.type === 'identifier');
      const nsImport = importClause.descendantsOfType('namespace_import')[0];
      const nameNode = defaultId || nsImport;
      if (nameNode) {
        const name = sourceCode.slice(nameNode.startIndex, nameNode.endIndex).trim();
        if (name) specifiers.push(name);
      }
    } else {
      const aliasedNodes = node.descendantsOfType('aliased_import');
      const dottedNodes = node.descendantsOfType('dotted_name');

      if (aliasedNodes.length > 0) {
        for (const aliased of aliasedNodes) {
          const nameNode = aliased.children[0];
          if (nameNode) specifiers.push(sourceCode.slice(nameNode.startIndex, nameNode.endIndex).trim());
        }
      } else if (dottedNodes.length > 0) {
        for (const dotted of dottedNodes) {
          specifiers.push(sourceCode.slice(dotted.startIndex, dotted.endIndex).trim());
        }
      }
    }
  }

  if (specifiers.length === 0) {
    const stringNode = node.descendantsOfType('string')[0];
    const dottedNode = node.descendantsOfType('dotted_name')[0];
    const moduleName = stringNode
      ? sourceCode.slice(stringNode.startIndex, stringNode.endIndex).replace(/['"]/g, '').trim()
      : dottedNode
      ? sourceCode.slice(dottedNode.startIndex, dottedNode.endIndex).trim()
      : sourceCode.slice(node.startIndex, node.endIndex).trim();
    if (moduleName) specifiers.push(moduleName);
  }

  return [...new Set(specifiers)];
}

/**
 * Extracts imports into standard symbol representations.
 */
function extractImportSymbols(tree, sourceCode, filePath, language) {
  const symbols = [];
  const importNodes = tree.rootNode.children.filter(c =>
    ['import_statement', 'import_from_statement', 'import_declaration'].includes(c.type)
  );

  for (const node of importNodes) {
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    const specifiers = getImportedSpecifiers(node, sourceCode);

    for (const specName of specifiers) {
      const symbolId = generateSymbolId(filePath, 'import', specName, startLine);

      symbols.push({
        id: symbolId,
        name: specName,
        type: 'import',
        language,
        file: filePath,
        start_line: startLine,
        end_line: endLine,
        parent: null,
      });
    }
  }

  return symbols;
}

/**
 * Recursively extracts symbol declarations and assigns parent-child relationships.
 */
function extractASTSymbols(rootNode, sourceCode, filePath, language) {
  const symbols = [];

  function walk(node, parentId = null) {
    for (const child of node.children) {
      if (['export_statement', 'export_declaration'].includes(child.type)) {
        walk(child, parentId);
        continue;
      }

      const startLine = child.startPosition.row + 1;
      const endLine = child.endPosition.row + 1;

      // 1. Classes
      if (['class_definition', 'class_declaration'].includes(child.type)) {
        const name = getNodeName(child, sourceCode);
        const classId = generateSymbolId(filePath, 'class', name, startLine, parentId);

        symbols.push({
          id: classId,
          name,
          type: 'class',
          language,
          file: filePath,
          start_line: startLine,
          end_line: endLine,
          parent: parentId,
        });

        const methodNodes = child.descendantsOfType(['method_definition', 'function_definition']);
        for (const m of methodNodes) {
          if (m === child) continue;

          const mStartLine = m.startPosition.row + 1;
          const mEndLine = m.endPosition.row + 1;
          const mName = getNodeName(m, sourceCode);
          const methodId = generateSymbolId(filePath, 'method', mName, mStartLine, classId);

          symbols.push({
            id: methodId,
            name: mName,
            type: 'method',
            language,
            file: filePath,
            start_line: mStartLine,
            end_line: mEndLine,
            parent: classId,
          });
        }
      }

      // 2. Functions
      else if (['function_declaration', 'function_definition'].includes(child.type)) {
        const name = getNodeName(child, sourceCode);
        const funcId = generateSymbolId(filePath, 'function', name, startLine, parentId);

        symbols.push({
          id: funcId,
          name,
          type: 'function',
          language,
          file: filePath,
          start_line: startLine,
          end_line: endLine,
          parent: parentId,
        });

        const body = child.childForFieldName('body');
        if (body) walk(body, funcId);
      }

      // 3. Arrow Functions
      else if (['lexical_declaration', 'variable_declaration'].includes(child.type)) {
        const declarator = child.descendantsOfType('variable_declarator')[0];
        const hasFunction = declarator?.children.some(c =>
          ['arrow_function', 'function_expression'].includes(c.type)
        );

        if (hasFunction) {
          const name = getNodeName(declarator, sourceCode);
          const funcId = generateSymbolId(filePath, 'function', name, startLine, parentId);

          symbols.push({
            id: funcId,
            name,
            type: 'function',
            language,
            file: filePath,
            start_line: startLine,
            end_line: endLine,
            parent: parentId,
          });
        }
      }

      // 4. Interfaces (TS)
      else if (child.type === 'interface_declaration') {
        const name = getNodeName(child, sourceCode);
        const interfaceId = generateSymbolId(filePath, 'interface', name, startLine, parentId);

        symbols.push({
          id: interfaceId,
          name,
          type: 'interface',
          language,
          file: filePath,
          start_line: startLine,
          end_line: endLine,
          parent: parentId,
        });
      }

      // 5. Type Aliases (TS)
      else if (child.type === 'type_alias_declaration') {
        const name = getNodeName(child, sourceCode);
        const typeId = generateSymbolId(filePath, 'type', name, startLine, parentId);

        symbols.push({
          id: typeId,
          name,
          type: 'type',
          language,
          file: filePath,
          start_line: startLine,
          end_line: endLine,
          parent: parentId,
        });
      }

      // 6. Enums (TS)
      else if (child.type === 'enum_declaration') {
        const name = getNodeName(child, sourceCode);
        const enumId = generateSymbolId(filePath, 'enum', name, startLine, parentId);

        symbols.push({
          id: enumId,
          name,
          type: 'enum',
          language,
          file: filePath,
          start_line: startLine,
          end_line: endLine,
          parent: parentId,
        });
      }
    }
  }

  walk(rootNode);
  return symbols;
}

/**
 * Main entry point: Processes analysis.json and creates normalized symbols.
 */
export function extractRepositorySymbols(analysisJsonPath) {
  const parser = new Parser();
  const repoRootDir = path.dirname(path.resolve(analysisJsonPath));
  const entries = JSON.parse(fs.readFileSync(analysisJsonPath, 'utf8'));

  const allSymbols = [];

  for (const entry of entries) {
    const filePath = typeof entry === 'string' ? entry : entry.path;
    if (!filePath) continue;

    const absolutePath = path.resolve(repoRootDir, filePath);
    const ext = path.extname(filePath);
    const config = GRAMMAR_MAP[ext];

    if (!config || !fs.existsSync(absolutePath)) continue;

    parser.setLanguage(config.grammar);
    const sourceCode = fs.readFileSync(absolutePath, 'utf8');
    const tree = parser.parse(sourceCode);

    const imports = extractImportSymbols(tree, sourceCode, filePath, config.lang);
    const declarations = extractASTSymbols(tree.rootNode, sourceCode, filePath, config.lang);

    allSymbols.push(...imports, ...declarations);
  }

  return allSymbols;
}

/**
 * Normalizes backslashes to forward slashes for cross-platform consistency.
 */
const normPath = (p) => (typeof p === 'string' ? p.replace(/\\/g, '/') : p);

/**
 * Builds fast lookup indices from symbols.json and repo file paths.
 */
function buildSymbolIndices(symbolsList = [], repoFilePaths = []) {
  const lineMap = new Map();
  const localNameMap = new Map();
  const globalNameMap = new Map();
  const fileSet = new Set();
  const fileBaseMap = new Map();

  for (const rawPath of repoFilePaths) {
    const filePath = normPath(rawPath);
    if (!filePath) continue;
    fileSet.add(filePath);

    const baseName = path.basename(filePath, path.extname(filePath));
    if (!fileBaseMap.has(baseName)) {
      fileBaseMap.set(baseName, filePath);
    }
  }

  for (const sym of symbolsList) {
    const filePath = normPath(sym.file || sym.path || '');
    if (!filePath) continue;

    fileSet.add(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    if (!fileBaseMap.has(baseName)) {
      fileBaseMap.set(baseName, filePath);
    }

    if (sym.start_line) {
      lineMap.set(`${filePath}:L${sym.start_line}`, sym.id);
    }

    if (sym.name) {
      localNameMap.set(`${filePath}:${sym.name}`, sym);

      if (!globalNameMap.has(sym.name)) {
        globalNameMap.set(sym.name, []);
      }
      globalNameMap.get(sym.name).push(sym);
    }
  }

  return { lineMap, localNameMap, globalNameMap, fileSet, fileBaseMap };
}

/**
 * Attempts to match a module string (e.g. "Courses" or "App/Courses") to a repository file.
 */
function findMatchingFile(modulePath, symbolIndices) {
  if (!modulePath) return null;

  const normalizedMod = normPath(modulePath);
  const baseMod = path.basename(normalizedMod, path.extname(normalizedMod));

  for (const filePath of symbolIndices.fileSet) {
    if (filePath === normalizedMod) return filePath;
  }

  for (const filePath of symbolIndices.fileSet) {
    const noExt = filePath.replace(/\.[^/.]+$/, '');
    if (noExt === normalizedMod || noExt.endsWith(`/${normalizedMod}`) || noExt.endsWith(normalizedMod)) {
      return filePath;
    }
  }

  if (symbolIndices.fileBaseMap.has(baseMod)) {
    return symbolIndices.fileBaseMap.get(baseMod);
  }

  return null;
}

/**
 * Resolves a raw target string to a symbol ID, module file, or external fallback.
 */
function resolveTarget(targetName, currentFilePath, symbolIndices) {
  if (!targetName) {
    return { target: targetName, target_symbol_id: null, resolved: false };
  }

  const normFile = normPath(currentFilePath);

  // 1. Direct local match (declarations only)
  const localMatch = symbolIndices.localNameMap.get(`${normFile}:${targetName}`);
  if (localMatch && localMatch.type !== 'import') {
    return {
      target: targetName,
      target_symbol_id: localMatch.id,
      resolved: true,
    };
  }

  // 2. Direct global match (declarations only)
  const globalMatches = symbolIndices.globalNameMap.get(targetName);
  if (globalMatches && globalMatches.length > 0) {
    const declMatch = globalMatches.find(s => s.type !== 'import');
    if (declMatch) {
      return {
        target: targetName,
        target_symbol_id: declMatch.id,
        resolved: true,
      };
    }
  }

  // 3. Dot-qualified target (e.g. "Courses.ds_course" or "./models/PrintedBook.PrintedBook")
  if (targetName.includes('.')) {
    const parts = targetName.split('.');
    const shortName = parts[parts.length - 1];
    const modulePath = parts.slice(0, -1).join('/').replace(/\\/g, '/');

    const shortNameMatches = symbolIndices.globalNameMap.get(shortName);
    if (shortNameMatches && shortNameMatches.length > 0) {
      const fileMatch = shortNameMatches.find(s => {
        if (s.type === 'import') return false;
        const symFile = normPath(s.file || '');
        const baseName = path.basename(symFile, path.extname(symFile));
        return (
          symFile.includes(modulePath) ||
          baseName === modulePath ||
          symFile.replace(/\.[^/.]+$/, '').endsWith(modulePath)
        );
      });

      if (fileMatch) {
        return {
          target: targetName,
          target_symbol_id: fileMatch.id,
          resolved: true,
        };
      }

      const fallbackDecl = shortNameMatches.find(s => s.type !== 'import');
      if (fallbackDecl) {
        return {
          target: targetName,
          target_symbol_id: fallbackDecl.id,
          resolved: true,
        };
      }
    }

    const matchedFile = findMatchingFile(modulePath, symbolIndices);
    if (matchedFile) {
      return {
        target: targetName,
        target_symbol_id: matchedFile,
        resolved: true,
      };
    }
  }

  // 4. Fallback to file/module match
  const matchedFile = findMatchingFile(targetName, symbolIndices);
  if (matchedFile) {
    return {
      target: targetName,
      target_symbol_id: matchedFile,
      resolved: true,
    };
  }

  return {
    target: targetName,
    target_symbol_id: null,
    resolved: false,
  };
}

function getCallTargetName(callNode, sourceCode) {
  if (!callNode) return null;

  let funcNode = callNode.childForFieldName('function') || callNode.childForFieldName('constructor');

  if (!funcNode && callNode.type === 'new_expression') {
    funcNode = callNode.children.find(c =>
      ['identifier', 'property_identifier', 'member_expression', 'type_identifier'].includes(c.type)
    );
  }

  if (!funcNode) funcNode = callNode.children[0];
  if (!funcNode || funcNode.type === 'new') return null;

  if (['identifier', 'property_identifier', 'type_identifier'].includes(funcNode.type)) {
    return sourceCode.slice(funcNode.startIndex, funcNode.endIndex);
  }

  if (['member_expression', 'attribute'].includes(funcNode.type)) {
    const propNode = funcNode.childForFieldName('property') || funcNode.childForFieldName('attribute');
    if (propNode) {
      return sourceCode.slice(propNode.startIndex, propNode.endIndex);
    }

    const lastChild = funcNode.children[funcNode.children.length - 1];
    if (lastChild && ['identifier', 'property_identifier', 'property_name'].includes(lastChild.type)) {
      return sourceCode.slice(lastChild.startIndex, lastChild.endIndex);
    }
  }

  return sourceCode.slice(funcNode.startIndex, funcNode.endIndex);
}

function cleanTargetName(rawTarget) {
  if (!rawTarget) return '';
  return rawTarget.split('<')[0].trim();
}

/**
 * Extracts IMPORTS relationships mapped to symbol IDs or module files.
 */
function extractImportRelationships(rootNode, sourceCode, filePath, symbolIndices) {
  const relationships = [];
  const normFile = normPath(filePath);

  const importNodes = rootNode.descendantsOfType([
    'import_statement',
    'import_from_statement',
    'import_declaration',
  ]);

  for (const child of importNodes) {
    const startLine = child.startPosition.row + 1;

    // Python "from x import y"
    if (child.type === 'import_from_statement') {
      const importKwIndex = child.children.findIndex(
        c => c.type === 'import' || sourceCode.slice(c.startIndex, c.endIndex) === 'import'
      );

      const moduleNode = child.children
        .slice(0, importKwIndex)
        .find(c => ['dotted_name', 'relative_import'].includes(c.type));

      const module = moduleNode ? sourceCode.slice(moduleNode.startIndex, moduleNode.endIndex).trim() : '';

      const nameNodes = child.children
        .slice(importKwIndex + 1)
        .flatMap(c => (c.type === 'import_list' ? c.children : [c]))
        .filter(c => ['identifier', 'dotted_name', 'aliased_import', 'wildcard_import'].includes(c.type));

      for (const n of nameNodes) {
        let symbolName = sourceCode.slice(n.startIndex, n.endIndex).trim();
        if (n.type === 'aliased_import') {
          const nameChild = n.children[0];
          if (nameChild) symbolName = sourceCode.slice(nameChild.startIndex, nameChild.endIndex).trim();
        }

        const sourceId = generateSymbolId(normFile, 'import', symbolName, startLine);
        const target = !module ? symbolName : module.endsWith('.') ? `${module}${symbolName}` : `${module}.${symbolName}`;
        const targetRes = resolveTarget(target, normFile, symbolIndices);

        relationships.push({
          type: 'IMPORTS',
          source: sourceId,
          target: targetRes.target,
          target_symbol_id: targetRes.target_symbol_id,
          resolved: targetRes.resolved,
          import_kind: 'symbol'
        });
      }
    } 
    // JS / TS / Python standard imports
    else {
      const stringNode = child.descendantsOfType('string')[0];
      const modulePath = stringNode
        ? sourceCode.slice(stringNode.startIndex, stringNode.endIndex).replace(/['"]/g, '').trim()
        : null;

      const importSpecifiers = child.descendantsOfType('import_specifier');
      const importClause = child.children.find(c => c.type === 'import_clause');

      // Named imports: import { PrintedBook, EBook } from './models/PrintedBook'
      if (importSpecifiers.length > 0) {
        for (const spec of importSpecifiers) {
          const idNode = spec.children.find(c => c.type === 'identifier') || spec;
          const symbolName = sourceCode.slice(idNode.startIndex, idNode.endIndex).trim();
          const sourceId = generateSymbolId(normFile, 'import', symbolName, startLine);
          const targetName = modulePath ? `${modulePath}.${symbolName}` : symbolName;
          const targetRes = resolveTarget(targetName, normFile, symbolIndices);

          relationships.push({
            type: 'IMPORTS',
            source: sourceId,
            target: targetRes.target,
            target_symbol_id: targetRes.target_symbol_id,
            resolved: targetRes.resolved,
            import_kind: 'symbol'
          });
        }
      } 
      // Default or Namespace Import
      else if (importClause) {
        const defaultId = importClause.children.find(c => c.type === 'identifier');
        const namespaceImport = importClause.descendantsOfType('namespace_import')[0];

        const symbolName = defaultId 
          ? sourceCode.slice(defaultId.startIndex, defaultId.endIndex).trim()
          : namespaceImport 
          ? sourceCode.slice(namespaceImport.startIndex, namespaceImport.endIndex).trim()
          : null;

        if (symbolName) {
          const sourceId = generateSymbolId(normFile, 'import', symbolName, startLine);
          const targetName = modulePath ? `${modulePath}.${symbolName}` : symbolName;
          const targetRes = resolveTarget(targetName, normFile, symbolIndices);

          relationships.push({
            type: 'IMPORTS',
            source: sourceId,
            target: targetRes.target,
            target_symbol_id: targetRes.target_symbol_id,
            resolved: targetRes.resolved,
            import_kind: 'symbol'
          });
        } else if (modulePath) {
          const sourceId = generateSymbolId(normFile, 'import', modulePath, startLine);
          const targetRes = resolveTarget(modulePath, normFile, symbolIndices);
          relationships.push({
            type: 'IMPORTS',
            source: sourceId,
            target: targetRes.target,
            target_symbol_id: targetRes.target_symbol_id,
            resolved: targetRes.resolved,
            import_kind: 'module'
          });
        }
      }
      // Dotted names / Aliased imports
      else {
        const aliasedNodes = child.descendantsOfType('aliased_import');
        const dottedNodes = child.descendantsOfType('dotted_name');
        const targetsToProcess = [];

        if (aliasedNodes.length > 0) {
          for (const aliased of aliasedNodes) {
            const nameNode = aliased.children[0];
            if (nameNode) targetsToProcess.push(sourceCode.slice(nameNode.startIndex, nameNode.endIndex).trim());
          }
        } else if (dottedNodes.length > 0) {
          for (const dotted of dottedNodes) {
            targetsToProcess.push(sourceCode.slice(dotted.startIndex, dotted.endIndex).trim());
          }
        } else if (modulePath) {
          targetsToProcess.push(modulePath);
        }

        for (const targetName of targetsToProcess) {
          const sourceId = generateSymbolId(normFile, 'import', targetName, startLine);
          const targetRes = resolveTarget(targetName, normFile, symbolIndices);
          relationships.push({
            type: 'IMPORTS',
            source: sourceId,
            target: targetRes.target,
            target_symbol_id: targetRes.target_symbol_id,
            resolved: targetRes.resolved,
            import_kind: 'module'
          });
        }
      }
    }
  }

  return relationships;
}

/**
 * Extracts INHERITS, IMPLEMENTS, and CALLS relationships with resolved symbol IDs.
 */
function extractRelationships(rootNode, sourceCode, filePath, symbolIndices) {
  const relationships = [];
  const normFile = normPath(filePath);

  // 1. Extract IMPORTS
  const importRelationships = extractImportRelationships(rootNode, sourceCode, normFile, symbolIndices);
  relationships.push(...importRelationships);

  // 2. Extract structural & call relationships
  function walk(node, currentClassId = null, currentScopeId = null) {
    for (const child of node.children) {
      if (['export_statement', 'export_declaration'].includes(child.type)) {
        walk(child, currentClassId, currentScopeId);
        continue;
      }

      const startLine = child.startPosition.row + 1;
      const matchedSymbolId = symbolIndices.lineMap.get(`${normFile}:L${startLine}`);

      // --- Class Inheritance & Implementation ---
      if (['class_definition', 'class_declaration', 'class_expression'].includes(child.type)) {
        const classSourceId = matchedSymbolId || `${normFile}:${getNodeName(child, sourceCode) || 'Class'}`;

        // Python Base Classes
        const argList = child.children.find(c => c.type === 'argument_list');
        if (argList) {
          for (const arg of argList.children) {
            if (['(', ')', ','].includes(arg.type) || arg.type === 'keyword_argument') continue;
            const rawTarget = cleanTargetName(sourceCode.slice(arg.startIndex, arg.endIndex));
            if (rawTarget) {
              const targetRes = resolveTarget(rawTarget, normFile, symbolIndices);
              relationships.push({
                type: 'INHERITS',
                source: classSourceId,
                target: targetRes.target,
                target_symbol_id: targetRes.target_symbol_id,
                resolved: targetRes.resolved
              });
            }
          }
        }

        // JS/TS Class Heritage
        const heritage = child.children.find(c => c.type === 'class_heritage');
        const heritageNodes = heritage ? heritage.children : child.children;

        for (const hChild of heritageNodes) {
          if (['extends_clause', 'extends_type_clause'].includes(hChild.type)) {
            const targets = hChild.children.filter(c => !['extends', ','].includes(c.type));
            for (const targetNode of targets) {
              const rawTarget = cleanTargetName(sourceCode.slice(targetNode.startIndex, targetNode.endIndex));
              if (rawTarget) {
                const targetRes = resolveTarget(rawTarget, normFile, symbolIndices);
                relationships.push({
                  type: 'INHERITS',
                  source: classSourceId,
                  target: targetRes.target,
                  target_symbol_id: targetRes.target_symbol_id,
                  resolved: targetRes.resolved
                });
              }
            }
          }

          if (hChild.type === 'implements_clause') {
            const targets = hChild.children.filter(c => !['implements', ','].includes(c.type));
            for (const targetNode of targets) {
              const rawTarget = cleanTargetName(sourceCode.slice(targetNode.startIndex, targetNode.endIndex));
              if (rawTarget) {
                const targetRes = resolveTarget(rawTarget, normFile, symbolIndices);
                relationships.push({
                  type: 'IMPLEMENTS',
                  source: classSourceId,
                  target: targetRes.target,
                  target_symbol_id: targetRes.target_symbol_id,
                  resolved: targetRes.resolved
                });
              }
            }
          }
        }

        walk(child, classSourceId, currentScopeId);
        continue;
      }

      // --- Scope Tracking ---
      let activeScopeId = currentScopeId;

      if (['function_declaration', 'function_definition', 'method_definition'].includes(child.type)) {
        activeScopeId = matchedSymbolId || activeScopeId;
      } else if (['lexical_declaration', 'variable_declaration'].includes(child.type)) {
        const declarator = child.descendantsOfType('variable_declarator')[0];
        const hasFunction = declarator?.children.some(c => ['arrow_function', 'function_expression'].includes(c.type));
        if (hasFunction) {
          activeScopeId = matchedSymbolId || activeScopeId;
        }
      }

      // --- Function/Method Calls and Instantiations (Supports top-level/root scope) ---
      if (['call_expression', 'call', 'new_expression'].includes(child.type)) {
        const sourceId = activeScopeId || normFile; // Fallback to file path for root-level calls
        const rawTargetName = getCallTargetName(child, sourceCode);
        if (rawTargetName) {
          const targetRes = resolveTarget(rawTargetName, normFile, symbolIndices);
          relationships.push({
            type: 'CALLS',
            source: sourceId,
            target: targetRes.target,
            target_symbol_id: targetRes.target_symbol_id,
            resolved: targetRes.resolved
          });
        }
      }

      walk(child, currentClassId, activeScopeId);
    }
  }

  walk(rootNode);
  return relationships;
}

/**
 * Main Entry: Reads symbols.json alongside analysis.json and generates normalized relationships.
 */
export function generateRelationships(analysisJsonPath, symbolsJsonPath = null) {
  const parser = new Parser();
  const repoRootDir = path.dirname(path.resolve(analysisJsonPath));
  const entries = JSON.parse(fs.readFileSync(analysisJsonPath, 'utf8'));

  const repoFilePaths = entries.map(e => (typeof e === 'string' ? e : e.path)).filter(Boolean);

  const symPath = symbolsJsonPath || path.join(repoRootDir, 'symbols.json');
  let symbolsList = [];
  if (fs.existsSync(symPath)) {
    symbolsList = JSON.parse(fs.readFileSync(symPath, 'utf8'));
  }

  const symbolIndices = buildSymbolIndices(symbolsList, repoFilePaths);
  const allRelationships = [];

  for (const filePath of repoFilePaths) {
    const normFilePath = normPath(filePath);
    const absolutePath = path.resolve(repoRootDir, normFilePath);
    const ext = path.extname(normFilePath);
    const grammar = GRAMMAR_MAP[ext];

    if (!grammar || !fs.existsSync(absolutePath)) continue;

    parser.setLanguage(grammar.grammar);
    const sourceCode = fs.readFileSync(absolutePath, 'utf8');
    const tree = parser.parse(sourceCode);

    const fileRelationships = extractRelationships(tree.rootNode, sourceCode, normFilePath, symbolIndices);
    allRelationships.push(...fileRelationships);
  }

  return { relationships: allRelationships };
}

// Execution Entrypoint
const inputPath = process.argv[2] || './AI-Resume-Analyzer';
const resolvedPath = path.resolve(process.cwd(), inputPath);

let analysisJsonPath = resolvedPath;
if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
  analysisJsonPath = path.join(resolvedPath, 'analysis.json');
}

if (!fs.existsSync(analysisJsonPath)) {
  console.error(`Error: Could not find analysis file at "${analysisJsonPath}"`);
  process.exit(1);
}

const outputDir = path.dirname(analysisJsonPath);

// 1. Extract and save symbols
const basicStructure = extractRepositorySymbols(analysisJsonPath);
const basicStructurePath = path.join(outputDir, 'symbols.json');
fs.writeFileSync(basicStructurePath, JSON.stringify(basicStructure, null, 2));
console.log(`Successfully generated basic structure and saved to ${basicStructurePath}`);

// 2. Generate and save relationships
const result = generateRelationships(analysisJsonPath);
const relationshipsPath = path.join(outputDir, 'relationships.json');
fs.writeFileSync(relationshipsPath, JSON.stringify(result, null, 2));
console.log(`Saved ${result.relationships.length} relationships to ${relationshipsPath}`);