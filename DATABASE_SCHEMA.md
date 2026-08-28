# Database Schema & Data Models

## AI-Powered Interactive Codebase Understanding and Visualization Platform

**Version:** 1.0 (Academic MVP)  
**Status:** Approved  

---

## 1. Overview & Dual-Database Strategy

The platform employs a hybrid database architecture:
1. **PostgreSQL 16 + pgvector**: Handles relational metadata, user authentication, analysis job lifecycle, file records, chat sessions, and semantic AST code chunk embeddings.
2. **Neo4j 5+ (Community Edition)**: Handles the topological software knowledge graph, capturing structural containment, function call graphs, import dependencies, API endpoints, and database interactions.

---

## 2. PostgreSQL Relational & Vector Schema

### 2.1 Vector Embedding Decision & Dimension
- **Selected Model**: `sentence-transformers/all-MiniLM-L6-v2`
- **Embedding Dimension**: **384**
- **Distance Metric**: Cosine Distance (`<=>` operator in pgvector)
- **Index Type**: `HNSW` (`m = 16`, `ef_construction = 64`) for high-speed nearest-neighbor search with sub-5ms latency on CPU.

---

### 2.2 Table Definitions (DDL)

```sql
-- Enable pgvector and UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Repositories Table
CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    github_url VARCHAR(512) NOT NULL,
    default_branch VARCHAR(100) DEFAULT 'main',
    local_path VARCHAR(512),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, ANALYZING, READY, FAILED
    total_files INTEGER DEFAULT 0,
    total_lines INTEGER DEFAULT 0,
    total_symbols INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_repositories_user_id ON repositories(user_id);
CREATE INDEX idx_repositories_status ON repositories(status);

-- 3. Analysis Jobs Table (Tracks SSE progress and background processing)
CREATE TABLE analysis_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, CLONING, SCANNING, PARSING, GRAPH_BUILDING, EMBEDDING, COMPLETED, FAILED
    stage VARCHAR(100) NOT NULL DEFAULT 'Initialized',
    progress_percent INTEGER NOT NULL DEFAULT 0, -- 0 to 100
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_analysis_jobs_repository_id ON analysis_jobs(repository_id);

-- 4. Files Table
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path VARCHAR(1024) NOT NULL,
    language VARCHAR(50) NOT NULL, -- python, javascript, typescript
    size_bytes INTEGER NOT NULL,
    line_count INTEGER NOT NULL,
    sha256_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (repository_id, file_path)
);

CREATE INDEX idx_files_repository_id ON files(repository_id);
CREATE INDEX idx_files_language ON files(language);

-- 5. Code Chunks Table (AST-aware chunks + pgvector embeddings)
CREATE TABLE code_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    file_path VARCHAR(1024) NOT NULL,
    symbol_name VARCHAR(255),
    symbol_type VARCHAR(50) NOT NULL, -- function, class, method, module_header
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    context_header TEXT, -- e.g., "File: src/auth.py | Class: AuthService"
    chunk_content TEXT NOT NULL,
    embedding VECTOR(384) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_code_chunks_repository_id ON code_chunks(repository_id);
CREATE INDEX idx_code_chunks_file_id ON code_chunks(file_id);
CREATE INDEX idx_code_chunks_symbol_name ON code_chunks(symbol_name);

-- HNSW Vector Index for Cosine Similarity Search
CREATE INDEX idx_code_chunks_embedding_hnsw 
ON code_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 6. Conversations Table (AI Q&A sessions)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_repo_user ON conversations(repository_id, user_id);

-- 7. Messages Table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender VARCHAR(20) NOT NULL, -- user, assistant
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]'::jsonb, -- Array of {file_path, start_line, end_line, symbol_name}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
```

---

## 3. Neo4j Graph Model

### 3.1 Node Labels & Properties

