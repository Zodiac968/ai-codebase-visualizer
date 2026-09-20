import React, { useEffect, useRef } from "react";
import "./CodeViewer.css";

export default function CodeViewer({ target, content, loading, error, onClose }) {
  const targetLineRef = useRef(null);
  const containerRef = useRef(null);

  // Auto-scroll to target start line
  useEffect(() => {
    if (!loading && targetLineRef.current) {
      targetLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [target?.startLine, target?.path, loading, content]);

  if (!target) return null;

  const lines = content ? content.split("\n") : [];
  const startLine = target.startLine || 1;
  const endLine = target.endLine && target.endLine >= startLine ? target.endLine : startLine;

  const fileName = target.path.split("/").pop();

  return (
    <div className="code-viewer-panel">
      {/* Code Viewer Header */}
      <div className="code-viewer-header">
        <div className="code-header-info">
          <div className="code-title-row">
            <span className="code-file-name">{fileName}</span>
            {target.type && target.type !== "file" && (
              <span className={`symbol-badge badge-${target.type}`}>
                {target.type}: {target.name}
              </span>
            )}
          </div>
          <div className="code-path-row">
            <span className="code-full-path">{target.path}</span>
            {target.startLine && (
              <span className="code-line-badge">
                Line {target.startLine}
                {target.endLine && target.endLine > target.startLine ? `–${target.endLine}` : ""}
              </span>
            )}
          </div>
        </div>

        <button
          className="code-close-btn"
          onClick={onClose}
          title="Close Code Viewer"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Code Viewer Content */}
      <div className="code-viewer-body" ref={containerRef}>
        {loading ? (
          <div className="code-loading">
            <div className="code-spinner" />
            <p>Loading {fileName}...</p>
          </div>
        ) : error ? (
          <div className="code-error">
            <p><strong>Failed to load file</strong></p>
            <p className="code-error-msg">{error}</p>
          </div>
        ) : (
          <div className="code-table">
            {lines.map((lineText, index) => {
              const lineNum = index + 1;
              const isTargetLine = lineNum === startLine;
              const isInRange = lineNum >= startLine && lineNum <= endLine;

              return (
                <div
                  key={lineNum}
                  ref={isTargetLine ? targetLineRef : null}
                  className={`code-row ${isInRange ? "row-highlighted" : ""} ${isTargetLine ? "row-target-start" : ""}`}
                >
                  <span className={`line-number ${isInRange ? "line-num-highlighted" : ""}`}>
                    {lineNum}
                  </span>
                  <pre className="line-content">
                    {lineText || " "}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
