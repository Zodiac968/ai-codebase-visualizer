export interface PythonAnalysisResponse {
  repository_id: string;
  files_analyzed: number;
  classes_found: number;
  functions_found: number;
  methods_found: number;
  imports_found: number;
  routes_found: number;
  files_with_parse_errors: number;
}

export interface SymbolItem {
  id: string;
  file_id: string;
  file_path: string;
  name: string;
  symbol_type: string;
  qualified_name: string;
  parent_id?: string | null;
  start_line: number;
  end_line: number;
  signature?: string | null;
  docstring?: string | null;
}

export interface SymbolListResponse {
  repository_id: string;
  total_symbols: number;
  symbols: SymbolItem[];
}
