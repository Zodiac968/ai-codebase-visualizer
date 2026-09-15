import re
from uuid import UUID
from typing import List, Optional, Tuple
import tree_sitter_python
from tree_sitter import Language, Parser, Node

from app.parser.base import BaseLanguageParser
from app.schemas.parser import (
    ExtractedSymbol,
    ExtractedImport,
    ExtractedRoute,
    FileAnalysisResult,
)
from app.core.logging import logger

PY_LANGUAGE = Language(tree_sitter_python.language())


class PythonParser(BaseLanguageParser):
    """
    Tree-sitter Python AST analyzer.
    Extracts classes, functions, methods, imports, decorators, and API routes.
    """

    def __init__(self):
        self.parser = Parser(PY_LANGUAGE)

    def _get_node_text(self, node: Node, source_bytes: bytes) -> str:
        """Helper to extract UTF-8 decoded text from a node."""
        return node.text.decode("utf-8", errors="replace")

    def _extract_docstring(self, body_node: Optional[Node], source_bytes: bytes) -> Optional[str]:
        """Extracts docstring from the first expression statement of a class/function block."""
        if not body_node:
            return None

        for child in body_node.children:
            if child.type == "expression_statement":
                # Check for string child
                for sub in child.children:
                    if sub.type == "string":
                        raw_text = self._get_node_text(sub, source_bytes).strip()
                        # Strip triple quotes or single/double quotes
                        if raw_text.startswith(('"""', "'''")) and len(raw_text) >= 6:
                            return raw_text[3:-3].strip()
                        elif raw_text.startswith(('"', "'")) and len(raw_text) >= 2:
                            return raw_text[1:-1].strip()
                        return raw_text
                break
            elif child.type not in ("comment", "\n"):
                break
        return None

    def _extract_decorators(self, node: Node, source_bytes: bytes) -> List[str]:
        """Extracts decorator strings from a decorated_definition node."""
        decorators = []
        for child in node.children:
            if child.type == "decorator":
                decorators.append(self._get_node_text(child, source_bytes).strip())
        return decorators

    def _detect_routes_from_decorators(
        self,
        decorators: List[str],
        func_name: str,
        line_number: int,
    ) -> List[ExtractedRoute]:
        """
        Heuristic route detector for FastAPI and Flask endpoints from decorator strings.
        Examples:
          @app.get("/users/{id}")
          @router.post("/items", status_code=201)
          @app.route("/api/v1/data", methods=["GET", "POST"])
        """
        routes: List[ExtractedRoute] = []

        for dec in decorators:
            # 1. FastAPI decorator pattern: @[obj].(get|post|put|delete|patch)("path", ...)
            fastapi_match = re.search(
                r"@[a-zA-Z0-9_.]*?\b(?:app|router|api_router|api|v1|endpoint)?\.(get|post|put|delete|patch|options|head)\s*\(\s*['\"]([^'\"]+)['\"]",
                dec,
                re.IGNORECASE,
            )
            if fastapi_match:
                method = fastapi_match.group(1).upper()
                path = fastapi_match.group(2)
                routes.append(
                    ExtractedRoute(
                        framework="fastapi",
                        http_method=method,
                        route_path=path,
                        function_name=func_name,
                        line_number=line_number,
                    )
                )
                continue

            # 2. Flask decorator pattern: @[obj].route("path", methods=[...])
            flask_match = re.search(
                r"@[a-zA-Z0-9_.]*?\b(?:app|flask_app|bp|blueprint|api)?\.route\s*\(\s*['\"]([^'\"]+)['\"]",
                dec,
                re.IGNORECASE,
            )
            if flask_match:
                path = flask_match.group(1)
                # Check for explicit methods list
                methods_match = re.search(r"methods\s*=\s*\[(.*?)\]", dec, re.IGNORECASE)
                if methods_match:
                    found_methods = re.findall(r"['\"]([A-Z]+)['\"]", methods_match.group(1), re.IGNORECASE)
                    for m in found_methods:
                        routes.append(
                            ExtractedRoute(
                                framework="flask",
                                http_method=m.upper(),
                                route_path=path,
                                function_name=func_name,
                                line_number=line_number,
                            )
                        )
                else:
                    # Default Flask method is GET
                    routes.append(
                        ExtractedRoute(
                            framework="flask",
                            http_method="GET",
                            route_path=path,
                            function_name=func_name,
                            line_number=line_number,
                        )
                    )

        return routes

    def _extract_function_signature(self, func_node: Node, source_bytes: bytes) -> str:
        """Constructs a clean textual signature: def name(params) -> return_type."""
        name_node = func_node.child_by_field_name("name")
        params_node = func_node.child_by_field_name("parameters")
        return_type_node = func_node.child_by_field_name("return_type")

        name_str = self._get_node_text(name_node, source_bytes) if name_node else "anonymous"
        params_str = self._get_node_text(params_node, source_bytes) if params_node else "()"
        ret_str = f" -> {self._get_node_text(return_type_node, source_bytes)}" if return_type_node else ""

        return f"def {name_str}{params_str}{ret_str}"

    def parse_file(
        self,
        file_content: str,
        file_id: UUID,
        relative_path: str,
    ) -> FileAnalysisResult:
        """
        Parses a Python file with Tree-sitter and returns structured symbols, imports, and routes.
        """
        source_bytes = file_content.encode("utf-8")
        symbols: List[ExtractedSymbol] = []
        imports: List[ExtractedImport] = []
        routes: List[ExtractedRoute] = []

        try:
            tree = self.parser.parse(source_bytes)
            has_errors = tree.root_node.has_error
            parse_status = "ERRORS" if has_errors else "SUCCESS"

            def traverse_nodes(node: Node, parent_qname: Optional[str] = None, in_class: bool = False):
                for child in node.children:
                    # 1. Imports: import a, b as c
                    if child.type == "import_statement":
                        line_no = child.start_point.row + 1
                        for sub in child.children:
                            if sub.type == "dotted_name":
                                mod_name = self._get_node_text(sub, source_bytes)
                                imports.append(
                                    ExtractedImport(
                                        module_name=mod_name,
                                        imported_name=None,
                                        alias=None,
                                        import_type="import",
                                        line_number=line_no,
                                    )
                                )
                            elif sub.type == "aliased_import":
                                name_n = sub.child_by_field_name("name")
                                alias_n = sub.child_by_field_name("alias")
                                mod_name = self._get_node_text(name_n, source_bytes) if name_n else ""
                                alias_str = self._get_node_text(alias_n, source_bytes) if alias_n else None
                                imports.append(
                                    ExtractedImport(
                                        module_name=mod_name,
                                        imported_name=None,
                                        alias=alias_str,
                                        import_type="import",
                                        line_number=line_no,
                                    )
                                )

                    # 2. Imports: from a import b, c as d
                    elif child.type == "import_from_statement":
                        line_no = child.start_point.row + 1
                        mod_name_node = child.child_by_field_name("module_name")
                        mod_name = self._get_node_text(mod_name_node, source_bytes) if mod_name_node else ""

                        for sub in child.children:
                            if sub.type == "dotted_name" and sub != mod_name_node:
                                imp_name = self._get_node_text(sub, source_bytes)
                                imports.append(
                                    ExtractedImport(
                                        module_name=mod_name,
                                        imported_name=imp_name,
                                        alias=None,
                                        import_type="from_import",
                                        line_number=line_no,
                                    )
                                )
                            elif sub.type == "aliased_import":
                                name_n = sub.child_by_field_name("name")
                                alias_n = sub.child_by_field_name("alias")
                                imp_name = self._get_node_text(name_n, source_bytes) if name_n else ""
                                alias_str = self._get_node_text(alias_n, source_bytes) if alias_n else None
                                imports.append(
                                    ExtractedImport(
                                        module_name=mod_name,
                                        imported_name=imp_name,
                                        alias=alias_str,
                                        import_type="from_import",
                                        line_number=line_no,
                                    )
                                )

                    # 3. Decorated definitions (functions or classes with @decorators)
                    elif child.type == "decorated_definition":
                        decorators = self._extract_decorators(child, source_bytes)
                        # Find underlying function or class
                        inner_def = None
                        for sub in child.children:
                            if sub.type in ("function_definition", "class_definition"):
                                inner_def = sub
                                break

                        if inner_def:
                            handle_definition(inner_def, decorators, parent_qname, in_class)

                    # 4. Undecorated Class or Function definitions
                    elif child.type in ("function_definition", "class_definition"):
                        handle_definition(child, [], parent_qname, in_class)

            def handle_definition(
                def_node: Node,
                decorators: List[str],
                parent_qname: Optional[str],
                in_class: bool,
            ):
                name_node = def_node.child_by_field_name("name")
                name_str = self._get_node_text(name_node, source_bytes) if name_node else "anonymous"

                start_line = def_node.start_point.row + 1
                end_line = def_node.end_point.row + 1
                start_col = def_node.start_point.column
                end_col = def_node.end_point.column

                body_node = def_node.child_by_field_name("body")
                docstring = self._extract_docstring(body_node, source_bytes)

                if def_node.type == "class_definition":
                    qname = f"{parent_qname}.{name_str}" if parent_qname else name_str
                    symbols.append(
                        ExtractedSymbol(
                            name=name_str,
                            symbol_type="class",
                            qualified_name=qname,
                            parent_qualified_name=parent_qname,
                            start_line=start_line,
                            end_line=end_line,
                            start_column=start_col,
                            end_column=end_col,
                            signature=f"class {name_str}",
                            docstring=docstring,
                            decorators=decorators,
                        )
                    )
                    # Traverse class body methods
                    if body_node:
                        traverse_nodes(body_node, parent_qname=qname, in_class=True)

                elif def_node.type == "function_definition":
                    sym_type = "method" if in_class else "function"
                    qname = f"{parent_qname}.{name_str}" if parent_qname else name_str
                    sig = self._extract_function_signature(def_node, source_bytes)

                    symbols.append(
                        ExtractedSymbol(
                            name=name_str,
                            symbol_type=sym_type,
                            qualified_name=qname,
                            parent_qualified_name=parent_qname,
                            start_line=start_line,
                            end_line=end_line,
                            start_column=start_col,
                            end_column=end_col,
                            signature=sig,
                            docstring=docstring,
                            decorators=decorators,
                        )
                    )

                    # Check for API routes
                    if decorators:
                        detected_routes = self._detect_routes_from_decorators(decorators, name_str, start_line)
                        routes.extend(detected_routes)

                    # Traverse nested functions inside function body
                    if body_node:
                        traverse_nodes(body_node, parent_qname=qname, in_class=False)

            # Start recursive traversal from AST root
            traverse_nodes(tree.root_node)

            return FileAnalysisResult(
                file_id=file_id,
                relative_path=relative_path,
                parse_status=parse_status,
                symbols=symbols,
                imports=imports,
                routes=routes,
            )

        except Exception as exc:
            logger.warning(f"Tree-sitter parse exception for {relative_path}: {exc}")
            return FileAnalysisResult(
                file_id=file_id,
                relative_path=relative_path,
                parse_status="FAILED",
                symbols=[],
                imports=[],
                routes=[],
                error_message=str(exc),
            )
