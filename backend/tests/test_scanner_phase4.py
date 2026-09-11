import sys
import os
import shutil
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

from app.main import app
from app.services.scanner import scan_repository_directory


def test_scanner_directory_walker():
    mock_dir = "./data/test_mock_repo"
    os.makedirs(os.path.join(mock_dir, "src"), exist_ok=True)
    os.makedirs(os.path.join(mock_dir, "node_modules", "bad_pkg"), exist_ok=True)
    os.makedirs(os.path.join(mock_dir, ".git"), exist_ok=True)
    os.makedirs(os.path.join(mock_dir, "__pycache__"), exist_ok=True)

    try:
        # 1. Python file
        with open(os.path.join(mock_dir, "src", "app.py"), "w", encoding="utf-8") as f:
            f.write("def hello():\n    print('Hello world')\n")

        # 2. JavaScript files
        with open(os.path.join(mock_dir, "src", "index.js"), "w", encoding="utf-8") as f:
            f.write("console.log('JS');\n")
        with open(os.path.join(mock_dir, "src", "component.jsx"), "w", encoding="utf-8") as f:
            f.write("export const C = () => null;\n")
        with open(os.path.join(mock_dir, "src", "module.mjs"), "w", encoding="utf-8") as f:
            f.write("export const x = 1;\n")
        with open(os.path.join(mock_dir, "src", "common.cjs"), "w", encoding="utf-8") as f:
            f.write("module.exports = {};\n")

        # 3. TypeScript files
        with open(os.path.join(mock_dir, "src", "types.ts"), "w", encoding="utf-8") as f:
            f.write("export interface User { id: string; }\n")
        with open(os.path.join(mock_dir, "src", "App.tsx"), "w", encoding="utf-8") as f:
            f.write("export const App = () => null;\n")

        # 4. Config & doc files
        with open(os.path.join(mock_dir, "package.json"), "w", encoding="utf-8") as f:
            f.write('{"name": "test"}\n')
        with open(os.path.join(mock_dir, "requirements.txt"), "w", encoding="utf-8") as f:
            f.write("fastapi>=0.100\n")
        with open(os.path.join(mock_dir, "README.md"), "w", encoding="utf-8") as f:
            f.write("# Test Repo\n")

        # 5. Ignored files & binary file
        with open(os.path.join(mock_dir, "node_modules", "bad_pkg", "ignore_me.js"), "w") as f:
            f.write("ignored")
        with open(os.path.join(mock_dir, "__pycache__", "app.cpython-311.pyc"), "wb") as f:
            f.write(b"\x00\x00\x00\x00")
        with open(os.path.join(mock_dir, "src", "logo.png"), "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")

        summary, file_list = scan_repository_directory(mock_dir, uuid.uuid4())

        assert summary.languages.get("python") == 1
        assert summary.languages.get("javascript") == 4
        assert summary.languages.get("typescript") == 2
        assert summary.source_files == 7
        assert summary.binary_files == 1
        assert summary.config_files == 2
        assert summary.total_source_lines > 0

        # Check ignored paths
        rel_paths = [f.relative_path for f in file_list]
        assert not any("node_modules" in p for p in rel_paths)
        assert not any(".git" in p for p in rel_paths)
        assert not any("__pycache__" in p for p in rel_paths)

    finally:
        shutil.rmtree(mock_dir, ignore_errors=True)


def test_scanner_api_endpoints():
    client = TestClient(app)

    # Register User A and User B
    email_a = f"scan_user_a_{uuid.uuid4().hex[:6]}@example.com"
    r_a = client.post("/api/v1/auth/register", json={"email": email_a, "password": "Password123!"})
    assert r_a.status_code == 201
    tok_a = r_a.json()["access_token"]
    h_a = {"Authorization": f"Bearer {tok_a}"}

    email_b = f"scan_user_b_{uuid.uuid4().hex[:6]}@example.com"
    r_b = client.post("/api/v1/auth/register", json={"email": email_b, "password": "Password123!"})
    assert r_b.status_code == 201
    tok_b = r_b.json()["access_token"]
    h_b = {"Authorization": f"Bearer {tok_b}"}

    # Import small public repository
    r_imp = client.post("/api/v1/repositories/import", json={"github_url": "https://github.com/octocat/Hello-World"}, headers=h_a)
    assert r_imp.status_code == 202
    repo_id = r_imp.json()["repository_id"]

    # 1. Unauthenticated scan rejection
    r_unauth = client.post(f"/api/v1/repositories/{repo_id}/scan")
    assert r_unauth.status_code == 401

    # 2. User B cannot scan User A's repo (isolation check)
    r_forbid = client.post(f"/api/v1/repositories/{repo_id}/scan", headers=h_b)
    assert r_forbid.status_code == 404

    # 3. User A scans repo
    r_scan = client.post(f"/api/v1/repositories/{repo_id}/scan", headers=h_a)
    assert r_scan.status_code == 200
    scan_data = r_scan.json()
    assert scan_data["total_files"] > 0

    # 4. Fetch scanned files
    r_files = client.get(f"/api/v1/repositories/{repo_id}/files", headers=h_a)
    assert r_files.status_code == 200
    files_data = r_files.json()
    assert files_data["total_files"] == scan_data["total_files"]
    assert len(files_data["files"]) > 0

    # 5. User B cannot access User A's scanned files
    r_files_b = client.get(f"/api/v1/repositories/{repo_id}/files", headers=h_b)
    assert r_files_b.status_code == 404

    # Cleanup
    client.delete(f"/api/v1/repositories/{repo_id}", headers=h_a)


if __name__ == "__main__":
    test_scanner_directory_walker()
    print("[PASS] test_scanner_directory_walker")
    test_scanner_api_endpoints()
    print("[PASS] test_scanner_api_endpoints")
    print("ALL PHASE 4 TESTS PASSED SUCCESSFULLY!")
