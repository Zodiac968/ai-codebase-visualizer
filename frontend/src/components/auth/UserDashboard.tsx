import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, LogOut, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Key } from 'lucide-react';

export const UserDashboard: React.FC = () => {
  const { user, token, logout, verifyToken } = useAuth();
  const [testResult, setTestResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null);
  const [testing, setTesting] = useState<boolean>(false);

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
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      {/* User Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg">
            <User className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono">Authenticated Session</div>
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
          <span className="text-slate-500 font-mono">Account Status</span>
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <ShieldCheck className="w-4 h-4" />
            Active (JWT Verified)
          </div>
        </div>
      </div>

      {/* JWT Token Preview */}
      {token && (
        <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-mono flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              Bearer Token (Truncated)
            </span>
            <span className="text-[10px] text-slate-500 font-mono">HS256</span>
          </div>
          <p className="font-mono text-[11px] text-slate-400 break-all bg-slate-900 p-2 rounded border border-slate-800">
            {token.substring(0, 40)}...{token.substring(token.length - 20)}
          </p>
        </div>
      )}

      {/* Protected Endpoint Verification Area */}
      <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-200">
              Verify Protected Route: <code className="text-blue-400">GET /api/v1/auth/me</code>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Sends the current Bearer token in the Authorization header to test FastAPI validation.
            </p>
          </div>
          <button
            onClick={handleTestProtectedApi}
            disabled={testing}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            Test Endpoint
          </button>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-lg border text-xs font-mono space-y-1 ${
              testResult.success
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold">
              {testResult.success ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Response 200 OK — Authentication Verified
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  Request Failed: {testResult.error}
                </>
              )}
            </div>
            {testResult.data && (
              <pre className="text-[11px] bg-slate-950/90 p-2 rounded text-slate-300 overflow-x-auto border border-slate-800">
                {JSON.stringify(testResult.data, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
