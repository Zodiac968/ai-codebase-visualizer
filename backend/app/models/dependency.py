import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.postgres import Base


class DependencyRecord(Base):
    __tablename__ = "dependencies"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )
    file_id = Column(
        UUID(as_uuid=True),
        ForeignKey("files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_name = Column(
        String(512),
        nullable=False,
        index=True,
    )
    imported_name = Column(
        String(255),
        nullable=True,
    )
    alias = Column(
        String(255),
        nullable=True,
    )
    import_type = Column(
        String(50),
        default="import",
        nullable=False,
    )
    line_number = Column(
        Integer,
        nullable=False,
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    file = relationship("FileRecord", backref="dependencies")

    def __repr__(self) -> str:
        return f"<DependencyRecord(id={self.id}, module={self.module_name}, imported={self.imported_name})>"
