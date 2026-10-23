/**
 * Phase 4.6: Deterministic citation validation.
 *
 * The LLM may only cite server-assigned IDs (S1..Sn). Every marker and ID it returns is
 * checked against the allowlist built from the retrieved context. Invalid citations are
 * reported explicitly and are never remapped to a different, valid-looking reference.
 */

// Line ranges accept ASCII and Unicode dash variants (models sometimes emit U+2011 / U+2013);
// the parsed range is still validated against the evidence like any other.
// Matches a bracket group of one or more markers: [S1], [S2:10-14], [S1, S3:7].
// Parenthesized (S1:574) and full-width 【S1】 groups are treated the same so they cannot bypass validation.
const MARKER_GROUP_PATTERN = /[[(【]\s*(S\d+(?::\d+(?:\s*[-\u2010-\u2015\u2212]\s*\d+)?)?(?:\s*[,;]\s*S\d+(?::\d+(?:\s*[-\u2010-\u2015\u2212]\s*\d+)?)?)*)\s*[\])\u3011]/g;
const SINGLE_MARKER_PATTERN = /^S(\d+)(?::(\d+)(?:\s*[-\u2010-\u2015\u2212]\s*(\d+))?)?$/;
const UNGROUPED_RANGED_PATTERN = /\bS\d+:\d+(?:\s*[-\u2010-\u2015\u2212]\s*\d+)?/g;
// Bracketed tokens that look like an attempted citation but are not in the allowed format.
const SUSPICIOUS_MARKER_PATTERN = /\[\s*((?:S\d+[^\]]*)|(?:[\w./-]+\.(?:js|jsx|ts|tsx|py|mjs|cjs)(?::\d+(?:-\d+)?)?))\s*\]/g;

/**
 * Builds the allowlist of citable evidence.
 *
 * @param {Array<Object>} citations - Citation entries from buildQaPrompt
 * @returns {Map<string, Object>} citation ID -> citation entry
 */
export function buildCitationAllowlist(citations = []) {
  const allowlist = new Map();
  for (const c of citations) {
    if (c?.id && c.symbol_id && c.file) allowlist.set(c.id, c);
  }
  return allowlist;
}

/**
 * Parses one marker token (e.g. "S2:10-14") and validates it against the allowlist.
 *
 * @returns {{ valid: true, id: string, start_line: number|null, end_line: number|null, ranged: boolean } | { valid: false, reason: string }}
 */
export function resolveMarker(token, allowlist) {
  const match = SINGLE_MARKER_PATTERN.exec(String(token).trim());
  if (!match) return { valid: false, reason: 'unrecognized_format' };

  const id = `S${match[1]}`;
  const citation = allowlist.get(id);
  if (!citation) return { valid: false, reason: 'unknown_citation_id' };

  if (match[2] === undefined) {
    return { valid: true, id, start_line: citation.start_line, end_line: citation.end_line, ranged: false };
  }

  const start = parseInt(match[2], 10);
  const end = match[3] !== undefined ? parseInt(match[3], 10) : start;
  if (end < start) return { valid: false, reason: 'invalid_line_range' };
  if (!citation.start_line || !citation.end_line) {
    return { valid: false, reason: 'line_range_unavailable_for_symbol' };
  }
  if (start < citation.start_line || end > citation.end_line) {
    return { valid: false, reason: 'line_range_outside_retrieved_evidence' };
  }
  return { valid: true, id, start_line: start, end_line: end, ranged: true };
}

/**
 * Extracts all marker tokens in order of appearance.
 */
export function extractMarkers(answerText = '') {
  const tokens = [];
  for (const m of String(answerText).matchAll(MARKER_GROUP_PATTERN)) {
    m[1].split(/\s*[,;]\s*/).forEach((t) => tokens.push(t.trim()));
  }
  return tokens;
}

function toReference(citation) {
  return {
    id: citation.id,
    symbol_id: citation.symbol_id,
    name: citation.name,
    type: citation.type,
    file: citation.file,
    start_line: citation.start_line,
    end_line: citation.end_line,
    role: citation.role,
  };
}

/**
 * Validates the structured LLM output and resolves citations to canonical references.
 *
 * @param {Object} llmData - Parsed JSON returned by the model
 * @param {Map<string, Object>} allowlist - From buildCitationAllowlist
 * @returns {{ ok: true, result: Object } | { ok: false, reason: string }}
 */
