import fs from 'fs';
import path from 'path';
import { extractRepositorySymbols, generateRelationships } from './symbolParser.js';
import { resolveRelationships } from './relationshipResolver.js';
import { buildAndSaveGraph } from './graphGenerator.js';
import { validateGraph } from './graphValidator.js';

/**
 * Executes the complete multi-stage analysis pipeline on a cloned repository directory.
 * 
 * Pipeline stages:
 * 1. Extract AST symbols (symbols.json)
 * 2. Generate raw relationships (relationships.json)
 * 3. Resolve cross-file semantic relationships (relationships.json)
 * 4. Generate unified graph data (graph.json)
 * 5. Validate graph consistency
 * 
 * @param {string} repoDir - The root directory of the cloned repository containing analysis.json
 * @returns {Promise<{ graph: Object, validation: Object }>}
 */
export async function runAnalysisPipeline(repoDir) {
  const analysisJsonPath = path.join(repoDir, 'analysis.json');
  if (!fs.existsSync(analysisJsonPath)) {
    throw new Error(`Cannot run analysis pipeline: analysis.json not found in ${repoDir}`);
  }

  const symbolsJsonPath = path.join(repoDir, 'symbols.json');
  const relationshipsJsonPath = path.join(repoDir, 'relationships.json');

  console.log(`[Pipeline] Stage 1/5: Extracting symbols from ${analysisJsonPath}...`);
  const symbols = extractRepositorySymbols(analysisJsonPath);
  fs.writeFileSync(symbolsJsonPath, JSON.stringify(symbols, null, 2));
  console.log(`[Pipeline] Extracted ${symbols.length} symbols -> ${symbolsJsonPath}`);

  console.log(`[Pipeline] Stage 2/5: Generating initial relationships...`);
  const relResult = generateRelationships(analysisJsonPath, symbolsJsonPath);
  fs.writeFileSync(relationshipsJsonPath, JSON.stringify(relResult, null, 2));
  console.log(`[Pipeline] Generated ${relResult.relationships.length} relationships -> ${relationshipsJsonPath}`);

  console.log(`[Pipeline] Stage 3/5: Resolving cross-file relationships...`);
  resolveRelationships(symbolsJsonPath, relationshipsJsonPath);
  console.log(`[Pipeline] Relationships resolution complete.`);

  console.log(`[Pipeline] Stage 4/5: Generating graph model...`);
  const { graphData, outputPath } = buildAndSaveGraph(repoDir);
  console.log(`[Pipeline] Graph successfully built with ${graphData.nodes.length} nodes and ${graphData.edges.length} edges.`);

  console.log(`[Pipeline] Stage 5/5: Validating graph integrity...`);
  const validation = validateGraph(repoDir);

  return {
    graph: graphData,
    validation,
  };
}
