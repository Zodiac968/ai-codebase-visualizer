# Codebase Visualizer

AI-powered interactive codebase understanding and visualization platform.

Paste a public GitHub repository URL and the app clones it, analyzes the source with Tree-sitter, and builds an interactive knowledge graph of folders, files, classes, functions and their relationships. You can then search the code in natural language, see the matches highlighted in the graph, and ask questions that are answered from the repository's own source with clickable citations.

## Features

- **Repository analysis**: clones a public GitHub repository and extracts classes, methods, functions, interfaces, types, enums and imports from **JavaScript, TypeScript (incl. JSX/TSX) and Python** using Tree-sitter.
- **Knowledge graph**: an interactive React Flow graph (repository → folders → files → symbols) with `CALLS`, `IMPORTS`, `INHERITS` and `IMPLEMENTS` edges. Nodes expand and collapse progressively, and clicking one opens the source at the exact lines.
- **AI Search**: hybrid retrieval that combines PostgreSQL full-text search with pgvector semantic search, fused by Reciprocal Rank Fusion. Results are expanded through the graph, then revealed and highlighted on the canvas.
- **Ask AI**: retrieval-augmented Q&A using the Groq API. Answers cite the retrieved code, and every citation is validated against the retrieved evidence before it is shown.
- **Caching**: analyzed repositories are stored in PostgreSQL and reopened instantly.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express 5, `pg` |
| Static analysis | Tree-sitter 0.25 (JavaScript, TypeScript/TSX, Python grammars) |
| Database | PostgreSQL with the pgvector extension |
| Embeddings | `BAAI/bge-small-en-v1.5` (384-dim), run locally via `@huggingface/transformers` |
| LLM (Ask AI) | Groq API, default model `openai/gpt-oss-120b` |
| Frontend | React 19, Vite 8, React Flow (`@xyflow/react`) |

## Prerequisites

