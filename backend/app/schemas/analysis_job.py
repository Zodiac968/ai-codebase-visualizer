from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class AnalysisJobResponse(BaseModel):
    id: UUID
    repository_id: UUID
    status: str
    stage: str
    progress_percent: int
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ProgressEvent(BaseModel):
    repository_id: UUID
    job_id: Optional[UUID] = None
    status: str
    stage: str
    progress_percent: int
    error_message: Optional[str] = None
