import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.postgres import Base


class FileRecord(Base):
    __tablename__ = "files"

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
    file_path = Column(
        String(1024),
        nullable=False,
    )
    language = Column(
        String(50),
        nullable=False,
        index=True,
    )
    size_bytes = Column(
        Integer,
        nullable=False,
        default=0,
    )
    line_count = Column(
        Integer,
        nullable=False,
        default=0,
    )
    sha256_hash = Column(
        String(64),
        nullable=True,
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    repository = relationship("Repository", back_populates="files")

    __table_args__ = (
        UniqueConstraint("repository_id", "file_path", name="uq_repository_file_path"),
    )

    def __repr__(self) -> str:
        return f"<FileRecord(id={self.id}, repo_id={self.repository_id}, path={self.file_path}, lang={self.language})>"
