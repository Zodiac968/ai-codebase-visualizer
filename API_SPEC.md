# REST API Specification

## AI-Powered Interactive Codebase Understanding and Visualization Platform

**Version:** 1.0 (Academic MVP)  
**Base URL:** `/api/v1`  
**Standard Response Format:** JSON (except SSE streams)  
**Authentication Scheme:** HTTP Bearer Header (`Authorization: Bearer <jwt_token>`)

---

## 1. Authentication Endpoints

### 1.1 User Registration
- **Route:** `POST /api/v1/auth/register`
- **Auth Required:** No
- **Request Body:**
  ```json
  {
    "email": "developer@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "email": "developer@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "created_at": "2026-08-27T10:00:00Z"
  }
  ```
- **Errors:** `400 Bad Request` (Email already exists, weak password).

### 1.2 User Login
- **Route:** `POST /api/v1/auth/login`
- **Auth Required:** No
- **Request Body:**
  ```json
  {
    "email": "developer@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "email": "developer@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
- **Errors:** `401 Unauthorized` (Invalid email or password).

### 1.3 Current User Info
- **Route:** `GET /api/v1/auth/me`
- **Auth Required:** Yes
- **Response `200 OK`:**
  ```json
  {
    "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "email": "developer@example.com"
  }
  ```

---

## 2. Repository Ingestion & Management

### 2.1 Import Public GitHub Repository
- **Route:** `POST /api/v1/repositories/import`
- **Auth Required:** Yes
- **Request Body:**
  ```json
  {
    "github_url": "https://github.com/fastapi/fastapi",
    "default_branch": "master"
  }
  ```
- **Response `202 Accepted`:**
  ```json
  {
    "repository_id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22",
    "name": "fastapi",
    "status": "ANALYZING",
    "job_id": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c33",
    "message": "Repository import and analysis initiated."
  }
  ```
- **Errors:** `400 Bad Request` (Invalid GitHub URL, repository exceeding size limits).

### 2.2 List User Repositories
- **Route:** `GET /api/v1/repositories`
- **Auth Required:** Yes
- **Response `200 OK`:**
  ```json
  [
    {
      "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22",
      "name": "fastapi",
      "github_url": "https://github.com/fastapi/fastapi",
      "status": "READY",
      "total_files": 142,
      "total_lines": 18450,
      "total_symbols": 680,
      "created_at": "2026-08-27T10:05:00Z"
    }
  ]
  ```

### 2.3 Get Repository Summary
- **Route:** `GET /api/v1/repositories/{id}`
- **Auth Required:** Yes
- **Response `200 OK`:**
  ```json
  {
    "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22",
    "name": "fastapi",
    "github_url": "https://github.com/fastapi/fastapi",
    "status": "READY",
    "total_files": 142,
    "total_lines": 18450,
    "total_symbols": 680,
    "languages": {
      "python": 138,
      "javascript": 4
    }
  }
  ```
- **Errors:** `404 Not Found`.

### 2.4 Delete Repository
- **Route:** `DELETE /api/v1/repositories/{id}`
- **Auth Required:** Yes
- **Response `204 No Content`**
- **Errors:** `404 Not Found`, `403 Forbidden`.

---

## 3. Analysis Progress & Live SSE Stream

### 3.1 Live Analysis Progress (SSE)
- **Route:** `GET /api/v1/repositories/{id}/progress`
- **Auth Required:** Yes (via query token or header)
- **Content-Type:** `text/event-stream`
- **Stream Event Payload Example:**
  ```text
  event: progress
  data: {"status": "PARSING", "stage": "Parsing Python ASTs with Tree-sitter", "progress_percent": 45}

  event: progress
  data: {"status": "GRAPH_BUILDING", "stage": "Constructing Neo4j Knowledge Graph", "progress_percent": 75}

  event: progress
  data: {"status": "READY", "stage": "Analysis Complete", "progress_percent": 100}
  ```

### 3.2 Poll Analysis Status
- **Route:** `GET /api/v1/repositories/{id}/status`
- **Auth Required:** Yes
- **Response `200 OK`:**
  ```json
  {
    "repository_id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22",
    "status": "READY",
    "stage": "Analysis Complete",
    "progress_percent": 100,
    "error_message": null
  }
  ```

---

## 4. Architecture Graph & Node Metadata

### 4.1 Get Architecture Graph Elements
- **Route:** `GET /api/v1/repositories/{id}/graph?level={package|file|symbol}`
- **Auth Required:** Yes
- **Query Parameters:**
  - `level` (optional, default `file`): Abstraction granularity (`package`, `file`, or `symbol`).
  - `module_path` (optional): Filter to sub-directory or package.
- **Response `200 OK` (React Flow formatted nodes & edges):**
  ```json
  {
    "nodes": [
      {
        "id": "file:app/auth.py",
        "type": "fileNode",
        "data": {
          "label": "auth.py",
          "path": "app/auth.py",
          "language": "python",
          "symbol_count": 8
        },
        "position": { "x": 100, "y": 150 }
      }
    ],
    "edges": [
      {
        "id": "edge:app/auth.py->app/security.py",
        "source": "file:app/auth.py",
        "target": "file:app/security.py",
        "label": "IMPORTS",
        "type": "smoothstep"
      }
    ]
  }
  ```

### 4.2 Get Node Detail Metadata
- **Route:** `GET /api/v1/repositories/{id}/nodes/{node_id}`
- **Auth Required:** Yes
- **Response `200 OK`:**
  ```json
  {
    "id": "func:app/auth.py:verify_token",
    "name": "verify_token",
    "symbol_type": "function",
    "file_path": "app/auth.py",
    "start_line": 42,
    "end_line": 68,
    "docstring": "Decodes and validates incoming JWT bearer tokens.",
    "callers": [
      { "name": "get_current_user", "file_path": "app/deps.py", "line": 15 }
    ],
    "callees": [
      { "name": "jwt.decode", "file_path": "external", "line": 50 }
    ]
  }
  ```

---

## 5. Source Code Access & Deep-Linking

### 5.1 Get Source File Content
- **Route:** `GET /api/v1/repositories/{id}/files/content?path={file_path}`
- **Auth Required:** Yes
- **Query Parameters:**
  - `path`: Relative path inside repository (e.g., `app/auth.py`).
- **Response `200 OK`:**
  ```json
  {
    "file_path": "app/auth.py",
    "language": "python",
    "total_lines": 95,
    "content": "from fastapi import HTTPException\nimport jwt\n\ndef verify_token(token: str):\n    ..."
  }
  ```
- **Errors:** `400 Bad Request` (Path traversal attempt `../`), `404 Not Found`.

---

## 6. Semantic Feature Search

### 6.1 Natural-Language Feature Search
- **Route:** `POST /api/v1/repositories/{id}/search`
- **Auth Required:** Yes
- **Request Body:**
  ```json
  {
    "query": "Where is the JWT token authentication logic implemented?",
    "top_k": 5
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "query": "Where is the JWT token authentication logic implemented?",
    "results": [
      {
        "chunk_id": "e4eebc99-9c0b-4ef8-bb6d-6bb9bd380e55",
        "file_path": "app/auth.py",
        "symbol_name": "verify_token",
        "symbol_type": "function",
        "start_line": 42,
        "end_line": 68,
        "similarity_score": 0.892,
        "context_header": "File: app/auth.py | Function: verify_token",
        "snippet": "def verify_token(token: str):\n    try:\n        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])\n        return payload\n    except JWTError:\n        raise credentials_exception"
      }
    ]
  }
  ```

---

## 7. Static Execution-Flow Tracing

### 7.1 List Detected Entrypoint Routes
- **Route:** `GET /api/v1/repositories/{id}/flows`
- **Auth Required:** Yes
- **Response `200 OK`:**
  ```json
  [
    {
      "id": "flow:post_login",
      "route_path": "/api/v1/auth/login",
      "http_method": "POST",
      "handler_name": "login_access_token",
      "file_path": "app/api/auth.py",
      "start_line": 25
    }
  ]
  ```

### 7.2 Get Traced Execution Path
- **Route:** `GET /api/v1/repositories/{id}/flows/{flow_id}`
- **Auth Required:** Yes
- **Response `200 OK`:**
  ```json
  {
    "flow_id": "flow:post_login",
    "entrypoint": {
      "route": "/api/v1/auth/login",
      "method": "POST",
      "handler": "login_access_token",
      "file_path": "app/api/auth.py",
      "line": 25
    },
    "steps": [
      {
        "step_number": 1,
        "symbol_name": "login_access_token",
        "symbol_type": "route_handler",
        "file_path": "app/api/auth.py",
        "start_line": 25,
        "end_line": 40,
        "status": "resolved"
      },
      {
        "step_number": 2,
        "symbol_name": "authenticate_user",
        "symbol_type": "function",
        "file_path": "app/services/user_service.py",
        "start_line": 50,
        "end_line": 72,
        "status": "resolved"
      },
      {
        "step_number": 3,
        "symbol_name": "UserModel.get_by_email",
        "symbol_type": "database_access",
        "file_path": "app/models/user.py",
        "start_line": 15,
        "end_line": 28,
        "status": "resolved"
      }
    ]
  }
  ```

---

## 8. AI Codebase Assistant (Groq RAG)

### 8.1 Ask AI Codebase Question (Streaming)
- **Route:** `POST /api/v1/repositories/{id}/chat`
- **Auth Required:** Yes
- **Request Body:**
  ```json
  {
    "conversation_id": "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380d44",
    "message": "Explain how user authentication and password hashing works in this repository."
  }
  ```
- **Response:** Streaming Chunk response / SSE text chunks terminating with JSON citations:
  ```text
  data: {"token": "In"}
  data: {"token": " this"}
  data: {"token": " repository,"}
  data: {"token": " authentication is handled in `app/auth.py`..."}
  data: {"citations": [{"file_path": "app/auth.py", "start_line": 42, "end_line": 68, "symbol_name": "verify_token"}]}
  data: [DONE]
  ```

### 8.2 Get Chat History
- **Route:** `GET /api/v1/repositories/{id}/conversations`
- **Auth Required:** Yes
- **Response `200 OK`:**
  ```json
  [
    {
      "id": "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380d44",
      "title": "Authentication Explanation",
      "created_at": "2026-08-27T10:15:00Z"
    }
  ]
  ```
