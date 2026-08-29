import { useEffect, useState } from 'react';
import { fetchHealth, HealthResponse } from './services/api';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthForm } from './components/auth/AuthForm';
import { UserDashboard } from './components/auth/UserDashboard';
import { CheckCircle2, XCircle, RefreshCw, Server, Database, Network, KeyRound } from 'lucide-react';

function MainContent() {
  const { user, isLoading: authLoading } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);

  const checkHealthStatus = async () => {
    setHealthLoading(true);
    setHealthError(null);
    const result = await fetchHealth();
    setHealth(result.data);
    setHealthError(result.error);
    setHealthLoading(false);
  };

  useEffect(() => {
    checkHealthStatus();
  }, []);

  const isConnected = !!health && !healthError;
  const isPostgresConnected = health?.databases?.postgres?.startsWith('connected');
  const isNeo4jConnected = health?.databases?.neo4j?.startsWith('connected');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="max-w-2xl w-full space-y-6">
        {/* Top App Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-600/30">
              <Network className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                AI Codebase Visualizer
              </h1>
              <p className="text-xs text-slate-400">
                Phase 2 — Simple JWT Authentication &amp; User Isolation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-950/80 text-blue-300 border border-blue-800/60">
              <KeyRound className="w-3 h-3" />
              Phase 2
            </span>
          </div>
        </div>

        {/* System Health Summary Bar */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {healthLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
              ) : isConnected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400" />
              )}
              <span className="font-semibold text-slate-200">
                Backend Status:{' '}
                {healthLoading
                  ? 'Checking...'
                  : isConnected
                  ? 'Connected ✓'
                  : 'Disconnected'}
              </span>
              {health && (
                <span className="text-slate-400">
                  ({health.app} v{health.version})
                </span>
              )}
            </div>
            <button
              onClick={checkHealthStatus}
              disabled={healthLoading}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 transition flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${healthLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex items-center justify-between p-2 rounded bg-slate-950/50 border border-slate-800/50">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Database className="w-3.5 h-3.5 text-blue-400" />
                PostgreSQL
              </span>
              <span
                className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                  isPostgresConnected
                    ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40'
                    : 'text-rose-400 bg-rose-950/60 border border-rose-800/40'
                }`}
              >
                {health?.databases?.postgres || 'offline'}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-950/50 border border-slate-800/50">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                Neo4j
              </span>
              <span
                className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                  isNeo4jConnected
                    ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40'
                    : 'text-rose-400 bg-rose-950/60 border border-rose-800/40'
                }`}
              >
                {health?.databases?.neo4j || 'offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Authentication View (Login/Register or Active User Session) */}
        {authLoading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            Loading authentication state...
          </div>
        ) : user ? (
          <UserDashboard />
        ) : (
          <AuthForm />
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-600">
          AI Codebase Visualizer • React 18 + FastAPI + PostgreSQL + Neo4j
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}

export default App;