- **Node.js 20.19+ or 22.12+** (required by Vite 8; developed on Node 22.12)
- **PostgreSQL** with the **[pgvector](https://github.com/pgvector/pgvector)** extension installed
- **Git**, available on your `PATH` (the backend clones repositories with `git clone`)
- **Internet access** for cloning GitHub repositories and, on first use, downloading the embedding model (~133 MB)
- *(Optional)* a **[Groq API key](https://console.groq.com/keys)**, needed only for **Ask AI**

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/Zodiac968/ai-codebase-visualizer.git
cd ai-codebase-visualizer
```

### 2. Prepare PostgreSQL

Create a database (or use the default `postgres` database) and make sure pgvector is installed on the server. The backend runs `CREATE EXTENSION IF NOT EXISTS vector` on startup, so the database user needs permission to create extensions. Alternatively, run that statement once yourself as a superuser.

```sql
CREATE DATABASE codebase_visualizer;
\c codebase_visualizer
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Configure the backend

```bash
cd backend
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Edit `backend/.env`:

- Set `DATABASE_URL` to your database, e.g. `postgres://postgres:postgres@localhost:5432/codebase_visualizer`. Alternatively, remove `DATABASE_URL` and set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.
- Set `GROQ_API_KEY` if you want to use **Ask AI**. The key stays on the server and is never sent to the browser.

All other values have working defaults; see [Configuration](#configuration).

### 4. Start the backend (creates the tables)

```bash
npm run dev
```

The API listens on **http://localhost:3000**. On startup it creates the `repositories` and `symbol_embeddings` tables if they don't exist. You should see:

```
Server is running on http://localhost:3000
[PostgreSQL] Database tables & indexes verified successfully.
```

### 5. Create the full-text search trigger (one time)

Lexical search reads a `tsv` column that is filled by a database trigger. The backend doesn't create this trigger, so run the following SQL once against your database **after the tables exist** (step 4):

```sql
CREATE OR REPLACE FUNCTION symbol_embeddings_tsv_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tsv := (
    setweight(to_tsvector('english', COALESCE(NEW.metadata->>'name', '') || ' ' || COALESCE(NEW.symbol_id, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.metadata->>'file', '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'D')
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_symbol_embeddings_tsv ON symbol_embeddings;
CREATE TRIGGER trg_symbol_embeddings_tsv
BEFORE INSERT OR UPDATE OF content, metadata, symbol_id ON symbol_embeddings
FOR EACH ROW EXECUTE FUNCTION symbol_embeddings_tsv_trigger();

-- Backfill rows that already exist (safe to run on an empty table)
UPDATE symbol_embeddings SET content = content;
```

Without this trigger the app still runs, but the lexical half of AI Search finds nothing.

### 6. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` requests to the backend on port 3000.

## Using the app

1. **Analyze a repository**: paste a public GitHub URL (e.g. `https://github.com/expressjs/express`) and click **Analyze**. The repository is cloned into `backend/repositories/`, analyzed, and saved to PostgreSQL, along with its search documents. Previously analyzed repositories appear on the home screen and open from the cache.
2. **Explore the graph**: click folders, files and classes to expand them. Click a file, class or function to open its source in the code viewer on the left.
3. **Generate vectors**: click **🧠 Vectors** in the header to compute semantic embeddings. Only symbols that changed since the last run are processed. The first run downloads the embedding model (~133 MB), which can take a minute. Without vectors, search and Q&A fall back to lexical search only.
4. **AI Search**: open **⚡ AI Search** and describe a feature, e.g. *"where is a view template rendered?"*. Use **Highlight All Matches**, **✨ Highlight** or **🎯 Focus** to reveal the results in the graph, and **✕ Clear Graph Highlight** to restore your previous view.
5. **Ask AI**: open **💬 Ask AI** and ask a question, e.g. *"How are errors handled when rendering a view fails?"*. Click a citation chip such as `S1` or `S2:45-50` to open the exact lines. Use **Highlight References in Graph** to show the cited symbols. Citations that could not be verified are shown struck through.
6. **Re-analyze**: **↻ Re-analyze** re-clones the repository and rebuilds its graph from the latest code. Click **🧠 Vectors** again afterwards to embed new or changed symbols.

## Configuration

All settings are environment variables in `backend/.env`.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string (takes precedence over the `PG*` variables) |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | `localhost`, `5432`, `postgres`, `postgres`, `postgres` | Used when `DATABASE_URL` is not set |
| `SUPPORTED_EXTENSIONS` | `.js,.ts,.jsx,.tsx,.py,.json` | File extensions included in the scan (only `.js .jsx .ts .tsx .py` are parsed) |
| `MAX_REPOSITORY_SIZE_MB` | `200` | Analysis fails if the clone exceeds this size |
| `MAX_FILE_COUNT` | `5000` | Maximum number of files scanned |
| `MAX_FILE_SIZE_MB` | `2` | Larger files are not line-counted |
| `EMBEDDING_MODEL` | `BAAI/bge-small-en-v1.5` | Embedding model (must produce 384-dim vectors) |
| `EMBEDDING_BATCH_SIZE` | `32` | Embedding batch size |
| `GROQ_API_KEY` | — | Required for Ask AI |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model ID |
| `GROQ_STRICT_SCHEMA` | `true` | Use strict JSON-schema output; set `false` for models without it |
| `GROQ_TEMPERATURE` | `0.1` | Sampling temperature |
| `GROQ_MAX_OUTPUT_TOKENS` | `4096` | Output token limit (includes reasoning tokens) |
| `GROQ_REASONING_EFFORT` | `medium` | Reasoning effort for `gpt-oss` models |
| `GROQ_CONTEXT_WINDOW` | `131072` | Model context window used for the prompt-size guard |
| `GROQ_TIMEOUT_MS` | `45000` | Request timeout |
| `GROQ_MAX_RETRIES` | `2` | Retries for rate limits, timeouts and server errors (max 5) |
| `QA_SEED_LIMIT` | `6` | Primary matches retrieved per question |
| `QA_MAX_DEPTH` | `1` | Graph expansion depth |
| `QA_MAX_EXPANDED_NODES` | `12` | Maximum graph-expanded symbols |
| `QA_MAX_TOTAL_SYMBOLS` | `18` | Maximum symbols sent to the model |
| `QA_MAX_CONTEXT_TOKENS` | `12000` | Source-code token budget per question |
| `QA_MAX_CONCURRENT_REQUESTS` | `2` | Simultaneous Q&A requests before returning HTTP 429 |

## Project structure

```
ai-codebase-visualizer/
├── backend/                  Express API, analysis pipeline, search and Q&A
│   ├── config/               Database schema setup, analysis limits, Groq/Q&A settings
│   ├── controllers/          HTTP request handlers
│   ├── routes/               /api/repositories routes
│   ├── services/
│   │   ├── analysis/         Tree-sitter parsing, relationship resolution, graph building
│   │   ├── context/          Source retrieval and context budgeting
│   │   ├── embedding/        Local embedding model
│   │   ├── graph/            Graph expansion
│   │   ├── llm/              Groq client
│   │   ├── qa/               Prompt building, citation validation, Q&A pipeline
│   │   └── search/           Lexical, semantic and hybrid search
│   ├── utils/                Repository scanner, GitHub URL validation
│   ├── evaluation/           Evaluation and test scripts
│   └── repositories/         Cloned repositories (git-ignored)
├── frontend/                 React + Vite web app
├── code-graph-ui/            Earlier standalone graph viewer (static data)
└── repository_analysis_standalone/  Earlier standalone analysis scripts
```

## API

All endpoints are served by the backend at `http://localhost:3000`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/repositories/analyze` | Analyze a repository, or return it from the cache. Body: `{ "repoUrl": "...", "forceRefresh": false }` |
| GET | `/api/repositories/recent?limit=10` | Recently analyzed repositories |
| GET | `/api/repositories/:id/graph` | Repository graph |
| GET | `/api/repositories/:id/file?filePath=...` | File content |
| POST | `/api/repositories/:id/embeddings/generate` | Regenerate search documents |
| POST | `/api/repositories/:id/vectors/generate` | Generate semantic vectors. Body: `{ "force": false }` |
| POST | `/api/repositories/:id/search/hybrid` | Hybrid search. Body: `{ "query": "...", "limit": 10 }` |
| POST | `/api/repositories/:id/search/context` | Search plus graph expansion and source context. Body: `{ "query": "..." }` |
| POST | `/api/repositories/:id/qa` | Ask a question. Body: `{ "question": "..." }` |

Repository IDs have the form `owner__name`, e.g. `expressjs__express`.

## Running the evaluations

The evaluation scripts live in `backend/evaluation/` and are run directly with Node from the `backend` directory. Most of them use the analyzed `expressjs/express` repository, so analyze `https://github.com/expressjs/express` and generate its vectors first.

```bash
cd backend
node evaluation/evaluateHighlighting.js        # graph highlighting logic (no database needed)
node evaluation/evaluateContextRetrieval.js    # graph expansion and context retrieval
node evaluation/evaluateRetrieval.js           # lexical / semantic / hybrid search quality
node evaluation/evaluateQA.js                  # Q&A prompt and citation validation (no Groq call)
node evaluation/evaluateQA.js --live           # also runs live questions against Groq (needs GROQ_API_KEY)
```

## Troubleshooting

- **AI Search finds nothing lexically, or `Lexical` ranks are always empty:** the full-text trigger is missing. Run the SQL in [step 5](#5-create-the-full-text-search-trigger-one-time).
- **"Failed to load embedding model …"**: the model is downloaded from Hugging Face on first use. Check your internet connection and try again. The model is cached inside `backend/node_modules`, so a fresh `npm install` can remove it and trigger a new download.
- **"No embedding documents found … Please generate embedding documents first."**: the repository has no search documents. Call `POST /api/repositories/:id/embeddings/generate`, or re-analyze the repository.
- **"This repository has no search index yet"** (Ask AI): same cause as above.
- **Ask AI says the service is not configured:** set `GROQ_API_KEY` in `backend/.env` and restart the backend.
- **Ask AI is slow when asking several questions in a row:** on Groq's free tier the per-minute token limit is low, so consecutive questions wait for the limit to reset. A single question normally takes a few seconds.
- **Port 3000 is already in use:** the backend port is fixed in `backend/index.js`, and the frontend proxy in `frontend/vite.config.js` expects it. Stop the other process, or change both.
- **`CREATE EXTENSION vector` fails:** pgvector isn't installed on your PostgreSQL server; see the [pgvector installation guide](https://github.com/pgvector/pgvector#installation).

## Limitations

- Only **public GitHub repositories** can be imported (no ZIP upload or local folders).
- Parsed languages: **JavaScript, TypeScript (incl. JSX/TSX) and Python**.
- Designed as a **local, single-user tool**: there is no authentication, and the API uses plain HTTP.
- Re-analysis rebuilds the whole repository, not just changed files.
- Ask AI answers each question independently (no conversation memory).
