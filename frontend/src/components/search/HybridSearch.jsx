import React, { useState, useEffect, useRef } from "react";
import "./HybridSearch.css";

/**
 * HybridSearch Component
 * 
 * Provides an interactive search and graph-expansion panel combining:
 * 1. Hybrid Retrieval (Lexical + Semantic + RRF)
 * 2. Graph Expansion & Context Retrieval (CALLS, INHERITS, IMPORTS, CONTAINS)
 * 3. Feature Search Graph Highlighting & Camera Navigation (Phase 4.5)
 * 
 * @param {Object} props
 * @param {string} props.repoId - Current repository identifier
 * @param {Function} props.onSelectSymbol - Callback when a search or context symbol is clicked
 * @param {Function} props.onClose - Callback to close the search panel
 * @param {Function} [props.onVisualizeInGraph] - Callback to trigger graph ancestor reveal and highlighting
 * @param {Function} [props.onFocusNode] - Callback to focus the graph viewport on a specific symbol node
 * @param {Function} [props.onClearGraphHighlight] - Callback to clear graph highlights
 * @param {boolean} [props.isGraphHighlighted=false] - Whether graph highlight is currently active
 */
export default function HybridSearch({
  repoId,
  onSelectSymbol,
  onClose,
  onVisualizeInGraph,
  onFocusNode,
  onClearGraphHighlight,
  isGraphHighlighted = false,
  activeHighlightId = null,
}) {
  const [activeTab, setActiveTab] = useState("context"); // Default to context for feature search
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Hybrid Search Results
  const [results, setResults] = useState([]);
  const [hybridStats, setHybridStats] = useState(null);

  // Context Package Results
  const [contextPackage, setContextPackage] = useState(null);

  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const executeSearch = async (targetTab, targetQuery) => {
    const cleanQuery = (targetQuery !== undefined ? targetQuery : query).trim();
    if (!cleanQuery || !repoId) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      if (targetTab === "context") {
        // Fetch Graph Context Package
        const response = await fetch(`/api/repositories/${repoId}/search/context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: cleanQuery,
            seedLimit: 5,
            maxDepth: 1,
            maxExpandedNodes: 12,
            maxContextTokens: 12000,
          }),
        });

        const resData = await response.json();
        if (!response.ok || !resData.success) {
          throw new Error(resData.error || "Context retrieval failed.");
        }
        setContextPackage(resData.data);
      } else {
        // Fetch Hybrid Search Results
        const response = await fetch(`/api/repositories/${repoId}/search/hybrid`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: cleanQuery,
            limit: 10,
          }),
        });

        const resData = await response.json();
        if (!response.ok || !resData.success) {
          throw new Error(resData.error || "Hybrid search failed.");
        }

        setResults(resData.data?.results || []);
        setHybridStats({
          lexicalCandidates: resData.data?.total_lexical_candidates || 0,
          semanticCandidates: resData.data?.total_semantic_candidates || 0,
          totalReturned: resData.data?.results?.length || 0,
        });
      }
    } catch (err) {
      console.error("Search request error:", err);
      setError(err.message || "Failed to execute search. Ensure vectors are generated.");
      if (targetTab === "context") setContextPackage(null);
      else setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    executeSearch(activeTab, query);
  };

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setError(null);
    if (query.trim()) {
      if (tab === "context" && !contextPackage) {
        executeSearch("context", query);
      } else if (tab === "hybrid" && results.length === 0) {
        executeSearch("hybrid", query);
      }
    }
  };

  const handleCardClick = (item) => {
    if (onSelectSymbol) {
      onSelectSymbol({
        id: item.symbol_id,
        name: item.name,
        type: item.type,
        path: item.file,
        startLine: item.start_line,
        endLine: item.end_line,
      });
    }
  };

  const handleHighlightItem = (e, item) => {
    e.stopPropagation();
    if (activeHighlightId === item.symbol_id) {
      if (onClearGraphHighlight) onClearGraphHighlight();
      return;
    }

    if (!onVisualizeInGraph) return;

    if (activeTab === "context" && contextPackage) {
      const symId = item.symbol_id;
      // Filter relationships connected directly to this selected item
      const itemRels = (contextPackage.relationships || []).filter(
        (rel) => rel.source === symId || rel.target === symId
      );

      // Collect connected 1-hop symbols
      const connectedIds = new Set();
      itemRels.forEach((rel) => {
        if (rel.source === symId && rel.target) connectedIds.add(rel.target);
        if (rel.target === symId && rel.source) connectedIds.add(rel.source);
      });

      const relatedSymbols = (contextPackage.expanded_symbols || []).filter((s) =>
        connectedIds.has(s.symbol_id)
      );

      onVisualizeInGraph({
        seeds: [item],
        expanded_symbols: relatedSymbols,
        relationships: itemRels,
        focusedNodeId: symId,
      });
    } else {
      // For hybrid search tab
      onVisualizeInGraph({
        seeds: [item],
        expanded_symbols: [],
        relationships: [],
        focusedNodeId: item.symbol_id,
      });
    }
  };

  const handleFocusClick = (e, item) => {
    e.stopPropagation();
    if (onFocusNode) {
      onFocusNode(item.symbol_id);
    }
    handleCardClick(item);
  };

  const handleVisualizeToggle = () => {
    if (isGraphHighlighted) {
      if (onClearGraphHighlight) onClearGraphHighlight();
    } else {
      if (onVisualizeInGraph) {
        const dataToVisualize =
          activeTab === "context"
            ? contextPackage
            : { seeds: results, expanded_symbols: [], relationships: [] };
        if (dataToVisualize) {
          onVisualizeInGraph(dataToVisualize);
        }
      }
    }
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
    <aside className="hybrid-search-overlay" aria-label="Hybrid Codebase Search">
      {/* Header */}
      <div className="hybrid-search-header">
        <div className="hybrid-header-title-row">
          <div className="hybrid-search-title">
            <span>⚡ AI Code Retrieval</span>
            <span className="hybrid-algo-badge">
              {activeTab === "hybrid" ? "RRF Hybrid" : "Graph Expansion"}
            </span>
          </div>
          <button
            className="hybrid-close-btn"
            onClick={onClose}
            title="Close Search Panel"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Search Input Form */}
        <form className="hybrid-search-form" onSubmit={handleSearchSubmit}>
          <div className="hybrid-search-input-wrap">
            <input
              ref={inputRef}
              type="text"
              className="hybrid-search-input"
              placeholder={
                activeTab === "context"
                  ? "Where is authentication, render, etc..."
                  : "Search symbols (e.g. app.listen, compileETag)..."
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            className="hybrid-search-btn"
            disabled={loading || !query.trim()}
          >
            {loading ? (
              <>
                <span className="hybrid-spinner" /> Searching...
              </>
            ) : (
              "Search"
            )}
          </button>
        </form>
      </div>

      {/* Mode Navigation Tabs */}
      <div className="hybrid-tabs-row">
        <button
          className={`hybrid-tab-btn ${activeTab === "context" ? "active" : ""}`}
          onClick={() => handleTabSwitch("context")}
        >
          🕸️ Graph Context
        </button>
        <button
          className={`hybrid-tab-btn ${activeTab === "hybrid" ? "active" : ""}`}
          onClick={() => handleTabSwitch("hybrid")}
        >
          ⚡ Hybrid Results
        </button>
      </div>

      {/* Stats Bar */}
      {activeTab === "hybrid" && hybridStats && (
        <div className="hybrid-stats-bar">
          <span>{hybridStats.totalReturned} Results</span>
          <span>
            {hybridStats.lexicalCandidates} Lexical • {hybridStats.semanticCandidates} Semantic
          </span>
        </div>
      )}

      {activeTab === "context" && contextPackage?.statistics && (
        <div className="hybrid-stats-bar">
          <span>
            {contextPackage.statistics.seed_count} Seeds • {contextPackage.statistics.expanded_count} Expanded
          </span>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span className="context-token-pill">
              ~{contextPackage.statistics.context_token_estimate.toLocaleString()} /{" "}
              {contextPackage.statistics.budget_tokens.toLocaleString()} tokens
            </span>
            {contextPackage.statistics.truncated && (
              <span className="context-truncated-pill">⚠ Capped</span>
            )}
          </div>
        </div>
      )}

      {/* Visualize in Graph Action Bar */}
      {((activeTab === "context" && contextPackage?.seeds?.length > 0) ||
        (activeTab === "hybrid" && results.length > 0)) && (
        <div className="visualize-action-bar">
          <button
            className={`btn-visualize-graph ${isGraphHighlighted ? "active" : ""}`}
            onClick={handleVisualizeToggle}
            title={
              isGraphHighlighted
                ? "Clear graph highlighting and restore view"
                : "Reveal and highlight all matching symbols and their relationships"
            }
          >
            {isGraphHighlighted ? "✕ Clear Graph Highlight" : "🕸️ Highlight All Matches"}
          </button>
        </div>
      )}

      {/* Results Scroll Area */}
      <div className="hybrid-results-scroll">
        {error && (
          <div className="hybrid-error-box">
            <div className="hybrid-error-msg">⚠ {error}</div>
          </div>
        )}

        {!loading && hasSearched && !error && (
          <>
            {activeTab === "hybrid" && results.length === 0 && (
              <div className="hybrid-empty-box">
                <div className="hybrid-empty-icon">🔍</div>
                <div className="hybrid-empty-text">No matching symbols found</div>
                <div className="hybrid-empty-sub">
                  Try searching for identifier names or conceptual keywords.
                </div>
              </div>
            )}

            {activeTab === "context" && (!contextPackage || contextPackage.context.length === 0) && (
              <div className="hybrid-empty-box">
                <div className="hybrid-empty-icon">🕸️</div>
                <div className="hybrid-empty-text">No context symbols retrieved</div>
                <div className="hybrid-empty-sub">
                  Search for a flow, method, or subsystem to expand connected symbols.
                </div>
              </div>
            )}
          </>
        )}

        {!hasSearched && (
          <div className="hybrid-empty-box">
            <div className="hybrid-empty-icon">⚡</div>
            <div className="hybrid-empty-text">
              {activeTab === "context" ? "AI Feature Search" : "Hybrid Code Retrieval"}
            </div>
            <div className="hybrid-empty-sub">
              {activeTab === "context"
                ? "Searches features, expands 1-hop connected symbols, and visualizes them directly on the React Flow graph."
                : "Combines PostgreSQL lexical search with pgvector similarity fused via RRF."}
            </div>
          </div>
        )}

        {/* --- TAB 1: HYBRID RESULTS --- */}
        {activeTab === "hybrid" &&
          results.map((item, index) => (
            <div
              key={item.symbol_id}
              className="hybrid-result-card"
              onClick={() => handleCardClick(item)}
              title="Click to view code in CodeViewer"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleCardClick(item);
              }}
            >
              <div className="hybrid-card-top">
                <div className="hybrid-symbol-title">
                  <span className={`hybrid-type-pill ${getTypeClass(item.type)}`}>
                    {item.type || "symbol"}
                  </span>
                  <span className="hybrid-symbol-name" title={item.name}>
                    {item.name || item.symbol_id}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    className={`btn-highlight-match ${activeHighlightId === item.symbol_id ? "active" : ""}`}
                    onClick={(e) => handleHighlightItem(e, item)}
                    title={
                      activeHighlightId === item.symbol_id
                        ? "Clear graph highlight"
                        : "Highlight this match and its connections in graph"
                    }
                  >
                    {activeHighlightId === item.symbol_id ? "★ Highlighted" : "✨ Highlight"}
                  </button>
                  <button
                    className="btn-focus-node"
                    onClick={(e) => handleFocusClick(e, item)}
                    title="Focus node in graph"
                  >
                    🎯 Focus
                  </button>
                  <span className="hybrid-rank-index">#{index + 1}</span>
                </div>
              </div>

              <div className="hybrid-card-loc">
                <span>{item.file}</span>
                {item.start_line && (
                  <span>
                    :L{item.start_line}
                    {item.end_line && item.end_line > item.start_line ? `-L${item.end_line}` : ""}
                  </span>
                )}
              </div>

              <div className="hybrid-card-scores">
                <span className="score-badge badge-rrf" title="Reciprocal Rank Fusion score">
                  RRF: {item.rrf_score.toFixed(4)}
                </span>
                {item.lexical_rank !== null && (
                  <span className="score-badge badge-lexical">Lexical #{item.lexical_rank}</span>
                )}
                {item.semantic_rank !== null && (
                  <span className="score-badge badge-semantic">
                    Semantic #{item.semantic_rank} ({(item.semantic_similarity * 100).toFixed(0)}%)
                  </span>
                )}
              </div>

              {item.content_snippet && (
                <div className="hybrid-card-snippet">{item.content_snippet}</div>
              )}
            </div>
          ))}

        {/* --- TAB 2: GRAPH CONTEXT PACKAGE --- */}
        {activeTab === "context" && contextPackage && (
          <>
            {/* Seeds Section */}
            <div className="context-section-header">
              <span>🌱 Primary Matches ({contextPackage.seeds.length})</span>
            </div>
            {contextPackage.seeds.map((item) => (
              <div
                key={`seed-${item.symbol_id}`}
                className="hybrid-result-card"
                onClick={() => handleCardClick(item)}
                title="Click to view seed code in CodeViewer"
                role="button"
                tabIndex={0}
              >
                <div className="hybrid-card-top">
                  <div className="hybrid-symbol-title">
                    <span className={`hybrid-type-pill ${getTypeClass(item.type)}`}>
                      {item.type || "symbol"}
                    </span>
                    <span className="hybrid-symbol-name" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      className={`btn-highlight-match ${activeHighlightId === item.symbol_id ? "active" : ""}`}
                      onClick={(e) => handleHighlightItem(e, item)}
                      title={
                        activeHighlightId === item.symbol_id
                          ? "Clear graph highlight"
                          : "Highlight this primary match and its 1-hop connections in graph"
                      }
                    >
                      {activeHighlightId === item.symbol_id ? "★ Highlighted" : "✨ Highlight"}
                    </button>
                    <button
                      className="btn-focus-node"
                      onClick={(e) => handleFocusClick(e, item)}
                      title="Focus node in graph"
                    >
                      🎯 Focus
                    </button>
                    <span className="score-badge badge-rrf">Seed #{item.hybrid_rank}</span>
                  </div>
                </div>

                <div className="hybrid-card-loc">
                  <span>{item.file}</span>
                  {item.start_line && (
                    <span>
                      :L{item.start_line}
                      {item.end_line && item.end_line > item.start_line ? `-L${item.end_line}` : ""}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Expanded Symbols Section */}
            <div className="context-section-header" style={{ marginTop: "12px" }}>
              <span>🕸️ Connected Symbols ({contextPackage.expanded_symbols.length})</span>
            </div>
            {contextPackage.expanded_symbols.map((item) => (
              <div
                key={`exp-${item.symbol_id}`}
                className="hybrid-result-card"
                onClick={() => handleCardClick(item)}
                title="Click to view connected code in CodeViewer"
                role="button"
                tabIndex={0}
              >
                <div className="hybrid-card-top">
                  <div className="hybrid-symbol-title">
                    <span className={`hybrid-type-pill ${getTypeClass(item.type)}`}>
                      {item.type || "symbol"}
                    </span>
                    <span className="hybrid-symbol-name" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      className="btn-focus-node"
                      onClick={(e) => handleFocusClick(e, item)}
                      title="Focus node in graph"
                    >
                      🎯 Focus
                    </button>
                    <span className="badge-distance">1-Hop</span>
                  </div>
                </div>

                <div className="hybrid-card-loc">
                  <span>{item.file}</span>
                  {item.start_line && (
                    <span>
                      :L{item.start_line}
                      {item.end_line && item.end_line > item.start_line ? `-L${item.end_line}` : ""}
                    </span>
                  )}
                </div>

                {/* Provenance Pills */}
                <div className="hybrid-card-scores">
                  <span className="score-badge badge-relevance">
                    Score: {item.relevance_score.toFixed(4)}
                  </span>
                  {item.discovered_from?.map((disc, idx) => (
                    <span
                      key={idx}
                      className="badge-provenance"
                      title={`Discovered from ${disc.seed_symbol_id}`}
                    >
                      {disc.relationship} ({disc.direction}) from{" "}
                      {disc.seed_symbol_id.split("::")[2] || disc.seed_symbol_id.split("/").pop()}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