export function validateQaResponse(llmData, allowlist) {
  if (!llmData || typeof llmData !== 'object' || Array.isArray(llmData)) {
    return { ok: false, reason: 'Response is not a JSON object.' };
  }
  if (typeof llmData.answer !== 'string' || !llmData.answer.trim()) {
    return { ok: false, reason: 'Response is missing a non-empty "answer" string.' };
  }

  const warnings = [];
  const asIdList = (value, field) => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      warnings.push(`"${field}" was not a list and was ignored.`);
      return [];
    }
    return value.filter((v) => typeof v === 'string').map((v) => v.trim());
  };

  const answer = llmData.answer.trim();
  const citedIds = asIdList(llmData.cited_ids, 'cited_ids');
  const relatedIds = asIdList(llmData.related_ids, 'related_ids');
  const insufficient = llmData.insufficient_context === true;
  const limitations =
    typeof llmData.limitations === 'string' && llmData.limitations.trim() ? llmData.limitations.trim() : null;

  const invalid = [];
  const invalidSeen = new Set();
  const addInvalid = (marker, reason, location) => {
    const key = `${location}:${marker}`;
    if (invalidSeen.has(key)) return;
    invalidSeen.add(key);
    invalid.push({ marker, reason, location });
  };

  // 1. Inline markers, in order of appearance.
  const orderedIds = [];
  const lineCitations = {};
  for (const token of extractMarkers(answer)) {
    const res = resolveMarker(token, allowlist);
    if (!res.valid) {
      addInvalid(token, res.reason, 'answer');
      continue;
    }
    if (!orderedIds.includes(res.id)) orderedIds.push(res.id);
    if (res.ranged) {
      lineCitations[token] = { id: res.id, start_line: res.start_line, end_line: res.end_line };
    }
  }

  // 2. Bracketed tokens that look like citations but do not match the allowed format
  //    (e.g. raw file paths or malformed IDs) are flagged, not resolved.
  const validTokens = new Set(extractMarkers(answer));
  for (const m of answer.matchAll(SUSPICIOUS_MARKER_PATTERN)) {
    const raw = m[1].trim();
    const parts = raw.split(/\s*[,;]\s*/);
    if (parts.every((p) => validTokens.has(p) || resolveMarker(p, allowlist).valid)) continue;
    if (parts.every((p) => SINGLE_MARKER_PATTERN.test(p))) continue; // already reported above
    addInvalid(raw, 'unrecognized_format', 'answer');
  }

  // Line-ranged IDs written outside any recognized group (e.g. "see S3:10-12") are
  // distinctive enough to be attempted citations; report them instead of ignoring them.
  const ungrouped = answer.replace(MARKER_GROUP_PATTERN, ' ').replace(SUSPICIOUS_MARKER_PATTERN, ' ');
  for (const m of ungrouped.matchAll(UNGROUPED_RANGED_PATTERN)) {
    addInvalid(m[0], 'unbracketed_citation', 'answer');
  }

  // 3. cited_ids list (whole-symbol IDs only).
  for (const id of citedIds) {
    const res = resolveMarker(id, allowlist);
    if (!res.valid) {
      addInvalid(id, res.reason, 'cited_ids');
      continue;
    }
    if (!orderedIds.includes(res.id)) orderedIds.push(res.id);
  }

  // 4. related_ids -> canonical graph symbol IDs.
  const relatedSymbolIds = [];
  for (const id of relatedIds) {
    const res = resolveMarker(id, allowlist);
    if (!res.valid) {
      addInvalid(id, res.reason, 'related_ids');
      continue;
    }
    const symId = allowlist.get(res.id).symbol_id;
    if (!relatedSymbolIds.includes(symId)) relatedSymbolIds.push(symId);
  }

  const citations = orderedIds.map((id) => toReference(allowlist.get(id)));

  if (citations.length === 0 && !insufficient) {
    warnings.push('The answer contains no verifiable citations; treat it as unverified.');
  }
  if (invalid.length > 0) {
    warnings.push(`${invalid.length} citation(s) could not be verified against the retrieved evidence.`);
  }

  return {
    ok: true,
    result: {
      answer,
      citations,
      line_citations: lineCitations,
      related_symbol_ids: relatedSymbolIds,
      insufficient_context: insufficient,
      limitations,
      invalid_citations: invalid,
      warnings,
    },
  };
}
