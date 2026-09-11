import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.postgres import Base


class Repository(Base):
    __tablename__ = "repositories"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(
        String(255),
        nullable=False,
    )
    github_url = Column(
        String(512),
        nullable=False,
    )
    default_branch = Column(
        String(100),
        default="main",
        nullable=False,
    )
    local_path = Column(
        String(512),
        nullable=True,
    )
    status = Column(
        String(50),
        default="PENDING",
        nullable=False,
        index=True,
    )
    total_files = Column(
        Integer,
        default=0,
        nullable=False,
    )
    total_lines = Column(
        Integer,
        default=0,
        nullable=False,
    )
    total_symbols = Column(
        Integer,
        default=0,
        nullable=False,
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    user = relationship("User", backref="repositories")
    jobs = relationship("AnalysisJob", back_populates="repository", cascade="all, delete-orphan", passive_deletes=True)
    files = relationship("FileRecord", back_populates="repository", cascade="all, delete-orphan", passive_deletes=True)

    def __repr__(self) -> str:
        return f"<Repository(id={self.id}, name={self.name}, status={self.status})>"
