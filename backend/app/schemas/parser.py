from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class ExtractedSymbol(BaseModel):
    name: str
    symbol_type: str  # class, function, method
    qualified_name: str
    parent_qualified_name: Optional[str] = None
    start_line: int  # 1-based
    end_line: int    # 1-based
    start_column: int = 0  # 0-based
    end_column: int = 0    # 0-based
    signature: Optional[str] = None
    docstring: Optional[str] = None
    decorators: List[str] = []

    model_config = ConfigDict(from_attributes=True)


class ExtractedImport(BaseModel):
    module_name: str
    imported_name: Optional[str] = None
    alias: Optional[str] = None
    import_type: str = "import"  # import, from_import
    line_number: int             # 1-based

    model_config = ConfigDict(from_attributes=True)


class ExtractedRoute(BaseModel):
    framework: str        # fastapi, flask
    http_method: str      # GET, POST, PUT, DELETE, PATCH
    route_path: str
    function_name: str
    line_number: int      # 1-based

    model_config = ConfigDict(from_attributes=True)


class FileAnalysisResult(BaseModel):
    file_id: UUID
    relative_path: str
    parse_status: str  # SUCCESS, ERRORS, FAILED
    symbols: List[ExtractedSymbol] = []
    imports: List[ExtractedImport] = []
    routes: List[ExtractedRoute] = []
    error_message: Optional[str] = None


class PythonAnalysisResponse(BaseModel):
    repository_id: UUID
    files_analyzed: int
    classes_found: int
    functions_found: int
    methods_found: int
    imports_found: int
    routes_found: int
    files_with_parse_errors: int


class SymbolItem(BaseModel):
    id: UUID
    file_id: UUID
    file_path: str
    name: str
    symbol_type: str
    qualified_name: str
    parent_id: Optional[UUID] = None
    start_line: int
    end_line: int
    signature: Optional[str] = None
    docstring: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SymbolListResponse(BaseModel):
    repository_id: UUID
    total_symbols: int
    symbols: List[SymbolItem]
