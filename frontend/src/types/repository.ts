export type RepositoryStatus = 'PENDING' | 'CLONING' | 'READY' | 'FAILED';

export interface Repository {
  id: string;
  user_id: string;
  name: string;
  github_url: string;
  default_branch: string;
  status: RepositoryStatus;
  total_files: number;
  total_lines: number;
  total_symbols: number;
  created_at: string;
  updated_at: string;
}

export interface RepositoryImportRequest {
  github_url: string;
  default_branch?: string;
}

export interface RepositoryImportResponse {
  repository_id: string;
  name: string;
  status: string;
  job_id: string;
  message: string;
}

export interface AnalysisJob {
  id: string;
  repository_id: string;
  status: string;
  stage: string;
  progress_percent: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ProgressEventPayload {
  repository_id: string;
  job_id?: string;
  status: string;
  stage: string;
  progress_percent: number;
  error_message?: string | null;
}
