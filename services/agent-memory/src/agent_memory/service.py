from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import socket
from contextlib import contextmanager
from dataclasses import dataclass
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Iterator
from urllib.parse import parse_qs, urlparse

import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

DEFAULT_AGENT_MEMORY_HOST = "0.0.0.0"
DEFAULT_AGENT_MEMORY_PORT = 3100
DEFAULT_AGENT_MEMORY_JOBS = [
    "run-embeddings",
    "run-evals",
    "run-scheduler-once",
    "run-worker",
]
DEFAULT_INTERNAL_REVIEW_TOKEN = "dev-review-token"
DEFAULT_AGENT_TASK_QUEUE = "default"
DEFAULT_AGENT_TASK_LEASE_SECONDS = 60
DEFAULT_AGENT_TASK_IDLE_TIMEOUT = 30.0
DEFAULT_EMBEDDING_BATCH_LIMIT = 128
EMBEDDING_DIMENSIONS = 1536
EMBEDDING_PROVIDER = "deterministic-dev"
TASK_READY_CHANNEL = "agent_task_ready"
SCHEDULER_LOCK_NAMESPACE = 43
SCHEDULER_LOCK_KEY = 1
LEASE_REPAIR_LOCK_KEY = 2
SUGGESTION_THRESHOLD = 2


@dataclass(frozen=True)
class SourceDocumentCandidate:
    source_kind: str
    uri: str
    body: str
    title: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass(frozen=True)
class ClaimCandidate:
    source_document_id: str
    summary: str
    status: str = "proposed"


def summarize_claim(candidate: ClaimCandidate) -> str:
    return f"{candidate.source_document_id}:{candidate.status}:{candidate.summary}"


def chunk_document(body: str, chunk_size: int = 120) -> list[str]:
    words = body.split()
    if not words:
        return []

    return [
        " ".join(words[index : index + chunk_size])
        for index in range(0, len(words), chunk_size)
    ]


def suggestion_confidence_for_occurrences(occurrences: int) -> float:
    bounded = max(0, occurrences)
    return min(0.95, round(0.4 + (bounded * 0.15), 2))


def build_preference_rationale(
    event_kind: str,
    suggestion_kind: str,
    occurrences: int,
) -> str:
    return (
        f"Observed {occurrences} repeated {event_kind} events for {suggestion_kind}; "
        "stage the candidate patch for operator review before publishing."
    )


def build_health_payload(database_url: str | None) -> dict[str, Any]:
    return {
        "service": "agent-memory",
        "status": "ok",
        "workspace": "clartk",
        "devDatabaseConfigured": bool(database_url),
        "devDatabaseName": "clartk_dev",
        "jobs": DEFAULT_AGENT_MEMORY_JOBS,
        "coordinationMode": "postgres",
        "embeddingProvider": EMBEDDING_PROVIDER,
        "embeddingDimensions": EMBEDDING_DIMENSIONS,
    }


def build_default_worker_name() -> str:
    return f"{socket.gethostname()}-{os.getpid()}"


def build_development_embedding(text: str, dimensions: int = EMBEDDING_DIMENSIONS) -> list[float]:
    if dimensions <= 0:
        raise ValueError("dimensions must be greater than zero")

    tokens = [token for token in text.lower().split() if token]
    if not tokens:
        return [0.0] * dimensions

    vector = [0.0] * dimensions
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        for index in range(0, len(digest), 4):
            window = digest[index : index + 4]
            if len(window) < 4:
                break

            slot = int.from_bytes(window[:2], "big") % dimensions
            magnitude = 0.25 + (window[2] / 255.0)
            sign = 1.0 if (window[3] % 2) == 0 else -1.0
            vector[slot] += sign * magnitude

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return [0.0] * dimensions

    return [value / norm for value in vector]


def task_retry_delay_seconds(attempt_count: int) -> int:
    bounded_attempt = max(1, attempt_count)
    return min(300, 2 ** bounded_attempt)


def maintenance_task_specs(chunk_size: int) -> dict[str, dict[str, Any]]:
    return {
        "memory.run_embeddings": {
            "payload": {
                "chunkSize": chunk_size,
                "batchLimit": DEFAULT_EMBEDDING_BATCH_LIMIT,
            },
            "priority": 100,
            "intervalSeconds": 60,
        },
        "memory.run_evaluations": {
            "payload": {},
            "priority": 50,
            "intervalSeconds": 300,
        },
    }


