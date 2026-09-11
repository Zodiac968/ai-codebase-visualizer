from uuid import UUID
from typing import List, Dict, Optional
from pydantic import BaseModel, ConfigDict


class FileMetadata(BaseModel):
    relative_path: str
    filename: str
    extension: str
    language: str
    size_bytes: int
    line_count: int
    is_source: bool
    is_binary: bool
    is_config: bool
    sha256_hash: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RepositoryScanResponse(BaseModel):
    repository_id: UUID
    total_files: int
    source_files: int
    config_files: int
    binary_files: int
    ignored_files: int
    total_size_bytes: int
    total_source_lines: int
    languages: Dict[str, int]


class FileListResponse(BaseModel):
    repository_id: UUID
    total_files: int
    files: List[FileMetadata]
