export interface FileMetadata {
  relative_path: string;
  filename: string;
  extension: string;
  language: string;
  size_bytes: number;
  line_count: number;
  is_source: boolean;
  is_binary: boolean;
  is_config: boolean;
  sha256_hash?: string;
}

export interface RepositoryScanResponse {
  repository_id: string;
  total_files: number;
  source_files: number;
  config_files: number;
  binary_files: number;
  ignored_files: number;
  total_size_bytes: number;
  total_source_lines: number;
  languages: Record<string, number>;
}

export interface FileListResponse {
  repository_id: string;
  total_files: number;
  files: FileMetadata[];
}
