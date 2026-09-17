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
 * Generates a deterministic unique ID for a symbol.
 */
function generateSymbolId(file, type, name, startLine, parentId = null) {
  const parentPrefix = parentId ? `${parentId}->` : '';
  return `${file}::${parentPrefix}${type}::${name || 'anonymous'}::L${startLine}`;
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
    const text = sourceCode.slice(node.startIndex, node.endIndex).trim();
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    // Identify module target
    const stringNode = node.descendantsOfType('string')[0];
    const dottedNode = node.descendantsOfType('dotted_name')[0];
    const moduleName = stringNode
      ? sourceCode.slice(stringNode.startIndex, stringNode.endIndex).replace(/['"]/g, '')
      : dottedNode
      ? sourceCode.slice(dottedNode.startIndex, dottedNode.endIndex)
      : text;

    const symbolId = generateSymbolId(filePath, 'import', moduleName, startLine);

    symbols.push({
      id: symbolId,
      name: moduleName,
      type: 'import',
      language,
      file: filePath,
      start_line: startLine,
      end_line: endLine,
      parent: null,
    });
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
      // Unpack export wrappers (JS/TS)
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

        // Extract class methods
        const methodNodes = child.descendantsOfType(['method_definition', 'function_definition']);
        for (const m of methodNodes) {
          if (m === child) continue; // Skip self

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

      // 2. Functions (Top-level or nested functions)
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

        // Walk inside function body for inner functions
        const body = child.childForFieldName('body');
        if (body) walk(body, funcId);
      }

      // 3. JS/TS Arrow Functions (`const fn = () => {}`)
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

function nodeToJSON(node) {
  const result = {
    type: node.type,
    isNamed: node.isNamed,
    startPosition: node.startPosition,
    endPosition: node.endPosition,
  };

  if (node.childCount > 0) {
    result.children = node.children.map(nodeToJSON);
  }

  return result;
}

function processAnalysisFile(analysisJsonPath) {
  const parser = new Parser();
  
  const repoRootDir = path.dirname(path.resolve(analysisJsonPath));
  const rawData = fs.readFileSync(analysisJsonPath, 'utf8');
  const entries = JSON.parse(rawData);

  const output = {};

  for (const entry of entries) {
    const filePath = typeof entry === 'string' ? entry : entry.path;

    if (!filePath) {
      console.warn('[SKIP] Entry missing "path" property:', entry);
      continue;
    }

    const absolutePath = path.resolve(repoRootDir, filePath);
    const ext = path.extname(filePath);
    const grammar = GRAMMAR_MAP[ext];

    if (!grammar) {
      console.warn(`[SKIP] No grammar mapped for extension "${ext}" (${filePath})`);
      continue;
    }

    if (!fs.existsSync(absolutePath)) {
      console.warn(`[SKIP] File not found: ${absolutePath}`);
      continue;
    }

    parser.setLanguage(grammar.grammar);
    const sourceCode = fs.readFileSync(absolutePath, 'utf8');
    const tree = parser.parse(sourceCode);

    output[filePath] = {
      meta: entry,
      sexpr: tree.rootNode.toString(),
      ast: nodeToJSON(tree.rootNode),
    };
  }

  return output;
}

/**
 * Extracts the function or method name being invoked in a call expression.
 * Handles: function(), method(), object.method(), this.method()
 */
function getCallTargetName(callNode, sourceCode) {
  const funcNode = callNode.childForFieldName('function') || callNode.children[0];
  if (!funcNode) return null;

  // 1. Direct function call: calculateScore()
  if (['identifier', 'property_identifier'].includes(funcNode.type)) {
    return sourceCode.slice(funcNode.startIndex, funcNode.endIndex);
  }

  // 2. Member / Attribute call: userService.fetchUser(), this.clear()
  if (['member_expression', 'attribute'].includes(funcNode.type)) {
    const propNode =
      funcNode.childForFieldName('property') ||
      funcNode.childForFieldName('attribute');

    if (propNode) {
      return sourceCode.slice(propNode.startIndex, propNode.endIndex);
    }

    const lastChild = funcNode.children[funcNode.children.length - 1];
    if (lastChild && ['identifier', 'property_identifier', 'property_name'].includes(lastChild.type)) {
      return sourceCode.slice(lastChild.startIndex, lastChild.endIndex);
    }
  }

  return null;
}

/**
 * Clean target names by removing generic arguments: "Base<T, U>" -> "Base"
 */
function cleanTargetName(rawTarget) {
  if (!rawTarget) return '';
  // Strip generics and trim whitespace
  const baseName = rawTarget.split('<')[0].trim();
  // Handle qualified namespace names if needed (e.g. "Models.User" -> "User" or keep full path)
  return baseName;
}

/**
 * Extracts IMPORTS relationships (module imports vs symbol imports).
 */
function extractImportRelationships(rootNode, sourceCode, filePath) {
  const relationships = [];

  for (const child of rootNode.children) {
    if (!['import_statement', 'import_from_statement', 'import_declaration'].includes(child.type)) {
      continue;
    }

    const text = sourceCode.slice(child.startIndex, child.endIndex).trim();

    // --- Python: `from module import symbol1, symbol2` ---
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
        .flatMap(c => c.type === 'import_list' ? c.children : [c])
        .filter(c => ['identifier', 'dotted_name', 'aliased_import', 'wildcard_import'].includes(c.type));

      for (const n of nameNodes) {
        let symbolName = sourceCode.slice(n.startIndex, n.endIndex).trim();
        if (n.type === 'aliased_import') {
          const nameChild = n.children[0];
          if (nameChild) symbolName = sourceCode.slice(nameChild.startIndex, nameChild.endIndex).trim();
        }

        let target = '';
        if (!module) {
          target = symbolName;
        } else if (module.endsWith('.')) {
          target = `${module}${symbolName}`;
        } else {
          target = `${module}.${symbolName}`;
        }

        relationships.push({
          type: 'IMPORTS',
          source: filePath,
          target,
          import_kind: 'symbol'
        });
      }
    }

    // --- Python: `import os` or `import numpy as np` ---
    else if (child.type === 'import_statement' && text.startsWith('import ')) {
      const aliasedNodes = child.descendantsOfType('aliased_import');
      const dottedNodes = child.descendantsOfType('dotted_name');

      if (aliasedNodes.length > 0) {
        for (const aliased of aliasedNodes) {
          const nameNode = aliased.children[0];
          if (nameNode) {
            relationships.push({
              type: 'IMPORTS',
              source: filePath,
              target: sourceCode.slice(nameNode.startIndex, nameNode.endIndex).trim(),
              import_kind: 'module'
            });
          }
        }
      } else if (dottedNodes.length > 0) {
        for (const dotted of dottedNodes) {
          relationships.push({
            type: 'IMPORTS',
            source: filePath,
            target: sourceCode.slice(dotted.startIndex, dotted.endIndex).trim(),
            import_kind: 'module'
          });
        }
      }
    }

    // --- JS / TS Imports ---
    else {
      const stringNode = child.descendantsOfType('string')[0];
      if (stringNode) {
        const module = sourceCode.slice(stringNode.startIndex, stringNode.endIndex).replace(/['"]/g, '').trim();
        const specifiers = child.descendantsOfType('import_specifier');

        if (specifiers.length > 0) {
          for (const spec of specifiers) {
            const id = spec.children.find(c => c.type === 'identifier') || spec;
            const symbolName = sourceCode.slice(id.startIndex, id.endIndex).trim();
            relationships.push({
              type: 'IMPORTS',
              source: filePath,
              target: `${module}.${symbolName}`,
              import_kind: 'symbol'
            });
          }

          // Account for default import alongside named specifiers (e.g., `import React, { useState }`)
          const importClause = child.children.find(c => c.type === 'import_clause');
          if (importClause?.children.some(c => c.type === 'identifier')) {
            relationships.push({
              type: 'IMPORTS',
              source: filePath,
              target: module,
              import_kind: 'module'
            });
          }
        } else {
          // Default import, wildcard `* as X`, or side-effect import
          relationships.push({
            type: 'IMPORTS',
            source: filePath,
            target: module,
            import_kind: 'module'
          });
        }
      }
    }
  }

  return relationships;
}

/**
 * Extracts INHERITS, IMPLEMENTS, CALLS, and IMPORTS relationships.
 */
function extractRelationships(rootNode, sourceCode, filePath) {
  const relationships = [];

  // 1. Extract import relationships
  const importRelationships = extractImportRelationships(rootNode, sourceCode, filePath);
  relationships.push(...importRelationships);

  // 2. Extract code structure relationships (INHERITS, IMPLEMENTS, CALLS)
  function walk(node, currentClass = null, currentScope = null) {
    for (const child of node.children) {
      if (['export_statement', 'export_declaration'].includes(child.type)) {
        walk(child, currentClass, currentScope);
        continue;
      }

      // --- Class Inheritance & Implementation ---
      if (['class_definition', 'class_declaration', 'class_expression'].includes(child.type)) {
        let className = getNodeName(child, sourceCode);
        if (!className && child.parent?.type === 'variable_declarator') {
          className = getNodeName(child.parent, sourceCode);
        }

        if (className) {
          const sourceRef = `${filePath}:${className}`;

          // Python Base Classes
          const argList = child.children.find(c => c.type === 'argument_list');
          if (argList) {
            for (const arg of argList.children) {
              if (['(', ')', ','].includes(arg.type) || arg.type === 'keyword_argument') continue;
              const targetName = cleanTargetName(sourceCode.slice(arg.startIndex, arg.endIndex));
              if (targetName) {
                relationships.push({ type: 'INHERITS', source: sourceRef, target: targetName });
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
                const targetName = cleanTargetName(sourceCode.slice(targetNode.startIndex, targetNode.endIndex));
                if (targetName) {
                  relationships.push({ type: 'INHERITS', source: sourceRef, target: targetName });
                }
              }
            }

            if (hChild.type === 'implements_clause') {
              const targets = hChild.children.filter(c => !['implements', ','].includes(c.type));
              for (const targetNode of targets) {
                const targetName = cleanTargetName(sourceCode.slice(targetNode.startIndex, targetNode.endIndex));
                if (targetName) {
                  relationships.push({ type: 'IMPLEMENTS', source: sourceRef, target: targetName });
                }
              }
            }
          }

          walk(child, className, currentScope);
          continue;
        }
      }

      // --- Interface Heritage (TS) ---
      if (child.type === 'interface_declaration') {
        const interfaceName = getNodeName(child, sourceCode);
        if (interfaceName) {
          const sourceRef = `${filePath}:${interfaceName}`;
          const extendsClause = child.children.find(c =>
            ['extends_type_clause', 'extends_clause', 'interface_heritage'].includes(c.type)
          );

          if (extendsClause) {
            const targets = extendsClause.children.filter(c => !['extends', ','].includes(c.type));
            for (const targetNode of targets) {
              const targetName = cleanTargetName(sourceCode.slice(targetNode.startIndex, targetNode.endIndex));
              if (targetName) {
                relationships.push({ type: 'INHERITS', source: sourceRef, target: targetName });
              }
            }
          }
        }
        walk(child, currentClass, currentScope);
        continue;
      }

      // --- Scope Tracking ---
      let activeScope = currentScope;

      if (['function_declaration', 'function_definition', 'method_definition'].includes(child.type)) {
        const name = getNodeName(child, sourceCode);
        if (name) {
          activeScope = currentClass ? `${filePath}:${currentClass}.${name}` : `${filePath}:${name}`;
        }
      } else if (['lexical_declaration', 'variable_declaration'].includes(child.type)) {
        const declarator = child.descendantsOfType('variable_declarator')[0];
        const hasFunction = declarator?.children.some(c =>
          ['arrow_function', 'function_expression'].includes(c.type)
        );
        if (hasFunction) {
          const name = getNodeName(declarator, sourceCode);
          if (name) {
            activeScope = currentClass ? `${filePath}:${currentClass}.${name}` : `${filePath}:${name}`;
          }
        }
      }

      // --- Function/Method Calls ---
      if (['call_expression', 'call'].includes(child.type)) {
        if (activeScope) {
          const targetName = getCallTargetName(child, sourceCode);
          if (targetName) {
            relationships.push({
              type: 'CALLS',
              source: activeScope,
              target: targetName,
            });
          }
        }
      }

      walk(child, currentClass, activeScope);
    }
  }

  walk(rootNode);
  return relationships;
}

export function generateRelationships(analysisJsonPath) {
  const parser = new Parser();
  const repoRootDir = path.dirname(path.resolve(analysisJsonPath));
  const entries = JSON.parse(fs.readFileSync(analysisJsonPath, 'utf8'));

  const allRelationships = [];

  for (const entry of entries) {
    const filePath = typeof entry === 'string' ? entry : entry.path;
    if (!filePath) continue;

    const absolutePath = path.resolve(repoRootDir, filePath);
    const ext = path.extname(filePath);
    const grammar = GRAMMAR_MAP[ext];

    if (!grammar || !fs.existsSync(absolutePath)) continue;

    parser.setLanguage(grammar.grammar);
    const sourceCode = fs.readFileSync(absolutePath, 'utf8');
    const tree = parser.parse(sourceCode);

    const fileRelationships = extractRelationships(tree.rootNode, sourceCode, filePath);
    allRelationships.push(...fileRelationships);
  }

  return { relationships: allRelationships };
}

// const results = processAnalysisFile('./lowclass/analysis.json');
// fs.writeFileSync('syntax_trees.json', JSON.stringify(results, null, 2));
// console.log('Successfully parsed files and saved to syntax_trees.json');

// Get path from command-line argument or default to './AI-Resume-Analyzer'
const inputPath = process.argv[2] || './AI-Resume-Analyzer';
const resolvedPath = path.resolve(process.cwd(), inputPath);

// Determine analysis.json path (whether user passed folder or file)
let analysisJsonPath = resolvedPath;
if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
  analysisJsonPath = path.join(resolvedPath, 'analysis.json');
}

if (!fs.existsSync(analysisJsonPath)) {
  console.error(`Error: Could not find analysis file at "${analysisJsonPath}"`);
  process.exit(1);
}

// Output directory (saves generated files next to analysis.json)
const outputDir = path.dirname(analysisJsonPath);

// 1. Extract and save basic structure
const basicStructure = extractRepositorySymbols(analysisJsonPath);
const basicStructurePath = path.join(outputDir, 'symbols.json');
fs.writeFileSync(basicStructurePath, JSON.stringify(basicStructure, null, 2));
console.log(`Successfully generated basic structure and saved to ${basicStructurePath}`);

// 2. Generate and save relationships
const result = generateRelationships(analysisJsonPath);
const relationshipsPath = path.join(outputDir, 'relationships.json');
fs.writeFileSync(relationshipsPath, JSON.stringify(result, null, 2));
console.log(`Saved ${result.relationships.length} relationships to ${relationshipsPath}`);