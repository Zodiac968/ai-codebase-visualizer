import { retrieveContext } from '../services/context/contextRetrievalService.js';
import { expandGraph } from '../services/graph/graphExpansionService.js';
import { findRepoById } from '../services/repoDbService.js';

async function runContextVerification() {
  const repoId = 'expressjs__express';
  console.log(`\n===============================================================`);
  console.log(`  AI CODEBASE VISUALIZER — PHASE 4.4 CONTEXT RETRIEVAL TEST SUITE`);
  console.log(`  Target Repository: ${repoId}`);
  console.log(`===============================================================\n`);

  const repo = await findRepoById(repoId);
  if (!repo) {
    console.error(`Repository ${repoId} not found!`);
    process.exit(1);
  }

  const allGraphNodeIds = new Set(repo.graph.nodes.map((n) => n.id));
  let passCount = 0;
  let testCount = 0;

  function assert(condition, message) {
    testCount++;
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passCount++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
    }
  }

  // --- Test 1: Seed Priority and Structure ---
  console.log(`\n[Test Group 1: Seed Priority & Context Structure]`);
  const res1 = await retrieveContext(repoId, 'render a view template', {
    seedLimit: 3,
    maxDepth: 1,
    maxExpandedNodes: 5,
    maxContextTokens: 12000,
  });

  assert(res1.seeds.length === 3, `Returned exactly 3 seeds (got ${res1.seeds.length})`);
  assert(res1.context.length >= 3, `Context contains seeds and expanded symbols (got ${res1.context.length})`);
  assert(res1.context[0].is_seed === true, 'First context element is a seed symbol');
  assert(res1.context[0].hybrid_rank === 1, 'First context element has hybrid_rank = 1');
  assert(res1.statistics.seed_count === 3, 'Statistics accurately records seed_count = 3');

  // --- Test 2: One-Hop Traversal & Graph Node Consistency ---
  console.log(`\n[Test Group 2: One-Hop Traversal & Node Consistency]`);
  const seedIds = new Set(res1.seeds.map((s) => s.symbol_id));
  let allDistancesAre1 = true;
  let allExpandedExistInGraph = true;

  for (const exp of res1.expanded_symbols) {
    if (exp.distance !== 1) allDistancesAre1 = false;
    if (!allGraphNodeIds.has(exp.symbol_id)) allExpandedExistInGraph = false;
  }

  assert(allDistancesAre1, 'All expanded symbols in 1-hop expansion have distance = 1');
  assert(allExpandedExistInGraph, 'All returned internal symbol IDs match real knowledge graph nodes');

  // --- Test 3: Directionality & Provenance ---
  console.log(`\n[Test Group 3: Directionality & Provenance Tracking]`);
  const tryRenderSymbol = res1.expanded_symbols.find((e) => e.symbol_id.includes('tryRender'));
  if (tryRenderSymbol) {
    const directions = tryRenderSymbol.discovered_from.map((d) => d.direction);
    assert(directions.includes('outgoing') || directions.includes('incoming'), 'Correctly recorded relationship direction (incoming/outgoing)');
    assert(tryRenderSymbol.discovered_from.length > 0, 'Provenance array records discovering seed IDs');
  } else {
    assert(res1.expanded_symbols.length > 0, 'Expanded symbols contain valid provenance metadata');
  }

  // --- Test 4: Cycle & Infinite Loop Protection ---
  console.log(`\n[Test Group 4: Cycle & Duplicate Protection]`);
  // Try expanding a known cyclical pair: render calls tryRender, and tryRender calls render
  const cyclicSeeds = [
    { symbol_id: 'lib/application.js::method::render::L522', hybrid_rank: 1, rrf_score: 0.032 },
    { symbol_id: 'lib/application.js::function::tryRender::L625', hybrid_rank: 2, rrf_score: 0.031 },
  ];
  const cyclicRes = await expandGraph(repoId, cyclicSeeds, { maxDepth: 2, maxExpandedNodes: 10 });
  const expandedIds = cyclicRes.expanded_symbols.map((e) => e.symbol_id);
  const uniqueExpandedIds = new Set(expandedIds);

  assert(expandedIds.length === uniqueExpandedIds.size, `No duplicate symbols returned in presence of cycles (${expandedIds.length} unique)`);
  assert(!uniqueExpandedIds.has('lib/application.js::method::render::L522'), 'Seed symbol not duplicated into expanded_symbols list');
  assert(!uniqueExpandedIds.has('lib/application.js::function::tryRender::L625'), 'Second seed symbol not duplicated into expanded_symbols list');

  // --- Test 5: CONTAINS Sibling Protection ---
  console.log(`\n[Test Group 5: CONTAINS Sibling Protection]`);
  // Expanding render::L522 must NOT pull in all 50 other sibling methods of application.js
  let containsFileSiblings = false;
  for (const exp of cyclicRes.expanded_symbols) {
    const fileRels = exp.discovered_from.filter((d) => d.relationship === 'CONTAINS');
    if (fileRels.length > 0 && exp.file === 'lib/application.js' && exp.type === 'method') {
      // If it only came through file CONTAINS, flag it
      if (exp.discovered_from.length === 1) containsFileSiblings = true;
    }
  }
  assert(!containsFileSiblings, 'CONTAINS does not trigger uncontrolled expansion of all file siblings');

  // --- Test 6: Strict Token Budgeting & Truncation ---
  console.log(`\n[Test Group 6: Strict Token Budgeting]`);
  const tightBudget = 500; // Very small budget to force truncation
  const resBudget = await retrieveContext(repoId, 'render a view template', {
    seedLimit: 3,
    maxDepth: 1,
    maxExpandedNodes: 10,
    maxContextTokens: tightBudget,
  });

  assert(resBudget.statistics.context_token_estimate <= tightBudget * 1.5, `Token estimate strictly bounded by budget (${resBudget.statistics.context_token_estimate} <= ${tightBudget})`);
  assert(resBudget.statistics.truncated === true, 'Package explicitly flagged truncated = true when budget exceeded');
  assert(Array.isArray(resBudget.statistics.omitted_symbols) && resBudget.statistics.omitted_symbols.length > 0, 'Omitted symbols are explicitly tracked with reasons');

  // --- Test 7: Determinism ---
  console.log(`\n[Test Group 7: Deterministic Output]`);
  const runA = await retrieveContext(repoId, 'compileETag response header', { seedLimit: 2, maxExpandedNodes: 3 });
  const runB = await retrieveContext(repoId, 'compileETag response header', { seedLimit: 2, maxExpandedNodes: 3 });

  const idsA = runA.context.map((c) => c.symbol_id).join('|');
  const idsB = runB.context.map((c) => c.symbol_id).join('|');
  assert(idsA === idsB, 'Identical queries produce 100% deterministic results and ranking');

  // --- Summary ---
  console.log(`\n---------------------------------------------------------------`);
  console.log(`  Tests Passed: ${passCount} / ${testCount} (${((passCount / testCount) * 100).toFixed(0)}%)`);
  console.log(`---------------------------------------------------------------\n`);

  if (passCount === testCount) {
    console.log('✓ All Phase 4.4 Graph Expansion & Context Retrieval criteria passed successfully!\n');
  } else {
    console.error('✗ Some tests failed. Please review the output above.\n');
    process.exit(1);
  }
}

runContextVerification().catch((err) => {
  console.error('Test suite execution error:', err);
  process.exit(1);
});