| Node Label | Key Properties | Description & Purpose |
| :--- | :--- | :--- |
| **`Repository`** | `id`, `name`, `github_url`, `owner` | Root node representing the imported codebase. |
| **`Package`** / **`Module`** | `id`, `name`, `path`, `repository_id` | Directory or logical module grouping files. |
| **`File`** | `id`, `path`, `language`, `line_count`, `repository_id` | Individual source file within the repository. |
| **`Class`** | `id`, `name`, `qualified_name`, `file_path`, `start_line`, `end_line`, `docstring`, `repository_id` | Class or interface declaration. |
| **`Function`** | `id`, `name`, `qualified_name`, `file_path`, `start_line`, `end_line`, `is_async`, `is_method`, `docstring`, `repository_id` | Top-level function or class method. |
| **`APIEndpoint`** | `id`, `route_path`, `http_method`, `handler_name`, `file_path`, `start_line`, `end_line`, `repository_id` | Detected web endpoint (FastAPI/Flask/Express). |
| **`DatabaseEntity`** | `id`, `model_name`, `table_name`, `file_path`, `start_line`, `end_line`, `repository_id` | Detected ORM model or database table entity. |

*Note: The canonical `id` property for every entity node follows the pattern: `repository_id + ":" + file_path + ":" + qualified_name` to guarantee uniqueness.*

---

### 3.2 Relationships & Purpose

```text
 (Repository)
      │
      ├─[:CONTAINS]──► (Package) ─[:CONTAINS]──► (File)
      │                                            │
      │                  ┌─────────────────────────┴────────────────────────┐
      │                  ▼                                                  ▼
      │             [:CONTAINS]                                        [:CONTAINS]
      │                  │                                                  │
      │                  ▼                                                  ▼
      │               (Class) ────────────[:CONTAINS]────────────────► (Function)
      │                  │                                                  │
      │             [:DEPENDS_ON]                                      [:CALLS]
      │                  │                                                  │
      │                  ▼                                                  ▼
      │               (Class)                                           (Function)
      │                                                                     │
      ├─[:EXPOSES]──────────────── (APIEndpoint) ◄────────[:EXPOSES]────────┤
      │                                                                     │
      └─[:ACCESSES]─────────────── (DatabaseEntity) ◄─────[:ACCESSES]───────┘
```

| Relationship | Source $\rightarrow$ Target | Purpose & Academic Rationale |
| :--- | :--- | :--- |
| **`CONTAINS`** | `Repository` $\rightarrow$ `Package` / `File`<br>`File` $\rightarrow$ `Class` / `Function`<br>`Class` $\rightarrow$ `Function` | Models physical and lexical containment hierarchy for multi-level visual graph clustering (System $\rightarrow$ Module $\rightarrow$ Class $\rightarrow$ Function). |
| **`IMPORTS`** | `File` $\rightarrow$ `File` / `Package` | Captures static module dependency graph and cross-file linkage. |
| **`CALLS`** | `Function` $\rightarrow$ `Function` | Captures static direct invocation chains. Properties: `line: int`, `is_resolved: boolean` (set to `false` for unresolved dynamic targets). |
| **`DEPENDS_ON`** | `Class` $\rightarrow$ `Class` | Captures object-oriented inheritance (`subclass` extends `superclass`) and interface implementations. |
| **`EXPOSES`** | `File` / `Function` $\rightarrow$ `APIEndpoint` | Links HTTP request entrypoints to their handler functions for execution-flow tracing. |
| **`ACCESSES`** | `Function` $\rightarrow$ `DatabaseEntity` | Connects business logic functions to database models and query targets. |

---

### 3.3 Neo4j Constraints and Indexes (Cypher)

```cypher
// Ensure unique entity identifiers per repository
CREATE CONSTRAINT unique_entity_id IF NOT EXISTS
FOR (e:Entity) REQUIRE e.id IS UNIQUE;

// Optimize lookup by repository_id
CREATE INDEX idx_node_repository_id IF NOT EXISTS
FOR (n:Entity) ON (n.repository_id);

CREATE INDEX idx_function_name IF NOT EXISTS
FOR (f:Function) ON (f.name);

CREATE INDEX idx_file_path IF NOT EXISTS
FOR (fl:File) ON (fl.path);
```
