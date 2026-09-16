import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [backendMessage, setBackendMessage] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/repositories/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repoUrl }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch data from the backend
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => setBackendMessage(data.message))
      .catch((error) => console.error("Error fetching data:", error));
  }, []);

  return (
    <>
      <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
        <h2>Frontend + Backend Connection Test</h2>
        <div>
          <p>
            <strong>Message from Express:</strong>
          </p>
          <p>{backendMessage ? backendMessage : "Loading..."}</p>
        </div>
      </div>
      <div>
        <h2>Submit a GitHub Repository</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            style={{ flex: 1, padding: "10px", fontSize: "16px" }}
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 20px",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </form>
        {result && (
          <div
            style={{
              borderColor: result.success ? "#4caf50" : "#f44336",
            }}
          >
            {result.success ? (
              <>
                <p>
                  <strong>✅ {result.message}</strong>
                </p>
                <p>
                  Repository ID: <code>{result.data.repositoryId}</code>
                </p>
                <p>
                  URL:{" "}
                  <a href={result.data.url} target="_blank" rel="noreferrer">
                    {result.data.url}
                  </a>
                </p>
              </>
            ) : (
              <p>
                <strong>❌ Error:</strong> {result.error}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default App;
