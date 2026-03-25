from __future__ import annotations

import argparse
import json
import os
from contextlib import contextmanager
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Iterator
from urllib.parse import parse_qs, urlparse

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

DEFAULT_AGENT_MEMORY_HOST = "0.0.0.0"
DEFAULT_AGENT_MEMORY_PORT = 3100
DEFAULT_AGENT_MEMORY_JOBS = ["run-embeddings", "run-evals"]


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


def build_health_payload(database_url: str | None) -> dict[str, Any]:
    return {
        "service": "agent-memory",
        "status": "ok",
        "workspace": "clartk",
        "devDatabaseConfigured": bool(database_url),
        "devDatabaseName": "clartk_dev",
        "jobs": DEFAULT_AGENT_MEMORY_JOBS,
    }


class MemoryRepository:
    def __init__(self, database_url: str | None) -> None:
        self.database_url = database_url

    @property
    def configured(self) -> bool:
        return bool(self.database_url)

    @contextmanager
    def connect(self) -> Iterator[psycopg.Connection[Any]]:
        if not self.database_url:
            raise RuntimeError("CLARTK_DEV_DATABASE_URL is not configured")

        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
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

    def run_embedding_job(self, chunk_size: int = 120) -> dict[str, Any]:
        if not self.configured:
            return {
                "configured": False,
                "documentsProcessed": 0,
                "chunksCreated": 0,
            }

        documents_processed = 0
        chunks_created = 0

        with self.connect() as connection:
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
                            Jsonb({"status": "pending_vector"}),
                        ),
                    )
                    chunks_created += 1

            connection.commit()

        return {
            "configured": True,
            "documentsProcessed": documents_processed,
            "chunksCreated": chunks_created,
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
                  (SELECT COUNT(*) FROM memory.embedding_chunk) AS embedding_chunk_count
                """
            ).fetchone()

            detail = {
                "sourceDocumentCount": row["source_document_count"],
                "claimCount": row["claim_count"],
                "embeddingChunkCount": row["embedding_chunk_count"],
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


def create_handler(repository: MemoryRepository) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
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
            except RuntimeError as error:
                self.send_json(503, {"error": str(error)})
                return

            self.send_json(404, {"error": "not found"})

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            try:
                payload = self.read_json_body()
                if parsed.path == "/v1/source-documents":
                    candidate = SourceDocumentCandidate(
                        source_kind=str(payload["sourceKind"]),
                        uri=str(payload["uri"]),
                        title=str(payload["title"]) if payload.get("title") else None,
                        body=str(payload["body"]),
                        metadata=payload.get("metadata"),
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

    evals_parser = subparsers.add_parser("run-evals")
    evals_parser.add_argument(
        "--database-url",
        default=os.environ.get("CLARTK_DEV_DATABASE_URL"),
    )

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
        result = MemoryRepository(args.database_url).run_embedding_job(args.chunk_size)
        print(json.dumps(result))
        return

    if args.command == "run-evals":
        result = MemoryRepository(args.database_url).run_evaluation_job()
        print(json.dumps(result))
        return

    parser.error(f"unknown command: {args.command}")


if __name__ == "__main__":
    main()