class MemoryRepository:
    def __init__(self, database_url: str | None) -> None:
        self.database_url = database_url

    @property
    def configured(self) -> bool:
        return bool(self.database_url)

    @contextmanager
    def connect(
        self,
        *,
        register_vectors: bool = False,
    ) -> Iterator[psycopg.Connection[Any]]:
        if not self.database_url:
            raise RuntimeError("CLARTK_DEV_DATABASE_URL is not configured")

        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            if register_vectors:
                register_vector(connection)
            yield connection

    def list_source_documents(self, limit: int = 50) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT source_document_id, source_kind, uri, title, body, metadata, captured_at
                FROM memory.source_document
                ORDER BY captured_at DESC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        return [map_source_document(row) for row in rows]

    def create_source_document(self, candidate: SourceDocumentCandidate) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute(
                """
                INSERT INTO memory.source_document (source_kind, uri, title, body, metadata)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING source_document_id, source_kind, uri, title, body, metadata, captured_at
                """,
                (
                    candidate.source_kind,
                    candidate.uri,
                    candidate.title,
                    candidate.body,
                    Jsonb(candidate.metadata or {}),
                ),
            ).fetchone()
            connection.commit()

        return map_source_document(row)

    def list_claims(self, limit: int = 50) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT knowledge_claim_id, source_document_id, summary, status, tags, created_at
                FROM memory.knowledge_claim
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        return [map_claim(row) for row in rows]

    def create_claim(
        self,
        source_document_id: int | None,
        summary: str,
        tags: list[Any] | None = None,
        status: str = "proposed",
    ) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute(
                """
                INSERT INTO memory.knowledge_claim (source_document_id, summary, status, tags)
                VALUES (%s, %s, %s, %s)
                RETURNING knowledge_claim_id, source_document_id, summary, status, tags, created_at
                """,
                (source_document_id, summary, status, Jsonb(tags or [])),
            ).fetchone()
            connection.commit()

        return map_claim(row)

    def search_claims(self, query: str, limit: int = 50) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        pattern = f"%{query}%"
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT kc.knowledge_claim_id, kc.source_document_id, kc.summary, kc.status, kc.tags, kc.created_at
                FROM memory.knowledge_claim AS kc
                LEFT JOIN memory.source_document AS sd
                  ON sd.source_document_id = kc.source_document_id
                WHERE kc.summary ILIKE %s OR COALESCE(sd.body, '') ILIKE %s
                ORDER BY kc.created_at DESC
                LIMIT %s
                """,
                (pattern, pattern, limit),
            ).fetchall()
        return [map_claim(row) for row in rows]

    def list_evaluations(self, limit: int = 50) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT evaluation_result_id, subject, outcome, detail, created_at
                FROM eval.evaluation_result
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        return [map_evaluation(row) for row in rows]

    def create_preference_observation(
        self,
        runtime_account_id: str,
        event_kind: str,
        signature: str,
        suggestion_kind: str,
        candidate_patch: dict[str, Any] | None = None,
        payload: dict[str, Any] | None = None,
        based_on_profile_version: int | None = None,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            observation_row = connection.execute(
                """
                INSERT INTO memory.preference_observation (
                  runtime_account_id,
                  event_kind,
                  signature,
                  suggestion_kind,
                  candidate_patch,
                  payload
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING
                  preference_observation_id,
                  runtime_account_id,
                  event_kind,
                  signature,
                  suggestion_kind,
                  candidate_patch,
                  payload,
                  observed_at
                """,
                (
                    runtime_account_id,
                    event_kind,
                    signature,
                    suggestion_kind,
                    Jsonb(candidate_patch or {}),
                    Jsonb(payload or {}),
                ),
            ).fetchone()

            suggestion = self._ensure_preference_suggestion(
                connection,
                runtime_account_id=runtime_account_id,
                event_kind=event_kind,
                signature=signature,
                suggestion_kind=suggestion_kind,
                candidate_patch=candidate_patch or {},
                based_on_profile_version=based_on_profile_version,
            )
            connection.commit()

        return {
            "observation": map_preference_observation(observation_row),
            "suggestion": suggestion,
        }

    def list_preference_suggestions(
        self,
        runtime_account_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            return self._list_preference_suggestions(connection, runtime_account_id, limit)

    def get_preference_suggestion(self, suggestion_id: int) -> dict[str, Any] | None:
        if not self.configured:
            return None

        with self.connect() as connection:
            return self._load_preference_suggestion(connection, suggestion_id)

    def create_preference_review(
        self,
        suggestion_id: int,
        reviewer_runtime_account_id: str,
        reviewer_role: str,
        outcome: str,
        notes: str | None = None,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            suggestion = self._load_preference_suggestion(connection, suggestion_id)
            if suggestion is None:
                raise LookupError("suggestion not found")
            if suggestion["status"] == "published":
                raise ValueError("published suggestions cannot be reviewed again")

            connection.execute(
                """
                INSERT INTO memory.preference_review (
                  preference_suggestion_id,
                  reviewer_runtime_account_id,
                  reviewer_role,
                  outcome,
                  notes
                )
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    suggestion_id,
                    reviewer_runtime_account_id,
                    reviewer_role,
                    outcome,
                    notes,
                ),
            )
            connection.execute(
                """
                UPDATE memory.preference_suggestion
                SET status = %s, updated_at = NOW()
                WHERE preference_suggestion_id = %s
                """,
                ("approved" if outcome == "approved" else "rejected", suggestion_id),
            )
            connection.commit()

        refreshed = self.get_preference_suggestion(suggestion_id)
        if refreshed is None:
            raise LookupError("suggestion not found")
        return refreshed

    def record_preference_publication(
        self,
        suggestion_id: int,
        runtime_profile_change_id: int,
        published_by_runtime_account_id: str,
        result: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            suggestion = self._load_preference_suggestion(connection, suggestion_id)
            if suggestion is None:
                raise LookupError("suggestion not found")

            connection.execute(
                """
                INSERT INTO memory.preference_publication (
                  preference_suggestion_id,
                  runtime_profile_change_id,
                  published_by_runtime_account_id,
                  result
                )
                VALUES (%s, %s, %s, %s)
                """,
                (
                    suggestion_id,
                    runtime_profile_change_id,
                    published_by_runtime_account_id,
                    Jsonb(result or {}),
                ),
            )
            connection.execute(
                """
                UPDATE memory.preference_suggestion
                SET
                  status = 'published',
                  published_runtime_change_id = %s,
                  updated_at = NOW()
                WHERE preference_suggestion_id = %s
                """,
                (runtime_profile_change_id, suggestion_id),
            )
            connection.commit()

        refreshed = self.get_preference_suggestion(suggestion_id)
        if refreshed is None:
            raise LookupError("suggestion not found")
        return refreshed

    def run_embedding_job(
        self,
        chunk_size: int = 120,
        batch_limit: int = DEFAULT_EMBEDDING_BATCH_LIMIT,
    ) -> dict[str, Any]:
        if not self.configured:
            return {
                "configured": False,
                "documentsProcessed": 0,
                "chunksCreated": 0,
                "chunksVectorized": 0,
            }

        with self.connect(register_vectors=True) as connection:
            documents_processed, chunks_created = self._stage_embedding_chunks(
                connection,
                chunk_size,
            )
            chunks_vectorized = self._vectorize_pending_chunks(connection, batch_limit)
            pending_row = connection.execute(
                """
                SELECT COUNT(*) AS pending_vector_count
                FROM memory.embedding_chunk
                WHERE embedding IS NULL
                """
            ).fetchone()
            connection.commit()

        return {
            "configured": True,
            "documentsProcessed": documents_processed,
            "chunksCreated": chunks_created,
            "chunksVectorized": chunks_vectorized,
            "pendingVectorCount": int(pending_row["pending_vector_count"]),
            "embeddingProvider": EMBEDDING_PROVIDER,
            "embeddingDimensions": EMBEDDING_DIMENSIONS,
        }

    def run_evaluation_job(self) -> dict[str, Any]:
        if not self.configured:
            return {
                "configured": False,
                "subject": "agent-memory",
                "outcome": "skipped",
            }

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                  (SELECT COUNT(*) FROM memory.source_document) AS source_document_count,
                  (SELECT COUNT(*) FROM memory.knowledge_claim) AS claim_count,
                  (SELECT COUNT(*) FROM memory.embedding_chunk) AS embedding_chunk_count,
                  (SELECT COUNT(*) FROM memory.embedding_chunk WHERE embedding IS NOT NULL) AS vectorized_embedding_chunk_count,
                  (SELECT COUNT(*) FROM memory.embedding_chunk WHERE embedding IS NULL) AS pending_embedding_chunk_count,
                  (SELECT COUNT(*) FROM memory.preference_suggestion) AS preference_suggestion_count
                """
            ).fetchone()

            detail = {
                "sourceDocumentCount": row["source_document_count"],
                "claimCount": row["claim_count"],
                "embeddingChunkCount": row["embedding_chunk_count"],
                "vectorizedEmbeddingChunkCount": row["vectorized_embedding_chunk_count"],
                "pendingEmbeddingChunkCount": row["pending_embedding_chunk_count"],
                "preferenceSuggestionCount": row["preference_suggestion_count"],
                "embeddingProvider": EMBEDDING_PROVIDER,
            }

            evaluation = connection.execute(
                """
                INSERT INTO eval.evaluation_result (subject, outcome, detail)
                VALUES (%s, %s, %s)
                RETURNING evaluation_result_id, subject, outcome, detail, created_at
                """,
                ("agent-memory", "observed", Jsonb(detail)),
            ).fetchone()
            connection.commit()

        return map_evaluation(evaluation)

    def run_scheduler_once(
        self,
        *,
        queue_name: str = DEFAULT_AGENT_TASK_QUEUE,
        chunk_size: int = 120,
    ) -> dict[str, Any]:
        if not self.configured:
            return {
                "configured": False,
                "created": [],
                "requeuedCount": 0,
            }

        scheduled = self.schedule_maintenance_tasks(queue_name=queue_name, chunk_size=chunk_size)
        requeued = self.requeue_expired_tasks()
        return {
            "configured": True,
            "created": scheduled["created"],
            "lockAcquired": scheduled["lockAcquired"],
            "requeuedCount": requeued["requeuedCount"],
            "requeueLockAcquired": requeued["lockAcquired"],
        }

    def run_worker(
        self,
        *,
        worker_name: str,
        queue_name: str = DEFAULT_AGENT_TASK_QUEUE,
        lease_seconds: int = DEFAULT_AGENT_TASK_LEASE_SECONDS,
        idle_timeout: float = DEFAULT_AGENT_TASK_IDLE_TIMEOUT,
        chunk_size: int = 120,
        once: bool = False,
        stop_after: int | None = None,
    ) -> dict[str, Any]:
        if not self.configured:
            return {
                "configured": False,
                "processedCount": 0,
            }

        processed_count = 0
        with self.connect() as listener:
            listener.execute(f"LISTEN {TASK_READY_CHANNEL}")
            listener.commit()

            while True:
                self.schedule_maintenance_tasks(queue_name=queue_name, chunk_size=chunk_size)
                self.requeue_expired_tasks()
                task = self.claim_task(
                    queue_name=queue_name,
                    worker_name=worker_name,
                    lease_seconds=lease_seconds,
                )

                if task is not None:
                    self.process_task(task, worker_name=worker_name, chunk_size=chunk_size)
                    processed_count += 1
                    if once or (stop_after is not None and processed_count >= stop_after):
                        break
                    continue

                if once:
                    break

                for _notify in listener.notifies(timeout=idle_timeout, stop_after=1):
                    break

        return {
            "configured": True,
            "processedCount": processed_count,
            "workerName": worker_name,
            "queueName": queue_name,
        }

    def schedule_maintenance_tasks(
        self,
        *,
        queue_name: str = DEFAULT_AGENT_TASK_QUEUE,
        chunk_size: int = 120,
    ) -> dict[str, Any]:
        if not self.configured:
            return {
                "configured": False,
                "lockAcquired": False,
                "created": [],
            }

        created: list[dict[str, Any]] = []
        with self.connect() as connection:
            locked_row = connection.execute(
                "SELECT pg_try_advisory_xact_lock(%s, %s) AS locked",
                (SCHEDULER_LOCK_NAMESPACE, SCHEDULER_LOCK_KEY),
            ).fetchone()
            lock_acquired = bool(locked_row["locked"])
            if lock_acquired:
                for task_kind, spec in maintenance_task_specs(chunk_size).items():
                    task_row = self._enqueue_maintenance_task_if_due(
                        connection,
                        queue_name=queue_name,
                        task_kind=task_kind,
                        payload=spec["payload"],
                        priority=spec["priority"],
                        interval_seconds=spec["intervalSeconds"],
                    )
                    if task_row is not None:
                        created.append(map_agent_task(task_row))
            connection.commit()

        return {
            "configured": True,
            "lockAcquired": lock_acquired,
            "created": created,
        }

    def requeue_expired_tasks(self) -> dict[str, Any]:
        if not self.configured:
            return {
                "configured": False,
                "lockAcquired": False,
                "requeuedCount": 0,
            }

        with self.connect() as connection:
            locked_row = connection.execute(
                "SELECT pg_try_advisory_xact_lock(%s, %s) AS locked",
                (SCHEDULER_LOCK_NAMESPACE, LEASE_REPAIR_LOCK_KEY),
            ).fetchone()
            lock_acquired = bool(locked_row["locked"])
            requeued_rows: list[dict[str, Any]] = []

            if lock_acquired:
                requeued_rows = connection.execute(
                    """
                    UPDATE agent.task
                    SET
                      status = 'queued',
                      lease_owner = NULL,
                      lease_expires_at = NULL,
                      available_at = NOW(),
                      last_error = 'lease expired and task was requeued',
                      updated_at = NOW()
                    WHERE status = 'leased'
                      AND lease_expires_at IS NOT NULL
                      AND lease_expires_at < NOW()
                    RETURNING
                      agent_task_id,
                      task_kind,
                      queue_name,
                      status,
                      priority,
                      payload,
                      available_at,
                      lease_owner,
                      lease_expires_at,
                      attempt_count,
                      max_attempts,
                      last_error,
                      created_at,
                      updated_at,
                      completed_at
                    """
                ).fetchall()
                for row in requeued_rows:
                    self._notify_task_ready(
                        connection,
                        queue_name=str(row["queue_name"]),
                        task_kind=str(row["task_kind"]),
                    )

            connection.commit()

        return {
            "configured": True,
            "lockAcquired": lock_acquired,
            "requeuedCount": len(requeued_rows),
        }

    def claim_task(
        self,
        *,
        queue_name: str,
        worker_name: str,
        lease_seconds: int,
    ) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                WITH next_task AS (
                  SELECT task.agent_task_id
                  FROM agent.task AS task
                  WHERE task.queue_name = %s
                    AND task.status = 'queued'
                    AND task.available_at <= NOW()
                    AND NOT EXISTS (
                      SELECT 1
                      FROM agent.task_dependency AS dependency
                      JOIN agent.task AS prerequisite
                        ON prerequisite.agent_task_id = dependency.depends_on_agent_task_id
                      WHERE dependency.agent_task_id = task.agent_task_id
                        AND prerequisite.status <> 'succeeded'
                    )
                  ORDER BY task.priority DESC, task.available_at ASC, task.agent_task_id ASC
                  FOR UPDATE SKIP LOCKED
                  LIMIT 1
                )
                UPDATE agent.task AS task
                SET
                  status = 'leased',
                  lease_owner = %s,
                  lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                  attempt_count = task.attempt_count + 1,
                  updated_at = NOW()
                FROM next_task
                WHERE task.agent_task_id = next_task.agent_task_id
                RETURNING
                  task.agent_task_id,
                  task.task_kind,
                  task.queue_name,
                  task.status,
                  task.priority,
                  task.payload,
                  task.available_at,
                  task.lease_owner,
                  task.lease_expires_at,
                  task.attempt_count,
                  task.max_attempts,
                  task.last_error,
                  task.created_at,
                  task.updated_at,
                  task.completed_at
                """,
                (queue_name, worker_name, lease_seconds),
            ).fetchone()
            connection.commit()

        return map_agent_task(row) if row is not None else None

    def process_task(
        self,
        task: dict[str, Any],
        *,
        worker_name: str,
        chunk_size: int,
    ) -> dict[str, Any]:
        run_id = self._start_agent_run(worker_name, task)

        try:
            result = self._execute_task(task, chunk_size=chunk_size)
        except Exception as error:
            return self._record_failed_task(
                task,
                run_id=run_id,
                error=error,
            )

        return self._record_completed_task(
            task,
            run_id=run_id,
            result=result,
        )

    def _stage_embedding_chunks(
        self,
        connection: psycopg.Connection[Any],
        chunk_size: int,
    ) -> tuple[int, int]:
        documents_processed = 0
        chunks_created = 0

        rows = connection.execute(
            """
            SELECT source_document_id, body
            FROM memory.source_document
            ORDER BY captured_at ASC
            """
        ).fetchall()

        for row in rows:
            documents_processed += 1
            for chunk in chunk_document(row["body"], chunk_size):
                exists = connection.execute(
                    """
                    SELECT 1
                    FROM memory.embedding_chunk
                    WHERE source_document_id = %s AND content = %s
                    LIMIT 1
                    """,
                    (row["source_document_id"], chunk),
                ).fetchone()
                if exists:
                    continue

                connection.execute(
                    """
                    INSERT INTO memory.embedding_chunk (source_document_id, content, metadata)
                    VALUES (%s, %s, %s)
                    """,
                    (
                        row["source_document_id"],
                        chunk,
                        Jsonb(
                            {
                                "status": "pending_vector",
                                "provider": EMBEDDING_PROVIDER,
                                "dimensions": EMBEDDING_DIMENSIONS,
                            }
                        ),
                    ),
                )
                chunks_created += 1

        return documents_processed, chunks_created

    def _vectorize_pending_chunks(
        self,
        connection: psycopg.Connection[Any],
        batch_limit: int,
    ) -> int:
        rows = connection.execute(
            """
            SELECT embedding_chunk_id, content, metadata
            FROM memory.embedding_chunk
            WHERE embedding IS NULL
            ORDER BY created_at ASC, embedding_chunk_id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT %s
            """,
            (batch_limit,),
        ).fetchall()

        for row in rows:
            metadata = dict(row["metadata"] or {})
            metadata.update(
                {
                    "status": "vectorized",
                    "provider": EMBEDDING_PROVIDER,
                    "dimensions": EMBEDDING_DIMENSIONS,
                }
            )
            connection.execute(
                """
                UPDATE memory.embedding_chunk
                SET embedding = %s, metadata = %s
                WHERE embedding_chunk_id = %s
                """,
                (
                    Vector(build_development_embedding(str(row["content"]))),
                    Jsonb(metadata),
                    row["embedding_chunk_id"],
                ),
            )

        return len(rows)

    def _enqueue_maintenance_task_if_due(
        self,
        connection: psycopg.Connection[Any],
        *,
        queue_name: str,
        task_kind: str,
        payload: dict[str, Any],
        priority: int,
        interval_seconds: int,
    ) -> dict[str, Any] | None:
        open_row = connection.execute(
            """
            SELECT 1
            FROM agent.task
            WHERE queue_name = %s
              AND task_kind = %s
              AND status IN ('queued', 'leased')
            LIMIT 1
            """,
            (queue_name, task_kind),
        ).fetchone()
        if open_row:
            return None

        latest_row = connection.execute(
            """
            SELECT COALESCE(completed_at, updated_at, created_at) AS last_activity_at
            FROM agent.task
            WHERE queue_name = %s
              AND task_kind = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (queue_name, task_kind),
        ).fetchone()
        if latest_row is not None:
            last_activity_at = latest_row["last_activity_at"]
            age_row = connection.execute(
                "SELECT EXTRACT(EPOCH FROM (NOW() - %s)) AS seconds_since_last_activity",
                (last_activity_at,),
            ).fetchone()
            if age_row and float(age_row["seconds_since_last_activity"]) < interval_seconds:
                return None

        row = connection.execute(
            """
            INSERT INTO agent.task (task_kind, queue_name, priority, payload)
            VALUES (%s, %s, %s, %s)
            RETURNING
              agent_task_id,
              task_kind,
              queue_name,
              status,
              priority,
              payload,
              available_at,
              lease_owner,
              lease_expires_at,
              attempt_count,
              max_attempts,
              last_error,
              created_at,
              updated_at,
              completed_at
            """,
            (task_kind, queue_name, priority, Jsonb(payload)),
        ).fetchone()
        self._notify_task_ready(connection, queue_name=queue_name, task_kind=task_kind)
        return row

    def _notify_task_ready(
        self,
        connection: psycopg.Connection[Any],
        *,
        queue_name: str,
        task_kind: str,
    ) -> None:
        connection.execute(
            "SELECT pg_notify(%s, %s)",
            (
                TASK_READY_CHANNEL,
                json.dumps(
                    {
                        "queueName": queue_name,
                        "taskKind": task_kind,
                    }
                ),
            ),
        )

    def _start_agent_run(self, worker_name: str, task: dict[str, Any]) -> int:
        with self.connect() as connection:
            row = connection.execute(
                """
                INSERT INTO agent.run (agent_name, task_slug, status)
                VALUES (%s, %s, %s)
                RETURNING agent_run_id
                """,
                (worker_name, task["taskKind"], "running"),
            ).fetchone()
            run_id = int(row["agent_run_id"])
            self._record_agent_event(
                connection,
                run_id,
                "task_claimed",
                {
                    "agentTaskId": task["agentTaskId"],
                    "taskKind": task["taskKind"],
                    "attemptCount": task["attemptCount"],
                    "queueName": task["queueName"],
                },
            )
            connection.commit()
        return run_id

    def _execute_task(
        self,
        task: dict[str, Any],
        *,
        chunk_size: int,
    ) -> dict[str, Any]:
        task_kind = str(task["taskKind"])
        payload = dict(task["payload"] or {})

        if task_kind == "memory.run_embeddings":
            requested_chunk_size = int(payload.get("chunkSize", chunk_size))
            batch_limit = int(payload.get("batchLimit", DEFAULT_EMBEDDING_BATCH_LIMIT))
            return self.run_embedding_job(
                chunk_size=requested_chunk_size,
                batch_limit=batch_limit,
            )

        if task_kind == "memory.run_evaluations":
            return self.run_evaluation_job()

        raise ValueError(f"unsupported task kind: {task_kind}")

    def _record_completed_task(
        self,
        task: dict[str, Any],
        *,
        run_id: int,
        result: dict[str, Any],
    ) -> dict[str, Any]:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE agent.task
                SET
                  status = 'succeeded',
                  lease_owner = NULL,
                  lease_expires_at = NULL,
                  last_error = NULL,
                  completed_at = NOW(),
                  updated_at = NOW()
                WHERE agent_task_id = %s
                """,
                (task["agentTaskId"],),
            )
            self._record_agent_event(
                connection,
                run_id,
                "task_completed",
                result,
            )
            self._record_agent_artifact(
                connection,
                run_id,
                artifact_kind="result",
                uri=f"clartk://agent-task/{task['agentTaskId']}/result",
                metadata=result,
            )
            self._finish_agent_run(connection, run_id, status="succeeded")
            connection.commit()

        return {
            "status": "succeeded",
            "agentTaskId": task["agentTaskId"],
            "result": result,
        }

    def _record_failed_task(
        self,
        task: dict[str, Any],
        *,
        run_id: int,
        error: Exception,
    ) -> dict[str, Any]:
        attempt_count = int(task["attemptCount"])
        max_attempts = int(task["maxAttempts"])
        exhausted = attempt_count >= max_attempts
        next_status = "failed" if exhausted else "queued"
        retry_delay_seconds = task_retry_delay_seconds(attempt_count)

        with self.connect() as connection:
            connection.execute(
                """
                UPDATE agent.task
                SET
                  status = %s,
                  lease_owner = NULL,
                  lease_expires_at = NULL,
                  available_at = CASE
                    WHEN %s = 'queued' THEN NOW() + (%s * INTERVAL '1 second')
                    ELSE available_at
                  END,
                  last_error = %s,
                  completed_at = CASE
                    WHEN %s = 'failed' THEN NOW()
                    ELSE NULL
                  END,
                  updated_at = NOW()
                WHERE agent_task_id = %s
                """,
                (
                    next_status,
                    next_status,
                    retry_delay_seconds,
                    str(error),
                    next_status,
                    task["agentTaskId"],
                ),
            )
            self._record_agent_event(
                connection,
                run_id,
                "task_failed",
                {
                    "error": str(error),
                    "nextStatus": next_status,
                    "retryDelaySeconds": retry_delay_seconds if next_status == "queued" else None,
                },
            )
            if next_status == "queued":
                self._notify_task_ready(
                    connection,
                    queue_name=str(task["queueName"]),
                    task_kind=str(task["taskKind"]),
                )
            self._finish_agent_run(connection, run_id, status=next_status)
            connection.commit()

        return {
            "status": next_status,
            "agentTaskId": task["agentTaskId"],
            "error": str(error),
            "retryDelaySeconds": retry_delay_seconds if next_status == "queued" else None,
        }

    def _record_agent_event(
        self,
        connection: psycopg.Connection[Any],
        agent_run_id: int,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        connection.execute(
            """
            INSERT INTO agent.event (agent_run_id, event_type, payload)
            VALUES (%s, %s, %s)
            """,
            (agent_run_id, event_type, Jsonb(payload)),
        )

    def _record_agent_artifact(
        self,
        connection: psycopg.Connection[Any],
        agent_run_id: int,
        *,
        artifact_kind: str,
        uri: str,
        metadata: dict[str, Any],
    ) -> None:
        connection.execute(
            """
            INSERT INTO agent.artifact (agent_run_id, artifact_kind, uri, metadata)
            VALUES (%s, %s, %s, %s)
            """,
            (agent_run_id, artifact_kind, uri, Jsonb(metadata)),
        )

    def _finish_agent_run(
        self,
        connection: psycopg.Connection[Any],
        agent_run_id: int,
        *,
        status: str,
    ) -> None:
        connection.execute(
            """
            UPDATE agent.run
            SET status = %s, finished_at = NOW()
            WHERE agent_run_id = %s
            """,
            (status, agent_run_id),
        )

    def _ensure_preference_suggestion(
        self,
        connection: psycopg.Connection[Any],
        *,
        runtime_account_id: str,
        event_kind: str,
        signature: str,
        suggestion_kind: str,
        candidate_patch: dict[str, Any],
        based_on_profile_version: int | None,
    ) -> dict[str, Any] | None:
        existing_row = connection.execute(
            """
            SELECT preference_suggestion_id
            FROM memory.preference_suggestion
            WHERE runtime_account_id = %s
              AND signature = %s
              AND status IN ('proposed', 'approved')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (runtime_account_id, signature),
        ).fetchone()
        if existing_row:
            return self._load_preference_suggestion(
                connection,
                int(existing_row["preference_suggestion_id"]),
            )

        evidence_rows = connection.execute(
            """
            SELECT
              preference_observation_id,
              runtime_account_id,
              event_kind,
              signature,
              suggestion_kind,
              candidate_patch,
              payload,
              observed_at
            FROM memory.preference_observation
            WHERE runtime_account_id = %s AND signature = %s
            ORDER BY observed_at DESC
            LIMIT 5
            """,
            (runtime_account_id, signature),
        ).fetchall()

        if len(evidence_rows) < SUGGESTION_THRESHOLD:
            return None

        rationale = build_preference_rationale(event_kind, suggestion_kind, len(evidence_rows))
        confidence = suggestion_confidence_for_occurrences(len(evidence_rows))
        evidence = [map_preference_observation(row) for row in evidence_rows]

        try:
            suggestion_row = connection.execute(
                """
                INSERT INTO memory.preference_suggestion (
                  runtime_account_id,
                  suggestion_kind,
                  rationale,
                  confidence,
                  candidate_patch,
                  evidence,
                  based_on_profile_version,
                  signature
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING preference_suggestion_id
                """,
                (
                    runtime_account_id,
                    suggestion_kind,
                    rationale,
                    confidence,
                    Jsonb(candidate_patch),
                    Jsonb(evidence),
                    based_on_profile_version,
                    signature,
                ),
            ).fetchone()
        except psycopg.errors.UniqueViolation:
            suggestion_row = connection.execute(
                """
                SELECT preference_suggestion_id
                FROM memory.preference_suggestion
                WHERE runtime_account_id = %s
                  AND signature = %s
                  AND status IN ('proposed', 'approved')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (runtime_account_id, signature),
            ).fetchone()

        return self._load_preference_suggestion(
            connection,
            int(suggestion_row["preference_suggestion_id"]),
        )

    def _list_preference_suggestions(
        self,
        connection: psycopg.Connection[Any],
        runtime_account_id: str | None,
        limit: int,
    ) -> list[dict[str, Any]]:
        if runtime_account_id:
            rows = connection.execute(
                """
                SELECT
                  preference_suggestion_id,
                  runtime_account_id,
                  suggestion_kind,
                  status,
                  rationale,
                  confidence,
                  candidate_patch,
                  evidence,
                  based_on_profile_version,
                  signature,
                  created_at,
                  updated_at,
                  published_runtime_change_id
                FROM memory.preference_suggestion
                WHERE runtime_account_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (runtime_account_id, limit),
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT
                  preference_suggestion_id,
                  runtime_account_id,
                  suggestion_kind,
                  status,
                  rationale,
                  confidence,
                  candidate_patch,
                  evidence,
                  based_on_profile_version,
                  signature,
                  created_at,
                  updated_at,
                  published_runtime_change_id
                FROM memory.preference_suggestion
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()

        reviews_by_suggestion_id = self._load_reviews_by_suggestion_id(
            connection,
            [int(row["preference_suggestion_id"]) for row in rows],
        )
        return [
            map_preference_suggestion(
                row,
                reviews_by_suggestion_id.get(int(row["preference_suggestion_id"]), []),
            )
            for row in rows
        ]

    def _load_preference_suggestion(
        self,
        connection: psycopg.Connection[Any],
        suggestion_id: int,
    ) -> dict[str, Any] | None:
        row = connection.execute(
            """
            SELECT
              preference_suggestion_id,
              runtime_account_id,
              suggestion_kind,
              status,
              rationale,
              confidence,
              candidate_patch,
              evidence,
              based_on_profile_version,
              signature,
              created_at,
              updated_at,
              published_runtime_change_id
            FROM memory.preference_suggestion
            WHERE preference_suggestion_id = %s
            """,
            (suggestion_id,),
        ).fetchone()
        if row is None:
            return None

        reviews_by_suggestion_id = self._load_reviews_by_suggestion_id(connection, [suggestion_id])
        return map_preference_suggestion(
            row,
            reviews_by_suggestion_id.get(suggestion_id, []),
        )

    def _load_reviews_by_suggestion_id(
        self,
        connection: psycopg.Connection[Any],
        suggestion_ids: list[int],
    ) -> dict[int, list[dict[str, Any]]]:
        if not suggestion_ids:
            return {}

        rows = connection.execute(
            """
            SELECT
              preference_review_id,
              preference_suggestion_id,
              reviewer_runtime_account_id,
              reviewer_role,
              outcome,
              notes,
              created_at
            FROM memory.preference_review
            WHERE preference_suggestion_id = ANY(%s)
            ORDER BY created_at ASC
            """,
            (suggestion_ids,),
        ).fetchall()

        reviews_by_suggestion_id: dict[int, list[dict[str, Any]]] = {}
        for row in rows:
            suggestion_id = int(row["preference_suggestion_id"])
            reviews_by_suggestion_id.setdefault(suggestion_id, []).append(
                map_preference_review(row)
            )
        return reviews_by_suggestion_id


def map_source_document(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "sourceDocumentId": row["source_document_id"],
        "sourceKind": row["source_kind"],
        "uri": row["uri"],
        "title": row["title"],
        "body": row["body"],
        "metadata": row["metadata"] or {},
        "capturedAt": row["captured_at"].isoformat(),
    }


def map_claim(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "knowledgeClaimId": row["knowledge_claim_id"],
        "sourceDocumentId": row["source_document_id"],
        "summary": row["summary"],
        "status": row["status"],
        "tags": row["tags"] or [],
        "createdAt": row["created_at"].isoformat(),
    }


def map_evaluation(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "evaluationResultId": row["evaluation_result_id"],
        "subject": row["subject"],
        "outcome": row["outcome"],
        "detail": row["detail"] or {},
        "createdAt": row["created_at"].isoformat(),
    }


def map_preference_observation(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "preferenceObservationId": int(row["preference_observation_id"]),
        "runtimeAccountId": str(row["runtime_account_id"]),
        "eventKind": row["event_kind"],
        "signature": row["signature"],
        "suggestionKind": row["suggestion_kind"],
        "candidatePatch": row["candidate_patch"] or {},
        "payload": row["payload"] or {},
        "observedAt": row["observed_at"].isoformat(),
    }


def map_preference_review(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "preferenceReviewId": int(row["preference_review_id"]),
        "preferenceSuggestionId": int(row["preference_suggestion_id"]),
        "reviewerRuntimeAccountId": str(row["reviewer_runtime_account_id"]),
        "reviewerRole": row["reviewer_role"],
        "outcome": row["outcome"],
        "notes": row["notes"],
        "createdAt": row["created_at"].isoformat(),
    }


def map_preference_suggestion(
    row: dict[str, Any],
    reviews: list[dict[str, Any]],
) -> dict[str, Any]:
    confidence = row["confidence"]
    if isinstance(confidence, Decimal):
        confidence_value: float | None = float(confidence)
    elif confidence is None:
        confidence_value = None
    else:
        confidence_value = float(confidence)

    return {
        "preferenceSuggestionId": int(row["preference_suggestion_id"]),
        "runtimeAccountId": str(row["runtime_account_id"]),
        "suggestionKind": row["suggestion_kind"],
        "status": row["status"],
        "rationale": row["rationale"],
        "confidence": confidence_value,
        "candidatePatch": row["candidate_patch"] or {},
        "evidence": row["evidence"] or [],
        "basedOnProfileVersion": row["based_on_profile_version"],
        "signature": row["signature"],
        "createdAt": row["created_at"].isoformat(),
        "updatedAt": row["updated_at"].isoformat(),
        "publishedRuntimeChangeId": row["published_runtime_change_id"],
        "reviews": reviews,
    }


def map_agent_task(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "agentTaskId": int(row["agent_task_id"]),
        "taskKind": row["task_kind"],
        "queueName": row["queue_name"],
        "status": row["status"],
        "priority": int(row["priority"]),
        "payload": row["payload"] or {},
        "availableAt": row["available_at"].isoformat(),
        "leaseOwner": row["lease_owner"],
        "leaseExpiresAt": row["lease_expires_at"].isoformat()
        if row["lease_expires_at"] is not None
        else None,
        "attemptCount": int(row["attempt_count"]),
        "maxAttempts": int(row["max_attempts"]),
        "lastError": row["last_error"],
        "createdAt": row["created_at"].isoformat(),
        "updatedAt": row["updated_at"].isoformat(),
        "completedAt": row["completed_at"].isoformat()
        if row["completed_at"] is not None
        else None,
    }


def create_handler(repository: MemoryRepository) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            path_parts = split_path(parsed.path)

            try:
                if parsed.path == "/health":
                    self.send_json(200, build_health_payload(repository.database_url))
                    return
                if parsed.path == "/v1/source-documents":
                    self.send_json(200, {"items": repository.list_source_documents()})
                    return
                if parsed.path == "/v1/claims":
                    self.send_json(200, {"items": repository.list_claims()})
                    return
                if parsed.path == "/v1/claims/search":
                    needle = query.get("q", [""])[0]
                    self.send_json(200, {"items": repository.search_claims(needle)})
                    return
                if parsed.path == "/v1/evaluations":
                    self.send_json(200, {"items": repository.list_evaluations()})
                    return
                if parsed.path == "/v1/internal/preferences/suggestions":
                    self.require_internal_token()
                    runtime_account_id = query.get("runtimeAccountId", [None])[0]
                    self.send_json(
                        200,
                        {
                            "items": repository.list_preference_suggestions(runtime_account_id),
                            "source": "dev-memory",
                        },
                    )
                    return
                if (
                    len(path_parts) == 5
                    and path_parts[:4]
                    == ["v1", "internal", "preferences", "suggestions"]
                    and path_parts[4].isdigit()
                ):
                    self.require_internal_token()
                    suggestion = repository.get_preference_suggestion(int(path_parts[4]))
                    if suggestion is None:
                        self.send_json(404, {"error": "not found"})
                        return
                    self.send_json(200, suggestion)
                    return
            except RuntimeError as error:
                self.send_json(503, {"error": str(error)})
                return

            self.send_json(404, {"error": "not found"})

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            path_parts = split_path(parsed.path)
            try:
                payload = self.read_json_body()
                if parsed.path == "/v1/source-documents":
                    candidate = SourceDocumentCandidate(
                        source_kind=str(payload["sourceKind"]),
                        uri=str(payload["uri"]),
                        title=str(payload["title"]) if payload.get("title") else None,
                        body=str(payload["body"]),
                        metadata=ensure_dict(payload.get("metadata")),
                    )
                    self.send_json(201, repository.create_source_document(candidate))
                    return
                if parsed.path == "/v1/claims":
                    self.send_json(
                        201,
                        repository.create_claim(
                            source_document_id=payload.get("sourceDocumentId"),
                            summary=str(payload["summary"]),
                            tags=payload.get("tags"),
                            status=str(payload.get("status", "proposed")),
                        ),
                    )
                    return
                if parsed.path == "/v1/internal/preferences/observations":
                    self.require_internal_token()
                    self.send_json(
                        201,
                        repository.create_preference_observation(
                            runtime_account_id=str(payload["runtimeAccountId"]),
                            event_kind=str(payload["eventKind"]),
                            signature=str(payload["signature"]),
                            suggestion_kind=str(payload["suggestionKind"]),
                            candidate_patch=ensure_dict(payload.get("candidatePatch")),
                            payload=ensure_dict(payload.get("payload")),
                            based_on_profile_version=as_optional_int(
                                payload.get("basedOnProfileVersion")
                            ),
                        ),
                    )
                    return
                if (
                    len(path_parts) == 6
                    and path_parts[:4]
                    == ["v1", "internal", "preferences", "suggestions"]
                    and path_parts[4].isdigit()
                    and path_parts[5] == "reviews"
                ):
                    self.require_internal_token()
                    self.send_json(
                        200,
                        repository.create_preference_review(
                            suggestion_id=int(path_parts[4]),
                            reviewer_runtime_account_id=str(
                                payload["reviewerRuntimeAccountId"]
                            ),
                            reviewer_role=str(payload["reviewerRole"]),
                            outcome=str(payload["outcome"]),
                            notes=str(payload["notes"]) if payload.get("notes") else None,
                        ),
                    )
                    return
                if (
                    len(path_parts) == 6
                    and path_parts[:4]
                    == ["v1", "internal", "preferences", "suggestions"]
                    and path_parts[4].isdigit()
                    and path_parts[5] == "publications"
                ):
                    self.require_internal_token()
                    self.send_json(
                        200,
                        repository.record_preference_publication(
                            suggestion_id=int(path_parts[4]),
                            runtime_profile_change_id=int(payload["runtimeProfileChangeId"]),
                            published_by_runtime_account_id=str(
                                payload["publishedByRuntimeAccountId"]
                            ),
                            result=ensure_dict(payload.get("result")),
                        ),
                    )
                    return
            except LookupError as error:
                self.send_json(404, {"error": str(error)})
                return
            except PermissionError as error:
                self.send_json(403, {"error": str(error)})
                return
            except ValueError as error:
                self.send_json(409, {"error": str(error)})
                return
            except KeyError as error:
                self.send_json(400, {"error": f"missing field: {error.args[0]}"})
                return
            except RuntimeError as error:
                self.send_json(503, {"error": str(error)})
                return
            except json.JSONDecodeError:
                self.send_json(400, {"error": "invalid json"})
                return

            self.send_json(404, {"error": "not found"})

        def read_json_body(self) -> dict[str, Any]:
            content_length = int(self.headers.get("Content-Length", "0"))
            data = self.rfile.read(content_length) if content_length else b"{}"
            return json.loads(data.decode("utf-8"))

        def require_internal_token(self) -> None:
            expected = os.environ.get(
                "CLARTK_AGENT_MEMORY_REVIEW_TOKEN",
                DEFAULT_INTERNAL_REVIEW_TOKEN,
            )
            provided = self.headers.get("X-Clartk-Review-Token")
            if not provided or provided != expected:
                raise PermissionError("missing or invalid review token")

        def send_json(self, status_code: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            return

    return Handler


def ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def as_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def split_path(path: str) -> list[str]:
    return [part for part in path.split("/") if part]


def serve_memory_http(
    repository: MemoryRepository, host: str = DEFAULT_AGENT_MEMORY_HOST, port: int = DEFAULT_AGENT_MEMORY_PORT
) -> None:
    server = ThreadingHTTPServer((host, port), create_handler(repository))
    server.serve_forever()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="clartk-agent-memory")
    parser.set_defaults(command="serve")
    subparsers = parser.add_subparsers(dest="command")

    serve_parser = subparsers.add_parser("serve")
    serve_parser.add_argument(
        "--host",
        default=os.environ.get("CLARTK_AGENT_MEMORY_HOST", DEFAULT_AGENT_MEMORY_HOST),
    )
    serve_parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("CLARTK_AGENT_MEMORY_PORT", str(DEFAULT_AGENT_MEMORY_PORT))),
    )
    serve_parser.add_argument(
        "--database-url",
        default=os.environ.get("CLARTK_DEV_DATABASE_URL"),
    )

    embeddings_parser = subparsers.add_parser("run-embeddings")
    embeddings_parser.add_argument(
        "--database-url",
        default=os.environ.get("CLARTK_DEV_DATABASE_URL"),
    )
    embeddings_parser.add_argument("--chunk-size", type=int, default=120)
    embeddings_parser.add_argument(
        "--batch-limit",
        type=int,
        default=DEFAULT_EMBEDDING_BATCH_LIMIT,
    )

    evals_parser = subparsers.add_parser("run-evals")
    evals_parser.add_argument(
        "--database-url",
        default=os.environ.get("CLARTK_DEV_DATABASE_URL"),
    )

    scheduler_parser = subparsers.add_parser("run-scheduler-once")
    scheduler_parser.add_argument(
        "--database-url",
        default=os.environ.get("CLARTK_DEV_DATABASE_URL"),
    )
    scheduler_parser.add_argument(
        "--queue-name",
        default=os.environ.get("CLARTK_AGENT_TASK_QUEUE", DEFAULT_AGENT_TASK_QUEUE),
    )
    scheduler_parser.add_argument("--chunk-size", type=int, default=120)

    worker_parser = subparsers.add_parser("run-worker")
    worker_parser.add_argument(
        "--database-url",
        default=os.environ.get("CLARTK_DEV_DATABASE_URL"),
    )
    worker_parser.add_argument(
        "--queue-name",
        default=os.environ.get("CLARTK_AGENT_TASK_QUEUE", DEFAULT_AGENT_TASK_QUEUE),
    )
    worker_parser.add_argument(
        "--worker-name",
        default=os.environ.get("CLARTK_AGENT_MEMORY_WORKER_NAME", build_default_worker_name()),
    )
    worker_parser.add_argument(
        "--lease-seconds",
        type=int,
        default=int(
            os.environ.get(
                "CLARTK_AGENT_TASK_LEASE_SECONDS",
                str(DEFAULT_AGENT_TASK_LEASE_SECONDS),
            )
        ),
    )
    worker_parser.add_argument(
        "--idle-timeout",
        type=float,
        default=float(
            os.environ.get(
                "CLARTK_AGENT_TASK_IDLE_TIMEOUT",
                str(DEFAULT_AGENT_TASK_IDLE_TIMEOUT),
            )
        ),
    )
    worker_parser.add_argument("--chunk-size", type=int, default=120)
    worker_parser.add_argument("--once", action="store_true")
    worker_parser.add_argument("--stop-after", type=int)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "serve":
        serve_memory_http(
            MemoryRepository(args.database_url),
            host=args.host,
            port=args.port,
        )
        return

    if args.command == "run-embeddings":
        result = MemoryRepository(args.database_url).run_embedding_job(
            args.chunk_size,
            args.batch_limit,
        )
        print(json.dumps(result))
        return

    if args.command == "run-evals":
        result = MemoryRepository(args.database_url).run_evaluation_job()
        print(json.dumps(result))
        return

    if args.command == "run-scheduler-once":
        result = MemoryRepository(args.database_url).run_scheduler_once(
            queue_name=args.queue_name,
            chunk_size=args.chunk_size,
        )
        print(json.dumps(result))
        return

    if args.command == "run-worker":
        result = MemoryRepository(args.database_url).run_worker(
            worker_name=args.worker_name,
            queue_name=args.queue_name,
            lease_seconds=args.lease_seconds,
            idle_timeout=args.idle_timeout,
            chunk_size=args.chunk_size,
            once=args.once,
            stop_after=args.stop_after,
        )
        print(json.dumps(result))
        return

    parser.error(f"unknown command: {args.command}")


if __name__ == "__main__":
    main()
