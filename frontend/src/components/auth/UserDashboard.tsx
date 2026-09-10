import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchRepositories } from '../../services/api';
import { Repository } from '../../types/repository';
import { RepositoryImportCard } from '../repository/RepositoryImportCard';
import { RepositoryList } from '../repository/RepositoryList';
import { User, LogOut, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Key } from 'lucide-react';

export const UserDashboard: React.FC = () => {
  const { user, token, logout, verifyToken } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [reposLoading, setReposLoading] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null);
  const [testing, setTesting] = useState<boolean>(false);

  const loadRepositories = useCallback(async () => {
    if (!token) return;
    setReposLoading(true);
    const { data } = await fetchRepositories(token);
    if (data) {
      setRepositories(data);
    }
    setReposLoading(false);
  }, [token]);

  useEffect(() => {
    loadRepositories();
  }, [loadRepositories]);

  const handleTestProtectedApi = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await verifyToken();
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="w-full space-y-6">
      {/* User Header & Status Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-mono">Authenticated Developer Session</div>
              <div className="text-base font-bold text-white">{user.email}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="px-3 py-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-700/60 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>

        {/* User Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-1">
            <span className="text-slate-500 font-mono">User UUID</span>
            <p className="font-mono text-slate-300 break-all">{user.id}</p>
          </div>
          <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-1">
            <span className="text-slate-500 font-mono">Account Security</span>
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4" />
              Active (JWT Verified)
            </div>
          </div>
        </div>

        {/* Protected Endpoint Verification Toggle */}
        <details className="group text-xs">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-200 flex items-center gap-1.5 font-medium select-none">
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Developer Debug: View Bearer Token &amp; Test Auth API</span>
          </summary>

          <div className="mt-3 p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-3">
            {token && (
              <p className="font-mono text-[11px] text-slate-400 break-all bg-slate-900 p-2 rounded border border-slate-800">
                {token.substring(0, 40)}...{token.substring(token.length - 20)}
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-400 text-[11px]">
                Test endpoint: <code className="text-blue-400">GET /api/v1/auth/me</code>
              </span>
              <button
                onClick={handleTestProtectedApi}
                disabled={testing}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${testing ? 'animate-spin' : ''}`} />
                Test
              </button>
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded border font-mono text-[11px] ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                }`}
              >
                {testResult.success ? (
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    200 OK — Validated User {testResult.data?.email}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    {testResult.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </details>
      </div>

      {/* Phase 3: Repository Ingestion Card */}
      <RepositoryImportCard onImportSuccess={loadRepositories} />

      {/* Ingested Repositories List */}
      <RepositoryList
        repositories={repositories}
        loading={reposLoading}
        onRefresh={loadRepositories}
      />
    </div>
  );
};
