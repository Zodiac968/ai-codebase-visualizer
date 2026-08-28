# Implementation Plan & Phased Roadmap

## AI-Powered Interactive Codebase Understanding and Visualization Platform

**Target Duration:** ~1 Month (Academic MVP)  
**Methodology:** Phased, iterative development with strict phase boundaries and continuous verification.

---

## Roadmap Overview

| Phase | Title | Complexity | Est. Effort | Key Deliverable |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 0** | Planning and Architecture | Low | 1 Day | Complete SRS, Architecture, Schemas, & ADRs |
| **Phase 1** | Project Skeleton & Dev Environment | Low | 1 Day | Docker Compose, FastAPI skeleton, React skeleton |
| **Phase 2** | Authentication | Low | 1-2 Days | JWT registration/login API & Auth context |
| **Phase 3** | GitHub Repository Ingestion | Medium | 2 Days | Git clone worker, job tracking, SSE stream |
| **Phase 4** | Repository Scanner & File Filter | Low | 1 Day | Language detection, ignore rules, metadata index |
| **Phase 5** | Tree-sitter Python Analyzer | Medium-High | 2-3 Days | Python AST parser, symbol & relationship extraction |
| **Phase 6** | JS/TS Analyzer | Medium-High | 2-3 Days | JS/TS AST parser, symbol & relationship extraction |
| **Phase 7** | Neo4j Knowledge Graph Persistence | Medium | 2 Days | Cypher graph builder, schema constraints, queries |
| **Phase 8** | Architecture Graph API | Medium | 1-2 Days | Hierarchical graph query endpoints (clustering/nodes) |
| **Phase 9** | React Flow Visualization Canvas | High | 3 Days | Interactive node graph, zoom/pan, detail drawer |
| **Phase 10** | Source-Code Location & Navigation | Medium | 2 Days | Deep-link code viewer with active line highlighting |
| **Phase 11** | AST Code Chunking & Local Embeddings | Medium | 2 Days | Local sentence-transformers, pgvector integration |
| **Phase 12** | Semantic Feature Search | Medium | 1-2 Days | Cosine search endpoint, search UI & jump-to-code |
| **Phase 13** | Hybrid RAG Pipeline | Medium-High | 2 Days | Graph context + vector retrieval prompt assembler |
| **Phase 14** | Groq AI Assistant | Medium | 2 Days | Streaming Groq LLM responses with source citations |
| **Phase 15** | Static Execution-Flow Analyzer | High | 3 Days | Route $\rightarrow$ function $\rightarrow$ DB call tracer |
| **Phase 16** | Execution-Flow Visualization | Medium | 2 Days | Step-by-step visual execution flow viewer |
| **Phase 17** | Unified Dashboard & Layout Polish | Medium | 2 Days | 3-pane responsive layout & sample repo presets |
| **Phase 18** | Error Handling & SRS Hardening | Medium | 2 Days | Graceful error boundary, syntax recovery, limits |
| **Phase 19** | Containerized Deployment Setup | Medium | 2 Days | Multi-stage Docker build, production compose/VPS |
| **Phase 20** | Academic Demonstration Preparation | Low | 1-2 Days | Sample repos, demo script, presentation deck assets |

---

## Detailed Phase Breakdown

