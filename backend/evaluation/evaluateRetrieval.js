import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { searchLexicalSymbols } from '../services/search/lexicalSearchService.js';
import { searchSemanticSymbols } from '../services/search/semanticSearchService.js';
import { hybridSearch } from '../services/search/hybridSearchService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runEvaluation() {
  const datasetPath = path.join(__dirname, 'dataset.json');
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const repoId = 'expressjs__express';

  console.log(`\n===============================================================`);
  console.log(`  AI CODEBASE VISUALIZER — HYBRID RETRIEVAL BENCHMARK`);
  console.log(`  Target Repository: ${repoId}`);
  console.log(`  Evaluation Queries: ${dataset.length}`);
  console.log(`===============================================================\n`);

  const modes = ['lexical', 'semantic', 'hybrid'];
  const metrics = {
    lexical: { recall5: 0, recall10: 0, mrr: 0, latencies: [] },
    semantic: { recall5: 0, recall10: 0, mrr: 0, latencies: [] },
    hybrid: { recall5: 0, recall10: 0, mrr: 0, latencies: [] },
  };

  const detailedResults = [];

  for (const item of dataset) {
    const row = {
      id: item.id,
      query: item.query,
      type: item.type,
      expected: item.expected_symbol_id,
      ranks: {},
    };

    // 1. Lexical
    const t0 = performance.now();
    const lexResults = await searchLexicalSymbols(repoId, item.query, 20);
    const lexDuration = performance.now() - t0;
    metrics.lexical.latencies.push(lexDuration);
    const lexIdx = lexResults.findIndex((r) => r.symbol_id === item.expected_symbol_id);
    const lexRank = lexIdx !== -1 ? lexIdx + 1 : null;
    row.ranks.lexical = lexRank;
    if (lexRank && lexRank <= 5) metrics.lexical.recall5++;
    if (lexRank && lexRank <= 10) metrics.lexical.recall10++;
    if (lexRank) metrics.lexical.mrr += 1 / lexRank;

    // 2. Semantic
    const t1 = performance.now();
    const semResults = await searchSemanticSymbols(repoId, item.query, 20);
    const semDuration = performance.now() - t1;
    metrics.semantic.latencies.push(semDuration);
    const semIdx = semResults.findIndex((r) => r.symbol_id === item.expected_symbol_id);
    const semRank = semIdx !== -1 ? semIdx + 1 : null;
    row.ranks.semantic = semRank;
    if (semRank && semRank <= 5) metrics.semantic.recall5++;
    if (semRank && semRank <= 10) metrics.semantic.recall10++;
    if (semRank) metrics.semantic.mrr += 1 / semRank;

    // 3. Hybrid (RRF)
    const t2 = performance.now();
    const hybResponse = await hybridSearch(repoId, item.query, { limit: 10, lexicalLimit: 20, semanticLimit: 20 });
    const hybDuration = performance.now() - t2;
    metrics.hybrid.latencies.push(hybDuration);
    const hybIdx = hybResponse.results.findIndex((r) => r.symbol_id === item.expected_symbol_id);
    const hybRank = hybIdx !== -1 ? hybIdx + 1 : null;
    row.ranks.hybrid = hybRank;
    if (hybRank && hybRank <= 5) metrics.hybrid.recall5++;
    if (hybRank && hybRank <= 10) metrics.hybrid.recall10++;
    if (hybRank) metrics.hybrid.mrr += 1 / hybRank;

    detailedResults.push(row);
  }

  // Calculate averages
  const N = dataset.length;
  for (const m of modes) {
    metrics[m].meanRecall5 = (metrics[m].recall5 / N) * 100;
    metrics[m].meanRecall10 = (metrics[m].recall10 / N) * 100;
    metrics[m].mrr = metrics[m].mrr / N;
    metrics[m].avgLatency = metrics[m].latencies.reduce((a, b) => a + b, 0) / N;
  }

  // Print Summary Table
  console.log(`-------------------------------------------------------------------------`);
  console.log(` Mode         | Recall@5  | Recall@10 | MRR    | Avg Latency`);
  console.log(`-------------------------------------------------------------------------`);
  for (const m of modes) {
    const r5 = `${metrics[m].meanRecall5.toFixed(1)}%`.padEnd(9);
    const r10 = `${metrics[m].meanRecall10.toFixed(1)}%`.padEnd(9);
    const mrr = metrics[m].mrr.toFixed(4).padEnd(6);
    const lat = `${metrics[m].avgLatency.toFixed(1)} ms`.padEnd(11);
    const modeName = m.toUpperCase().padEnd(12);
    console.log(` ${modeName} | ${r5} | ${r10} | ${mrr} | ${lat}`);
  }
  console.log(`-------------------------------------------------------------------------\n`);

  // Print Per-Query Breakdown
  console.log(`Per-Query Retrieval Breakdown:`);
  console.log(`-------------------------------------------------------------------------`);
  for (const d of detailedResults) {
    const lex = d.ranks.lexical ? `#${d.ranks.lexical}` : 'MISS';
    const sem = d.ranks.semantic ? `#${d.ranks.semantic}` : 'MISS';
    const hyb = d.ranks.hybrid ? `#${d.ranks.hybrid}` : 'MISS';
    console.log(`[${d.id}] "${d.query}" (${d.type})`);
    console.log(`     Target: ${d.expected}`);
    console.log(`     Lexical: ${lex.padEnd(6)} | Semantic: ${sem.padEnd(6)} | Hybrid: ${hyb}`);
  }
  console.log(`-------------------------------------------------------------------------\n`);

  await pool.end();
}

runEvaluation().catch((err) => {
  console.error('Evaluation runner failed:', err);
  process.exit(1);
});
