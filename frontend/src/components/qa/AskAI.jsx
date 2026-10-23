import React, { useState, useEffect, useRef } from "react";
import "../search/HybridSearch.css";
import "./AskAI.css";

const STAGE_LABELS = {
  request: "Request error",
  retrieval: "Retrieval error",
  generation: "AI generation error",
};

// Matches inline code spans, bracketed citation groups such as [S1], [S2:10-14], [S1, S3],
// and strictly formed parenthesized / full-width groups such as (S1:574) or 【S1】,
// mirroring the backend validator. Also **bold** and *italic* emphasis.
const INLINE_TOKEN_PATTERN =
  /(`[^`\n]+`)|(\[\s*S\d+[^\]\n]*\])|([(【]\s*S\d+(?::\d+(?:\s*\p{Pd}\s*\d+)?)?(?:\s*[,;]\s*S\d+(?::\d+(?:\s*\p{Pd}\s*\d+)?)?)*\s*[)】])|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)/gu;

/**
 * AskAI Component (Phase 4.6)
 *
 * Retrieval-augmented Q&A panel. Questions are answered by the backend from retrieved
 * repository source; citation markers in the answer are resolved only through the
 * server-validated citation list and open the existing CodeViewer.
 *
 * @param {Object} props
 * @param {string} props.repoId - Current repository identifier
 * @param {Function} props.onSelectSymbol - Opens the CodeViewer for a symbol
 * @param {Function} props.onClose - Closes the panel
 * @param {Function} [props.onVisualizeInGraph] - Phase 4.5 graph reveal + highlight
 * @param {Function} [props.onFocusNode] - Phase 4.5 graph focus
 * @param {Function} [props.onClearGraphHighlight] - Phase 4.5 highlight clear
 * @param {boolean} [props.isGraphHighlighted=false] - Whether graph highlight is active
 */
export default function AskAI({
  repoId,
  onSelectSymbol,
  onClose,
  onVisualizeInGraph,
  onFocusNode,
  onClearGraphHighlight,
  isGraphHighlighted = false,
}) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const requestSeqRef = useRef(0);
  const abortRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    const requestSeq = requestSeqRef;
    const abortHolder = abortRef;
    return () => {
      // Panel closed or repository switched: drop any in-flight answer.
      requestSeq.current++;
      if (abortHolder.current) abortHolder.current.abort();
    };
  }, []);

  const askQuestion = async () => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || !repoId || loading) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeqRef.current;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/repositories/${repoId}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion }),
        signal: controller.signal,
      });

      let resData = null;
      try {
        resData = await response.json();
      } catch {
        resData = null;
      }
      if (seq !== requestSeqRef.current) return;

      if (!response.ok || !resData?.success) {
        setError({
          message: resData?.error || `Request failed with status ${response.status}.`,
          stage: resData?.stage || null,
        });
        return;
      }
      setResult(resData.data);
    } catch (err) {
      if (err.name === "AbortError" || seq !== requestSeqRef.current) return;
      console.error("Q&A request error:", err);
      setError({ message: "Could not reach the server. Ensure the backend is running.", stage: null });
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    askQuestion();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askQuestion();
    }
  };

  const citationsById = new Map((result?.citations || []).map((c) => [c.id, c]));
  const invalidByMarker = new Map(
    (result?.invalid_citations || []).map((inv) => [inv.marker, inv.reason])
  );

  const openReference = (citation, range = null) => {
    if (!onSelectSymbol || !citation) return;
    onSelectSymbol({
      id: citation.symbol_id,
      name: citation.name,
      type: citation.type,
      path: citation.file,
      startLine: range?.start_line || citation.start_line,
      endLine: range?.end_line || citation.end_line,
    });
  };

  const handleFocusClick = (e, citation) => {
    e.stopPropagation();
    if (onFocusNode) onFocusNode(citation.symbol_id);
    openReference(citation);
  };

  const handleHighlightToggle = () => {
    if (isGraphHighlighted) {
      if (onClearGraphHighlight) onClearGraphHighlight();
      return;
    }
    if (!onVisualizeInGraph || !result) return;
    const citedIds = new Set(result.citations.map((c) => c.symbol_id));
    onVisualizeInGraph({
      seeds: result.citations.map((c) => ({ symbol_id: c.symbol_id })),
      expanded_symbols: result.related_symbol_ids
        .filter((id) => !citedIds.has(id))
        .map((id) => ({ symbol_id: id })),
      relationships: result.relationships || [],
    });
  };

  const renderCitationChip = (token, key) => {
    const ranged = result.line_citations?.[token];
    const citation = ranged ? citationsById.get(ranged.id) : citationsById.get(token);

    if (!citation) {
      const reason = invalidByMarker.get(token) || "not_verified";
      return (
        <span
          key={key}
          className="qa-cite-chip qa-cite-invalid"
          title={`Unverified citation (${reason.replace(/_/g, " ")})`}
        >
          {token}?
        </span>
      );
    }

    const lines = ranged
      ? `L${ranged.start_line}${ranged.end_line !== ranged.start_line ? `-${ranged.end_line}` : ""}`
      : citation.start_line
        ? `L${citation.start_line}`
        : "";

    return (
      <button
        key={key}
        type="button"
        className="qa-cite-chip"
        onClick={() => openReference(citation, ranged)}
        title={`${citation.type} ${citation.name} — ${citation.file}${lines ? `:${lines}` : ""}`}
      >
        {ranged ? token : citation.id}
      </button>
    );
  };

  const renderInline = (text, keyPrefix) => {
    const nodes = [];
    let lastIndex = 0;
    let idx = 0;
    for (const match of text.matchAll(INLINE_TOKEN_PATTERN)) {
      if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
      if (match[1]) {
        nodes.push(
          <code key={`${keyPrefix}-c${idx++}`} className="qa-inline-code">
            {match[1].slice(1, -1)}
          </code>
        );
      } else if (match[4]) {
        nodes.push(<strong key={`${keyPrefix}-s${idx++}`}>{renderInline(match[4].slice(2, -2), `${keyPrefix}-s${idx}`)}</strong>);
      } else if (match[5]) {
        nodes.push(<em key={`${keyPrefix}-e${idx++}`}>{renderInline(match[5].slice(1, -1), `${keyPrefix}-e${idx}`)}</em>);
      } else {
        const group = match[2] || match[3];
        const tokens = group.slice(1, -1).split(/\s*[,;]\s*/).map((t) => t.trim());
        tokens.forEach((token) => nodes.push(renderCitationChip(token, `${keyPrefix}-r${idx++}`)));
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
  };

  const renderAnswer = (answer) => {
    const blocks = answer.split(/\n\s*\n/);
    return blocks.map((block, bIdx) => {
      const lines = block.split("\n").filter((l) => l.trim());
      const isList = lines.length > 0 && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
      if (isList) {
        const ordered = /^\s*\d+[.)]/.test(lines[0]);
        const ListTag = ordered ? "ol" : "ul";
        return (
          <ListTag key={`b${bIdx}`} className="qa-answer-list">
            {lines.map((l, lIdx) => (
              <li key={lIdx}>{renderInline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `b${bIdx}l${lIdx}`)}</li>
            ))}
          </ListTag>
        );
      }
      return (
        <p key={`b${bIdx}`} className="qa-answer-paragraph">
          {lines.map((l, lIdx) => (
            <React.Fragment key={lIdx}>
              {lIdx > 0 && <br />}
              {renderInline(l, `b${bIdx}l${lIdx}`)}
            </React.Fragment>
          ))}
        </p>
      );
    });
  };

  const getTypeClass = (type) => {
    switch (type) {
      case "method":
        return "hybrid-type-method";
      case "function":
        return "hybrid-type-function";
      case "class":
        return "hybrid-type-class";
      default:
        return "hybrid-type-other";
    }
  };

  return (
    <aside className="hybrid-search-overlay" aria-label="Ask AI about this repository">
      {/* Header */}
      <div className="hybrid-search-header">
        <div className="hybrid-header-title-row">
          <div className="hybrid-search-title">
            <span>💬 Ask AI</span>
            <span className="hybrid-algo-badge">Grounded Q&A</span>
          </div>
          <button
            className="hybrid-close-btn"
            onClick={onClose}
            title="Close Ask AI Panel"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className="qa-form" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            className="hybrid-search-input qa-textarea"
            placeholder="Ask about this codebase, e.g. How are errors handled?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={1000}
            rows={3}
            disabled={loading}
          />
          <div className="qa-form-footer">
            <span className="qa-hint">Enter to ask • Shift+Enter for a new line</span>
            <button
              type="submit"
              className="hybrid-search-btn"
              disabled={loading || question.trim().length < 3}
            >
              {loading ? (
                <>
                  <span className="hybrid-spinner" /> Thinking...
                </>
              ) : (
                "Ask"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Stats Bar */}
      {result && (
        <div className="hybrid-stats-bar">
          <span>
            {result.retrieval.total_symbols} symbols retrieved • {result.citations.length} cited
          </span>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {result.retrieval.truncated && (
              <span className="context-truncated-pill" title="Some matching symbols were left out to fit the context budget">
                ⚠ Capped
              </span>
            )}
            <span className="context-token-pill" title={result.model || "No model call needed"}>
              {(result.timings_ms.total / 1000).toFixed(1)}s
            </span>
          </div>
        </div>
      )}

      {/* Highlight in Graph Action Bar */}
      {result && result.citations.length > 0 && (
        <div className="visualize-action-bar">
          <button
            className={`btn-visualize-graph ${isGraphHighlighted ? "active" : ""}`}
            onClick={handleHighlightToggle}
            title={
              isGraphHighlighted
                ? "Clear graph highlighting and restore view"
                : "Reveal and highlight the referenced symbols in the graph"
            }
          >
            {isGraphHighlighted ? "✕ Clear Graph Highlight" : "🕸️ Highlight References in Graph"}
          </button>
        </div>
      )}

      <div className="hybrid-results-scroll">
        {error && (
          <div className="hybrid-error-box">
            <div className="hybrid-error-msg">
              ⚠ {error.stage ? `${STAGE_LABELS[error.stage] || "Error"}: ` : ""}
              {error.message}
            </div>
          </div>
        )}

        {loading && (
          <div className="hybrid-empty-box">
            <div className="hybrid-empty-icon">🔎</div>
            <div className="hybrid-empty-text">Retrieving code and generating answer...</div>
            <div className="hybrid-empty-sub">
              Hybrid search → graph expansion → source retrieval → grounded answer.
            </div>
          </div>
        )}

        {!loading && !result && !error && (
          <div className="hybrid-empty-box">
            <div className="hybrid-empty-icon">💬</div>
            <div className="hybrid-empty-text">Ask a question about this repository</div>
            <div className="hybrid-empty-sub">
              Answers are generated only from retrieved source code. Click a citation to open
              the exact lines in the code viewer.
            </div>
          </div>
        )}

        {result && (
          <>
            {result.insufficient_context && (
              <div className="qa-notice qa-notice-warning">
                <strong>Limited evidence.</strong> The retrieved code was not enough to fully
                answer this question; treat the answer as partial.
              </div>
            )}
            {!result.retrieval.semantic_available && (
              <div className="qa-notice">
                Semantic vectors are not generated for this repository, so retrieval used
                lexical search only.
              </div>
            )}
            {result.warnings?.map((w, i) => (
              <div key={i} className="qa-notice qa-notice-warning">
                {w}
              </div>
            ))}

            <div className="qa-answer-card">{renderAnswer(result.answer)}</div>

            {result.limitations && (
              <div className="qa-limitations">
                <strong>Limitations:</strong> {result.limitations}
              </div>
            )}

            {result.citations.length > 0 && (
              <>
                <div className="context-section-header" style={{ marginTop: "12px" }}>
                  <span>📎 References ({result.citations.length})</span>
                </div>
                {result.citations.map((c) => (
                  <div
                    key={c.id}
                    className="hybrid-result-card"
                    onClick={() => openReference(c)}
                    title="Click to view code in CodeViewer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openReference(c);
                    }}
                  >
                    <div className="hybrid-card-top">
                      <div className="hybrid-symbol-title">
                        <span className="qa-cite-chip qa-cite-static">{c.id}</span>
                        <span className={`hybrid-type-pill ${getTypeClass(c.type)}`}>
                          {c.type || "symbol"}
                        </span>
                        <span className="hybrid-symbol-name" title={c.name}>
                          {c.name}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button
                          className="btn-focus-node"
                          onClick={(e) => handleFocusClick(e, c)}
                          title="Focus node in graph"
                        >
                          🎯 Focus
                        </button>
                        <span className={c.role === "primary" ? "score-badge badge-rrf" : "badge-distance"}>
                          {c.role === "primary" ? "Primary" : "Supporting"}
                        </span>
                      </div>
                    </div>
                    <div className="hybrid-card-loc">
                      <span>{c.file}</span>
                      {c.start_line && (
                        <span>
                          :L{c.start_line}
                          {c.end_line && c.end_line > c.start_line ? `-L${c.end_line}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {result.invalid_citations?.length > 0 && (
              <details className="qa-invalid-details">
                <summary>
                  {result.invalid_citations.length} unverified citation
                  {result.invalid_citations.length === 1 ? "" : "s"}
                </summary>
                <ul>
                  {result.invalid_citations.map((inv, i) => (
                    <li key={i}>
                      <code>{inv.marker}</code> in {inv.location}: {inv.reason.replace(/_/g, " ")}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {result.model && (
              <div className="qa-meta">
                Model: {result.model} • retrieval{" "}
                {result.timings_ms.hybrid_retrieval + result.timings_ms.expansion_and_context}ms •
                generation {result.timings_ms.llm_inference}ms
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