### Phase 0: Planning and Architecture
- **Objective**: Analyze requirements, resolve design ambiguities, define data schemas, API contracts, and establish project documentation.
- **Dependencies**: None.
- **Expected Outputs**: `SRS.md`, `AGENTS.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `DATABASE_SCHEMA.md`, `API_SPEC.md`, `PROGRESS.md`, `DECISIONS.md`, `README.md`.
- **Requirements Satisfied**: All architectural foundations.
- **Complexity**: Low.
- **Can Be Split**: No (Atomic planning phase).

---

### Phase 1: Project Skeleton and Development Environment
- **Objective**: Establish the initial backend and frontend directory structure, configure `docker-compose.yml` for PostgreSQL (`pgvector/pgvector:pg16`) and Neo4j (`neo4j:5-community`), and create baseline FastAPI and Vite React applications.
- **Dependencies**: Phase 0.
- **Expected Outputs**:
  - `docker-compose.yml` with working Postgres/pgvector and Neo4j services.
  - `backend/` with FastAPI entrypoint (`main.py`), health check endpoint (`/health`), and database connection managers.
  - `frontend/` with Vite React + TypeScript + Tailwind CSS skeleton displaying initial status.
- **Requirements Satisfied**: REQ-5.10, REQ-5.12.
- **Complexity**: Low.
- **Can Be Split**: Yes (1.1 Backend + Docker skeleton; 1.2 Frontend skeleton).

---

### Phase 2: Authentication
- **Objective**: Implement simple, stateless JWT user registration and login on backend and frontend to isolate user repositories and chat sessions.
- **Dependencies**: Phase 1.
- **Expected Outputs**:
  - PostgreSQL `users` table and migration/SQLAlchemy models.
  - `POST /api/v1/auth/register` and `POST /api/v1/auth/login` endpoints with bcrypt password hashing.
  - JWT authentication middleware/dependency in FastAPI.
  - Frontend login/registration forms with auth context and token persistence.
- **Requirements Satisfied**: REQ-5.4, REQ-5.5.
- **Complexity**: Low.
- **Can Be Split**: Yes (2.1 Backend Auth API; 2.2 Frontend Auth UI).

---

### Phase 3: GitHub Repository Ingestion
- **Objective**: Implement asynchronous cloning of public GitHub repositories into a secure, isolated workspace directory with job tracking and real-time SSE progress streaming.
- **Dependencies**: Phase 2.
- **Expected Outputs**:
  - PostgreSQL `repositories` and `analysis_jobs` tables.
  - `POST /api/v1/repositories/import` endpoint triggering asynchronous clone.
  - `GET /api/v1/repositories/{id}/progress` SSE endpoint streaming real-time status (`CLONING`, `SCANNING`, etc.).
  - Frontend repository import modal with real-time progress bar.
- **Requirements Satisfied**: REQ-1.1, REQ-1.2, REQ-1.4, REQ-1.5.
- **Complexity**: Medium.
- **Can Be Split**: Yes (3.1 Backend Ingestion & SSE; 3.2 Frontend Import Modal).

---

### Phase 4: Repository Scanner & File Filter
- **Objective**: Scan cloned repositories, enforce size/LOC limits, filter out ignored directories (`.git`, `node_modules`, binaries), extract file tree structures, and index files in PostgreSQL.
- **Dependencies**: Phase 3.
- **Expected Outputs**:
  - Scanner service filtering out non-source files and detecting language extensions (`.py`, `.js`, `.jsx`, `.ts`, `.tsx`).
  - PostgreSQL `files` records populated with file paths, sizes, and line counts.
  - `GET /api/v1/repositories/{id}/files` endpoint.
- **Requirements Satisfied**: REQ-1.2, REQ-1.3, REQ-5.7.
- **Complexity**: Low.
- **Can Be Split**: No.

---

### Phase 5: Tree-sitter Python Analyzer
- **Objective**: Implement AST-based static parsing for Python source files using `tree-sitter` and `tree-sitter-python` to extract modules, classes, functions, calls, imports, FastAPI/Flask API routes, and SQLAlchemy models with exact line numbers.
- **Dependencies**: Phase 4.
- **Expected Outputs**:
  - Python AST visitor extracting nodes (Module, Class, Function, Route, DBModel) and relationships (CONTAINS, CALLS, IMPORTS, EXPOSES, ACCESSES) with `[start_line, end_line]`.
  - Comprehensive unit test parsing representative Python codebases.
- **Requirements Satisfied**: REQ-2.1, REQ-2.2, REQ-2.3, REQ-2.4.
- **Complexity**: Medium-High.
- **Can Be Split**: Yes (5.1 Structure/Symbol Parser; 5.2 Calls & Imports Extractor; 5.3 Route/ORM Extractor).

---

### Phase 6: JavaScript/TypeScript Analyzer
- **Objective**: Implement AST-based static parsing for JS/TS/JSX/TSX source files using `tree-sitter` (`tree-sitter-javascript`, `tree-sitter-typescript`) to extract modules, classes, functions, imports, Express API routes, and database entities with exact line numbers.
- **Dependencies**: Phase 5.
- **Expected Outputs**:
  - JS/TS AST visitor extracting symbols and relationships with exact line metadata.
  - Unit tests parsing representative JS/TS repositories.
- **Requirements Satisfied**: REQ-2.1, REQ-2.2, REQ-2.3, REQ-2.4.
- **Complexity**: Medium-High.
- **Can Be Split**: Yes (6.1 JS/TS Parser; 6.2 Route/Express Extractor).

---

### Phase 7: Neo4j Knowledge Graph Persistence
- **Objective**: Store parsed symbols and relationships into Neo4j with unique constraints, parameterized Cypher batch upserts, and multi-tenancy tags (`repository_id`).
- **Dependencies**: Phase 5, Phase 6.
- **Expected Outputs**:
  - Neo4j graph service executing idempotent Cypher queries.
  - Graph schema constraints on `(e:Entity {id: repository_id + ":" + file_path + ":" + qualified_name})`.
  - Integration verifying graph node and edge creation after repository scan.
- **Requirements Satisfied**: REQ-2.5, REQ-5.5.
- **Complexity**: Medium.
- **Can Be Split**: No.

---

### Phase 8: Architecture Graph API
- **Objective**: Create backend endpoints to retrieve hierarchical and clustered graph structures (Package level $\rightarrow$ File level $\rightarrow$ Class/Function level) and node detail metadata from Neo4j.
- **Dependencies**: Phase 7.
- **Expected Outputs**:
  - `GET /api/v1/repositories/{id}/graph` supporting abstraction level query parameters (`level=package|file|symbol`).
  - `GET /api/v1/repositories/{id}/nodes/{node_id}` returning detailed symbol metadata and incoming/outgoing edges.
- **Requirements Satisfied**: REQ-4.1, REQ-5.2.
- **Complexity**: Medium.
- **Can Be Split**: No.

---

### Phase 9: React Flow Visualization Canvas
- **Objective**: Implement the primary interactive code architecture canvas in React using React Flow with custom node designs, zoom/pan controls, hierarchical level toggles, and node selection side drawer.
- **Dependencies**: Phase 8.
- **Expected Outputs**:
  - React Flow canvas component rendering modules, files, and classes with distinct visual styling.
  - Abstraction level switcher (Package vs File vs Symbol view).
  - Node inspection sidebar showing symbol info, docstrings, dependencies, and file links.
- **Requirements Satisfied**: REQ-4.1.
- **Complexity**: High.
- **Can Be Split**: Yes (9.1 Canvas & Custom Nodes; 9.2 Abstraction Level Filtering; 9.3 Node Details Drawer).

---

### Phase 10: Source-Code Location & Navigation
- **Objective**: Implement the source code viewing panel allowing users to inspect raw repository files with syntax highlighting, automatic line scrolling, and targeted line range highlighting on symbol click.
- **Dependencies**: Phase 4, Phase 9.
- **Expected Outputs**:
  - `GET /api/v1/repositories/{id}/files/{file_path}` API endpoint returning file contents safely.
  - Frontend Code Viewer modal/panel with syntax highlighting and line range highlighting (`#L15-L35`).
  - Deep-link synchronization from graph node clicks to the code viewer.
