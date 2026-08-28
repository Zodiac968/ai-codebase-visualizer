# AGENTS.md — Guidelines for AI Coding Agents

Welcome, Agent. You are pair programming on the **AI-Powered Interactive Codebase Understanding and Visualization Platform**.

This document outlines mandatory rules and operating procedures for all AI agents working in this repository. Strict compliance is required to maintain architectural integrity, avoid scope creep, and ensure steady progress toward the 1-month academic MVP deadline.

---

## 1. Golden Rules of Development

1. **Read Before Writing**: Before writing or modifying any code in any session, always read:
   - `SRS.md` (Functional & non-functional requirements)
   - `ARCHITECTURE.md` (System design & data flows)
   - `DECISIONS.md` (Recorded technical decisions & ADRs)
   - `DATABASE_SCHEMA.md` (PostgreSQL & Neo4j data contracts)
   - `API_SPEC.md` (REST API contracts)
   - `PROGRESS.md` (Current phase status & completed work)

2. **Phase Boundary Discipline**:
   - Work **only** on the specific phase and tasks instructed by the user.
   - Do **NOT** implement future phases ahead of time or introduce preliminary scaffoldings for unrelated phases unless explicitly instructed.
   - Respect the phased implementation roadmap in `IMPLEMENTATION_PLAN.md`.

3. **No Silent Architectural Shifts**:
   - Adhere strictly to the chosen tech stack: **React + TypeScript + Tailwind + React Flow** on the frontend; **FastAPI + Tree-sitter + PostgreSQL/pgvector + Neo4j + Groq API** on the backend.
   - Do **NOT** introduce alternative libraries (e.g., Qdrant, Celery, Redis, LangChain, Prisma, GraphQL, WebSockets) without explicit user approval and a recorded entry in `DECISIONS.md`.

4. **Zero Modification to Analyzed Code**:
   - The backend analyzer treats ingested repositories strictly as **read-only untrusted input**.
   - Under no circumstances should backend code execute, compile, or modify files inside cloned repositories.

5. **Academic MVP Simplicity**:
   - Optimize for working demonstration, clarity, and maintainability.
   - Do **NOT** over-engineer with enterprise abstractions, microservices, complex multi-broker queues, or Kubernetes configs.
   - Prefer clean, straightforward Python and TypeScript code over heavy meta-frameworks.

6. **Preserve Working Code**:
   - Do not perform destructive refactors of working modules.
   - If an existing file needs enhancement, perform surgical, non-breaking updates that preserve existing test and API contracts.

7. **Verification Over Assumption**:
   - Never claim a feature is complete or functional without executing verification steps (e.g., running tests, validating parser outputs, testing API endpoints with `curl` or test scripts).
   - If a step is incomplete or blocked by external dependencies (e.g., API key, running database instance), report the exact status and next steps clearly.

8. **Update Progress Reliably**:
   - Upon completing any phase or subtask, immediately update `PROGRESS.md` to reflect the current state, date, and verified features.

---

## 2. Directory Structure & Conventions

```text
ai-codebase-visualizer/
├── docs/                        # Additional research/diagram assets (if needed)
├── backend/                     # FastAPI Backend Application
│   ├── app/
│   │   ├── api/                 # API route handlers (v1)
│   │   │   ├── auth.py
│   │   │   ├── repositories.py
│   │   │   ├── graph.py
│   │   │   ├── search.py
│   │   │   ├── execution_flow.py
│   │   │   └── chat.py
│   │   ├── core/                # Config, security, DB connections
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   ├── postgres.py
│   │   │   └── neo4j.py
│   │   ├── models/              # SQLAlchemy / Pydantic models
│   │   ├── parser/              # Tree-sitter AST parsers & extractors
│   │   │   ├── base.py
│   │   │   ├── python_parser.py
│   │   │   └── ts_js_parser.py
│   │   ├── graph/               # Neo4j graph builders & queries
│   │   ├── embeddings/          # Local sentence-transformers & chunker
│   │   ├── rag/                 # Hybrid RAG & Groq LLM client
│   │   └── services/            # Ingestion worker, scanner, repo manager
│   ├── tests/                   # Backend unit and integration tests
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                    # React + Vite + TypeScript Frontend
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── graph/           # React Flow custom nodes & canvas
│   │   │   ├── flow/            # Execution flow diagrams
│   │   │   ├── code/            # Source code preview & highlighter
│   │   │   ├── chat/            # AI Q&A conversation panel
│   │   │   └── layout/          # Dashboard sidebar, header, drawers
│   │   ├── hooks/               # Custom React hooks (SSE, API)
│   │   ├── services/            # Axios API client functions
│   │   ├── types/               # TypeScript interfaces (matching API_SPEC.md)
│   │   └── App.tsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml           # Local dev compose (Postgres + pgvector, Neo4j, backend, frontend)
├── AGENTS.md                    # Agent instructions (this file)
├── SRS.md                       # Software requirements specification
├── ARCHITECTURE.md              # System architecture & data flow
├── IMPLEMENTATION_PLAN.md       # Phased roadmap
├── DATABASE_SCHEMA.md           # PostgreSQL & Neo4j schemas
├── API_SPEC.md                  # REST API contract
├── PROGRESS.md                  # Development progress log
├── DECISIONS.md                 # Architecture Decision Records (ADRs)
└── README.md                    # Project overview
```

---

## 3. Communication & Session Handoff Protocol

At the end of every agent session:
1. Summarize what was accomplished and verified.
2. Note any files created or modified.
3. List any open questions, blockers, or required user inputs (e.g., API keys).
4. Update `PROGRESS.md`.
5. Clearly specify the exact next phase/task recommended for the next session.
