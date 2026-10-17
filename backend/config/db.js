import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool(
  connectionString
    ? { connectionString }
    : {
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'postgres',
      }
);

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle database client:', err.message);
});

export const query = (text, params) => pool.query(text, params);

/**
 * Initializes the database schema. Creates tables and indexes if they do not exist.
 */
export async function initDb() {
  const schemaSql = `
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS repositories (
      id VARCHAR(255) PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL UNIQUE,
      owner VARCHAR(128) NOT NULL,
      name VARCHAR(128) NOT NULL,
      url TEXT NOT NULL,
      local_path TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'analyzed',
      file_analysis JSONB,
      symbols JSONB,
      relationships JSONB,
      graph JSONB NOT NULL,
      validation JSONB,
      node_count INT DEFAULT 0,
      edge_count INT DEFAULT 0,
      file_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_repos_full_name ON repositories(full_name);
    CREATE INDEX IF NOT EXISTS idx_repos_created_at ON repositories(created_at DESC);

    CREATE TABLE IF NOT EXISTS symbol_embeddings (
      id TEXT PRIMARY KEY,
      repo_id VARCHAR(255) NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      symbol_id TEXT NOT NULL,
      content TEXT,
      metadata JSONB,
      embedding vector(384),
      model_id VARCHAR(128),
      content_hash VARCHAR(64),
      vector_dimensions INT DEFAULT 384,
      tsv tsvector,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_se_repo_id ON symbol_embeddings(repo_id);
    CREATE INDEX IF NOT EXISTS idx_se_symbol_id ON symbol_embeddings(symbol_id);
    CREATE INDEX IF NOT EXISTS idx_se_model_id ON symbol_embeddings(model_id);
    CREATE INDEX IF NOT EXISTS idx_se_tsv ON symbol_embeddings USING GIN(tsv);
  `;

  try {
    const client = await pool.connect();
    try {
      await client.query(schemaSql);
      console.log('[PostgreSQL] Database tables & indexes verified successfully.');
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[PostgreSQL] Failed to initialize database tables:', error.message);
    console.warn('[PostgreSQL] Please ensure local PostgreSQL is running on localhost:5432 with database "postgres".');
    return false;
  }
}
