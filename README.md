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
- **Backend**: Python 3.11, FastAPI, Tree-sitter (`tree-sitter-python`, `tree-sitter-javascript`, `tree-sitter-typescript`), Pydantic
- **Databases**:
  - **Neo4j 5+**: Software Knowledge Graph (Nodes, Calls, Imports, Routes, DB Models)
  - **PostgreSQL 16 + pgvector**: Relational metadata, analysis jobs, chat history, and 384d vector embeddings
- **AI & Embeddings**:
  - **Embeddings**: Local `sentence-transformers/all-MiniLM-L6-v2` (384-dim, CPU inference)
  - **LLM**: Groq Cloud API (`llama-3.3-70b-versatile`)
- **Authentication**: Stateless JWT Bearer tokens
- **Real-Time Updates**: Server-Sent Events (SSE)

---

## System Architecture

```text
[ React Flow + TypeScript Frontend ]
                 │
      REST APIs  │  SSE Progress Stream
                 ▼
     [ FastAPI Backend Engine ]
     ├─ Git Ingestion & File Scanner
     ├─ Tree-sitter AST Multi-Language Parser
     ├─ Local AST Chunker & 384d Embedder
     └─ Hybrid RAG & Groq LLM Client
           │                     │
           ▼                     ▼
   [ Neo4j Graph DB ]    [ PostgreSQL + pgvector ]
   - Architecture Graph  - Relational Metadata
   - Call & Import Edges - 384d Vector Embeddings
   - Execution Paths     - Chat Sessions & History
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

- **Current Phase**: **Phase 0 (Planning and Architecture)** — Baseline Complete
- **Next Phase**: **Phase 1 (Project Skeleton & Development Environment)**
