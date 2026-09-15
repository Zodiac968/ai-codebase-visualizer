import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.postgres import Base


class RouteRecord(Base):
    __tablename__ = "routes"

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
    symbol_id = Column(
        UUID(as_uuid=True),
        ForeignKey("symbols.id", ondelete="SET NULL"),
        nullable=True,
    )
    framework = Column(
        String(50),
        nullable=False,
        index=True,
    )
    http_method = Column(
        String(20),
        nullable=False,
    )
    route_path = Column(
        String(512),
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
    file = relationship("FileRecord", backref="routes")
    symbol = relationship("SymbolRecord", backref="routes")

    def __repr__(self) -> str:
        return f"<RouteRecord(id={self.id}, framework={self.framework}, method={self.http_method}, path={self.route_path})>"
