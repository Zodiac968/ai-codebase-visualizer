import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.postgres import Base


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )
    repository_id = Column(
        UUID(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(
        String(50),
        default="PENDING",
        nullable=False,
        index=True,
    )
    stage = Column(
        String(100),
        default="Initialized",
        nullable=False,
    )
    progress_percent = Column(
        Integer,
        default=0,
        nullable=False,
    )
    error_message = Column(
        Text,
        nullable=True,
    )
    started_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    completed_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    repository = relationship("Repository", back_populates="jobs")

    def __repr__(self) -> str:
        return f"<AnalysisJob(id={self.id}, repo_id={self.repository_id}, status={self.status}, progress={self.progress_percent}%)>"
