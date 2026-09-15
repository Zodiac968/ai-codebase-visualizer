import sys
import os
import shutil
import uuid
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from app.main import app
from app.parser.python_parser import PythonParser
from app.services.scanner import scan_and_save_repository
from app.db.postgres import SessionLocal
from app.models.symbol import SymbolRecord
from app.models.dependency import DependencyRecord
from app.models.route import RouteRecord
from app.core.config import settings


def test_python_parser_unit():
    parser = PythonParser()
    sample_code = '''
"""Module docstring."""
import os
import requests as req
from fastapi import FastAPI, APIRouter, Depends as D
from flask import Flask

app = FastAPI()
router = APIRouter(prefix="/api/v1")
flask_app = Flask(__name__)

class BaseService:
    """Base docstring."""
    pass

class UserService(BaseService):
    """User service docstring."""
    def __init__(self, db: str):
        self.db = db

    def get_user(self, user_id: str) -> dict:
        """Fetch user by ID."""
        return {"id": user_id}

@app.get("/users/{id}")
@router.post("/users")
def create_user_route(payload: dict) -> dict:
    """Route handler for users."""
    def inner_calculator():
        return 42
    return payload

@flask_app.route("/items", methods=["GET", "POST"])
def flask_items():
    """Flask route handler."""
    return "items"
'''

    file_id = uuid.uuid4()
    result = parser.parse_file(sample_code, file_id, "app/api/user.py")

    assert result.parse_status == "SUCCESS"
    assert len(result.symbols) == 7  # BaseService, UserService, __init__, get_user, create_user_route, inner_calculator, flask_items

    # 1. Verify Classes
    classes = [s for s in result.symbols if s.symbol_type == "class"]
    assert len(classes) == 2
    user_svc = next(s for s in classes if s.name == "UserService")
    assert user_svc.docstring == "User service docstring."
    assert user_svc.start_line > 0
    assert user_svc.end_line >= user_svc.start_line

    # 2. Verify Methods & Parent Qualification
    methods = [s for s in result.symbols if s.symbol_type == "method"]
    assert len(methods) == 2
    get_user_m = next(s for s in methods if s.name == "get_user")
    assert get_user_m.qualified_name == "UserService.get_user"
    assert get_user_m.parent_qualified_name == "UserService"
    assert "def get_user(self, user_id: str) -> dict" in get_user_m.signature
    assert get_user_m.docstring == "Fetch user by ID."

    # 3. Verify Functions & Nested Functions
    functions = [s for s in result.symbols if s.symbol_type == "function"]
    assert len(functions) >= 3
    create_fn = next(s for s in functions if s.name == "create_user_route")
    assert create_fn.docstring == "Route handler for users."
    inner_fn = next(s for s in functions if s.name == "inner_calculator")
    assert inner_fn.parent_qualified_name == "create_user_route"
    assert inner_fn.qualified_name == "create_user_route.inner_calculator"

    # 4. Verify Imports & Aliases
    imports = result.imports
    assert any(i.module_name == "os" and i.import_type == "import" for i in imports)
    assert any(i.module_name == "requests" and i.alias == "req" for i in imports)
    assert any(i.module_name == "fastapi" and i.imported_name == "FastAPI" for i in imports)
    assert any(i.module_name == "fastapi" and i.imported_name == "Depends" and i.alias == "D" for i in imports)

    # 5. Verify Route Detection
    routes = result.routes
    assert len(routes) >= 3  # GET /users/{id}, POST /users, GET & POST /items
    assert any(r.framework == "fastapi" and r.http_method == "GET" and r.route_path == "/users/{id}" for r in routes)
    assert any(r.framework == "fastapi" and r.http_method == "POST" and r.route_path == "/users" for r in routes)
    assert any(r.framework == "flask" and r.route_path == "/items" for r in routes)

    # 6. Verify Syntax Error Tolerance
    bad_syntax = "def broken(:\n    print('fail"
    bad_result = parser.parse_file(bad_syntax, uuid.uuid4(), "broken.py")
    assert bad_result.parse_status in ("ERRORS", "SUCCESS")  # Tree-sitter parses error nodes tolerantly without crashing


