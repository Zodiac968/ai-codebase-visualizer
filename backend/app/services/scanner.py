import os
import hashlib
from uuid import UUID
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.config import settings
from app.core.logging import logger
from app.models.repository import Repository
from app.models.file import FileRecord
from app.schemas.scanner import FileMetadata, RepositoryScanResponse


# Directories skipped during traversal
IGNORED_DIRECTORIES = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    "coverage",
    ".next",
    ".vite",
    ".cache",
    ".pytest_cache",
    ".mypy_cache",
    ".turbo",
    ".idea",
    ".vscode",
    ".svn",
    ".hg",
    ".tox",
    ".ruff_cache",
    "site-packages",
}

# Specific filenames or patterns to ignore
IGNORED_FILENAMES = {
    ".ds_store",
    "thumbs.db",
    ".gitkeep",
}

IGNORED_FILE_EXTENSIONS = {
    ".pyc",
    ".pyo",
    ".pyd",
    ".log",
    ".tmp",
    ".swp",
    ".swo",
}

# Known binary extensions
BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff",
    ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar", ".exe", ".dll", ".so",
    ".dylib", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp3", ".mp4",
    ".wav", ".avi", ".mov", ".wasm", ".bin", ".db", ".sqlite", ".class",
    ".jar", ".o", ".a",
}

# Supported AST-target source languages (V1)
SOURCE_EXTENSIONS_MAP = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
}

# Common configuration & metadata files
CONFIG_EXTENSIONS_MAP = {
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".xml": "xml",
    ".ini": "ini",
    ".cfg": "cfg",
    ".env": "env",
}

CONFIG_FILENAMES = {
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "requirements.txt",
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "pipfile",
    "gemfile",
    "cargo.toml",
    "pom.xml",
    "build.gradle",
    "makefile",
    ".gitignore",
    ".env.example",
}

DOC_EXTENSIONS = {
    ".md": "markdown",
    ".rst": "restructuredtext",
    ".txt": "text",
    ".markdown": "markdown",
}


def is_binary_file(file_path: str, extension: str) -> bool:
    """
    Determines whether a file is binary by extension or null-byte inspection.
    """
    if extension in BINARY_EXTENSIONS:
        return True

    try:
        with open(file_path, "rb") as f:
            chunk = f.read(1024)
            if b"\x00" in chunk:
                return True
    except (OSError, PermissionError):
        return True

    return False


def count_lines_and_hash(file_path: str) -> Tuple[int, Optional[str]]:
    """
    Safely counts lines in a text file and generates its SHA-256 hash.
    Handles UTF-8 with BOM, standard UTF-8, and fallback encodings.
    """
    try:
        with open(file_path, "r", encoding="utf-8-sig", errors="replace") as f:
            content = f.read()

        line_count = len(content.splitlines())
        sha256_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        return line_count, sha256_hash
    except Exception as exc:
        logger.debug(f"Could not read text for line count {file_path}: {exc}")
        return 0, None


def classify_file(filename: str, extension: str, is_binary: bool) -> Tuple[str, bool, bool]:
    """
    Classifies a file into a language identifier and category flags.
    Returns (language, is_source, is_config).
    """
    if is_binary:
        return "binary", False, False

    lower_name = filename.lower()
    lower_ext = extension.lower()

    # 1. Source files
    if lower_ext in SOURCE_EXTENSIONS_MAP:
        return SOURCE_EXTENSIONS_MAP[lower_ext], True, False

    # 2. Config / build files
    if lower_name in CONFIG_FILENAMES or lower_ext in CONFIG_EXTENSIONS_MAP:
        lang = CONFIG_EXTENSIONS_MAP.get(lower_ext, "configuration")
        return lang, False, True

    # 3. Documentation files
    if lower_ext in DOC_EXTENSIONS:
        return DOC_EXTENSIONS[lower_ext], False, False

    # 4. Other text files
    return "text" if lower_ext else "other", False, False


