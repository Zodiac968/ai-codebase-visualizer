/**
 * Supported symbol types for embedding document generation.
 */
const SUPPORTED_TYPES = new Set(['class', 'method', 'function', 'interface', 'type']);

/**
 * Resolves a relationship target to a human-readable name.
 */
function resolveReadableTargetName(rel, symbolsById) {
  if (rel.target_symbol_id && symbolsById.has(rel.target_symbol_id)) {
    const targetSym = symbolsById.get(rel.target_symbol_id);
    if (targetSym.class_name && targetSym.name) {
      return `${targetSym.class_name}.${targetSym.name}`;
    }
    return targetSym.name || rel.target;
  }
  if (rel.target) {
    const parts = rel.target.split('/');
    return parts[parts.length - 1] || rel.target;
  }
  return rel.target_symbol_id || 'unknown';
}

/**
 * Builds the text content of the embedding document with strict field omission.
 * Any missing or empty field is omitted entirely from the generated string.
 */
function formatEmbeddingContent({
  name,
  type,
  language,
  file,
  className,
  purpose,
  signature,
  source,
  callsNames,
  importsNames,
  inheritsNames,
  implementsNames,
}) {
  const parts = [];

  if (name) parts.push(`Symbol: ${name}`);
  if (type) parts.push(`Type: ${type}`);
  if (language) parts.push(`Language: ${language}`);
  if (file) parts.push(`File: ${file}`);
  if (className) parts.push(`Class: ${className}`);

  if (purpose && purpose.trim()) {
    parts.push(`Purpose:\n${purpose.trim()}`);
  }

  if (signature && signature.trim()) {
    parts.push(`Signature:\n${signature.trim()}`);
  }

  if (source && source.trim()) {
    parts.push(`Source:\n${source.trim()}`);
  }

  if (callsNames && callsNames.length > 0) {
    parts.push(`Calls:\n${callsNames.join(', ')}`);
  }

  if (importsNames && importsNames.length > 0) {
    parts.push(`Imports:\n${importsNames.join(', ')}`);
  }

  if (inheritsNames && inheritsNames.length > 0) {
    parts.push(`Inherits:\n${inheritsNames.join(', ')}`);
  }

  if (implementsNames && implementsNames.length > 0) {
    parts.push(`Implements:\n${implementsNames.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Generates symbol embedding documents from pre-computed symbols and relationships.
 * 
 * @param {Array} symbols - Extracted symbols from repository analysis
 * @param {Array|Object} relationshipsData - Resolved relationships
 * @returns {Array<{ symbol_id: string, content: string, metadata: Object }>}
 */
export function generateEmbeddingDocuments(symbols = [], relationshipsData = []) {
  const rawRelationships = Array.isArray(relationshipsData)
    ? relationshipsData
    : relationshipsData?.relationships || [];

  // Index symbols by canonical ID
  const symbolsById = new Map();
  for (const sym of symbols) {
    if (sym && sym.id) {
      symbolsById.set(sym.id, sym);
    }
  }

  // Index outgoing relationships by multiple key formats for robust matching
  const relsBySource = new Map();
  for (const rel of rawRelationships) {
    if (!rel || !rel.source) continue;
    const key = rel.source;
    if (!relsBySource.has(key)) {
      relsBySource.set(key, []);
    }
    relsBySource.get(key).push(rel);
  }

  const embeddingDocuments = [];

  for (const sym of symbols) {
    if (!sym || !SUPPORTED_TYPES.has(sym.type)) {
      continue;
    }

    // Collect all outgoing relationships for this symbol
    const candidateKeys = [
      sym.id,
      `${sym.file}:${sym.class_name ? sym.class_name + '.' + sym.name : sym.name}`,
    ];
    if (sym.type === 'class') {
      candidateKeys.push(`${sym.file}:${sym.name}`);
    }

    const matchedRels = [];
    const seenRelKeys = new Set();
    for (const key of candidateKeys) {
      const rels = relsBySource.get(key) || [];
      for (const r of rels) {
        const dedupeKey = `${r.type}:${r.target}:${r.target_symbol_id}`;
        if (!seenRelKeys.has(dedupeKey)) {
          seenRelKeys.add(dedupeKey);
          matchedRels.push(r);
        }
      }
    }

    // Group relationships by type
    const structuredCalls = [];
    const structuredImports = [];
    const structuredInherits = [];
    const structuredImplements = [];

    const callsNamesSet = new Set();
    const importsNamesSet = new Set();
    const inheritsNamesSet = new Set();
    const implementsNamesSet = new Set();

    for (const rel of matchedRels) {
      const readableName = resolveReadableTargetName(rel, symbolsById);
      const targetId = rel.target_symbol_id || rel.target;

      switch (rel.type) {
        case 'CALLS':
          structuredCalls.push({ id: targetId, name: readableName });
          callsNamesSet.add(readableName);
          break;
        case 'IMPORTS':
          structuredImports.push({ id: targetId, name: readableName });
          importsNamesSet.add(readableName);
          break;
        case 'INHERITS':
          structuredInherits.push({ id: targetId, name: readableName });
          inheritsNamesSet.add(readableName);
          break;
        case 'IMPLEMENTS':
          structuredImplements.push({ id: targetId, name: readableName });
          implementsNamesSet.add(readableName);
          break;
        default:
          break;
      }
    }

    // Format content with strict omission
    const content = formatEmbeddingContent({
      name: sym.name,
      type: sym.type,
      language: sym.language,
      file: sym.file,
      className: sym.class_name || null,
      purpose: sym.purpose || null,
      signature: sym.signature || null,
      source: sym.source || null,
      callsNames: Array.from(callsNamesSet),
      importsNames: Array.from(importsNamesSet),
      inheritsNames: Array.from(inheritsNamesSet),
      implementsNames: Array.from(implementsNamesSet),
    });

    const metadata = {
      name: sym.name,
      type: sym.type,
      language: sym.language,
      file: sym.file,
      start_line: sym.start_line,
      end_line: sym.end_line,
    };

    if (sym.class_name) {
      metadata.class = sym.class_name;
    }

    if (structuredCalls.length > 0) metadata.calls = structuredCalls;
    if (structuredImports.length > 0) metadata.imports = structuredImports;
    if (structuredInherits.length > 0) metadata.inherits = structuredInherits;
    if (structuredImplements.length > 0) metadata.implements = structuredImplements;

    embeddingDocuments.push({
      symbol_id: sym.id,
      content,
      metadata,
    });
  }

  return embeddingDocuments;
}
