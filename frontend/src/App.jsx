import React, { useState } from "react";
import CodebaseGraph from "./components/graph/CodebaseGraph";
import CodeViewer from "./components/code/CodeViewer";
import { NODE_TYPE_COLORS } from "./utils/graph/constants";
import "./App.css";

export default function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState(null);
  const [repoData, setRepoData] = useState(null);

  // Code Viewer State
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [fileCache, setFileCache] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setLoading(true);
    setError(null);
    setSelectedTarget(null);
    setFileCache({});
    setLoadingMessage("Cloning repository and executing AST analysis pipeline...");

    try {
      const response = await fetch("/api/repositories/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      });

      const rawText = await response.text();
      let result;
      try {
        result = JSON.parse(rawText);
      } catch {
        throw new Error(
          response.status === 502
            ? "502 Bad Gateway: Backend server dropped the connection or restarted during analysis. (Tip: Restart backend if nodemon had restarted)."
            : `Server responded with status ${response.status}: ${rawText.slice(0, 150) || "Empty response"}`
        );
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to analyze repository.");
      }

      setRepoData(result.data);
    } catch (err) {
      console.error("Analysis request failed:", err);
      setError(err.message || "An unexpected error occurred while analyzing the repository.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setRepoData(null);
    setError(null);
    setSelectedTarget(null);
    setFileContent("");
    setFileCache({});
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
          <span className="brand-badge">Tree-sitter AST</span>
        </div>

        <div className="header-actions">
          {repoData ? (
            <>
              <span className="meta-pill">
                <strong>URL:</strong> {repoData.url}
              </span>
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
              <button className="btn-secondary" onClick={handleReset}>
                ← Analyze Another Repo
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
          </div>
        ) : (
          <div className="landing-view">
            <div className="input-card">
              <h1>Visualize Any Codebase</h1>
              <p>
                Enter a public GitHub repository URL. Our backend clones the repo,
                runs Tree-sitter AST symbol extraction, resolves cross-file relationships,
                and generates an interactive architectural graph.
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
                      Cloning repository, parsing AST, and calculating hierarchical layout...
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="error-box">
                  <strong>Analysis Error:</strong> {error}
                </div>
              )}

              <div className="quick-examples">
                <span>Quick test examples:</span>
                <button
                  type="button"
                  className="example-chip"
                  onClick={() => setRepoUrl("https://github.com/octocat/Hello-World")}
                >
                  octocat/Hello-World
                </button>
                <button
                  type="button"
                  className="example-chip"
                  onClick={() => setRepoUrl("https://github.com/expressjs/express")}
                >
                  expressjs/express
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
