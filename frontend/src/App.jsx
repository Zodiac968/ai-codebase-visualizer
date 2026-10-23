import React, { useState, useEffect, useRef } from "react";
import CodebaseGraph from "./components/graph/CodebaseGraph";
import CodeViewer from "./components/code/CodeViewer";
import HybridSearch from "./components/search/HybridSearch";
import AskAI from "./components/qa/AskAI";
import {
  computeAncestorRevealSet,
  buildHighlightContext,
} from "./utils/graph/highlightUtils";
import { NODE_TYPE_COLORS } from "./utils/graph/constants";
import "./App.css";

export default function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState(null);
  const [repoData, setRepoData] = useState(null);
  const [recentRepos, setRecentRepos] = useState([]);

  // Code Viewer State
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [fileCache, setFileCache] = useState({});

  // AI Search Panel State (Phase 4.3 / 4.4)
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Ask AI Q&A Panel State (Phase 4.6)
  const [isAskOpen, setIsAskOpen] = useState(false);

  // Vector Generation State (Phase 4.2 on-demand trigger)
  const [vectorJob, setVectorJob] = useState({ status: "idle", message: "" });
  const currentRepoIdRef = useRef(null);

  useEffect(() => {
    currentRepoIdRef.current = repoData?.repositoryId || null;
  }, [repoData?.repositoryId]);

  // Phase 4.5 Feature Search Graph Highlighting State
  const [highlightContext, setHighlightContext] = useState(null);
  const [searchRevealSet, setSearchRevealSet] = useState(null);

  // Fetch recent repositories from PostgreSQL
  const fetchRecentRepos = async () => {
    try {
      const response = await fetch("/api/repositories/recent");
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setRecentRepos(result.data || []);
        }
      }
    } catch (err) {
      console.warn("Could not load recent repositories:", err);
    }
  };

  useEffect(() => {
    let ignore = false;
    fetch("/api/repositories/recent")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!ignore && json?.success) {
          setRecentRepos(json.data || []);
        }
      })
      .catch((err) => console.warn("Could not load recent repositories:", err));

    return () => {
      ignore = true;
    };
  }, []);

  const analyzeRepositoryUrl = async (targetUrl, forceRefresh = false) => {
    if (!targetUrl || !targetUrl.trim()) return;

    setLoading(true);
    setError(null);
    setSelectedTarget(null);
    setFileCache({});
    setHighlightContext(null);
    setSearchRevealSet(null);
    setVectorJob({ status: "idle", message: "" });
    setLoadingMessage(
      forceRefresh
        ? "Re-cloning and re-analyzing fresh from GitHub..."
        : "Checking PostgreSQL cache or analyzing repository..."
    );

    try {
      const response = await fetch("/api/repositories/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoUrl: targetUrl.trim(),
          forceRefresh: Boolean(forceRefresh),
        }),
      });

      const rawText = await response.text();
      let result;
      try {
        result = JSON.parse(rawText);
      } catch {
        throw new Error(
          response.status === 502
            ? "502 Bad Gateway: Backend server dropped connection. Ensure backend is running."
            : `Server responded with status ${response.status}: ${rawText.slice(0, 150) || "Empty response"}`
        );
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to analyze repository.");
      }

      setRepoData(result.data);
      setRepoUrl(result.data.url || targetUrl);
      fetchRecentRepos();
    } catch (err) {
      console.error("Analysis request failed:", err);
      setError(err.message || "An unexpected error occurred while analyzing the repository.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    analyzeRepositoryUrl(repoUrl, false);
  };

  const handleReanalyze = () => {
    if (repoData?.url) {
      analyzeRepositoryUrl(repoData.url, true);
    }
  };

  // Generates semantic vectors for the current repository's embedding documents.
  // Incremental on the backend: symbols whose content hash is unchanged are skipped.
  const handleGenerateVectors = async () => {
    const repoId = repoData?.repositoryId;
    if (!repoId || vectorJob.status === "running") return;

    setVectorJob({ status: "running", message: "" });

    try {
      const response = await fetch(`/api/repositories/${repoId}/vectors/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false }),
      });

      let result = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      // Ignore the response if the user switched repositories meanwhile
      if (currentRepoIdRef.current !== repoId) return;

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `Vector generation failed with status ${response.status}.`);
      }

      const { total = 0, generated = 0, skipped = 0 } = result.data || {};
      setVectorJob({
        status: "done",
        total,
        message: `${total} vectors ready (${generated} newly generated, ${skipped} unchanged)`,
      });
    } catch (err) {
      if (currentRepoIdRef.current !== repoId) return;
      console.error("Vector generation failed:", err);
      setVectorJob({
        status: "error",
        message: err.message || "Vector generation failed. Ensure the backend is running.",
      });
    }
  };

  const handleReset = () => {
    setVectorJob({ status: "idle", message: "" });
    setRepoData(null);
    setError(null);
    setSelectedTarget(null);
    setFileContent("");
    setFileCache({});
    setIsSearchOpen(false);
    setIsAskOpen(false);
    setHighlightContext(null);
    setSearchRevealSet(null);
    fetchRecentRepos();
  };

  // Phase 4.5: Feature Search Visualization Handlers
  const handleVisualizeInGraph = (searchData) => {
    if (!searchData || !repoData?.graph?.nodes) return;

    const ctx = buildHighlightContext(searchData, searchData.focusedNodeId || null);
    const targetIds = [
      ...Array.from(ctx.primaryNodeIds),
      ...Array.from(ctx.relatedNodeIds),
    ];

    const revealSet = computeAncestorRevealSet(targetIds, repoData.graph.nodes);
    setHighlightContext(ctx);
    setSearchRevealSet(revealSet);
  };

  const handleFocusGraphNode = (nodeId) => {
    if (!nodeId) return;
    setHighlightContext((prev) => {
      if (!prev) {
        return {
          isActive: true,
          primaryNodeIds: new Set([String(nodeId)]),
          relatedNodeIds: new Set(),
          relevantEdgeKeys: new Set(),
          focusedNodeId: String(nodeId),
          seedCount: 1,
          expandedCount: 0,
        };
      }
      return {
        ...prev,
        focusedNodeId: String(nodeId),
      };
    });

    if (repoData?.graph?.nodes) {
      setSearchRevealSet((prev) => {
        const reveal = computeAncestorRevealSet([String(nodeId)], repoData.graph.nodes);
        if (!prev) return reveal;
        const merged = new Set(prev);
        reveal.forEach((id) => merged.add(id));
        return merged;
      });
    }
  };

  const handleClearHighlight = () => {
    setHighlightContext(null);
    setSearchRevealSet(null);
  };

  const handleNodeSelect = async (target) => {
    setSelectedTarget(target);

    if (!target?.path || !repoData?.repositoryId) return;

    // Check in-memory cache
    if (fileCache[target.path]) {
      setFileContent(fileCache[target.path]);
      setFileError(null);
      return;
    }

    setFileLoading(true);
    setFileError(null);

    try {
      const response = await fetch(
        `/api/repositories/${repoData.repositoryId}/file?filePath=${encodeURIComponent(target.path)}`
      );
      const resData = await response.json();

      if (!response.ok || !resData.success) {
        throw new Error(resData.error || `Failed to fetch file: ${target.path}`);
      }

      const content = resData.data.content;
      setFileContent(content);
      setFileCache((prev) => ({ ...prev, [target.path]: content }));
    } catch (err) {
      console.error("Error loading file:", err);
      setFileError(err.message || "Failed to load file content.");
    } finally {
      setFileLoading(false);
    }
  };

  const handleCloseCodeViewer = () => {
    setSelectedTarget(null);
    setFileContent("");
    setFileError(null);
  };

  const nodeCount = repoData?.graph?.nodes?.length || 0;
  const edgeCount = repoData?.graph?.edges?.length || 0;

  return (
    <div className="app-container">
      {/* Top Navigation / Header */}
      <header className="app-header">
        <div className="brand-section">
          <h1 className="brand-title">AI Codebase Visualizer</h1>
          <span className="brand-badge">PostgreSQL + Tree-sitter</span>
        </div>

        <div className="header-actions">
          {repoData ? (
            <>
              <span className="meta-pill">
                <strong>Repo:</strong> {repoData.fullName || repoData.url}
              </span>
              {repoData.cached ? (
                <span className="meta-pill pill-cached">⚡ Cached from DB</span>
              ) : (
                <span className="meta-pill pill-fresh">✓ Freshly Analyzed</span>
              )}
              <span className="meta-pill">
                <strong>Nodes:</strong> {nodeCount} | <strong>Edges:</strong> {edgeCount}
              </span>
              {repoData.validation && (
                <span
                  className="meta-pill"
                  style={{
                    color: repoData.validation.valid ? "#15803d" : "#b45309",
                    background: repoData.validation.valid ? "#dcfce7" : "#fef3c7",
                  }}
                >
                  {repoData.validation.valid ? "✓ Valid Graph" : "⚠ Warnings"}
                </span>
              )}
              <button
                className="btn-secondary"
                onClick={() => {
                  setIsSearchOpen((prev) => !prev);
                  setIsAskOpen(false);
                }}
                title="Toggle AI Code Search & Graph Context Retrieval"
                style={{
                  background: isSearchOpen ? "#fdf2f8" : "#ffffff",
                  borderColor: isSearchOpen ? "#ec4899" : "#cbd5e1",
                  color: isSearchOpen ? "#db2777" : "#334155",
                  fontWeight: 600,
                }}
              >
                ⚡ AI Search
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setIsAskOpen((prev) => !prev);
                  setIsSearchOpen(false);
                }}
                title="Ask natural-language questions answered from the repository source"
                style={{
                  background: isAskOpen ? "#fdf2f8" : "#ffffff",
                  borderColor: isAskOpen ? "#ec4899" : "#cbd5e1",
                  color: isAskOpen ? "#db2777" : "#334155",
                  fontWeight: 600,
                }}
              >
                💬 Ask AI
              </button>
              <button
                className="btn-secondary"
                onClick={handleGenerateVectors}
                disabled={loading || vectorJob.status === "running"}
                title={
                  vectorJob.message
                    ? `${vectorJob.message}\nClick to generate again.`
                    : "Generate 384-d semantic vectors (BAAI/bge-small-en-v1.5) for this repository. Unchanged symbols are skipped."
                }
                style={
                  vectorJob.status === "done"
                    ? { color: "#15803d", borderColor: "#86efac", background: "#f0fdf4" }
                    : vectorJob.status === "error"
                      ? { color: "#b45309", borderColor: "#fcd34d", background: "#fffbeb" }
                      : undefined
                }
              >
                {vectorJob.status === "running"
                  ? "⏳ Vectors..."
                  : vectorJob.status === "done"
                    ? `✓ ${vectorJob.total} Vectors`
                    : vectorJob.status === "error"
                      ? "⚠ Vectors"
                      : "🧠 Vectors"}
              </button>
              <button
                className="btn-secondary"
                onClick={handleReanalyze}
                disabled={loading}
                title="Force re-clone and re-parse repository"
              >
                ↻ Re-analyze
              </button>
              <button className="btn-secondary" onClick={handleReset}>
                ← Back to Home
              </button>
            </>
          ) : (
            <span className="meta-pill">Ready to analyze</span>
          )}
        </div>
      </header>

      {/* Main View Area */}
      <main className="app-main">
        {repoData?.graph ? (
          <div className="workspace-layout">
            {/* Left Panel: Code Viewer */}
            {selectedTarget && (
              <div className="workspace-code-pane">
                <CodeViewer
                  target={selectedTarget}
                  content={fileContent}
                  loading={fileLoading}
                  error={fileError}
                  onClose={handleCloseCodeViewer}
                />
              </div>
            )}

            {/* Right Panel: Interactive Graph */}
            <div className="workspace-graph-pane">
              <CodebaseGraph
                graphData={repoData.graph}
                onNodeSelect={handleNodeSelect}
                highlightContext={highlightContext}
                searchRevealSet={searchRevealSet}
                onClearHighlight={handleClearHighlight}
              />

              {/* Bottom-left Legend */}
              <div className="graph-legend">
                <div className="legend-title">Node Hierarchy & Types</div>
                <div className="legend-items">
                  {Object.entries(NODE_TYPE_COLORS).map(([type, color]) => (
                    <div key={type} className="legend-item">
                      <span
                        className="legend-dot"
                        style={{ backgroundColor: color }}
                      />
                      <span>{type}</span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 10,
                    color: "#64748b",
                    borderTop: "1px solid #f1f5f9",
                    paddingTop: 6,
                  }}
                >
                  Tip: Click <strong>file</strong>, <strong>class</strong>, or <strong>function</strong> to inspect code on the left.
                </div>
              </div>
            </div>

            {/* Right Drawer: AI Hybrid & Context Search */}
            {isSearchOpen && repoData?.repositoryId && (
              <HybridSearch
                repoId={repoData.repositoryId}
                onSelectSymbol={handleNodeSelect}
                onClose={() => setIsSearchOpen(false)}
                onVisualizeInGraph={handleVisualizeInGraph}
                onFocusNode={handleFocusGraphNode}
                onClearGraphHighlight={handleClearHighlight}
                isGraphHighlighted={Boolean(highlightContext?.isActive)}
                activeHighlightId={
                  highlightContext?.focusedNodeId ||
                  (highlightContext?.primaryNodeIds?.size === 1
                    ? Array.from(highlightContext.primaryNodeIds)[0]
                    : null)
                }
              />
            )}

            {/* Right Drawer: Ask AI Grounded Q&A (Phase 4.6) */}
            {isAskOpen && repoData?.repositoryId && (
              <AskAI
                key={repoData.repositoryId}
                repoId={repoData.repositoryId}
                onSelectSymbol={handleNodeSelect}
                onClose={() => setIsAskOpen(false)}
                onVisualizeInGraph={handleVisualizeInGraph}
                onFocusNode={handleFocusGraphNode}
                onClearGraphHighlight={handleClearHighlight}
                isGraphHighlighted={Boolean(highlightContext?.isActive)}
              />
            )}
          </div>
        ) : (
          <div className="landing-view">
            <div className="input-card">
              <h1>Visualize Any Codebase</h1>
              <p>
                Enter a public GitHub repository URL. Our backend normalizes the repository ID,
                extracts AST symbols and relationships, and persists full graph models into PostgreSQL
                for instant subsequent exploration.
              </p>

              <form className="url-form" onSubmit={handleSubmit}>
                <div className="input-group">
                  <input
                    type="url"
                    className="url-input"
                    placeholder="https://github.com/owner/repository"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={loading || !repoUrl.trim()}
                  >
                    {loading ? "Analyzing..." : "Analyze"}
                  </button>
                </div>
              </form>

              {loading && (
                <div className="loading-box">
                  <div className="spinner" />
                  <div>
                    <p className="loading-text">{loadingMessage}</p>
                    <p className="loading-subtext">
                      Accessing PostgreSQL cache, parsing AST, and calculating hierarchical layout...
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="error-box">
                  <strong>Analysis Error:</strong> {error}
                </div>
              )}

              {/* Quick Examples */}
              <div className="quick-examples">
                <span>Quick test examples:</span>
                <button
                  type="button"
                  className="example-chip"
                  onClick={() => analyzeRepositoryUrl("https://github.com/octocat/Hello-World")}
                >
                  octocat/Hello-World
                </button>
                <button
                  type="button"
                  className="example-chip"
                  onClick={() => analyzeRepositoryUrl("https://github.com/expressjs/express")}
                >
                  expressjs/express
                </button>
              </div>

              {/* Previously Analyzed Repositories (PostgreSQL) */}
              {recentRepos.length > 0 && (
                <div className="recent-section">
                  <div className="recent-title">
                    ⚡ Previously Analyzed Repositories (PostgreSQL Cache)
                  </div>
                  <div className="recent-grid">
                    {recentRepos.map((repo) => (
                      <div
                        key={repo.id}
                        className="recent-item"
                        onClick={() => analyzeRepositoryUrl(repo.url, false)}
                      >
                        <span className="recent-name">{repo.full_name}</span>
                        <div className="recent-meta">
                          <span className="recent-badge">
                            {repo.node_count || 0} nodes
                          </span>
                          <span className="recent-badge">
                            {repo.edge_count || 0} edges
                          </span>
                          <span>
                            {new Date(repo.updated_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
