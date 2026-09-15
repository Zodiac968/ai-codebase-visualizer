import os
import uuid
from uuid import UUID
from typing import Dict, List
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.config import settings
from app.core.logging import logger
from app.models.repository import Repository
from app.models.file import FileRecord
from app.models.symbol import SymbolRecord
from app.models.dependency import DependencyRecord
from app.models.route import RouteRecord
from app.parser.python_parser import PythonParser
from app.schemas.parser import PythonAnalysisResponse
from app.services.clone import ensure_repository_workspace


def is_safe_path(base_dir: str, path: str) -> bool:
    """Verifies that the target path does not escape the configured base storage directory."""
    real_base = os.path.realpath(base_dir)
    real_path = os.path.realpath(path)
    return real_path.startswith(real_base)


def analyze_python_repository(repository_id: UUID, db: Session) -> PythonAnalysisResponse:
    """
    Executes Tree-sitter static analysis on all Python source files in a repository.
    Extracts classes, functions, methods, dependencies, and API routes and persists them in PostgreSQL.
    """
    repo = db.query(Repository).filter(Repository.id == repository_id).first()
    if not repo:
        raise ValueError("Repository not found")

    if repo.status != "READY":
        raise ValueError(f"Repository cannot be analyzed while in '{repo.status}' state. It must be 'READY'.")

    # Determine source directory (self-healing if workspace was deleted or moved)
    source_dir = ensure_repository_workspace(repo, db)

    # Fetch Python files metadata upfront as lightweight tuples
    python_files_data = [
        (f.id, f.file_path)
        for f in db.query(FileRecord.id, FileRecord.file_path)
        .filter(
            FileRecord.repository_id == repository_id,
            FileRecord.language == "python",
        )
        .all()
    ]

    logger.info(f"Analyzing {len(python_files_data)} Python files for repository {repository_id} ({repo.name})")

    # Clean rebuild: delete existing symbols, dependencies, and routes for this repository's files
    file_ids = [fid for fid, _ in python_files_data]
    if file_ids:
        db.query(RouteRecord).filter(RouteRecord.file_id.in_(file_ids)).delete(synchronize_session=False)
        db.query(DependencyRecord).filter(DependencyRecord.file_id.in_(file_ids)).delete(synchronize_session=False)
        db.query(SymbolRecord).filter(SymbolRecord.file_id.in_(file_ids)).delete(synchronize_session=False)
        db.flush()

    parser = PythonParser()

    total_classes = 0
    total_functions = 0
    total_methods = 0
    total_imports = 0
    total_routes = 0
    files_with_errors = 0

    all_symbol_records: List[SymbolRecord] = []
    all_dependency_records: List[DependencyRecord] = []
    all_route_records: List[RouteRecord] = []

    for file_id, rel_path in python_files_data:
        file_path = os.path.join(source_dir, rel_path)

        if not is_safe_path(source_dir, file_path) or not os.path.exists(file_path):
            logger.warning(f"File not accessible: {file_path}")
            continue

        try:
            with open(file_path, "r", encoding="utf-8-sig", errors="replace") as f:
                content = f.read()
        except Exception as read_err:
            logger.warning(f"Failed to read file {file_path}: {read_err}")
            files_with_errors += 1
            continue

        analysis = parser.parse_file(content, file_id, rel_path)

        if analysis.parse_status in ("ERRORS", "FAILED"):
            files_with_errors += 1

        # Track qualified names -> UUID for parent linking and route symbol linking
        qname_to_id: Dict[str, UUID] = {}
        func_name_to_id: Dict[str, UUID] = {}

        # 1. First pass: assign UUIDs to all symbols
        for sym in analysis.symbols:
            sym_id = uuid.uuid4()
            qname_to_id[sym.qualified_name] = sym_id
            func_name_to_id[sym.name] = sym_id

            if sym.symbol_type == "class":
                total_classes += 1
            elif sym.symbol_type == "method":
                total_methods += 1
            elif sym.symbol_type == "function":
                total_functions += 1

        # 2. Second pass: instantiate SymbolRecord with resolved parent_id
        for sym in analysis.symbols:
            sym_id = qname_to_id[sym.qualified_name]
            parent_id = None
            if sym.parent_qualified_name and sym.parent_qualified_name in qname_to_id:
                parent_id = qname_to_id[sym.parent_qualified_name]

            record = SymbolRecord(
                id=sym_id,
                file_id=file_id,
                name=sym.name,
                symbol_type=sym.symbol_type,
                qualified_name=sym.qualified_name,
                parent_id=parent_id,
                start_line=sym.start_line,
                end_line=sym.end_line,
                start_column=sym.start_column,
                end_column=sym.end_column,
                signature=sym.signature,
                docstring=sym.docstring,
            )
            all_symbol_records.append(record)

        # 3. Process dependencies / imports
        for imp in analysis.imports:
            total_imports += 1
            dep_record = DependencyRecord(
                id=uuid.uuid4(),
                file_id=file_id,
                module_name=imp.module_name,
                imported_name=imp.imported_name,
                alias=imp.alias,
                import_type=imp.import_type,
                line_number=imp.line_number,
            )
            all_dependency_records.append(dep_record)

        # 4. Process routes
        for rt in analysis.routes:
            total_routes += 1
            matched_sym_id = func_name_to_id.get(rt.function_name)
            route_record = RouteRecord(
                id=uuid.uuid4(),
                file_id=file_id,
                symbol_id=matched_sym_id,
                framework=rt.framework,
                http_method=rt.http_method,
                route_path=rt.route_path,
                line_number=rt.line_number,
            )
            all_route_records.append(route_record)

    # Persist extracted records
    if all_symbol_records:
        db.add_all(all_symbol_records)
    if all_dependency_records:
        db.add_all(all_dependency_records)
    if all_route_records:
        db.add_all(all_route_records)

    # Update total symbols on repository
    repo = db.query(Repository).filter(Repository.id == repository_id).first()
    if repo:
        repo.total_symbols = len(all_symbol_records)
        repo.updated_at = func.now()

    db.commit()

    logger.info(
        f"Python analysis complete for {repository_id}: {len(python_files_data)} files, "
        f"{total_classes} classes, {total_functions} functions, {total_methods} methods, "
        f"{total_imports} imports, {total_routes} routes"
    )

    return PythonAnalysisResponse(
        repository_id=repository_id,
        files_analyzed=len(python_files_data),
        classes_found=total_classes,
        functions_found=total_functions,
        methods_found=total_methods,
        imports_found=total_imports,
        routes_found=total_routes,
        files_with_parse_errors=files_with_errors,
    )
