# Architecture Decision Records (ADRs) & SRS Ambiguity Resolutions

## AI-Powered Interactive Codebase Understanding and Visualization Platform

**Version:** 1.1 (Phase 1 Baseline)  
**Status:** Approved  

---

## 1. Core Architectural Decisions

### ADR-001: Frontend Graph Rendering Engine — React Flow (`@xyflow/react`)
- **Context:** The frontend requires an interactive, performant, and customizable canvas to visualize software knowledge graphs and execution flows with pan/zoom, custom HTML cards, and edge styling.
- **Alternatives Considered:** D3.js, Cytoscape.js, Vis.js, React Force Graph.
- **Decision:** Use **React Flow (`@xyflow/react`)**.
- **Rationale:** React Flow provides native React component integration, declarative state management, custom node rendering with Tailwind styling, and built-in controls (minimap, zoom, drag). D3 and Cytoscape require imperative DOM manipulation that creates lifecycle friction in modern React.

---

### ADR-002: Vector Storage — PostgreSQL with `pgvector` (Rejecting Dedicated Vector DBs like Qdrant)
- **Context:** Semantic code chunk search requires dense vector storage and cosine similarity indexing.
- **Alternatives Considered:** Qdrant, Pinecone, Milvus, ChromaDB, Weaviate.
- **Decision:** Use **PostgreSQL with the `pgvector` extension**.
- **Rationale:** Minimizes infrastructure complexity for an academic MVP by avoiding a third dedicated database service daemon. PostgreSQL already stores relational entities (users, repos, files, chat history); `pgvector` allows transactional consistency, joins between relational metadata and vectors, and provides high-speed HNSW indexing with minimal RAM overhead.

---

### ADR-003: Embedding Generation — Local Model (`all-MiniLM-L6-v2`, 384 Dimensions)
- **Context:** Need dense vector embeddings for AST code chunks without incurring per-token API costs or introducing external API rate-limiting delays.
- **Alternatives Considered:** OpenAI `text-embedding-3-small` (1536d), Cohere Embed, local `bge-large-en-v1.5` (1024d).
- **Decision:** Use local **`sentence-transformers/all-MiniLM-L6-v2`** (384 dimensions) via `fastembed` or PyTorch CPU inference.
- **Rationale:** 
  1. **Zero Cost & Offline Capability**: Runs entirely locally on standard CPU hardware.
  2. **Speed & Lightweight**: Embeds chunks in <15 ms per chunk; model file is only ~80 MB.
  3. **Index Efficiency**: 384 dimensions consume 4x less memory in pgvector HNSW index than 1536d vectors, crucial for low-cost/free VPS deployments.

---

### ADR-004: LLM Generation Provider — Groq Cloud API
- **Context:** Conversational codebase Q&A requires high-quality reasoning and ultra-low latency streaming for an interactive UI experience.
- **Alternatives Considered:** OpenAI GPT-4o-mini, Anthropic Claude 3.5 Haiku, Local Ollama / Llama.cpp.
- **Decision:** Use **Groq Cloud API** with `llama-3.3-70b-versatile` (or `llama-3.1-8b-instant`).
- **Rationale:** Groq's LPU hardware delivers inference speeds exceeding 250+ tokens/sec, enabling near-instantaneous streaming answers in the chat pane. The free/low-cost tier generously accommodates academic testing, whereas running 70B models locally exceeds standard hardware capabilities.
- **Configurability Note:** The specific model identifier is stored in backend configuration (`GROQ_MODEL=llama-3.3-70b-versatile`) and can be toggled without code modifications.

---

### ADR-005: Execution-Flow Strategy — Static Approximation (Zero Code Execution)
- **Context:** Users require execution-flow visualization to understand how requests travel through the codebase.
- **Alternatives Considered:** Dynamic tracing / runtime instrumentation (e.g., executing code under debugger/profiler), full symbolic execution.
- **Decision:** Implement **Static Execution-Flow Approximation** using AST call graph traversal.
- **Rationale:** Executing arbitrary, untrusted user-submitted GitHub repositories on the backend server introduces critical Remote Code Execution (RCE) security risks and environment setup hurdles (missing DBs, env vars, external services). Static analysis safely approximates execution paths by tracing AST routes $\rightarrow$ functions $\rightarrow$ DB queries, explicitly tagging dynamic dispatches or unresolved targets as `[Unresolved Target]`.

