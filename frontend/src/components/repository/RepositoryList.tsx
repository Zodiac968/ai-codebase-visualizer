import React from 'react';
import { Repository } from '../../types/repository';
import { useAuth } from '../../context/AuthContext';
import { deleteRepository } from '../../services/api';
import { FolderGit2, ExternalLink, Trash2, CheckCircle2, Clock, AlertTriangle, FileCode2, RefreshCw } from 'lucide-react';

interface Props {
  repositories: Repository[];
  loading: boolean;
  onRefresh: () => void;
}

export const RepositoryList: React.FC<Props> = ({ repositories, loading, onRefresh }) => {
  const { token } = useAuth();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!token) return;
    if (!window.confirm(`Are you sure you want to delete repository "${name}" and its cloned workspace?`)) {
      return;
    }

    setDeletingId(id);
    try {
      const { success } = await deleteRepository(id, token);
      if (success) {
        onRefresh();
      }
    } finally {
      setDeletingId(null);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            <CheckCircle2 className="w-3 h-3" />
            Ready for Analysis
          </span>
        );
      case 'CLONING':
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-950/80 text-blue-400 border border-blue-800/60">
            <Clock className="w-3 h-3 animate-spin" />
            Cloning...
          </span>
        );
      case 'FAILED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/80 text-rose-400 border border-rose-800/60">
            <AlertTriangle className="w-3 h-3" />
            Failed
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <FolderGit2 className="w-5 h-5 text-blue-400" />
          <h2 className="text-base font-bold text-white">Your Ingested Repositories</h2>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs font-mono">
            {repositories.length}
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 transition disabled:opacity-50"
          title="Refresh repository list"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && repositories.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          Loading repositories...
        </div>
      ) : repositories.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500 space-y-1">
          <p>No repositories ingested yet.</p>
          <p className="text-[11px] text-slate-600">Import a public GitHub repository above to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {repositories.map((repo) => (
            <div
              key={repo.id}
              className="p-4 bg-slate-950/60 border border-slate-800/90 rounded-lg hover:border-slate-700 transition flex items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-sm text-slate-100 truncate">
                    {repo.name}
                  </span>
                  {renderStatusBadge(repo.status)}
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <a
                    href={repo.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-blue-400 transition font-mono truncate"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    {repo.github_url.replace('https://github.com/', '')}
                  </a>

                  {repo.total_files > 0 && (
                    <span className="flex items-center gap-1 text-slate-500 font-mono shrink-0">
                      <FileCode2 className="w-3 h-3" />
                      {repo.total_files} files
                    </span>
                  )}

                  <span className="text-slate-600 text-[11px] shrink-0">
                    {new Date(repo.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleDelete(repo.id, repo.name)}
                disabled={deletingId === repo.id}
                className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/50 rounded-lg transition disabled:opacity-50 shrink-0"
                title="Delete repository and workspace"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
