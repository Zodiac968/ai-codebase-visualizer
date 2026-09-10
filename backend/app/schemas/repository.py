from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class RepositoryImportRequest(BaseModel):
    github_url: str = Field(..., description="Public HTTPS GitHub repository URL")
    default_branch: Optional[str] = Field("main", description="Target Git branch to clone")


class RepositoryImportResponse(BaseModel):
    repository_id: UUID
    name: str
    status: str
    job_id: UUID
    message: str


class RepositoryResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    github_url: str
    default_branch: str
    status: str
    total_files: int
    total_lines: int
    total_symbols: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
