// backend/evaluation/evaluateHighlighting.js
import assert from 'assert';
import {
  computeAncestorRevealSet,
  buildHighlightContext,
} from '../../frontend/src/utils/graph/highlightUtils.js';
import { buildNodeStyle } from '../../frontend/src/utils/graph/nodeStyles.js';

console.log('===============================================================');
console.log('  AI CODEBASE VISUALIZER — PHASE 4.5 GRAPH HIGHLIGHT TEST SUITE');
console.log('===============================================================\n');

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// Mock Graph Nodes
const mockNodes = [
  { id: 'repository', type: 'repository', name: 'my-repo', parent_id: null },
  { id: 'lib', type: 'folder', name: 'lib', parent_id: 'repository' },
  { id: 'lib/app.js', type: 'file', name: 'app.js', parent_id: 'lib' },
  { id: 'lib/app.js::class::App::L10', type: 'class', name: 'App', parent_id: 'lib/app.js' },
  { id: 'lib/app.js::method::listen::L20', type: 'method', name: 'listen', parent_id: 'lib/app.js::class::App::L10' },
  { id: 'lib/other.js', type: 'file', name: 'other.js', parent_id: 'lib' },
  { id: 'test', type: 'folder', name: 'test', parent_id: 'repository' },
  { id: 'test/test.js', type: 'file', name: 'test.js', parent_id: 'test' },
];

console.log('[Test Group 1: computeAncestorRevealSet]');
it('Computes minimal ancestor chain without expanding unrelated sibling folders', () => {
  const targets = ['lib/app.js::method::listen::L20'];
  const revealSet = computeAncestorRevealSet(targets, mockNodes);

  assert(revealSet.has('repository'), 'Must include repository root');
  assert(revealSet.has('lib'), 'Must include parent folder "lib"');
  assert(revealSet.has('lib/app.js'), 'Must include parent file "lib/app.js"');
  assert(revealSet.has('lib/app.js::class::App::L10'), 'Must include parent class "App"');
  assert(!revealSet.has('lib/other.js'), 'Must NOT expand sibling file "lib/other.js"');
  assert(!revealSet.has('test'), 'Must NOT expand unrelated folder "test"');
  assert(!revealSet.has('test/test.js'), 'Must NOT expand unrelated file "test/test.js"');
});

console.log('\n[Test Group 2: buildHighlightContext]');
it('Correctly separates primary matches and related symbols', () => {
  const searchData = {
    seeds: [
      { symbol_id: 'lib/app.js::method::listen::L20', name: 'listen' },
    ],
    expanded_symbols: [
      { symbol_id: 'lib/server.js::function::createServer::L5', name: 'createServer' },
      { symbol_id: 'lib/app.js::method::listen::L20', name: 'listen' }, // Duplicate seed guard
    ],
    relationships: [
      { source: 'lib/app.js::method::listen::L20', target: 'lib/server.js::function::createServer::L5', type: 'CALLS' },
    ],
  };

  const ctx = buildHighlightContext(searchData, 'lib/app.js::method::listen::L20');

  assert(ctx.isActive === true, 'Must be active');
  assert(ctx.primaryNodeIds.has('lib/app.js::method::listen::L20'), 'Primary must contain seed');
  assert(ctx.relatedNodeIds.has('lib/server.js::function::createServer::L5'), 'Related must contain expanded');
  assert(!ctx.relatedNodeIds.has('lib/app.js::method::listen::L20'), 'Seed must not be in related');
  assert(ctx.focusedNodeId === 'lib/app.js::method::listen::L20', 'Focused node id must match');
  assert(ctx.relevantEdgeKeys.has('CALLS:lib/app.js::method::listen::L20->lib/server.js::function::createServer::L5'), 'Must index edge key');
});

console.log('\n[Test Group 3: buildNodeStyle Highlights]');
it('Applies high-contrast pink glow for primary matches', () => {
  const { style, zIndex } = buildNodeStyle('method', false, false, {
    isPrimary: true,
    isRelated: false,
    isFocused: false,
    isSearchActive: true,
  });

  assert.strictEqual(style.border, '3px solid #ec4899');
  assert.strictEqual(style.background, '#fdf2f8');
  assert(style.boxShadow.includes('rgba(236, 72, 153'), 'Must have pink glow shadow');
  assert.strictEqual(style.opacity, 1);
  assert.strictEqual(zIndex, 15);
});

it('Applies cyan/blue glow for related symbols', () => {
  const { style, zIndex } = buildNodeStyle('function', false, false, {
    isPrimary: false,
    isRelated: true,
    isFocused: false,
    isSearchActive: true,
  });

  assert.strictEqual(style.border, '2.5px solid #0284c7');
  assert.strictEqual(style.background, '#f0f9ff');
  assert(style.boxShadow.includes('rgba(2, 132, 199'), 'Must have blue glow shadow');
  assert.strictEqual(style.opacity, 1);
  assert.strictEqual(zIndex, 10);
});

it('De-emphasizes unrelated nodes when search is active', () => {
  const { style, zIndex } = buildNodeStyle('file', false, false, {
    isPrimary: false,
    isRelated: false,
    isFocused: false,
    isSearchActive: true,
  });

  assert.strictEqual(style.opacity, 0.35);
  assert.strictEqual(zIndex, 1);
});

it('Applies amber outline for focused target', () => {
  const { style, zIndex } = buildNodeStyle('method', false, false, {
    isPrimary: true,
    isRelated: false,
    isFocused: true,
    isSearchActive: true,
  });

  assert.strictEqual(style.outline, '3px solid #f59e0b');
  assert.strictEqual(zIndex, 25);
});

console.log('\n---------------------------------------------------------------');
console.log(`  Tests Passed: ${passed} / ${passed + failed}`);
console.log('---------------------------------------------------------------');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✓ All Phase 4.5 Graph Highlighting criteria passed successfully!\n');
}
