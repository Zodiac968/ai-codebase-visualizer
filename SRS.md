# Software Requirements Specification (SRS)
## AI-Powered Interactive Codebase Understanding and Visualization Platform

**Version:** 1.0 (Academic MVP Baseline)  
**Status:** Approved for Baseline Planning  
**Target Completion:** ~1 Month  

---

## 1. Executive Summary & Purpose

The **AI-Powered Interactive Codebase Understanding and Visualization Platform** is an academic software engineering platform designed to ingest public GitHub repositories, perform deep AST-based static analysis, construct a multi-level software knowledge graph in Neo4j, generate semantic code chunk embeddings stored in PostgreSQL/pgvector, and present an interactive visual dashboard powered by React Flow and Groq LLM assistance.

The platform targets three primary developer workflows:
1. **Interactive Architecture & Dependency Visualization** (Hierarchical graph exploration from system down to function level).
2. **Static Execution-Flow Approximation** (Tracing API routes to controllers, business logic, and database operations).
3. **AI-Powered Repository Explanation & Semantic Feature Search** (Accurate Q&A backed by hybrid RAG with line-level source code citations).

---

## 2. System Scope & MVP Boundaries

### 2.1 In-Scope (Academic MVP)
- Ingestion of public GitHub repositories via Git clone into an isolated, read-only temporary workspace.
- Static code analysis for **Python**, **JavaScript**, and **TypeScript** using **Tree-sitter**.
- Knowledge Graph construction in **Neo4j** (hierarchies, calls, imports, API definitions, database accesses).
- Code chunking preserving line numbers and symbol headers, embedded using a local, lightweight model (`sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions) and indexed with **PostgreSQL / pgvector**.
- Real-time ingestion progress reporting using **Server-Sent Events (SSE)**.
- Interactive web frontend built with **React**, **TypeScript**, **Tailwind CSS**, and **React Flow**.
- Semantic feature search and multi-turn conversational AI assistant using **Groq API** with source code deep-linking (file path, start line, end line).
- Static execution-flow approximation highlighting call chains and marking dynamic/unresolved dispatches explicitly as "unresolved".
- Simple JWT authentication for user account and repository workspace isolation.

### 2.2 Out-of-Scope (Deferred / Non-MVP)
- Arbitrary code execution, dynamic profiling, or runtime debugging.
- Private repository OAuth app integrations (MVP supports public URLs).
- Incremental Git commit diff re-indexing (MVP performs clean re-analysis upon re-import).
- Multi-tenant enterprise RBAC, SAML/SSO, or complex billing tiers.
- Languages outside Python, JavaScript, and TypeScript (e.g., C++, Rust, Go, Java to be added post-MVP).
- Dedicated external vector databases (e.g., Qdrant/Pinecone) — PostgreSQL + pgvector is used to minimize infrastructure overhead.

---

## 3. Functional Requirements

### Section 1: Repository Ingestion & Ingestion Management

* **REQ-1.1: Public GitHub URL Ingestion**  
  The system shall accept a valid public GitHub repository URL (HTTPS) submitted by an authenticated user and clone the repository into an isolated, read-only storage directory on the backend server.
* **REQ-1.2: Pre-Flight Validation & Constraints**  
  The system shall validate repository accessibility and enforce MVP resource constraints (maximum repository size of 50 MB or 25,000 LOC, reject bare/empty repositories, verify supported language presence).
* **REQ-1.3: Repository File Scanner & Ignore Rules**  
  The system shall scan the cloned repository directory tree, automatically respecting `.gitignore` rules and skipping non-code directories/files (e.g., `.git`, `node_modules`, `venv`, `__pycache__`, `dist`, `build`, binary files, lockfiles, images, minified assets).
* **REQ-1.4: Asynchronous Analysis Job Management**  
  The backend shall initiate analysis as a non-blocking asynchronous background job, creating an `analysis_jobs` record with status transitions: `PENDING` $\rightarrow$ `CLONING` $\rightarrow$ `SCANNING` $\rightarrow$ `PARSING` $\rightarrow$ `GRAPH_BUILDING` $\rightarrow$ `EMBEDDING` $\rightarrow$ `COMPLETED` (or `FAILED`).
* **REQ-1.5: Real-Time Ingestion Progress via SSE**  
  The system shall stream real-time analysis status, current stage description, percentage completion, and logged events to the frontend client using Server-Sent Events (SSE).
* **REQ-1.6: Repository Management**  
  The system shall allow users to list their ingested repositories, view analysis summaries (total files, LOC, symbols, graph nodes), and delete a repository along with all associated graph entities, relational metadata, and vector embeddings.

---

### Section 2: Static Code Analysis & Knowledge Graph Construction

* **REQ-2.1: Multi-Language Tree-sitter AST Parsing**  
  The analyzer engine shall parse discovered source code files into Abstract Syntax Trees (ASTs) using official Tree-sitter grammar parsers for Python, JavaScript, and TypeScript without executing any analyzed code.
* **REQ-2.2: Symbol & Entity Extraction**  
  The system shall extract code symbols and map them to standard entity types:
  - `Repository`
  - `Module` / `Package`
  - `File`
  - `Class` / `Interface`
  - `Function` / `Method`
  - `API Route` (e.g., FastAPI, Flask, Express router decorators/handlers)
  - `Database Entity / Query` (e.g., ORM models, SQL query calls)
* **REQ-2.3: Source Location Preservation**  
  For every extracted symbol, the system must store exact source location metadata: `repository_id`, `file_path`, `symbol_name`, `symbol_type`, `start_line`, `end_line`, `start_column`, and `end_column`.
* **REQ-2.4: Relationship Extraction**  
  The analyzer shall identify and extract static relationships between entities:
  - `CONTAINS` (Structural: Repository $\rightarrow$ File $\rightarrow$ Class $\rightarrow$ Function)
  - `IMPORTS` (File imports Module/File/Symbol)
  - `CALLS` (Function calls Function/Method)
  - `DEPENDS_ON` (Class inherits Class, File depends on Package)
  - `EXPOSES` (File/Function exposes API Route)
  - `ACCESSES` (Function accesses Database Table/Model)
* **REQ-2.5: Neo4j Knowledge Graph Persistence**  
  The system shall persist extracted nodes and relationships into Neo4j using idempotent Cypher queries, enforcing uniqueness constraints on entity identifiers (`repository_id + file_path + symbol_qualified_name`).

---

### Section 3: Code Embeddings & Semantic Search

* **REQ-3.1: AST-Aware Hierarchical Code Chunking**  
  The system shall chunk source files at function and class boundaries rather than arbitrary token windows. Each chunk shall include:
  - Context header (Repository name, file path, parent class/module name, docstrings/comments).
  - Clean source code of the function/class.
  - Accurate start and end line numbers.
* **REQ-3.2: Local Embedding Generation**  
  The system shall generate dense vector embeddings for all code chunks using a local, CPU-efficient sentence transformer model (`sentence-transformers/all-MiniLM-L6-v2`, output dimension 384) without sending source code to external embedding APIs.
* **REQ-3.3: PostgreSQL & pgvector Storage & Indexing**  
  The system shall store code chunks and their 384-dimensional vector embeddings in PostgreSQL using the `pgvector` extension, creating an HNSW (or IVFFlat) cosine index for high-speed similarity search.
* **REQ-3.4: Semantic Feature Search**  
  The system shall provide an API endpoint where users enter natural-language queries (e.g., "Where is user JWT token authentication handled?"), encode the query locally, execute a cosine similarity search against `code_chunks`, and return top-$k$ ranked matches with snippet previews and exact file/line links.

---

### Section 4: Interactive Visualization, Execution Flow & AI Q&A

* **REQ-4.1: Interactive Multi-Level Architecture Graph (React Flow)**  
  The frontend shall render an interactive canvas visualizing the Neo4j knowledge graph using React Flow. Key capabilities:
  - Dynamic clustering/filtering by abstraction level (`Package/Directory` $\rightarrow$ `File` $\rightarrow$ `Class/Function`).
  - Node expansion/collapse on click.
  - Side drawer displaying selected node metadata, docstrings, incoming/outgoing dependencies, and file links.
* **REQ-4.2: Static Execution-Flow Approximation**  
  The system shall compute and visualize end-to-end static execution flows starting from entrypoints (e.g., HTTP API route handler or CLI main function) down through call chains to service functions and database queries. Dynamic dispatch or unresolved function targets shall be explicitly marked and rendered as `[Unresolved Target]`.
* **REQ-4.3: Source Code Preview & Deep-Linking Navigation**  
  When a user clicks any entity node, search result, execution-flow step, or AI citation, the frontend shall open a code viewer panel displaying the file contents with the exact `[start_line, end_line]` highlighted and auto-scrolled into view.
* **REQ-4.4: Contextual Hybrid RAG Pipeline**  
  The backend shall implement a Retrieval-Augmented Generation pipeline combining:
  1. Semantic vector search matches from PostgreSQL/pgvector.
  2. Structural knowledge graph context from Neo4j (callers, callees, imported modules).
  3. Formatted prompt instructions enforcing strictly grounded answers.
* **REQ-4.5: AI Repository Q&A via Groq API**  
  The system shall send the retrieved context and user question to the Groq API (e.g., `llama-3.3-70b-versatile` or `llama-3.1-8b-instant`) to generate fast, streaming natural-language explanations with explicit inline file/line citations (`[src/auth/service.py:42-65]`).
* **REQ-4.6: Multi-Turn Conversation Memory**  
  The system shall persist conversation sessions and message history in PostgreSQL, allowing users to ask follow-up questions within the context of a selected repository.

---

## 4. Non-Functional Requirements

* **REQ-5.1: Ingestion & Analysis Performance**  
  For repositories up to 10,000 LOC, end-to-end analysis (cloning, Tree-sitter parsing, Neo4j graph insertion, chunk embedding) shall complete within 60 seconds on standard dual-core / 4GB RAM hardware.
* **REQ-5.2: Query & Graph API Responsiveness**  
  Architecture graph queries and semantic search queries shall return responses in under 500 ms for average-sized repositories.
* **REQ-5.3: Security & Code Safety (Zero Execution Guarantee)**  
  The backend shall strictly perform static analysis without compiling, executing, or invoking any analyzed source files, scripts, or build tools. Analyzed repos are treated as untrusted input.
* **REQ-5.4: Authentication & Session Security**  
  User authentication shall be implemented using stateless JWT tokens transmitted via standard HTTP Authorization bearer headers. Passwords shall be hashed using `bcrypt` or `argon2`.
* **REQ-5.5: Multi-Tenant Data Isolation**  
  All relational records, vector embeddings, and Neo4j graph nodes shall be scoped by `repository_id` and owned by `user_id`. Queries must enforce tenant separation.
* **REQ-5.6: Low External API Cost & Groq Optimization**  
  The architecture shall incur zero third-party vector/embedding API costs by utilizing local embedding models. Groq API usage shall be strictly budgeted with prompt compression and max token caps.
* **REQ-5.7: Source Code Immutability & Ephemeral Storage**  
  Cloned repositories shall be marked read-only on the backend file system. The analyzer engine shall never modify, write to, or commit to the analyzed codebase.
* **REQ-5.8: Reliability & Error Recovery**  
  Tree-sitter parser error recovery shall ensure that individual syntax errors or unsupported language files in a repository do not fail the overall repository analysis. Failed files are logged and skipped.
* **REQ-5.9: Modular Analyzer Architecture**  
  The static analysis engine shall follow a modular plugin design pattern where individual language parsers (Python, JS/TS) implement a common abstract base interface, allowing straightforward extension to future languages.
* **REQ-5.10: Low-Cost / Free-Tier Deployment Compatibility**  
  The complete stack shall be packaged into Docker Compose containers capable of running on free/low-cost single-node VPS instances (e.g., Render, Railway, Fly.io, or standard 2 vCPU / 4GB RAM VPS).
* **REQ-5.11: Usability & Academic Presentation Readiness**  
  The UI shall provide pre-loaded popular sample repositories (e.g., small Express/FastAPI sample apps) for instant demonstration during academic defense evaluations without waiting for clone operations.
* **REQ-5.12: Academic MVP Scope Discipline**  
  Architectural complexity shall be minimized by avoiding microservices, separate message brokers (Celery/RabbitMQ), and dedicated vector DB daemons. FastAPI background tasks and unified PostgreSQL + Neo4j shall be prioritized.

---

## 5. Requirement Traceability Matrix (Summary)

| Req ID | Component | Database | Primary User Feature |
| :--- | :--- | :--- | :--- |
| **REQ-1.1 - 1.6** | Backend Ingestion & Job Manager | PostgreSQL | Repository Import & Live SSE Progress |
| **REQ-2.1 - 2.5** | Tree-sitter Analyzer Engine | Neo4j & PostgreSQL | Knowledge Graph Construction & Symbol Index |
| **REQ-3.1 - 3.4** | Embeddings & Search Engine | PostgreSQL / pgvector | Semantic Feature Discovery |
| **REQ-4.1 - 4.3** | Frontend Canvas & Code Viewer | Neo4j + API | Interactive Graph Exploration & Deep-Linking |
| **REQ-4.2** | Static Execution Flow Analyzer | Neo4j | Route-to-DB Flow Visualization |
| **REQ-4.4 - 4.6** | Groq RAG Engine | Postgres + Neo4j + Groq | AI Codebase Q&A & Explanation |
| **REQ-5.1 - 5.12** | Core System Infrastructure | All | Performance, Security, Portability, MVP Scope |
