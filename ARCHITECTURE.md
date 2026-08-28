# System Architecture Specification

## AI-Powered Interactive Codebase Understanding and Visualization Platform

**Version:** 1.0 (Academic MVP)  
**Status:** Approved  

---

## 1. High-Level Architecture Overview

The system is designed as a clean, decoupled client-server architecture with a high-performance Python/FastAPI backend, a modern React/TypeScript single-page frontend, and a dual-database storage tier:
- **Neo4j** stores the topological Software Knowledge Graph (modules, files, classes, functions, calls, imports, routes, and DB models).
- **PostgreSQL (with `pgvector`)** stores user accounts, repository metadata, analysis job logs, conversational chat history, and AST code chunks with 384-dimensional dense vector embeddings.
- **Groq Cloud API** provides ultra-fast LLM inference for the hybrid RAG question-answering assistant.
- **Local Embedding Pipeline** generates vector embeddings on the backend CPU using `sentence-transformers/all-MiniLM-L6-v2`, avoiding third-party vector API costs and preserving data privacy.

---

## 2. ASCII System Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FRONTEND (React + TS + Vite)                              │
│                                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────────┐  ┌─────────────────────────────┐  │
│  │   Interactive Graph   │  │   Static Execution Flow   │  │      AI Codebase Chat       │  │
│  │   (React Flow Canvas) │  │    (Traced Path Viewer)   │  │    (Streaming Markdown)     │  │
│  └───────────▲───────────┘  └─────────────▲─────────────┘  └──────────────▲──────────────┘  │
│              │                            │                               │                 │
│  ┌───────────┴────────────────────────────┴───────────────────────────────┴──────────────┐  │
│  │                     Source Code Inspector & Line Deep-Linker                          │  │
│  └────────────────────────────────────────▲──────────────────────────────────────────────┘  │
│                                           │ REST / SSE Events                               │
└───────────────────────────────────────────┼─────────────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   BACKEND (Python / FastAPI)                                │
│                                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                                  REST & SSE API Layer                                 │  │
│  │   /api/v1/auth   /api/v1/repositories   /api/v1/graph   /api/v1/search   /api/v1/chat  │  │
│  └───────────▲────────────────────────────▲───────────────────────────────▲──────────────┘  │
│              │                            │                               │                 │
│  ┌───────────┴──────────┐   ┌─────────────┴─────────────┐   ┌─────────────┴──────────────┐  │
│  │  Repository Ingestion│   │    Static Analysis Engine │   │   Hybrid RAG & Groq LLM    │  │
│  │  - Git Clone Service │   │    - Tree-sitter Parser   │   │   - Vector Search Query    │  │
│  │  - File Filter (.git)│──►│      (Python, JS, TS)     │──►│   - Graph Context Fetcher  │  │
│  │  - SSE Job Manager   │   │    - AST Symbol Extractor │   │   - Groq Llama-3.3 Stream  │  │
│  └──────────────────────┘   │    - Dependency & Calls   │   └─────────────▲──────────────┘  │
│                             └─────────────┬─────────────┘                 │                 │
│                                           │                               │                 │
│                             ┌─────────────┴─────────────┐                 │                 │
│                             │   AST Chunker & Embedder  │─────────────────┘                 │
│                             │   (all-MiniLM-L6-v2: 384d)│                                   │
│                             └───────┬─────────────┬─────┘                                   │
└─────────────────────────────────────┼─────────────┼─────────────────────────────────────────┘
                                      │             │
                    Cypher Queries    │             │  SQL + Vector Cosine (<=>)
                    (Nodes & Edges)   │             │  (Metadata, Chunks, Embeddings)
                                      ▼             ▼
             ┌───────────────────────────┐       ┌─────────────────────────────────┐
             │       Neo4j Graph DB      │       │     PostgreSQL + pgvector       │
             │                           │       │                                 │
             │ - Modules, Files, Classes │       │ - Users, Repositories, Jobs     │
             │ - Functions, Methods      │       │ - Code Chunks (start/end lines) │
             │ - API Routes, DB Entities │       │ - 384d Dense Vector Embeddings  │
             │ - CALLS, IMPORTS, EXPOSES │       │ - Chat Sessions & Messages      │
             └───────────────────────────┘       └─────────────────────────────────┘
```

---

## 3. Core Subsystems & Components

### 3.1 Frontend Subsystem (Single Page Application)
- **Framework**: React 18+ with TypeScript and Vite.
- **Styling**: Tailwind CSS for responsive, modern developer dark/light UI.
- **Graph Visualization**: React Flow (`@xyflow/react`) for fluid, zoomable, pannable node-link architecture diagrams and execution path views with custom HTML node cards.
- **Code Viewer**: Monaco Editor or Prism/Highlight.js with active line highlighting and deep-linking support (`file_path#L10-L25`).
- **Real-Time Client**: `EventSource` wrapper for receiving asynchronous ingestion progress from the backend SSE stream.
- **State Management**: Zustand / React Context for repository selection, active graph nodes, and chat state.