- **Requirements Satisfied**: REQ-2.3, REQ-4.3.
- **Complexity**: Medium.
- **Can Be Split**: No.

---

### Phase 11: AST Code Chunking & Local Embeddings
- **Objective**: Implement AST-aware code chunking (at function/class boundaries with context headers) and generate dense 384-dimensional vector embeddings using a local `sentence-transformers` model, storing them in PostgreSQL with `pgvector` HNSW indexes.
- **Dependencies**: Phase 4, Phase 5, Phase 6.
- **Expected Outputs**:
  - AST chunker producing chunks with `start_line`, `end_line`, and symbol context headers.
  - Local embedding pipeline generating 384d vectors using `all-MiniLM-L6-v2`.
  - PostgreSQL `code_chunks` table with pgvector column and HNSW cosine distance index.
- **Requirements Satisfied**: REQ-3.1, REQ-3.2, REQ-3.3, REQ-5.6.
- **Complexity**: Medium.
- **Can Be Split**: Yes (11.1 Chunker; 11.2 Embedder & pgvector storage).

---

### Phase 12: Semantic Feature Search
- **Objective**: Implement natural-language semantic feature search allowing users to query repository functionality and retrieve ranked code chunks with direct source navigation.
- **Dependencies**: Phase 11, Phase 10.
- **Expected Outputs**:
  - `POST /api/v1/repositories/{id}/search` endpoint performing vector similarity queries.
  - Search bar in UI returning ranked list of matching functions/files with similarity scores and snippet previews.
  - Clicking search results triggers the source code viewer at the exact line range.
- **Requirements Satisfied**: REQ-3.4, REQ-4.3.
- **Complexity**: Medium.
- **Can Be Split**: No.

---

### Phase 13: Hybrid RAG Pipeline
- **Objective**: Construct a hybrid RAG retrieval pipeline that combines semantic code chunks from pgvector with structural graph context (callers, callees, imports) from Neo4j to assemble a rich, grounded LLM prompt.
- **Dependencies**: Phase 7, Phase 11.
- **Expected Outputs**:
  - RAG prompt builder that retrieves top-$k$ chunks and enriches them with 1-hop Neo4j graph relationships.
  - Unit tests verifying structured prompt assembly with line number annotations.
- **Requirements Satisfied**: REQ-4.4.
- **Complexity**: Medium-High.
- **Can Be Split**: No.

---

