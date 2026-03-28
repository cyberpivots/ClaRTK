#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import socket
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

import psycopg


REPO_ROOT = Path(__file__).resolve().parents[1]
RESOLVED_ENV_PATH = REPO_ROOT / ".clartk" / "dev" / "resolved.env"


def parse_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    result: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip().strip("\"'")
    return result


def tcp_reachable(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except OSError:
        return False


def probe_service(service: str, url: str, *, expect_json: bool = True) -> dict[str, object]:
    try:
        with urlopen(url, timeout=2.0) as response:
            status_code = getattr(response, "status", 200)
            if status_code >= 400:
                return {
                    "service": service,
                    "status": "degraded",
                    "url": url,
                    "detail": {"error": f"http {status_code}"},
                }
            if expect_json:
                detail = json.loads(response.read().decode("utf-8"))
            else:
                detail = {
                    "status": "ok",
                    "contentType": response.headers.get("content-type", "unknown"),
                }
            return {
                "service": service,
                "status": "ok" if detail.get("status") == "ok" else "degraded",
                "url": url,
                "detail": detail,
            }
    except HTTPError as error:
        return {
            "service": service,
            "status": "degraded",
            "url": url,
            "detail": {"error": f"http {error.code}"},
        }
    except (URLError, OSError, json.JSONDecodeError) as error:
        return {
            "service": service,
            "status": "degraded",
            "url": url,
            "detail": {"error": str(error)},
        }


def latest_backup_summary(backup_dir: Path) -> dict[str, object] | None:
    if not backup_dir.exists():
        return None
    directories = sorted(
        [entry for entry in backup_dir.iterdir() if entry.is_dir()],
        key=lambda entry: entry.name,
        reverse=True,
    )
    if not directories:
        return None
    latest = directories[0]
    manifest_path = latest / "manifest.json"
    created_at = None
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            created_at = manifest.get("timestampUtc")
        except json.JSONDecodeError:
            created_at = None
    backup_kind = "logical+volume" if (latest / "postgres-volume.tar").exists() else "logical"
    return {
        "latestBackupDir": str(latest),
        "latestBackupKind": backup_kind,
        "latestBackupCreatedAt": created_at,
    }


def scan_docs_count() -> int:
    docs_root = REPO_ROOT / "docs"
    count = sum(1 for _ in docs_root.rglob("*.md"))
    if (REPO_ROOT / "AGENTS.md").exists():
        count += 1
    return count


def scan_skills() -> list[dict[str, str]]:
    roots = [
        ("repo", REPO_ROOT / ".agents" / "skills"),
        ("system", Path.home() / ".codex" / "skills" / ".system"),
    ]
    skills: list[dict[str, str]] = []
    for source, root in roots:
        if not root.exists():
            continue
        for skill_path in sorted(root.rglob("SKILL.md")):
            skills.append(
                {
                    "source": source,
                    "skillId": skill_path.parent.name,
                    "path": str(skill_path),
                }
            )
    return skills


def build_coordination_summary(database_url: str | None, errors: list[dict[str, str]]) -> dict[str, object]:
    fallback = {
        "taskCount": 0,
        "runCount": 0,
        "reviewRunCount": 0,
        "blockedTaskCount": 0,
        "staleLeaseCount": 0,
        "queues": [],
        "latestRuns": [],
        "latestReviewRuns": [],
    }
    if not database_url:
        errors.append({"key": "database", "error": "CLARTK_RESOLVED_DEV_DATABASE_URL is not set"})
        return fallback

    try:
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                  (SELECT COUNT(*) FROM agent.task),
                  (SELECT COUNT(*) FROM agent.run),
                  (SELECT COUNT(*) FROM review.ui_run),
                  (
                    SELECT COUNT(*)
                    FROM agent.task AS task
                    WHERE task.status = 'queued'
                      AND EXISTS (
                        SELECT 1
                        FROM agent.task_dependency AS dependency
                        JOIN agent.task AS prerequisite
                          ON prerequisite.agent_task_id = dependency.depends_on_agent_task_id
                        WHERE dependency.agent_task_id = task.agent_task_id
                          AND prerequisite.status <> 'succeeded'
                      )
                  ),
                  (
                    SELECT COUNT(*)
                    FROM agent.task
                    WHERE status = 'leased'
                      AND lease_expires_at < NOW()
                  )
                """
            )
            (
                task_count,
                run_count,
                review_run_count,
                blocked_task_count,
                stale_lease_count,
            ) = cursor.fetchone()

            cursor.execute(
                """
                SELECT
                  queue_name,
                  COUNT(*) FILTER (WHERE status = 'queued') AS queued_count,
                  COUNT(*) FILTER (WHERE status = 'leased') AS leased_count,
                  COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded_count,
                  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
                FROM agent.task
                GROUP BY queue_name
                ORDER BY queue_name ASC
                """
            )
            queues = [
                {
                    "queueName": row[0],
                    "queuedCount": int(row[1]),
                    "leasedCount": int(row[2]),
                    "succeededCount": int(row[3]),
                    "failedCount": int(row[4]),
                    "recentTasks": [],
                }
                for row in cursor.fetchall()
            ]

            cursor.execute(
                """
                SELECT agent_run_id, agent_name, task_slug, status, started_at, finished_at
                FROM agent.run
                ORDER BY started_at DESC, agent_run_id DESC
                LIMIT 5
                """
            )
            latest_runs = [
                {
                    "agentRunId": int(row[0]),
                    "agentName": row[1],
                    "taskSlug": row[2],
                    "status": row[3],
                    "startedAt": row[4].isoformat(),
                    "finishedAt": row[5].isoformat() if row[5] is not None else None,
                }
                for row in cursor.fetchall()
            ]

            cursor.execute(
                """
                SELECT ui_review_run_id, status, scenario_set, created_at
                FROM review.ui_run
                ORDER BY created_at DESC, ui_review_run_id DESC
                LIMIT 5
                """
            )
            latest_review_runs = [
                {
                    "uiReviewRunId": int(row[0]),
                    "status": row[1],
                    "scenarioSet": row[2],
                    "createdAt": row[3].isoformat(),
                }
                for row in cursor.fetchall()
            ]
    except Exception as error:  # noqa: BLE001
        errors.append({"key": "database", "error": str(error)})
        return fallback

    return {
        "taskCount": int(task_count),
        "runCount": int(run_count),
        "reviewRunCount": int(review_run_count),
        "blockedTaskCount": int(blocked_task_count),
        "staleLeaseCount": int(stale_lease_count),
        "queues": queues,
        "latestRuns": latest_runs,
        "latestReviewRuns": latest_review_runs,
    }


def main() -> None:
    resolved_env = parse_env_file(RESOLVED_ENV_PATH)
    runtime_api_base_url = os.environ.get(
        "CLARTK_RUNTIME_API_BASE_URL",
        f"http://127.0.0.1:{os.environ.get('CLARTK_API_PORT', resolved_env.get('CLARTK_API_PORT', '3000'))}",
    )
    dev_console_api_base_url = os.environ.get(
        "CLARTK_DEV_CONSOLE_API_BASE_URL",
        f"http://127.0.0.1:{os.environ.get('CLARTK_DEV_CONSOLE_API_PORT', '3300')}",
    )
    agent_memory_base_url = os.environ.get(
        "CLARTK_AGENT_MEMORY_BASE_URL",
        "http://127.0.0.1:3100",
    )
    dev_console_origin = os.environ.get("CLARTK_DEV_CONSOLE_ORIGIN", "http://127.0.0.1:5180")
    postgres_host = resolved_env.get("CLARTK_RESOLVED_POSTGRES_HOST", os.environ.get("CLARTK_POSTGRES_HOST", "127.0.0.1"))
    postgres_port = int(resolved_env.get("CLARTK_RESOLVED_POSTGRES_PORT", os.environ.get("CLARTK_POSTGRES_PORT", "5432")))
    postgres_source = resolved_env.get("CLARTK_RESOLVED_POSTGRES_SOURCE", "configured_env")
    database_url = resolved_env.get("CLARTK_RESOLVED_DEV_DATABASE_URL", os.environ.get("CLARTK_DEV_DATABASE_URL"))

    services = [
        {
            "service": "dev-console-api",
            "status": "ok" if tcp_reachable("127.0.0.1", int(dev_console_api_base_url.rsplit(":", 1)[1])) else "degraded",
            "url": f"{dev_console_api_base_url}/health",
            "detail": {"source": "script-fallback"},
        },
        probe_service("api", f"{runtime_api_base_url}/health"),
        probe_service("agent-memory", f"{agent_memory_base_url}/health"),
        probe_service("gateway", f"{os.environ.get('CLARTK_GATEWAY_DIAGNOSTICS_BASE_URL', 'http://127.0.0.1:3200')}/health"),
        probe_service("dev-console-web", dev_console_origin, expect_json=False),
    ]

    errors: list[dict[str, str]] = []
    coordination = build_coordination_summary(database_url, errors)
    skills = scan_skills()
    summary = {
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "endpoints": {
            "runtimeApiBaseUrl": runtime_api_base_url,
            "devConsoleApiBaseUrl": dev_console_api_base_url,
            "agentMemoryBaseUrl": agent_memory_base_url,
        },
        "account": None,
        "workspace": {
            "status": "ok"
            if tcp_reachable(postgres_host, postgres_port)
            and all(service["status"] == "ok" for service in services)
            else "degraded",
            "postgres": {
                "host": postgres_host,
                "port": postgres_port,
                "source": postgres_source,
                "reachable": tcp_reachable(postgres_host, postgres_port),
            },
            "backup": latest_backup_summary(REPO_ROOT / ".clartk" / "dev" / "backups"),
            "services": services,
        },
        "coordination": coordination,
        "catalog": {
            "docCount": scan_docs_count(),
            "skillCount": len(skills),
            "coordinatorSkillPresent": any(skill["skillId"] == "cli-coordinator" for skill in skills),
        },
        "errors": errors,
        "source": "script-fallback",
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