### 3.2 Backend Subsystem (FastAPI Web Service)
- **API Framework**: FastAPI (Python 3.11+) offering asynchronous request handling, Pydantic data validation, and OpenAPI generation.
- **Security & Auth**: Stateless JWT authentication with `PyJWT` and password hashing via `passlib[bcrypt]`.
- **Job Orchestration**: Lightweight background tasks managed directly via FastAPI `BackgroundTasks` / `asyncio` task queues with status persisted in PostgreSQL and broadcasted via SSE.
- **Static Analysis Engine**:
  - `tree-sitter` bindings for Python (`tree-sitter-python`), JavaScript (`tree-sitter-javascript`), and TypeScript (`tree-sitter-typescript`).
  - AST Visitor modules that extract symbol hierarchies, function calls, class inheritance, import paths, API routes, and ORM models.
  - Source location tracker capturing exact `start_line`, `end_line`, `start_col`, and `end_col`.
- **Local Embedding Engine**:
  - `sentence-transformers` / `fastembed` running `sentence-transformers/all-MiniLM-L6-v2` locally on CPU.
  - Generates 384-dimensional dense vectors for AST-aware code chunks.
- **Hybrid RAG & Groq Client**:
  - Formulates contextual prompts combining top-$k$ pgvector code snippets and Neo4j graph neighbors (callers/callees).
  - Streams LLM responses via the official `groq` Python SDK.

### 3.3 Storage Subsystem
- **PostgreSQL 16 + pgvector**:
  - Primary relational store for user credentials, repository metadata, analysis jobs, code chunk text + line bounds, and chat history.
  - pgvector HNSW index configured with cosine distance operator (`<=>`) for sub-millisecond semantic search over code chunks.
- **Neo4j Community Edition 5+**:
  - Labeled Property Graph storing structural entities (`Repository`, `Module`, `File`, `Class`, `Function`, `APIEndpoint`, `DatabaseModel`) and typed relationships (`CONTAINS`, `IMPORTS`, `CALLS`, `DEPENDS_ON`, `EXPOSES`, `ACCESSES`).
  - Enables multi-hop Cypher queries to compute dependency trees and trace static execution paths.

---

## 4. End-to-End Data Flow

```text
[User Ingestion Request]
       │
       ▼
 1. Backend clones public GitHub repo to ephemeral read-only directory (/tmp/repos/<repo_id>)
       │
       ▼
 2. File scanner filters ignored files (.git, node_modules, binaries, minified code)
       │
       ▼
 3. Tree-sitter AST parsers extract symbols, line numbers, calls, imports, routes, & DB models
       │
       ├────────────────────────────────────────┬────────────────────────────────────────┐
       ▼                                        ▼                                        ▼
 4a. Write Nodes & Edges to Neo4j        4b. Chunk AST symbols & compute           4c. Stream SSE
     - Repository, File, Class, Function     local 384d embeddings                     progress updates
     - CONTAINS, CALLS, IMPORTS, EXPOSES     - Insert into PostgreSQL/pgvector         to frontend client
       │                                        │                                        │
       └────────────────────────────────────────┴────────────────────────────────────────┘
       │
       ▼
 5. Analysis Complete → Frontend transitions to Interactive Dashboard
       │
       ├────────────────────────────────────────┬────────────────────────────────────────┐
       ▼                                        ▼                                        ▼
 [Graph Exploration]                    [Semantic Search]                      [AI Hybrid RAG Chat]
 - Frontend calls /api/v1/graph          - Frontend calls /api/v1/search        - Frontend calls /api/v1/chat
 - Neo4j returns hierarchical nodes      - pgvector returns top-k chunks        - pgvector finds relevant code
 - React Flow renders canvas             - User clicks chunk -> Code view       - Neo4j finds call hierarchy
                                                                                - Groq streams cited answer
```

---

## 5. Security & Isolation Model

1. **Static Analysis Guarantee**: Cloned code is never executed, imported into the Python runtime, or compiled. Tree-sitter parses raw text byte streams into syntax trees without code evaluation.
2. **Path Traversal Protection**: File path parameters are strictly validated to prevent `../` directory traversal outside the repository workspace.
3. **Tenant Scoping**: All relational queries, vector queries, and Cypher graph queries are strictly filtered by `user_id` and `repository_id`.
4. **Token Security**: JWT tokens are signed with HMAC-SHA256 using a server-side secret key and configured with expiration lifetimes.