### Phase 14: Groq AI Assistant
- **Objective**: Integrate Groq API (Llama 3.3) for high-speed streaming conversational repository Q&A, formatting responses with markdown and clickable source citations (`[path:line]`).
- **Dependencies**: Phase 13, Phase 10.
- **Expected Outputs**:
  - `POST /api/v1/repositories/{id}/chat` streaming endpoint (SSE or streaming HTTP response).
  - PostgreSQL `conversations` and `messages` tables for multi-turn history.
  - Frontend AI Chat panel with streaming token rendering and interactive citation deep-links.
- **Requirements Satisfied**: REQ-4.5, REQ-4.6.
- **Complexity**: Medium.
- **Can Be Split**: Yes (14.1 Backend Groq client & chat API; 14.2 Frontend streaming chat UI).

---

### Phase 15: Static Execution-Flow Analyzer
- **Objective**: Implement the backend static execution-flow tracer that starts from detected entrypoints (API routes, main scripts) and traces through call graphs in Neo4j to service functions and database queries, explicitly tagging unresolved dynamic dispatches.
- **Dependencies**: Phase 7, Phase 8.
- **Expected Outputs**:
  - Execution-flow graph traversal algorithm in Python/Cypher.
  - `GET /api/v1/repositories/{id}/flows` listing available entrypoint routes.
  - `GET /api/v1/repositories/{id}/flows/{flow_id}` returning ordered sequence of execution steps.
- **Requirements Satisfied**: REQ-4.2.
- **Complexity**: High.
- **Can Be Split**: Yes (15.1 Route entrypoint indexing; 15.2 Multi-hop call path tracer).

---

### Phase 16: Execution-Flow Visualization
- **Objective**: Build an interactive execution-flow visualization tab/mode in the frontend using React Flow / step-card timelines to show the sequential path from HTTP request to database query.
- **Dependencies**: Phase 15, Phase 10.
- **Expected Outputs**:
  - Flow selector dropdown listing detected API routes.
  - Visual timeline/flow-graph of calls with status indicators (`Resolved` vs `[Unresolved Target]`).
  - Clicking any step opens the source code viewer at that exact function definition.
- **Requirements Satisfied**: REQ-4.2, REQ-4.3.
- **Complexity**: Medium.
- **Can Be Split**: No.

---

### Phase 17: Unified Dashboard & UI Polish
- **Objective**: Unify the 3 core views (Architecture Graph, Execution Flow, AI Chat) into a polished, responsive 3-pane layout with repository selector, stats summary, and pre-loaded sample repositories.
- **Dependencies**: Phase 9, Phase 14, Phase 16.
- **Expected Outputs**:
  - Unified responsive dashboard layout with toggleable panels.
  - Quick-start demo presets (e.g., pre-ingested demo repositories).
  - Clean dark/light theme styling with Tailwind CSS.
- **Requirements Satisfied**: REQ-5.11.
- **Complexity**: Medium.
- **Can Be Split**: No.

---

### Phase 18: Error Handling & SRS Hardening
- **Objective**: Conduct comprehensive edge-case hardening across the system: robust Tree-sitter error recovery, handling malformed imports, repository size limits enforcement, token budget capping, and clean API error payloads.
- **Dependencies**: Phase 17.
- **Expected Outputs**:
  - Global FastAPI exception handlers returning consistent JSON error envelopes.
  - Parser fallback for unparsable/corrupted files.
  - Frontend error boundary components and user-friendly toast notifications.
- **Requirements Satisfied**: REQ-5.3, REQ-5.8, REQ-5.12.
- **Complexity**: Medium.
- **Can Be Split**: No.

---

### Phase 19: Containerized Deployment Setup
- **Objective**: Prepare production-ready multi-stage Dockerfiles and `docker-compose.prod.yml` configured for deployment on low-cost VPS/cloud services (Render, Railway, Fly.io, or Ubuntu VPS).
- **Dependencies**: Phase 18.
- **Expected Outputs**:
  - Optimized multi-stage Dockerfiles for backend (Python + Tree-sitter + local model) and frontend (Vite build + Nginx).
  - Production Docker Compose configuration with health checks, environment variables, and volume persistence.
  - Deployment guide and smoke test verification script.
- **Requirements Satisfied**: REQ-5.10.
- **Complexity**: Medium.
- **Can Be Split**: No.

---

### Phase 20: Final Academic Demonstration Preparation
- **Objective**: Finalize academic demonstration assets: verification against all functional/non-functional SRS requirements, curated demo walkthrough scripts, architecture diagrams, and defense presentation preparation.
- **Dependencies**: Phase 19.
- **Expected Outputs**:
  - Demo script covering the 3 primary user journeys (Architecture exploration, Feature search / AI Q&A, Execution-flow tracing).
  - Verified benchmark report (ingestion time, search latency, graph node count on sample repos).
  - Final project documentation review.
- **Requirements Satisfied**: All SRS requirements (Validation & Verification).
- **Complexity**: Low.
- **Can Be Split**: No.
