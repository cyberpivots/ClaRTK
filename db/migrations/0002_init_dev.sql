BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS agent;
CREATE SCHEMA IF NOT EXISTS memory;
CREATE SCHEMA IF NOT EXISTS eval;

CREATE TABLE IF NOT EXISTS agent.run (
  agent_run_id BIGSERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL,
  task_slug TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent.event (
  agent_event_id BIGSERIAL PRIMARY KEY,
  agent_run_id BIGINT NOT NULL REFERENCES agent.run (agent_run_id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent.artifact (
  artifact_id BIGSERIAL PRIMARY KEY,
  agent_run_id BIGINT NOT NULL REFERENCES agent.run (agent_run_id),
  artifact_kind TEXT NOT NULL,
  uri TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory.source_document (
  source_document_id BIGSERIAL PRIMARY KEY,
  source_kind TEXT NOT NULL,
  uri TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory.knowledge_claim (
  knowledge_claim_id BIGSERIAL PRIMARY KEY,
  source_document_id BIGINT REFERENCES memory.source_document (source_document_id),
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory.claim_validation (
  claim_validation_id BIGSERIAL PRIMARY KEY,
  knowledge_claim_id BIGINT NOT NULL REFERENCES memory.knowledge_claim (knowledge_claim_id),
  validator TEXT NOT NULL,
  outcome TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory.embedding_chunk (
  embedding_chunk_id BIGSERIAL PRIMARY KEY,
  source_document_id BIGINT NOT NULL REFERENCES memory.source_document (source_document_id),
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eval.evaluation_result (
  evaluation_result_id BIGSERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;

