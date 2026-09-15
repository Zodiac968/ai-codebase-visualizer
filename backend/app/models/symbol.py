import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.postgres import Base


class SymbolRecord(Base):
    __tablename__ = "symbols"

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
    name = Column(
        String(255),
        nullable=False,
    )
    symbol_type = Column(
        String(50),
        nullable=False,
        index=True,
    )
    qualified_name = Column(
        String(512),
        nullable=False,
        index=True,
    )
    parent_id = Column(
        UUID(as_uuid=True),
        ForeignKey("symbols.id", ondelete="SET NULL"),
        nullable=True,
    )
    start_line = Column(
        Integer,
        nullable=False,
    )
    end_line = Column(
        Integer,
        nullable=False,
    )
    start_column = Column(
        Integer,
        nullable=False,
        default=0,
    )
    end_column = Column(
        Integer,
        nullable=False,
        default=0,
    )
    signature = Column(
        String(1024),
        nullable=True,
    )
    docstring = Column(
        Text,
        nullable=True,
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    file = relationship("FileRecord", backref="symbols")

    def __repr__(self) -> str:
        return f"<SymbolRecord(id={self.id}, name={self.name}, type={self.symbol_type}, qname={self.qualified_name})>"
