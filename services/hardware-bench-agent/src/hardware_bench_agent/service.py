from __future__ import annotations

import argparse
import json
import os

from agent_memory.service import (
    DEFAULT_AGENT_TASK_IDLE_TIMEOUT,
    DEFAULT_AGENT_TASK_LEASE_SECONDS,
    HARDWARE_TASK_QUEUE,
    MemoryRepository,
    build_default_worker_name,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="clartk-hardware-bench-agent")
    parser.add_argument(
        "--database-url",
        default=os.environ.get("CLARTK_DEV_DATABASE_URL"),
    )
    parser.add_argument(
        "--queue-name",
        default=os.environ.get("CLARTK_HARDWARE_BENCH_QUEUE", HARDWARE_TASK_QUEUE),
    )
    parser.add_argument(
        "--worker-name",
        default=os.environ.get(
            "CLARTK_HARDWARE_BENCH_WORKER_NAME",
            f"hardware-bench-{build_default_worker_name()}",
        ),
    )
    parser.add_argument(
        "--lease-seconds",
        type=int,
        default=int(
            os.environ.get(
                "CLARTK_HARDWARE_BENCH_LEASE_SECONDS",
                str(DEFAULT_AGENT_TASK_LEASE_SECONDS),
            )
        ),
    )
    parser.add_argument(
        "--idle-timeout",
        type=float,
        default=float(
            os.environ.get(
                "CLARTK_HARDWARE_BENCH_IDLE_TIMEOUT",
                str(DEFAULT_AGENT_TASK_IDLE_TIMEOUT),
            )
        ),
    )
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--stop-after", type=int)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    result = MemoryRepository(args.database_url).run_worker(
        worker_name=args.worker_name,
        queue_name=args.queue_name,
        lease_seconds=args.lease_seconds,
        idle_timeout=args.idle_timeout,
        once=args.once,
        stop_after=args.stop_after,
    )
    print(json.dumps(result))
