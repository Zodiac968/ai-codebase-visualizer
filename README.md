# AI-Powered Interactive Codebase Understanding and Visualization Platform

An academic software engineering platform that automatically ingests public GitHub repositories, performs AST-based static code analysis using Tree-sitter, constructs a software knowledge graph in Neo4j, generates local semantic vector embeddings in PostgreSQL/pgvector, and provides an interactive visual dashboard powered by React Flow and Groq LLM assistance.

---

## Key Features

1. **Interactive Architecture Graph**: Multi-level visual exploration of codebase structure (Packages $\rightarrow$ Files $\rightarrow$ Classes $\rightarrow$ Functions) with dependency links on a React Flow canvas.
2. **Static Execution-Flow Approximation**: Tracing API route entrypoints down to service logic and database entities without executing untrusted code.
3. **Semantic Feature Discovery**: Natural-language search over AST-aware code chunks powered by local 384-dimensional dense vector embeddings.
4. **AI Repository Assistant**: Fast, streaming codebase Q&A powered by Groq LLM (Llama 3.3) and hybrid RAG, providing accurate line-level source code citations.
5. **Source Code Deep-Linking**: Instant navigation and active line highlighting across all graph nodes, search results, and AI citations.

---

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Flow (`@xyflow/react`)
- **Backend**: Python 3.11/3.12, FastAPI, SQLAlchemy, Tree-sitter, Pydantic v2
- **Databases**:
  - **Neo4j 5+ Community**: Software Knowledge Graph (Nodes, Calls, Imports, Routes, DB Models)
  - **PostgreSQL 16 + pgvector**: Relational metadata, analysis jobs, chat history, and 384d vector embeddings
- **AI & Embeddings**:
  - **Embeddings**: Local `sentence-transformers/all-MiniLM-L6-v2` (384-dim, CPU inference)
  - **LLM**: Groq Cloud API (`llama-3.3-70b-versatile`)
- **Authentication**: Stateless JWT Bearer tokens
- **Real-Time Updates**: Server-Sent Events (SSE)

---

## Local Development Setup

### Prerequisites

- **Docker & Docker Compose** (Docker Desktop on Windows/Mac, Docker Engine on Linux)
- **Python 3.11+**
- **Node.js v20+** and **npm**

---

### Step 1: Start Database Infrastructure (Docker Compose)

Start PostgreSQL (with `pgvector`) and Neo4j Community in the background:

```bash
docker compose up -d postgres neo4j
```

Verify running containers:

```bash
docker compose ps
```

*Note: PostgreSQL is mapped to host port `5433` (`5433:5432`) to prevent port conflicts with any pre-existing local PostgreSQL service.*

---

### Step 2: Start Backend (FastAPI)

#### Option A: Local Virtualenv (Recommended for Development)

```bash
cd backend
python -m venv .venv

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env

uvicorn app.main:app --reload --port 8000
```

#### Option B: Containerized Backend (Docker Compose)

```bash
docker compose up -d backend
```

---

### Step 3: Start Frontend (React + Vite)

In a separate terminal:

```bash
cd frontend
npm install
cp .env.example .env

npm run dev
```

---

## Local Development URLs

| Service | URL | Description |
| :--- | :--- | :--- |
| **Frontend UI** | [http://localhost:5173](http://localhost:5173) | Vite React SPA development server |
| **Backend API** | [http://localhost:8000](http://localhost:8000) | FastAPI application root |
| **Health Check** | [http://localhost:8000/health](http://localhost:8000/health) | System & DB connectivity status |
| **Swagger API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive OpenAPI documentation |
| **ReDoc API Docs** | [http://localhost:8000/redoc](http://localhost:8000/redoc) | Alternative API documentation |
| **Neo4j Browser UI** | [http://localhost:7474](http://localhost:7474) | Neo4j query console (`neo4j` / `password123`) |
| **PostgreSQL Port** | `localhost:5433` | Database: `codebase_visualizer` (`postgres` / `postgres`) |

---

## Stopping Infrastructure

To stop all Docker containers:

```bash
docker compose down
```

To stop containers and delete stored volumes:

```bash
docker compose down -v
```

---

## Project Documentation Index

- [`SRS.md`](SRS.md): Complete functional and non-functional requirements specification.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): System architecture, components, data flows, and security model.
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md): 21-phase roadmap with task breakdowns and complexity estimates.
- [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md): PostgreSQL relational/pgvector schemas and Neo4j graph model.
- [`API_SPEC.md`](API_SPEC.md): Complete REST and SSE API endpoint contracts.
- [`DECISIONS.md`](DECISIONS.md): Architecture Decision Records (ADRs) and ambiguity resolutions.
- [`AGENTS.md`](AGENTS.md): Strict development rules and session handoff guidelines for AI coding agents.
- [`PROGRESS.md`](PROGRESS.md): Development progress tracker.

---

## Current Status

- **Completed Phases**:
  - **Phase 0**: Planning and Architecture Foundation
  - **Phase 1**: Project Skeleton & Development Environment
- **Next Phase**: **Phase 2 (Authentication)**