---

### ADR-006: Ingestion Progress Protocol — Server-Sent Events (SSE)
- **Context:** Ingesting and analyzing a repository involves multi-step background stages (Cloning $\rightarrow$ Parsing $\rightarrow$ Graphing $\rightarrow$ Embedding). The frontend needs real-time progress updates.
- **Alternatives Considered:** WebSockets, Client Polling (`setInterval`).
- **Decision:** Use **Server-Sent Events (SSE)** via `GET /api/v1/repositories/{id}/progress`.
- **Rationale:** Ingestion progress is strictly unidirectional (backend $\rightarrow$ frontend). SSE runs natively over HTTP/1.1 and HTTP/2 without WebSocket handshake complexity, custom framing, or connection state overhead. A fallback status polling endpoint is also provided.

---

### ADR-007: Authentication Strategy — Stateless JWT
- **Context:** Need user isolation for uploaded repositories and chat history.
- **Alternatives Considered:** Stateful session cookies, OAuth2 GitHub Login, Auth0/Clerk.
- **Decision:** Use **Stateless JSON Web Tokens (JWT)** with Bearer authentication.
- **Rationale:** Simplest, most reliable implementation for decoupled React SPA and FastAPI backend without external third-party auth service dependencies or CORS cookie complications.

---

### ADR-008: Ingestion Scope for V1 — Public GitHub Repositories
- **Context:** Mechanism for importing code into the visualizer.
- **Alternatives Considered:** Local zip file upload, GitHub OAuth private repository integration, local filesystem path binding.
- **Decision:** Support **Public HTTPS GitHub URLs** for V1.
- **Rationale:** Provides the cleanest user experience without requiring users to configure GitHub OAuth apps or upload local ZIP archives. Public URLs can be cloned directly via `git clone --depth 1`.

---

### ADR-009: PostgreSQL Host Port Mapping (5433:5432) for Local Development
- **Context:** In developer environments where a native Windows PostgreSQL service is already active on host port 5432, Docker Compose port binding collisions cause authentication failures against the wrong database instance.
- **Decision:** Map host port `5433` to Docker container port `5432` (`5433:5432`) in `docker-compose.yml` and configure local host `DATABASE_URL` as `postgresql://postgres:postgres@localhost:5433/codebase_visualizer`. Inside the internal Docker Compose network, containerized backend services continue communicating on default port `5432`.
- **Rationale:** Guarantees zero host port conflicts with existing developer databases while maintaining standard internal container networking.

---

## 2. Analysis of SRS Ambiguities & Resolutions

### Ambiguity 1: "Local Folder Path" vs "Public GitHub URLs"
- **The Issue:** Some initial SRS drafts mention pointing the analyzer to a "local folder path", while cloud web deployment requires remote repository ingestion.
- **Resolution for MVP:** The backend will support **Public GitHub URLs** as the primary ingestion interface. The backend cloning worker clones the remote repository into an isolated local server directory (`/tmp/repos/<repo_id>`). The internal scanner and parser operate on this local folder path. This fulfills both requirements cleanly.

---

### Ambiguity 2: Repository Source-Code Storage at Rest
- **The Issue:** Should raw source code files be persisted in PostgreSQL columns, stored permanently on disk, or fetched dynamically on demand?
- **Resolution for MVP:** Store repository file trees and metadata in PostgreSQL `files` table, and maintain the cloned repository directory in an isolated backend storage directory (`/storage/repos/<repo_id>`). The API endpoint `GET /api/v1/repositories/{id}/files/content?path=...` safely reads from the local disk clone with strict path traversal validation (`os.path.realpath` check).

---

### Ambiguity 3: Requirement to Encrypt Source Code at Rest
- **The Issue:** Certain security specifications suggest full database/disk encryption for analyzed source code.
- **Resolution for MVP:** For an academic MVP operating on **public open-source repositories**, file system-level disk encryption is unnecessary overhead. Data is isolated by `user_id` and `repository_id` at the application database layer. Repositories can be deleted by the user at any time (triggering cascade deletion across Postgres, Neo4j, and disk).

