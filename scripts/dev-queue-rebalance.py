#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

REPO_ROOT = Path(__file__).resolve().parents[1]
AGENT_MEMORY_SRC = REPO_ROOT / "services" / "agent-memory" / "src"
if str(AGENT_MEMORY_SRC) not in sys.path:
    sys.path.insert(0, str(AGENT_MEMORY_SRC))

from agent_memory.service import DEFAULT_AGENT_TASK_QUEUE, DEV_PREFERENCE_TASK_KIND, resolve_task_queue_name


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dev-queue-rebalance")
    parser.add_argument(
        "--database-url",
        default=os.environ.get("CLARTK_RESOLVED_DEV_DATABASE_URL")
        or os.environ.get("CLARTK_DEV_DATABASE_URL"),
    )
    parser.add_argument("--apply", action="store_true")
    return parser


def collect_plan(connection: psycopg.Connection[object]) -> dict[str, object]:
    queued_rows = connection.execute(
        """
        SELECT agent_task_id, task_kind
        FROM agent.task
        WHERE queue_name = %s
          AND status = 'queued'
        ORDER BY agent_task_id ASC
        """,
        (DEFAULT_AGENT_TASK_QUEUE,),
    ).fetchall()

    moves: list[dict[str, object]] = []
    move_counts_by_queue: dict[str, int] = defaultdict(int)
    move_counts_by_task_kind: dict[str, int] = defaultdict(int)
    for row in queued_rows:
        task_kind = str(row["task_kind"])
        target_queue = resolve_task_queue_name(task_kind, DEFAULT_AGENT_TASK_QUEUE)
        if target_queue == DEFAULT_AGENT_TASK_QUEUE:
            continue
        moves.append(
            {
                "agentTaskId": int(row["agent_task_id"]),
                "taskKind": task_kind,
                "targetQueue": target_queue,
            }
        )
        move_counts_by_queue[target_queue] += 1
        move_counts_by_task_kind[task_kind] += 1

    preference_rows = connection.execute(
        """
        SELECT
          agent_task_id,
          queue_name,
          payload ->> 'runtimeAccountId' AS runtime_account_id
        FROM agent.task
        WHERE task_kind = %s
          AND status = 'queued'
          AND payload ? 'runtimeAccountId'
        ORDER BY agent_task_id ASC
        """,
        (DEV_PREFERENCE_TASK_KIND,),
    ).fetchall()

    target_preference_queue = resolve_task_queue_name(DEV_PREFERENCE_TASK_KIND, DEFAULT_AGENT_TASK_QUEUE)
    grouped_task_ids: dict[str, list[int]] = defaultdict(list)
    for row in preference_rows:
        effective_queue = resolve_task_queue_name(DEV_PREFERENCE_TASK_KIND, str(row["queue_name"]))
        if effective_queue != target_preference_queue:
            continue
        grouped_task_ids[str(row["runtime_account_id"])].append(int(row["agent_task_id"]))

    duplicates = []
    skipped_task_ids: list[int] = []
    for runtime_account_id, task_ids in sorted(grouped_task_ids.items()):
        if len(task_ids) <= 1:
            continue
        duplicates.append(
            {
                "runtimeAccountId": runtime_account_id,
                "keepTaskId": task_ids[0],
                "skipTaskIds": task_ids[1:],
            }
        )
        skipped_task_ids.extend(task_ids[1:])

    return {
        "moveCount": len(moves),
        "moveCountsByQueue": dict(sorted(move_counts_by_queue.items())),
        "moveCountsByTaskKind": dict(sorted(move_counts_by_task_kind.items())),
        "moves": moves,
        "duplicatePreferenceCount": len(duplicates),
        "duplicatePreferenceTasksSkipped": skipped_task_ids,
        "duplicatePreferenceGroups": duplicates,
    }


def apply_plan(connection: psycopg.Connection[object], plan: dict[str, object]) -> dict[str, object]:
    notified_pairs: set[tuple[str, str]] = set()
    moved_rows = 0
    for move in plan["moves"]:
        connection.execute(
            """
            UPDATE agent.task
            SET queue_name = %s, updated_at = NOW()
            WHERE agent_task_id = %s
            """,
            (move["targetQueue"], move["agentTaskId"]),
        )
        moved_rows += 1
        notified_pairs.add((str(move["targetQueue"]), str(move["taskKind"])))

    skipped_task_ids = [int(task_id) for task_id in plan["duplicatePreferenceTasksSkipped"]]
    skipped_rows = 0
    if skipped_task_ids:
        connection.execute(
            """
            UPDATE agent.task
            SET
              status = 'skipped',
              last_error = 'deduplicated during queue rebalance',
              completed_at = NOW(),
              updated_at = NOW()
            WHERE agent_task_id = ANY(%s)
            """,
            (skipped_task_ids,),
        )
        skipped_rows = len(skipped_task_ids)

    for queue_name, task_kind in sorted(notified_pairs):
        connection.execute(
            "SELECT pg_notify(%s, %s)",
            (
                "agent_task_ready",
                json.dumps({"queueName": queue_name, "taskKind": task_kind}),
            ),
        )

    connection.commit()
    return {
        "movedRows": moved_rows,
        "skippedRows": skipped_rows,
        "notifiedQueues": [
            {"queueName": queue_name, "taskKind": task_kind}
            for queue_name, task_kind in sorted(notified_pairs)
        ],
    }


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if not args.database_url:
        raise SystemExit("database url is required")

    with psycopg.connect(args.database_url, row_factory=dict_row) as connection:
        plan = collect_plan(connection)
        result = {"apply": bool(args.apply), "plan": plan}
        if args.apply:
            result["applied"] = apply_plan(connection, plan)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
