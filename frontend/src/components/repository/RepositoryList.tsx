import React, { useState } from 'react';
import { Repository } from '../../types/repository';
import { FileMetadata, RepositoryScanResponse } from '../../types/scanner';
import { useAuth } from '../../context/AuthContext';
import { deleteRepository, scanRepository, fetchRepositoryFiles } from '../../services/api';
import {
  FolderGit2,
  ExternalLink,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileCode2,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  Layers,
  FileText,
  Binary,
  Code2,
  Sparkles,
} from 'lucide-react';

interface Props {
  repositories: Repository[];
  loading: boolean;
  onRefresh: () => void;
}

export const RepositoryList: React.FC<Props> = ({ repositories, loading, onRefresh }) => {
  const { token } = useAuth();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [expandedRepoId, setExpandedRepoId] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<Record<string, RepositoryScanResponse>>({});
  const [repoFiles, setRepoFiles] = useState<Record<string, FileMetadata[]>>({});
  const [fileFilter, setFileFilter] = useState<string>('');
  const [loadingFilesId, setLoadingFilesId] = useState<string | null>(null);

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

  const handleScan = async (repoId: string) => {
    if (!token) return;
    setScanningId(repoId);
    try {
      const { data, error } = await scanRepository(repoId, token);
      if (data) {
        setScanResults((prev) => ({ ...prev, [repoId]: data }));
        setExpandedRepoId(repoId);
        // Also load scanned files
        await loadFiles(repoId);
        onRefresh();
      } else if (error) {
        alert(error);
      }
    } finally {
      setScanningId(null);
    }
  };

  const loadFiles = async (repoId: string) => {
    if (!token) return;
    setLoadingFilesId(repoId);
    try {
      const { data } = await fetchRepositoryFiles(repoId, token);
      if (data) {
        setRepoFiles((prev) => ({ ...prev, [repoId]: data.files }));
      }
    } finally {
      setLoadingFilesId(null);
    }
  };

  const toggleExpand = async (repoId: string) => {
    if (expandedRepoId === repoId) {
      setExpandedRepoId(null);
    } else {
      setExpandedRepoId(repoId);
      if (!repoFiles[repoId]) {
        await loadFiles(repoId);
      }
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

  const getLanguageColor = (lang: string) => {
    switch (lang.toLowerCase()) {
      case 'python':
        return 'bg-blue-950 text-blue-400 border-blue-800/60';
      case 'typescript':
        return 'bg-cyan-950 text-cyan-400 border-cyan-800/60';
      case 'javascript':
        return 'bg-amber-950 text-amber-400 border-amber-800/60';
      case 'json':
      case 'yaml':
      case 'toml':
        return 'bg-emerald-950 text-emerald-400 border-emerald-800/60';
      case 'binary':
        return 'bg-purple-950 text-purple-400 border-purple-800/60';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
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
        <div className="space-y-4">
          {repositories.map((repo) => {
            const isExpanded = expandedRepoId === repo.id;
            const scan = scanResults[repo.id];
            const files = repoFiles[repo.id] || [];
            const filteredFiles = files.filter((f) =>
              f.relative_path.toLowerCase().includes(fileFilter.toLowerCase()) ||
              f.language.toLowerCase().includes(fileFilter.toLowerCase())
            );

            return (
              <div
                key={repo.id}
                className="bg-slate-950/70 border border-slate-800/90 rounded-xl overflow-hidden transition"
              >
                {/* Repo Card Header */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-bold text-sm text-slate-100 truncate">
                        {repo.name}
                      </span>
                      {renderStatusBadge(repo.status)}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
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
                        <span className="flex items-center gap-1 text-slate-400 font-mono shrink-0">
                          <FileCode2 className="w-3 h-3 text-blue-400" />
                          {repo.total_files} files
                        </span>
                      )}

                      {repo.total_lines > 0 && (
                        <span className="flex items-center gap-1 text-slate-400 font-mono shrink-0">
                          <Code2 className="w-3 h-3 text-emerald-400" />
                          {repo.total_lines.toLocaleString()} LOC
                        </span>
                      )}

                      <span className="text-slate-600 text-[11px] shrink-0">
                        {new Date(repo.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {repo.status === 'READY' && (
                      <>
                        <button
                          onClick={() => handleScan(repo.id)}
                          disabled={scanningId === repo.id}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${scanningId === repo.id ? 'animate-spin' : ''}`} />
                          {scanningId === repo.id ? 'Scanning...' : 'Scan Codebase'}
                        </button>

                        <button
                          onClick={() => toggleExpand(repo.id)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center gap-1"
                          title="Toggle file list"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          Files
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => handleDelete(repo.id, repo.name)}
                      disabled={deletingId === repo.id}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/50 rounded-lg transition disabled:opacity-50 shrink-0"
                      title="Delete repository and workspace"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expandable Scan Metrics & File List */}
                {isExpanded && (
                  <div className="border-t border-slate-800/80 p-4 bg-slate-950/90 space-y-4 text-xs">
                    {/* Scan Summary Banner if present */}
                    {scan && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300">
                        <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
                          <div className="text-slate-500 flex items-center gap-1 text-[11px]">
                            <Layers className="w-3 h-3 text-blue-400" />
                            Source Files
                          </div>
                          <div className="text-sm font-bold text-white font-mono mt-0.5">
                            {scan.source_files}
                          </div>
                        </div>

                        <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
                          <div className="text-slate-500 flex items-center gap-1 text-[11px]">
                            <Code2 className="w-3 h-3 text-emerald-400" />
                            Source Lines
                          </div>
                          <div className="text-sm font-bold text-white font-mono mt-0.5">
                            {scan.total_source_lines.toLocaleString()}
                          </div>
                        </div>

                        <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
                          <div className="text-slate-500 flex items-center gap-1 text-[11px]">
                            <FileText className="w-3 h-3 text-amber-400" />
                            Config Files
                          </div>
                          <div className="text-sm font-bold text-white font-mono mt-0.5">
                            {scan.config_files}
                          </div>
                        </div>

                        <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
                          <div className="text-slate-500 flex items-center gap-1 text-[11px]">
                            <Binary className="w-3 h-3 text-purple-400" />
                            Binary Files
                          </div>
                          <div className="text-sm font-bold text-white font-mono mt-0.5">
                            {scan.binary_files}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Language Breakdown Badges */}
                    {scan && Object.keys(scan.languages).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-500 text-[11px] mr-1">Languages:</span>
                        {Object.entries(scan.languages).map(([lang, count]) => (
                          <span
                            key={lang}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono border ${getLanguageColor(lang)}`}
                          >
                            {lang}: {count}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Search & Filter Bar */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                        <input
                          type="text"
                          value={fileFilter}
                          onChange={(e) => setFileFilter(e.target.value)}
                          placeholder="Filter files by path or language (e.g. .py, app/main)..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                        />
                      </div>
                      <span className="text-slate-500 font-mono text-[11px] shrink-0">
                        {filteredFiles.length} / {files.length} files
                      </span>
                    </div>

                    {/* Files Table / List */}
                    {loadingFilesId === repo.id ? (
                      <div className="py-6 text-center text-slate-500">Loading files...</div>
                    ) : files.length === 0 ? (
                      <div className="py-6 text-center text-slate-500">
                        No files scanned yet. Click "Scan Codebase" above to inspect repository files.
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
                        {filteredFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="p-2 bg-slate-900/80 border border-slate-800/60 rounded flex items-center justify-between gap-3 hover:bg-slate-900 transition"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileCode2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span className="text-slate-200 truncate" title={file.relative_path}>
                                {file.relative_path}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] border ${getLanguageColor(
                                  file.language
                                )}`}
                              >
                                {file.language}
                              </span>

                              {file.line_count > 0 && (
                                <span className="text-slate-400 text-[10px]">
                                  {file.line_count} lines
                                </span>
                              )}

                              <span className="text-slate-500 text-[10px]">
                                {(file.size_bytes / 1024).toFixed(1)} KB
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