---

### Ambiguity 4: Incremental Re-Analysis vs Clean Full Ingestion
- **The Issue:** Should the analyzer support Git diff / incremental commit updates?
- **Resolution for MVP:** Incremental AST and graph diffing adds massive algorithmic complexity. For the MVP, re-analyzing a repository performs a clean wipe and rebuild of that repository's Neo4j sub-graph and pgvector chunks.

---

### Ambiguity 5: Dynamic Dispatch & Polymorphic Call Ambiguity
- **The Issue:** Static analysis cannot dynamically resolve polymorphic calls (e.g., Python `obj.handle()` or JS higher-order callbacks `handlers[type](req)`).
- **Resolution for MVP:** When the Tree-sitter visitor cannot uniquely resolve a function call to a known definition within the repository's symbol table, the call relationship is persisted in Neo4j with property `is_resolved: false` and rendered in the UI with a distinct dashed visual style and label `[Unresolved Target]`.

---

### Ambiguity 6: API Route & Database Query Detection Strategy
- **The Issue:** How to identify web routes and database models across different frameworks without executing code?
- **Resolution for MVP:** Implement AST pattern matching for common conventions:
  - **Python**: FastAPI/Flask decorators (`@app.get`, `@router.post`), SQLAlchemy models (`class X(Base)` / `db.Model`).
  - **JavaScript/TypeScript**: Express route calls (`app.get(path, handler)`, `router.post(...)`), Mongoose/Prisma/Sequelize models.
  - Frameworks outside these standard patterns fall back to regular Class/Function nodes.

---

### Ambiguity 7: Graph Abstraction Hierarchy & Canvas Clutter
- **The Issue:** Rendering 5,000 function nodes simultaneously crashes browser canvases and creates visual noise.
- **Resolution for MVP:** The backend graph API supports level-based querying (`?level=package`, `?level=file`, `?level=symbol`). The default React Flow view renders top-level Packages and Files. Clicking a File or Package node expands child Classes and Functions on demand.

---

### Ambiguity 8: Source-Code Deep Linking & Highlighting
- **The Issue:** How to ensure clicked graph nodes, search results, and AI citations highlight exact lines accurately?
- **Resolution for MVP:** Every symbol in Neo4j and code chunk in PostgreSQL strictly stores `start_line` and `end_line` (1-indexed). The frontend code viewer accepts URL hashes/props (e.g., `line_start=42&line_end=68`), automatically scrolls to the line, and applies a distinct highlight background.

---

### Ambiguity 9: Free/Low-Cost Deployment Constraints
- **The Issue:** Running Neo4j, PostgreSQL, FastAPI, and React simultaneously on free cloud tiers (512MB RAM limits) can cause Out-Of-Memory (OOM) kills.
- **Resolution for MVP:**
  - Limit repository analysis size to 50 MB / 25,000 LOC.
  - Configure Neo4j initial/max heap size (`NEO4J_server_memory_heap_initial__size=256m`, `NEO4J_server_memory_heap_max__size=512m`).
  - Use `sentence-transformers/all-MiniLM-L6-v2` with batch size 16 on CPU.
  - Package everything via clean Docker Compose suitable for a 2-4GB RAM single-node VPS.

---

## 3. Unresolved Decisions Tracking

| Decision ID | Topic | Current Recommendation | Status |
| :--- | :--- | :--- | :--- |
| **ADR-TBD-01** | Cloud Hosting Provider Selection | Render / Railway / Fly.io vs Hetzner / DigitalOcean VPS | **TBD** (Deferred to Phase 19) |
| **ADR-TBD-02** | Syntax Highlighting Engine | Monaco Editor vs PrismJS / Highlight.js | **TBD** (To be evaluated in Phase 10 based on bundle size) |
| **ADR-TBD-03** | Default Groq Model | `llama-3.3-70b-versatile` vs `llama-3.1-8b-instant` | **TBD** (Runtime configurable via environment variable) |
