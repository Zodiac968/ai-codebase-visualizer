import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { importRepository, subscribeRepositoryProgress } from '../../services/api';
import { ProgressEventPayload } from '../../types/repository';
import { Github, ArrowRight, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

interface Props {
  onImportSuccess: () => void;
}

export const RepositoryImportCard: React.FC<Props> = ({ onImportSuccess }) => {
  const { token } = useAuth();
  const [githubUrl, setGithubUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressEvent, setProgressEvent] = useState<ProgressEventPayload | null>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !githubUrl.trim()) return;

    setLoading(true);
    setErrorMessage(null);
    setProgressEvent({
      repository_id: '',
      status: 'PENDING',
      stage: 'Initiating repository clone...',
      progress_percent: 5,
    });

    const { data, error } = await importRepository(githubUrl.trim(), 'main', token);

    if (error || !data) {
      setErrorMessage(error || 'Failed to initiate repository import');
      setLoading(false);
      setProgressEvent(null);
      return;
    }

    // Subscribe to SSE progress stream
    const unsubscribe = subscribeRepositoryProgress(
      data.repository_id,
      token,
      (event) => {
        setProgressEvent(event);
      },
      () => {
        setLoading(false);
        onImportSuccess();
      },
      (err) => {
        console.warn('SSE stream disconnected:', err);
        setLoading(false);
        onImportSuccess();
      }
    );

    // Auto-cleanup after 60 seconds if stream stalls
    setTimeout(() => {
      unsubscribe();
    }, 60000);
  };

  const handleSampleClick = (sampleUrl: string) => {
    setGithubUrl(sampleUrl);
    setErrorMessage(null);
  };

  const isCompleted = progressEvent?.status === 'COMPLETED';
  const isFailed = progressEvent?.status === 'FAILED';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-slate-800 rounded-lg text-white">
            <Github className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Import GitHub Repository</h2>
            <p className="text-xs text-slate-400">
              Submit a public GitHub URL to clone and prepare for AST static analysis.
            </p>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-950/50 border border-rose-800/70 rounded-lg text-rose-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Import Form */}
      <form onSubmit={handleImport} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Public Repository URL
          </label>
          <div className="relative">
            <input
              type="url"
              required
              disabled={loading}
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/octocat/Hello-World"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-28 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-50 font-mono"
            />
            <button
              type="submit"
              disabled={loading || !githubUrl.trim()}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-3.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md shadow transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Cloning...
                </>
              ) : (
                <>
                  Import
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sample Repositories */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Try sample:
          </span>
          <button
            type="button"
            onClick={() => handleSampleClick('https://github.com/octocat/Hello-World')}
            disabled={loading}
            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 font-mono text-[11px] transition disabled:opacity-50"
          >
            octocat/Hello-World
          </button>
          <button
            type="button"
            onClick={() => handleSampleClick('https://github.com/expressjs/express')}
            disabled={loading}
            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 font-mono text-[11px] transition disabled:opacity-50"
          >
            expressjs/express
          </button>
        </div>
      </form>

      {/* Real-Time SSE Progress Bar */}
      {progressEvent && (
        <div
          className={`p-4 rounded-lg border text-xs space-y-2 transition ${
            isFailed
              ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
              : isCompleted
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-slate-950/80 border-slate-800 text-slate-200'
          }`}
        >
          <div className="flex items-center justify-between font-medium">
            <span className="flex items-center gap-2">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
              {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              {isFailed && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
              {progressEvent.stage}
            </span>
            <span className="font-mono font-bold">{progressEvent.progress_percent}%</span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isFailed
                  ? 'bg-rose-500'
                  : isCompleted
                  ? 'bg-emerald-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${Math.max(5, progressEvent.progress_percent)}%` }}
            />
          </div>

          {progressEvent.error_message && (
            <p className="text-[11px] text-rose-400/90 font-mono mt-1">
              {progressEvent.error_message}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