def scan_repository_directory(
    source_dir: str,
    repository_id: UUID,
) -> Tuple[RepositoryScanResponse, List[FileMetadata]]:
    """
    Recursively scans the cloned repository source directory.
    Extracts file metadata, calculates statistics, and classifies languages.
    """
    if not os.path.exists(source_dir):
        raise FileNotFoundError(f"Repository source directory not found at {source_dir}")

    files_list: List[FileMetadata] = []
    language_counts: Dict[str, int] = {}
    total_size = 0
    total_source_lines = 0
    source_files_count = 0
    config_files_count = 0
    binary_files_count = 0
    ignored_files_count = 0

    for root, dirs, files in os.walk(source_dir, topdown=True):
        # Filter ignored directories in-place during walk
        dirs[:] = [
            d for d in dirs
            if d.lower() not in IGNORED_DIRECTORIES and not d.startswith(".")
        ]

        for filename in files:
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, source_dir).replace("\\", "/")
            lower_filename = filename.lower()
            _, ext = os.path.splitext(lower_filename)

            # Check ignored files
            if lower_filename in IGNORED_FILENAMES or ext in IGNORED_FILE_EXTENSIONS:
                ignored_files_count += 1
                continue

            try:
                size_bytes = os.path.getsize(full_path)
            except OSError:
                size_bytes = 0

            is_binary = is_binary_file(full_path, ext)
            language, is_source, is_config = classify_file(filename, ext, is_binary)

            line_count = 0
            sha256_hash = None
            if not is_binary:
                line_count, sha256_hash = count_lines_and_hash(full_path)

            file_meta = FileMetadata(
                relative_path=rel_path,
                filename=filename,
                extension=ext,
                language=language,
                size_bytes=size_bytes,
                line_count=line_count,
                is_source=is_source,
                is_binary=is_binary,
                is_config=is_config,
                sha256_hash=sha256_hash,
            )
            files_list.append(file_meta)

            total_size += size_bytes
            if is_source:
                source_files_count += 1
                total_source_lines += line_count
                language_counts[language] = language_counts.get(language, 0) + 1
            elif is_config:
                config_files_count += 1
            elif is_binary:
                binary_files_count += 1

    total_files = len(files_list)

    scan_summary = RepositoryScanResponse(
        repository_id=repository_id,
        total_files=total_files,
        source_files=source_files_count,
        config_files=config_files_count,
        binary_files=binary_files_count,
        ignored_files=ignored_files_count,
        total_size_bytes=total_size,
        total_source_lines=total_source_lines,
        languages=language_counts,
    )

    return scan_summary, files_list


def scan_and_save_repository(repository_id: UUID, db: Session) -> RepositoryScanResponse:
    """
    Executes a scan on a repository's cloned workspace and persists file records in PostgreSQL.
    """
    repo = db.query(Repository).filter(Repository.id == repository_id).first()
    if not repo:
        raise ValueError("Repository not found")

    if repo.status != "READY":
        raise ValueError(f"Repository cannot be scanned while in '{repo.status}' state. Must be 'READY'.")

    # Determine source directory
    source_dir = repo.local_path
    if not source_dir or not os.path.exists(source_dir):
        # Fallback to standard storage path
        source_dir = os.path.join(settings.REPOSITORY_STORAGE_PATH, str(repository_id), "source")
        if not os.path.exists(source_dir):
            raise FileNotFoundError(f"Source workspace not found at {source_dir}")

    logger.info(f"Scanning repository {repository_id} ({repo.name}) at {source_dir}")

    # Run scan
    scan_summary, files_list = scan_repository_directory(source_dir, repository_id)

    # Persist file records in database
    db.query(FileRecord).filter(FileRecord.repository_id == repository_id).delete()

    db_records = [
        FileRecord(
            repository_id=repository_id,
            file_path=f.relative_path,
            language=f.language,
            size_bytes=f.size_bytes,
            line_count=f.line_count,
            sha256_hash=f.sha256_hash,
        )
        for f in files_list
    ]

    db.bulk_save_objects(db_records)

    # Update Repository summary metrics
    repo.total_files = scan_summary.total_files
    repo.total_lines = scan_summary.total_source_lines
    repo.updated_at = func.now()

    db.commit()
    db.refresh(repo)

    logger.info(
        f"Scan complete for {repository_id}: {scan_summary.total_files} total files, "
        f"{scan_summary.source_files} source files, {scan_summary.total_source_lines} LOC"
    )

    return scan_summary