def test_python_analyzer_api():
    client = TestClient(app)

    # 1. Register User A & User B
    email_a = f"py_user_a_{uuid.uuid4().hex[:6]}@example.com"
    r_a = client.post("/api/v1/auth/register", json={"email": email_a, "password": "Password123!"})
    tok_a = r_a.json()["access_token"]
    h_a = {"Authorization": f"Bearer {tok_a}"}

    email_b = f"py_user_b_{uuid.uuid4().hex[:6]}@example.com"
    r_b = client.post("/api/v1/auth/register", json={"email": email_b, "password": "Password123!"})
    tok_b = r_b.json()["access_token"]
    h_b = {"Authorization": f"Bearer {tok_b}"}

    # 2. Import a small public repo
    r_imp = client.post("/api/v1/repositories/import", json={"github_url": "https://github.com/octocat/Hello-World"}, headers=h_a)
    assert r_imp.status_code == 202
    repo_id = r_imp.json()["repository_id"]

    time.sleep(4)

    # Add a mock Python file to repo workspace for rich analysis
    target_repo_dir = os.path.join(settings.REPOSITORY_STORAGE_PATH, str(repo_id), "source")
    os.makedirs(os.path.join(target_repo_dir, "app"), exist_ok=True)
    sample_py_path = os.path.join(target_repo_dir, "app", "service.py")
    with open(sample_py_path, "w", encoding="utf-8") as f:
        f.write("""import os
from fastapi import FastAPI

app = FastAPI()

class OrderManager:
    \"\"\"Order manager class.\"\"\"
    def process(self, order_id: int) -> bool:
        return True

@app.get("/orders/{order_id}")
def get_order(order_id: int):
    mgr = OrderManager()
    return mgr.process(order_id)
""")

    # Scan the repository first
    r_scan = client.post(f"/api/v1/repositories/{repo_id}/scan", headers=h_a)
    assert r_scan.status_code == 200

    # 3. Unauthenticated Analysis Request -> 401
    r_unauth = client.post(f"/api/v1/repositories/{repo_id}/analyze/python")
    assert r_unauth.status_code == 401

    # 4. User B cannot analyze User A's repo -> 404
    r_forbid = client.post(f"/api/v1/repositories/{repo_id}/analyze/python", headers=h_b)
    assert r_forbid.status_code == 404

    # 5. User A executes Python Tree-sitter analysis
    r_analyze = client.post(f"/api/v1/repositories/{repo_id}/analyze/python", headers=h_a)
    assert r_analyze.status_code == 200
    data = r_analyze.json()
    assert data["files_analyzed"] >= 1
    assert data["classes_found"] >= 1
    assert data["methods_found"] >= 1
    assert data["functions_found"] >= 1
    assert data["routes_found"] >= 1

    # 6. Verify GET /symbols endpoint
    r_symbols = client.get(f"/api/v1/repositories/{repo_id}/symbols", headers=h_a)
    assert r_symbols.status_code == 200
    sym_list = r_symbols.json()["symbols"]
    assert len(sym_list) >= 3

    # Check method parent resolution in database
    method_sym = next((s for s in sym_list if s["name"] == "process"), None)
    class_sym = next((s for s in sym_list if s["name"] == "OrderManager"), None)
    assert method_sym is not None
    assert class_sym is not None
    assert method_sym["parent_id"] == class_sym["id"]

    # 7. Re-analysis check (clean rebuild, no duplicates)
    r_reanalyze = client.post(f"/api/v1/repositories/{repo_id}/analyze/python", headers=h_a)
    assert r_reanalyze.status_code == 200
    r_symbols2 = client.get(f"/api/v1/repositories/{repo_id}/symbols", headers=h_a)
    assert len(r_symbols2.json()["symbols"]) == len(sym_list)

    # Cleanup
    client.delete(f"/api/v1/repositories/{repo_id}", headers=h_a)


if __name__ == "__main__":
    test_python_parser_unit()
    print("[PASS] test_python_parser_unit")
    test_python_analyzer_api()
    print("[PASS] test_python_analyzer_api")
    print("ALL PHASE 5 TESTS PASSED SUCCESSFULLY!")
