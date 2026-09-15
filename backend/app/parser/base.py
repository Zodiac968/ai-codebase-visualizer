from abc import ABC, abstractmethod
from uuid import UUID
from app.schemas.parser import FileAnalysisResult


class BaseLanguageParser(ABC):
    """Abstract base class for Tree-sitter language parsers."""

    @abstractmethod
    def parse_file(
        self,
        file_content: str,
        file_id: UUID,
        relative_path: str,
    ) -> FileAnalysisResult:
        """Parses source file content and extracts symbols, imports, and routes."""
        pass
