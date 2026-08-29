import { useEffect, useState } from 'react';
import { fetchHealth, HealthResponse } from './services/api';
import { CheckCircle2, XCircle, RefreshCw, Server, Database, Network } from 'lucide-react';

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<string>('');

  const checkStatus = async () => {
    setLoading(true);
    setError(null);
    const result = await fetchHealth();
    setHealth(result.data);
    setError(result.error);
    setLoading(false);
    setLastChecked(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const isConnected = !!health && !error;
  const isPostgresConnected = health?.databases?.postgres?.startsWith('connected');
  const isNeo4jConnected = health?.databases?.neo4j?.startsWith('connected');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="border-b border-slate-800 pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="p-2 bg-blue-600 rounded-lg text-white">
              <Network className="w-6 h-6" />
            </span>
            AI Codebase Visualizer
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Phase 1 — Project Skeleton &amp; Development Environment
          </p>
        </div>

        {/* Status Banner */}
        <div
          className={`p-4 rounded-lg border flex items-center justify-between ${
            loading
              ? 'bg-slate-800/50 border-slate-700 text-slate-300'
              : isConnected
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-3">
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
            ) : isConnected ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-400" />
            )}
            <div>
              <div className="font-semibold text-sm">
                Backend Status:{' '}
                {loading
                  ? 'Checking connection...'
                  : isConnected
                  ? 'Connected ✓'
                  : 'Disconnected'}
              </div>
              {error && <div className="text-xs text-rose-400/90 mt-0.5">{error}</div>}
              {health && (
                <div className="text-xs text-emerald-400/90 mt-0.5">
                  {health.app} (v{health.version}) • Environment: {health.environment}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={checkStatus}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md border border-slate-700 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Database Connectivity Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* PostgreSQL Card */}
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-300 flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-400" />
                PostgreSQL + pgvector
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                  isPostgresConnected
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                    : 'bg-amber-950 text-amber-400 border border-amber-800/50'
                }`}
              >
                {health?.databases?.postgres || 'unknown'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Relational metadata &amp; 384d vector embeddings
            </p>
          </div>

          {/* Neo4j Card */}
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-300 flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                Neo4j Knowledge Graph
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                  isNeo4jConnected
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                    : 'bg-amber-950 text-amber-400 border border-amber-800/50'
                }`}
              >
                {health?.databases?.neo4j || 'unknown'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Codebase topology, AST calls, &amp; imports
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
          <span>React Flow ready: <code>@xyflow/react</code></span>
          {lastChecked && <span>Last checked: {lastChecked}</span>}
        </div>
      </div>
    </div>
  );
}

export default App;
