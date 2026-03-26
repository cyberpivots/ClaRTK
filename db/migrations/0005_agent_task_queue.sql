BEGIN;

CREATE TABLE IF NOT EXISTS agent.task (
  agent_task_id BIGSERIAL PRIMARY KEY,
  task_kind TEXT NOT NULL,
  queue_name TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_task_claim_idx
  ON agent.task (queue_name, status, priority DESC, available_at ASC, agent_task_id ASC);

CREATE INDEX IF NOT EXISTS agent_task_open_kind_idx
  ON agent.task (task_kind, queue_name)
  WHERE status IN ('queued', 'leased');

CREATE TABLE IF NOT EXISTS agent.task_dependency (
  agent_task_id BIGINT NOT NULL REFERENCES agent.task (agent_task_id) ON DELETE CASCADE,
  depends_on_agent_task_id BIGINT NOT NULL REFERENCES agent.task (agent_task_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_task_id, depends_on_agent_task_id),
  CHECK (agent_task_id <> depends_on_agent_task_id)
);

COMMIT;
