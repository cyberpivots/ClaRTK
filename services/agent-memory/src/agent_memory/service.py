from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import socket
import subprocess
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import parse_qs, urlparse

import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from agent_memory.vision import VisualAsset, run_local_visual_enrichment

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
MEMORY_MAINTENANCE_TASK_QUEUE = "memory.maintenance"
CATALOG_TASK_QUEUE = "catalog.refresh"
PREFERENCE_SCORE_TASK_QUEUE = "preferences.recompute"
UI_REVIEW_TASK_QUEUE = "ui.review"
PREVIEW_TASK_QUEUE = "preview.review"
HARDWARE_TASK_QUEUE = "hardware.build"
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
REPO_ROOT = Path(__file__).resolve().parents[4]
REPO_SKILLS_ROOT = REPO_ROOT / ".agents" / "skills"
SYSTEM_SKILLS_ROOT = Path.home() / ".codex" / "skills" / ".system"
DEV_PREFERENCE_TASK_KIND = "preferences.compute_dev_preference_scores"
REFRESH_DOC_CATALOG_TASK_KIND = "catalog.refresh_doc_catalog"
REFRESH_SKILL_CATALOG_TASK_KIND = "catalog.refresh_skill_catalog"
HARDWARE_PREPARE_TASK_KIND = "hardware.prepare"
HARDWARE_RESERVE_PARTS_TASK_KIND = "hardware.reserve_parts"
HARDWARE_BUILD_TASK_KIND = "hardware.build"
HARDWARE_BENCH_VALIDATE_TASK_KIND = "hardware.bench_validate"
HARDWARE_RUNTIME_REGISTER_TASK_KIND = "hardware.runtime_register"
HARDWARE_STATUS_BUILD_PLANNED = "planned"
HARDWARE_STATUS_BUILD_PREPARED = "prepared"
HARDWARE_STATUS_BUILD_PARTS_RESERVED = "parts_reserved"
HARDWARE_STATUS_BUILD_ASSEMBLED = "assembled"
HARDWARE_STATUS_BUILD_VALIDATED = "bench_validated"
HARDWARE_STATUS_BUILD_RUNTIME_PENDING = "runtime_publish_pending"
HARDWARE_STATUS_BUILD_RUNTIME_PUBLISHED = "runtime_published"
HARDWARE_STATUS_BUILD_RUNTIME_REGISTRATION_FAILED = "runtime_registration_failed"
HARDWARE_STATUS_BUILD_FAILED = "failed"
HARDWARE_STATUS_BUILD_CANCELLED = "cancelled"
UI_REVIEW_CAPTURE_TASK_KIND = "ui.review.capture"
UI_REVIEW_ANALYZE_TASK_KIND = "ui.review.analyze"
UI_REVIEW_FIX_DRAFT_TASK_KIND = "ui.review.fix_draft"
UI_REVIEW_PROMOTE_BASELINE_TASK_KIND = "ui.review.promote_baseline"
PREVIEW_RENDER_TASK_KIND = "preview.render"
PREVIEW_ANALYZE_TASK_KIND = "preview.analyze"
UI_REVIEW_DEFAULT_SURFACE = "dev-console-web"
UI_REVIEW_DEFAULT_SCENARIO_SET = "default"
UI_REVIEW_DEFAULT_BROWSER = "chromium"
UI_REVIEW_DEFAULT_BASE_URL = "http://127.0.0.1:5180"
UI_REVIEW_DEFAULT_VIEWPORT = {"width": 1440, "height": 900}
UI_REVIEW_STATUS_PLANNED = "planned"
UI_REVIEW_STATUS_CAPTURE_RUNNING = "capture_running"
UI_REVIEW_STATUS_CAPTURED = "captured"
UI_REVIEW_STATUS_ANALYSIS_RUNNING = "analysis_running"
UI_REVIEW_STATUS_ANALYZED = "analyzed"
UI_REVIEW_STATUS_FIX_DRAFT_RUNNING = "fix_draft_running"
UI_REVIEW_STATUS_READY_FOR_REVIEW = "ready_for_review"
UI_REVIEW_STATUS_BASELINE_PROMOTION_RUNNING = "baseline_promotion_running"
UI_REVIEW_STATUS_BASELINE_PROMOTED = "baseline_promoted"
UI_REVIEW_STATUS_FAILED = "failed"
UI_REVIEW_FINDING_STATUS_PROPOSED = "proposed"
UI_REVIEW_FINDING_STATUS_ACCEPTED = "accepted"
UI_REVIEW_FINDING_STATUS_REJECTED = "rejected"
UI_REVIEW_BASELINE_STATUS_ACTIVE = "active"
UI_REVIEW_BASELINE_STATUS_SUPERSEDED = "superseded"
PREVIEW_DEFAULT_BROWSER = "chromium"
PREVIEW_DEFAULT_VIEWPORT = {"width": 1440, "height": 900}
PREVIEW_STATUS_PLANNED = "planned"
PREVIEW_STATUS_RENDER_RUNNING = "render_running"
PREVIEW_STATUS_RENDERED = "rendered"
PREVIEW_STATUS_ANALYSIS_RUNNING = "analysis_running"
PREVIEW_STATUS_READY_FOR_REVIEW = "ready_for_review"
PREVIEW_STATUS_FAILED = "failed"
UI_REVIEW_NODE_BINARY = os.environ.get("CLARTK_UI_REVIEW_NODE_BINARY", "node")
UI_REVIEW_COMMAND_TIMEOUT_SECONDS = max(
    30,
    int(os.environ.get("CLARTK_UI_REVIEW_TASK_TIMEOUT_SECONDS", "300")),
)
UI_REVIEW_CAPTURE_SCRIPT = REPO_ROOT / "scripts" / "ui-review-capture.mjs"
UI_REVIEW_ANALYZE_SCRIPT = REPO_ROOT / "scripts" / "ui-review-analyze.mjs"
PREVIEW_RENDER_SCRIPT = REPO_ROOT / "scripts" / "preview-render.mjs"
PREVIEW_ANALYZE_SCRIPT = REPO_ROOT / "scripts" / "preview-analyze.mjs"
TASK_KIND_DEFAULT_QUEUES = {
    DEV_PREFERENCE_TASK_KIND: PREFERENCE_SCORE_TASK_QUEUE,
    REFRESH_DOC_CATALOG_TASK_KIND: CATALOG_TASK_QUEUE,
    REFRESH_SKILL_CATALOG_TASK_KIND: CATALOG_TASK_QUEUE,
    "memory.run_embeddings": MEMORY_MAINTENANCE_TASK_QUEUE,
    "memory.run_evaluations": MEMORY_MAINTENANCE_TASK_QUEUE,
    UI_REVIEW_CAPTURE_TASK_KIND: UI_REVIEW_TASK_QUEUE,
    UI_REVIEW_ANALYZE_TASK_KIND: UI_REVIEW_TASK_QUEUE,
    UI_REVIEW_FIX_DRAFT_TASK_KIND: UI_REVIEW_TASK_QUEUE,
    UI_REVIEW_PROMOTE_BASELINE_TASK_KIND: UI_REVIEW_TASK_QUEUE,
    PREVIEW_RENDER_TASK_KIND: PREVIEW_TASK_QUEUE,
    PREVIEW_ANALYZE_TASK_KIND: PREVIEW_TASK_QUEUE,
    HARDWARE_PREPARE_TASK_KIND: HARDWARE_TASK_QUEUE,
    HARDWARE_RESERVE_PARTS_TASK_KIND: HARDWARE_TASK_QUEUE,
    HARDWARE_BUILD_TASK_KIND: HARDWARE_TASK_QUEUE,
    HARDWARE_BENCH_VALIDATE_TASK_KIND: HARDWARE_TASK_QUEUE,
    HARDWARE_RUNTIME_REGISTER_TASK_KIND: HARDWARE_TASK_QUEUE,
}
DEFAULT_AGENT_WORKER_QUEUE_NAMES = [
    DEFAULT_AGENT_TASK_QUEUE,
    MEMORY_MAINTENANCE_TASK_QUEUE,
    CATALOG_TASK_QUEUE,
    PREFERENCE_SCORE_TASK_QUEUE,
    UI_REVIEW_TASK_QUEUE,
    PREVIEW_TASK_QUEUE,
    HARDWARE_TASK_QUEUE,
]
DEFAULT_AGENT_WORKER_QUEUE = ",".join(DEFAULT_AGENT_WORKER_QUEUE_NAMES)


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


def normalize_lexical_score(score: float, max_score: float) -> float:
    if score <= 0 or max_score <= 0:
        return 0.0
    return round(min(1.0, score / max_score), 4)


def semantic_score_from_distance(distance: float | None) -> float:
    if distance is None:
        return 0.0
    bounded = max(0.0, float(distance))
    return round(1.0 / (1.0 + bounded), 4)


def combine_claim_search_scores(
    lexical_score: float,
    semantic_score: float,
    *,
    mode: str,
) -> float:
    if mode == "lexical":
        return round(lexical_score, 4)
    if mode == "vector":
        return round(semantic_score, 4)
    if lexical_score > 0 and semantic_score > 0:
        return round((lexical_score * 0.65) + (semantic_score * 0.35), 4)
    return round(max(lexical_score, semantic_score), 4)


def summarize_visual_signals(signals: list[dict[str, Any]]) -> dict[str, Any]:
    severity_counts: dict[str, int] = {}
    kind_counts: dict[str, int] = {}
    highlights: list[dict[str, Any]] = []
    for signal in signals:
        severity = str(signal.get("severity", "info"))
        kind = str(signal.get("kind", "unknown"))
        severity_counts[severity] = severity_counts.get(severity, 0) + 1
        kind_counts[kind] = kind_counts.get(kind, 0) + 1
        if len(highlights) < 8:
            highlights.append(
                {
                    "severity": severity,
                    "kind": kind,
                    "label": signal.get("label"),
                    "relativePath": signal.get("relativePath"),
                }
            )
    return {
        "severityCounts": severity_counts,
        "kindCounts": kind_counts,
        "highlights": highlights,
        "total": len(signals),
    }


def task_retry_delay_seconds(attempt_count: int) -> int:
    bounded_attempt = max(1, attempt_count)
    return min(300, 2 ** bounded_attempt)


def timestamp_from_mtime(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()


def scan_markdown_catalog() -> dict[str, Any]:
    counts = {
        "task": 0,
        "adr": 0,
        "operations": 0,
        "research": 0,
        "plan": 0,
        "other": 0,
    }

    docs_root = REPO_ROOT / "docs"
    for markdown_path in docs_root.rglob("*.md"):
        relative = markdown_path.relative_to(docs_root).as_posix()
        if relative.startswith("tasks/"):
            counts["task"] += 1
        elif relative.startswith("adr/"):
            counts["adr"] += 1
        elif relative.startswith("operations/"):
            counts["operations"] += 1
        elif relative.startswith("research/"):
            counts["research"] += 1
        elif relative.startswith("plan/"):
            counts["plan"] += 1
        else:
            counts["other"] += 1

    return {
        "repoRoot": str(REPO_ROOT),
        "counts": counts,
        "total": sum(counts.values()),
    }


def scan_skill_catalog() -> dict[str, Any]:
    skills: list[dict[str, Any]] = []

    for source, root in (("repo", REPO_SKILLS_ROOT), ("system", SYSTEM_SKILLS_ROOT)):
        if not root.exists():
            continue
        for skill_path in sorted(root.rglob("SKILL.md")):
            description = ""
            try:
                lines = skill_path.read_text(encoding="utf-8").splitlines()
            except OSError:
                continue
            for line in lines:
                if line.startswith("description:"):
                    description = line.split(":", 1)[1].strip()
                    break
            skill_id = skill_path.parent.name
            skills.append(
                {
                    "skillId": skill_id,
                    "source": source,
                    "path": str(skill_path),
                    "description": description,
                }
            )

    return {
        "repoRoot": str(REPO_ROOT),
        "skillCount": len(skills),
        "skills": skills,
    }


def choose_top_value(values: list[str]) -> tuple[str | None, float]:
    filtered = [value for value in values if value]
    if not filtered:
        return None, 0.0

    counts: dict[str, int] = {}
    for value in filtered:
        counts[value] = counts.get(value, 0) + 1

    winner = max(counts.items(), key=lambda item: (item[1], item[0]))
    confidence = round(winner[1] / len(filtered), 2)
    return winner[0], confidence


def extract_string(payload: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def as_int(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return int(value)
        except ValueError:
            return None
    return None


def sanitize_identifier(value: Any) -> str:
    sanitized = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(value)).strip("-")
    return sanitized or "item"


def parse_markdown_title(markdown_path: Path) -> str:
    for line in markdown_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return markdown_path.stem


def resolve_preview_source(deck_key: str) -> tuple[Path, Path | None, str]:
    markdown_path = REPO_ROOT / "docs" / "presentations" / f"{deck_key}.md"
    if not markdown_path.exists():
        raise FileNotFoundError(f"presentation deck not found: {deck_key}")

    if deck_key == "index" or deck_key.endswith("-canva-brief"):
        raise ValueError(f"presentation deck is not previewable: {deck_key}")

    companion_path = markdown_path.with_suffix(".preview.json")
    return (
        markdown_path,
        companion_path if companion_path.exists() else None,
        parse_markdown_title(markdown_path),
    )


def parse_inventory_manifest(manifest_path: str) -> dict[str, list[dict[str, Any]]]:
    manifest_file = Path(manifest_path)
    if not manifest_file.is_absolute():
        candidate = REPO_ROOT / manifest_path
        if candidate.exists():
            manifest_file = candidate
    if not manifest_file.exists():
        raise FileNotFoundError(f"manifest not found: {manifest_path}")

    text = manifest_file.read_text(encoding="utf-8")

    marker_start = "```json"
    marker_end = "```"
    manifest_payload: dict[str, Any] | None = None
    search_start = 0
    while True:
        block_start = text.find(marker_start, search_start)
        if block_start == -1:
            break
        block_content_start = block_start + len(marker_start)
        block_end = text.find(marker_end, block_content_start)
        if block_end == -1:
            break
        block = text[block_content_start:block_end].strip()
        search_start = block_end + len(marker_end)

        try:
            parsed = json.loads(block)
        except json.JSONDecodeError:
            continue
        if (
            isinstance(parsed, dict)
            and ("items" in parsed or "units" in parsed)
            and manifest_payload is None
        ):
            manifest_payload = parsed
            break

    if manifest_payload is None:
        raise ValueError(f"could not locate inventory json block in manifest: {manifest_path}")

    raw_items = manifest_payload.get("items", [])
    raw_units = manifest_payload.get("units", [])
    if not isinstance(raw_items, list) or not isinstance(raw_units, list):
        raise ValueError("manifest sections must be arrays named items and units")

    def normalize_row(row: Any) -> dict[str, Any]:
        if not isinstance(row, dict):
            raise ValueError("manifest rows must be objects")
        return dict(row)

    return {
        "items": [normalize_row(row) for row in raw_items],
        "units": [normalize_row(row) for row in raw_units],
    }


def build_dev_preference_scorecard(
    signals: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    def collect_payload_values(signal_kind: str, *keys: str) -> list[str]:
        return [
            extract_string(signal.get("payload", {}), *keys)
            for signal in signals
            if signal.get("signalKind") == signal_kind
        ]

    def collect_payload_values_for_signal_kinds(
        signal_kinds: set[str], *keys: str
    ) -> list[str]:
        return [
            extract_string(signal.get("payload", {}), *keys)
            for signal in signals
            if signal.get("signalKind") in signal_kinds
        ]

    landing_panels = [
        signal.get("panelKey")
        for signal in signals
        if signal.get("signalKind") == "landing_panel_selected" and signal.get("panelKey")
    ]
    detail_depths = [
        extract_string(signal.get("payload", {}), "detailDepth", "value")
        for signal in signals
        if signal.get("signalKind") == "detail_depth_selected"
    ]
    queue_filters = [
        extract_string(signal.get("payload", {}), "queueName", "value")
        for signal in signals
        if signal.get("signalKind") == "queue_filter_selected"
    ]
    explanation_density = [
        extract_string(signal.get("payload", {}), "density", "value")
        for signal in signals
        if signal.get("signalKind") == "explanation_density_selected"
    ]
    evidence_formats = [
        extract_string(signal.get("payload", {}), "evidenceFormat", "value")
        for signal in signals
        if signal.get("signalKind") == "evidence_format_selected"
    ]
    hud_densities = [
        extract_string(signal.get("payload", {}), "density", "value")
        for signal in signals
        if signal.get("signalKind") == "hud_density_selected"
    ]
    motion_modes = [
        extract_string(signal.get("payload", {}), "motionMode", "value")
        for signal in signals
        if signal.get("signalKind") == "motion_mode_selected"
    ]
    preview_subpanes = [
        extract_string(signal.get("payload", {}), "subpane", "value")
        for signal in signals
        if signal.get("signalKind") == "preview_subpane_selected"
    ]
    telemetry_drawers = collect_payload_values_for_signal_kinds(
        {"telemetry_drawer_opened", "telemetry_mode_selected"},
        "drawerKey",
        "telemetryMode",
        "value",
    )
    questionnaire_surfaces = collect_payload_values_for_signal_kinds(
        {"questionnaire_started", "questionnaire_completed"},
        "questionnaireSurface",
        "value",
    )
    questionnaire_answers = [
        signal
        for signal in signals
        if signal.get("signalKind") == "questionnaire_step_answered"
    ]
    questionnaire_started = [
        signal for signal in signals if signal.get("signalKind") == "questionnaire_started"
    ]
    questionnaire_completed = [
        signal for signal in signals if signal.get("signalKind") == "questionnaire_completed"
    ]
    surface_page_signals = [
        signal
        for signal in signals
        if signal.get("signalKind") == "surface_carousel_page_selected"
    ]
    surface_card_signals = [
        signal for signal in signals if signal.get("signalKind") == "surface_card_selected"
    ]
    evidence_page_signals = [
        signal
        for signal in surface_page_signals
        if extract_string(signal.get("payload", {}), "pageKey", "value") == "evidence"
    ]
    evidence_card_signals = [
        signal
        for signal in surface_card_signals
        if "evidence" in extract_string(signal.get("payload", {}), "cardKey", "value")
    ]

    accepted_actions = [
        decision
        for decision in decisions
        if decision.get("subjectKind") == "recommended_action"
        and decision.get("decisionKind") == "accepted"
    ]
    rejected_actions = [
        decision
        for decision in decisions
        if decision.get("subjectKind") == "recommended_action"
        and decision.get("decisionKind") == "rejected"
    ]
    overridden_actions = [
        decision
        for decision in decisions
        if decision.get("subjectKind") == "recommended_action"
        and decision.get("decisionKind") == "overridden"
    ]
    questionnaire_decisions = [
        decision
        for decision in decisions
        if decision.get("subjectKind") == "questionnaire_answer"
    ]
    preview_questionnaire_decisions = [
        decision
        for decision in questionnaire_decisions
        if extract_string(decision.get("payload", {}), "panelKey", "value") == "preview"
    ]
    preview_approved = [
        decision
        for decision in preview_questionnaire_decisions
        if str(decision.get("subjectKey")) == "next_action"
        and str(decision.get("chosenValue")) == "approve_direction"
    ]
    preview_rejected = [
        decision
        for decision in preview_questionnaire_decisions
        if str(decision.get("subjectKey")) == "next_action"
        and str(decision.get("chosenValue")) in {"request_revision", "pause_for_research"}
    ]

    preferred_landing_panel, landing_confidence = choose_top_value(
        [value for value in landing_panels if value]
    )
    preferred_detail_depth, detail_confidence = choose_top_value(
        [value for value in detail_depths if value]
    )
    preferred_queue_name, queue_confidence = choose_top_value(
        [value for value in queue_filters if value]
    )
    preferred_density, density_confidence = choose_top_value(
        [value for value in explanation_density if value]
    )
    preferred_evidence_format, evidence_confidence = choose_top_value(
        [value for value in evidence_formats if value]
    )
    preferred_hud_density, density_mode_confidence = choose_top_value(
        [value for value in hud_densities if value]
    )
    preferred_motion_mode, motion_confidence = choose_top_value(
        [value for value in motion_modes if value]
    )
    preferred_preview_subpane, preview_subpane_confidence = choose_top_value(
        [value for value in preview_subpanes if value]
    )
    preferred_questionnaire_surface, questionnaire_surface_confidence = choose_top_value(
        [value for value in questionnaire_surfaces if value]
    )
    preferred_telemetry_mode, telemetry_confidence = choose_top_value(
        [value for value in telemetry_drawers if value]
    )

    total_action_decisions = (
        len(accepted_actions) + len(rejected_actions) + len(overridden_actions)
    )
    if total_action_decisions == 0:
        automation_style = "supervised"
        automation_confidence = 0.4
    else:
        acceptance_ratio = len(accepted_actions) / total_action_decisions
        automation_style = "assisted" if acceptance_ratio >= 0.5 else "supervised"
        automation_confidence = round(max(0.4, acceptance_ratio), 2)

    review_decision_count = len(accepted_actions) + len(rejected_actions)
    review_acceptance_ratio = (
        round(len(accepted_actions) / review_decision_count, 2)
        if review_decision_count > 0
        else 0.0
    )
    preview_decision_count = len(preview_approved) + len(preview_rejected)
    preview_approval_ratio = (
        round(len(preview_approved) / preview_decision_count, 2)
        if preview_decision_count > 0
        else 0.0
    )
    questionnaire_completion_rate = (
        round(len(questionnaire_completed) / len(questionnaire_started), 2)
        if questionnaire_started
        else 0.0
    )
    evidence_signal_count = len(evidence_page_signals) + len(evidence_card_signals)
    evidence_engagement = (
        round(evidence_signal_count / len(signals), 2) if signals else 0.0
    )

    page_preferences: dict[str, dict[str, Any]] = {}
    page_signals_by_panel: dict[str, list[str]] = {}
    for signal in surface_page_signals:
        payload = signal.get("payload", {})
        panel_key = extract_string(payload, "panelKey", "value")
        page_key = extract_string(payload, "pageKey", "value")
        if not panel_key or not page_key:
            continue
        page_signals_by_panel.setdefault(panel_key, []).append(page_key)
    for panel_key in sorted(page_signals_by_panel):
        page_values = page_signals_by_panel[panel_key]
        preferred_page, preferred_page_confidence = choose_top_value(page_values)
        page_preferences[panel_key] = {
            "value": preferred_page,
            "confidence": preferred_page_confidence,
        }

    feature_summary = {
        "signalCount": len(signals),
        "decisionCount": len(decisions),
        "acceptedActionCount": len(accepted_actions),
        "rejectedActionCount": len(rejected_actions),
        "overriddenActionCount": len(overridden_actions),
        "hudDensitySelectionCount": len([value for value in hud_densities if value]),
        "motionModeSelectionCount": len([value for value in motion_modes if value]),
        "previewSubpaneSelectionCount": len([value for value in preview_subpanes if value]),
        "telemetryDrawerSelectionCount": len([value for value in telemetry_drawers if value]),
        "questionnaireStartedCount": len(questionnaire_started),
        "questionnaireAnsweredCount": len(questionnaire_answers),
        "questionnaireCompletedCount": len(questionnaire_completed),
        "surfacePageSelectionCount": len(surface_page_signals),
        "surfaceCardSelectionCount": len(surface_card_signals),
        "evidenceEngagementSignalCount": evidence_signal_count,
    }
    scorecard = {
        "preferredLandingPanel": {
            "value": preferred_landing_panel,
            "confidence": landing_confidence,
        },
        "preferredDetailDepth": {
            "value": preferred_detail_depth,
            "confidence": detail_confidence,
        },
        "preferredQueueName": {
            "value": preferred_queue_name,
            "confidence": queue_confidence,
        },
        "preferredExplanationDensity": {
            "value": preferred_density,
            "confidence": density_confidence,
        },
        "preferredEvidenceFormat": {
            "value": preferred_evidence_format,
            "confidence": evidence_confidence,
        },
        "preferredHudDensity": {
            "value": preferred_hud_density,
            "confidence": density_mode_confidence,
        },
        "preferredMotionMode": {
            "value": preferred_motion_mode,
            "confidence": motion_confidence,
        },
        "preferredPreviewSubpane": {
            "value": preferred_preview_subpane,
            "confidence": preview_subpane_confidence,
        },
        "preferredQuestionnaireSurface": {
            "value": preferred_questionnaire_surface,
            "confidence": questionnaire_surface_confidence,
        },
        "preferredTelemetryMode": {
            "value": preferred_telemetry_mode,
            "confidence": telemetry_confidence,
        },
        "preferredPageByPanel": page_preferences,
        "automationStyle": {
            "value": automation_style,
            "confidence": automation_confidence,
        },
        "questionnaireCompletionRate": {
            "value": questionnaire_completion_rate,
            "confidence": round(max(0.4, questionnaire_completion_rate or 0.4), 2),
        },
        "reviewAcceptanceRatio": {
            "value": review_acceptance_ratio,
            "confidence": round(max(0.4, review_acceptance_ratio or 0.4), 2),
        },
        "previewApprovalRatio": {
            "value": preview_approval_ratio,
            "confidence": round(max(0.4, preview_approval_ratio or 0.4), 2),
        },
        "evidenceEngagement": {
            "value": evidence_engagement,
            "confidence": round(max(0.4, evidence_engagement or 0.4), 2),
        },
    }
    return feature_summary, scorecard


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


def resolve_task_queue_name(task_kind: str, queue_name: str | None) -> str:
    normalized = queue_name.strip() if isinstance(queue_name, str) else ""
    if normalized and normalized != DEFAULT_AGENT_TASK_QUEUE:
        return normalized
    return TASK_KIND_DEFAULT_QUEUES.get(task_kind, DEFAULT_AGENT_TASK_QUEUE)


def parse_queue_names(queue_name: str | None) -> list[str]:
    source = queue_name.strip() if isinstance(queue_name, str) and queue_name.strip() else DEFAULT_AGENT_WORKER_QUEUE
    queue_names: list[str] = []
    for item in source.split(","):
        normalized = item.strip()
        if not normalized or normalized in queue_names:
            continue
        queue_names.append(normalized)
    return queue_names or [DEFAULT_AGENT_TASK_QUEUE]


class MemoryRepository:
    def __init__(self, database_url: str | None) -> None:
        self.database_url = database_url
        self.connect_timeout_seconds = max(
            1,
            int(os.environ.get("CLARTK_AGENT_MEMORY_DB_CONNECT_TIMEOUT_SECONDS", "10")),
        )
        self.session_idle_timeout_ms = max(
            1000,
            int(os.environ.get("CLARTK_AGENT_MEMORY_DB_SESSION_IDLE_TIMEOUT_MS", "60000")),
        )
        self.db_connection_limit = max(
            1,
            int(os.environ.get("CLARTK_AGENT_MEMORY_DB_MAX_CONNECTIONS", "4")),
        )
        self.connection_slots = threading.BoundedSemaphore(self.db_connection_limit)

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
        acquired = self.connection_slots.acquire(timeout=self.connect_timeout_seconds + 1)
        if not acquired:
            raise RuntimeError("agent-memory database connection slots are exhausted")

        try:
            with psycopg.connect(
                self.database_url,
                row_factory=dict_row,
                connect_timeout=self.connect_timeout_seconds,
                application_name="clartk-agent-memory",
                options=f"-c idle_session_timeout={self.session_idle_timeout_ms}",
            ) as connection:
                if register_vectors:
                    register_vector(connection)
                yield connection
        finally:
            self.connection_slots.release()

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

    def search_claims(
        self,
        query: str,
        *,
        mode: str = "hybrid",
        limit: int = 50,
    ) -> dict[str, Any]:
        normalized_mode = mode if mode in {"lexical", "vector", "hybrid"} else "hybrid"
        normalized_query = " ".join(query.split()).strip()
        if not self.configured:
            return {
                "items": [],
                "source": "unconfigured",
                "query": normalized_query,
                "mode": normalized_mode,
            }
        if not normalized_query:
            return {
                "items": [],
                "source": "dev-memory",
                "query": normalized_query,
                "mode": normalized_mode,
            }

        query_vector = Vector(build_development_embedding(normalized_query))
        with self.connect(register_vectors=True) as connection:
            rows = connection.execute(
                """
                WITH lexical AS (
                  SELECT
                    kc.knowledge_claim_id,
                    kc.source_document_id,
                    kc.summary,
                    kc.status,
                    kc.tags,
                    kc.created_at,
                    sd.title AS source_title,
                    sd.uri AS source_uri,
                    ts_rank_cd(
                      setweight(to_tsvector('simple', COALESCE(kc.summary, '')), 'A') ||
                      setweight(to_tsvector('simple', COALESCE(sd.title, '')), 'B') ||
                      setweight(to_tsvector('simple', COALESCE(sd.body, '')), 'C'),
                      websearch_to_tsquery('simple', %s)
                    ) AS lexical_score
                  FROM memory.knowledge_claim AS kc
                  LEFT JOIN memory.source_document AS sd
                    ON sd.source_document_id = kc.source_document_id
                ),
                semantic AS (
                  SELECT
                    kc.knowledge_claim_id,
                    MIN(chunk.embedding <=> %s) AS semantic_distance
                  FROM memory.knowledge_claim AS kc
                  LEFT JOIN memory.embedding_chunk AS chunk
                    ON chunk.source_document_id = kc.source_document_id
                   AND chunk.embedding IS NOT NULL
                  GROUP BY kc.knowledge_claim_id
                )
                SELECT
                  lexical.knowledge_claim_id,
                  lexical.source_document_id,
                  lexical.summary,
                  lexical.status,
                  lexical.tags,
                  lexical.created_at,
                  lexical.source_title,
                  lexical.source_uri,
                  lexical.lexical_score,
                  semantic.semantic_distance
                FROM lexical
                LEFT JOIN semantic
                  ON semantic.knowledge_claim_id = lexical.knowledge_claim_id
                WHERE (
                  %s = 'lexical' AND lexical.lexical_score > 0
                ) OR (
                  %s = 'vector' AND semantic.semantic_distance IS NOT NULL
                ) OR (
                  %s = 'hybrid' AND (lexical.lexical_score > 0 OR semantic.semantic_distance IS NOT NULL)
                )
                ORDER BY lexical.created_at DESC, lexical.knowledge_claim_id DESC
                LIMIT %s
                """,
                (
                    normalized_query,
                    query_vector,
                    normalized_mode,
                    normalized_mode,
                    normalized_mode,
                    limit,
                ),
            ).fetchall()

        max_lexical_score = max((float(row["lexical_score"] or 0.0) for row in rows), default=0.0)
        items: list[dict[str, Any]] = []
        for row in rows:
            lexical_score = normalize_lexical_score(float(row["lexical_score"] or 0.0), max_lexical_score)
            semantic_score = semantic_score_from_distance(
                float(row["semantic_distance"]) if row["semantic_distance"] is not None else None
            )
            combined_score = combine_claim_search_scores(
                lexical_score,
                semantic_score,
                mode=normalized_mode,
            )
            match_reasons = []
            if lexical_score > 0:
                match_reasons.append("lexical")
            if semantic_score > 0:
                match_reasons.append("semantic")
            items.append(
                {
                    "knowledgeClaimId": int(row["knowledge_claim_id"]),
                    "sourceDocumentId": int(row["source_document_id"])
                    if row["source_document_id"] is not None
                    else None,
                    "summary": row["summary"],
                    "status": row["status"],
                    "tags": row["tags"] or [],
                    "createdAt": row["created_at"].isoformat(),
                    "sourceTitle": row["source_title"],
                    "sourceUri": row["source_uri"],
                    "lexicalScore": lexical_score,
                    "semanticScore": semantic_score,
                    "combinedScore": combined_score,
                    "matchReasons": match_reasons,
                }
            )

        items.sort(
            key=lambda item: (
                float(item["combinedScore"]),
                float(item["lexicalScore"]),
                float(item["semanticScore"]),
                str(item["createdAt"]),
            ),
            reverse=True,
        )
        return {
            "items": items,
            "source": "dev-memory",
            "query": normalized_query,
            "mode": normalized_mode,
        }

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

    def list_agent_tasks(
        self,
        queue_name: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        if not self.configured:
            return {
                "items": [],
                "queues": [],
                "source": "unconfigured",
            }

        where_sql = ""
        params: list[Any] = []
        if queue_name:
            where_sql = "WHERE queue_name = %s"
            params.append(queue_name)

        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT
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
                FROM agent.task
                {where_sql}
                ORDER BY created_at DESC, agent_task_id DESC
                LIMIT %s
                """,
                tuple(params + [limit]),
            ).fetchall()
            queue_rows = connection.execute(
                f"""
                SELECT
                  queue_name,
                  COUNT(*) FILTER (WHERE status = 'queued') AS queued_count,
                  COUNT(*) FILTER (WHERE status = 'leased') AS leased_count,
                  COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded_count,
                  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
                FROM agent.task
                {where_sql}
                GROUP BY queue_name
                ORDER BY queue_name ASC
                """,
                tuple(params),
            ).fetchall()

        recent_by_queue: dict[str, list[dict[str, Any]]] = {}
        for task in [map_agent_task(row) for row in rows]:
            recent_by_queue.setdefault(str(task["queueName"]), [])
            if len(recent_by_queue[str(task["queueName"])]) < 5:
                recent_by_queue[str(task["queueName"])].append(task)

        queues = [
            {
                "queueName": row["queue_name"],
                "queuedCount": int(row["queued_count"]),
                "leasedCount": int(row["leased_count"]),
                "succeededCount": int(row["succeeded_count"]),
                "failedCount": int(row["failed_count"]),
                "recentTasks": recent_by_queue.get(str(row["queue_name"]), []),
            }
            for row in queue_rows
        ]

        return {
            "items": [map_agent_task(row) for row in rows],
            "queues": queues,
            "source": "dev-memory",
        }

    def get_agent_task(self, agent_task_id: int) -> dict[str, Any] | None:
        if not self.configured:
            return None

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
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
                FROM agent.task
                WHERE agent_task_id = %s
                """,
                (agent_task_id,),
            ).fetchone()
        return map_agent_task(row) if row is not None else None

    def list_inventory_items(self, status: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                  item.item_id,
                  item.item_key,
                  item.part_name,
                  item.manufacturer,
                  item.model,
                  item.category,
                  item.classification,
                  item.status,
                  item.latest_event_id,
                  item.notes_json,
                  item.created_at,
                  item.updated_at,
                  (
                    SELECT COUNT(*)
                    FROM inventory.unit AS unit
                    WHERE unit.item_id = item.item_id
                  ) AS total_units
                FROM inventory.item AS item
                WHERE (%s IS NULL OR item.status = %s)
                ORDER BY item.created_at DESC, item.item_id DESC
                LIMIT %s
                """,
                (status, status, limit),
            ).fetchall()
        return [map_inventory_item(row) for row in rows]

    def list_inventory_units(
        self,
        item_id: int | None = None,
        status: str | None = None,
        build_id: int | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                  unit.unit_id,
                  unit.item_id,
                  unit.unit_label,
                  unit.serial_number,
                  unit.asset_tag,
                  unit.status,
                  unit.location,
                  unit.current_build_id,
                  unit.latest_event_id,
                  unit.metadata_json,
                  unit.created_at,
                  unit.updated_at
                FROM inventory.unit AS unit
                WHERE (%s IS NULL OR unit.item_id = %s)
                  AND (%s IS NULL OR unit.status = %s)
                  AND (%s IS NULL OR unit.current_build_id = %s)
                ORDER BY unit.created_at DESC, unit.unit_id DESC
                LIMIT %s
                """,
                (item_id, item_id, status, status, build_id, build_id, limit),
            ).fetchall()
        return [map_inventory_unit(row) for row in rows]

    def list_inventory_builds(
        self,
        status: str | None = None,
        build_kind: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                  build.build_id,
                  build.build_name,
                  build.build_kind,
                  build.status,
                  build.base_unit_id,
                  build.rover_unit_id,
                  build.reserved_by_account_id,
                  build.runtime_device_id,
                  build.current_task_id,
                  build.expected_site,
                  build.plan_json,
                  build.result_json,
                  build.latest_event_id,
                  build.created_at,
                  build.updated_at
                FROM inventory.build AS build
                WHERE (%s IS NULL OR build.status = %s)
                  AND (%s IS NULL OR build.build_kind = %s)
                ORDER BY build.created_at DESC, build.build_id DESC
                LIMIT %s
                """,
                (status, status, build_kind, build_kind, limit),
            ).fetchall()
        return [map_inventory_build(row) for row in rows]

    def list_inventory_events(
        self,
        subject_kind: str | None = None,
        subject_id: int | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                  event.event_id,
                  event.subject_kind,
                  event.subject_id,
                  event.event_kind,
                  event.payload_json,
                  event.actor,
                  event.agent_task_id,
                  event.created_at
                FROM inventory.event AS event
                WHERE (%s IS NULL OR event.subject_kind = %s)
                  AND (%s IS NULL OR event.subject_id = %s)
                ORDER BY event.created_at DESC, event.event_id DESC
                LIMIT %s
                """,
                (subject_kind, subject_kind, subject_id, subject_id, limit),
            ).fetchall()
        return [map_inventory_event(row) for row in rows]

    def get_inventory_item(self, item_id: int) -> dict[str, Any] | None:
        if not self.configured:
            return None

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                  item.item_id,
                  item.item_key,
                  item.part_name,
                  item.manufacturer,
                  item.model,
                  item.category,
                  item.classification,
                  item.status,
                  item.latest_event_id,
                  item.notes_json,
                  item.created_at,
                  item.updated_at,
                  (
                    SELECT COUNT(*)
                    FROM inventory.unit AS unit
                    WHERE unit.item_id = item.item_id
                  ) AS total_units
                FROM inventory.item AS item
                WHERE item.item_id = %s
                """,
                (item_id,),
            ).fetchone()
        return map_inventory_item(row) if row is not None else None

    def get_inventory_unit(self, unit_id: int) -> dict[str, Any] | None:
        if not self.configured:
            return None

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                  unit.unit_id,
                  unit.item_id,
                  unit.unit_label,
                  unit.serial_number,
                  unit.asset_tag,
                  unit.status,
                  unit.location,
                  unit.current_build_id,
                  unit.latest_event_id,
                  unit.metadata_json,
                  unit.created_at,
                  unit.updated_at
                FROM inventory.unit AS unit
                WHERE unit.unit_id = %s
                """,
                (unit_id,),
            ).fetchone()
        return map_inventory_unit(row) if row is not None else None

    def get_inventory_build(self, build_id: int) -> dict[str, Any] | None:
        if not self.configured:
            return None

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                  build.build_id,
                  build.build_name,
                  build.build_kind,
                  build.status,
                  build.base_unit_id,
                  build.rover_unit_id,
                  build.reserved_by_account_id,
                  build.runtime_device_id,
                  build.current_task_id,
                  build.expected_site,
                  build.plan_json,
                  build.result_json,
                  build.latest_event_id,
                  build.created_at,
                  build.updated_at
                FROM inventory.build AS build
                WHERE build.build_id = %s
                """,
                (build_id,),
            ).fetchone()
        return map_inventory_build(row) if row is not None else None

    def _ui_review_root(self) -> Path:
        configured_root = os.environ.get("CLARTK_UI_REVIEW_ROOT")
        return (
            Path(configured_root).resolve()
            if configured_root
            else REPO_ROOT / ".clartk" / "dev" / "ui-review"
        )

    def _ui_review_baseline_root(self) -> Path:
        configured_root = os.environ.get("CLARTK_UI_REVIEW_BASELINE_ROOT")
        return (
            Path(configured_root).resolve()
            if configured_root
            else self._ui_review_root() / "baselines"
        )

    def _preview_root(self) -> Path:
        configured_root = os.environ.get("CLARTK_PREVIEW_ROOT")
        return (
            Path(configured_root).resolve()
            if configured_root
            else REPO_ROOT / ".clartk" / "dev" / "presentation-preview"
        )

    def _build_ui_review_artifact_dir(
        self,
        ui_review_run_id: int,
        *,
        surface: str,
        scenario_set: str,
    ) -> Path:
        return self._ui_review_root() / "runs" / (
            f"{ui_review_run_id:06d}-"
            f"{sanitize_identifier(surface)}-"
            f"{sanitize_identifier(scenario_set)}"
        )

    def _build_ui_review_baseline_path(
        self,
        *,
        surface: str,
        browser: str,
        viewport_key: str,
        scenario_name: str,
        checkpoint_name: str,
    ) -> Path:
        return (
            self._ui_review_baseline_root()
            / sanitize_identifier(surface)
            / sanitize_identifier(browser)
            / sanitize_identifier(viewport_key)
            / f"{sanitize_identifier(scenario_name)}-{sanitize_identifier(checkpoint_name)}.png"
        )

    def _build_preview_artifact_dir(
        self,
        preview_run_id: int,
        *,
        deck_key: str,
    ) -> Path:
        return self._preview_root() / "runs" / (
            f"{preview_run_id:06d}-{sanitize_identifier(deck_key)}"
        )

    def _relative_repo_path(self, target: Path) -> str:
        return target.resolve().relative_to(REPO_ROOT).as_posix()

    def _run_json_command(self, args: list[str]) -> dict[str, Any]:
        completed = subprocess.run(
            args,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=UI_REVIEW_COMMAND_TIMEOUT_SECONDS,
            check=False,
        )
        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip() or "command failed"
            raise RuntimeError(detail)

        stdout = completed.stdout.strip()
        if not stdout:
            raise RuntimeError("review command returned no json payload")

        try:
            return json.loads(stdout)
        except json.JSONDecodeError as error:
            raise RuntimeError(f"review command returned invalid json: {error}") from error

    def _create_review_task(
        self,
        connection: psycopg.Connection[Any],
        *,
        task_kind: str,
        queue_name: str,
        priority: int,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        queue_name = resolve_task_queue_name(task_kind, queue_name)
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
        return map_agent_task(row)

    def _record_ui_review_artifacts(
        self,
        connection: psycopg.Connection[Any],
        agent_run_id: int,
        descriptors: list[dict[str, Any]],
    ) -> None:
        seen: set[tuple[str, str]] = set()
        for descriptor in descriptors:
            kind = str(descriptor.get("kind", "")).strip()
            relative_path = str(descriptor.get("relativePath", "")).strip()
            if not kind or not relative_path:
                continue
            dedupe_key = (kind, relative_path)
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            self._record_agent_artifact(
                connection,
                agent_run_id,
                artifact_kind=kind,
                uri=f"clartk://workspace/{relative_path}",
                metadata={
                    "relativePath": relative_path,
                    "mediaType": descriptor.get("mediaType"),
                },
            )

    def _record_preview_artifacts(
        self,
        connection: psycopg.Connection[Any],
        agent_run_id: int,
        descriptors: list[dict[str, Any]],
    ) -> None:
        seen: set[tuple[str, str]] = set()
        for descriptor in descriptors:
            kind = str(descriptor.get("kind", "")).strip()
            relative_path = str(descriptor.get("relativePath", "")).strip()
            if not kind or not relative_path:
                continue
            dedupe_key = (kind, relative_path)
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            metadata: dict[str, Any] = {
                "relativePath": relative_path,
                "mediaType": descriptor.get("mediaType"),
            }
            slide_id = extract_string(descriptor, "slideId")
            if slide_id:
                metadata["slideId"] = slide_id
            self._record_agent_artifact(
                connection,
                agent_run_id,
                artifact_kind=kind,
                uri=f"clartk://workspace/{relative_path}",
                metadata=metadata,
            )

    def _collect_visual_assets(
        self,
        descriptors: list[dict[str, Any]],
        *,
        kind_prefixes: tuple[str, ...],
    ) -> list[VisualAsset]:
        assets: list[VisualAsset] = []
        for descriptor in descriptors:
            kind = str(descriptor.get("kind", "")).strip()
            relative_path = str(descriptor.get("relativePath", "")).strip()
            if not kind or not relative_path:
                continue
            if not any(kind.startswith(prefix) for prefix in kind_prefixes):
                continue
            absolute_path = REPO_ROOT / relative_path
            assets.append(
                VisualAsset(
                    kind=kind,
                    relative_path=relative_path,
                    absolute_path=absolute_path,
                    label=str(descriptor.get("slideId") or absolute_path.name),
                )
            )
        return assets

    def _write_visual_enrichment_artifact(
        self,
        base_dir: Path,
        payload: dict[str, Any],
    ) -> tuple[str, dict[str, Any]] | None:
        if not payload:
            return None
        base_dir.mkdir(parents=True, exist_ok=True)
        artifact_path = base_dir / "ml-summary.json"
        artifact_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return self._relative_repo_path(artifact_path), payload

    def list_preview_feedback(
        self,
        *,
        preview_run_id: int | None = None,
        slide_id: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                  preview_feedback_id,
                  preview_run_id,
                  slide_id,
                  feedback_kind,
                  comment,
                  payload_json,
                  created_by_account_id,
                  created_at
                FROM review.preview_feedback
                WHERE (%s::BIGINT IS NULL OR preview_run_id = %s::BIGINT)
                  AND (%s::TEXT IS NULL OR slide_id = %s::TEXT)
                ORDER BY created_at DESC, preview_feedback_id DESC
                LIMIT %s
                """,
                (preview_run_id, preview_run_id, slide_id, slide_id, limit),
            ).fetchall()
        return [map_preview_feedback(row) for row in rows]

    def create_preview_feedback(
        self,
        preview_run_id: int,
        *,
        feedback_kind: str,
        created_by_account_id: str,
        slide_id: str | None = None,
        comment: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if feedback_kind not in {"comment", "requested_changes", "approved", "rejected"}:
            raise ValueError("feedbackKind is not supported")

        with self.connect() as connection:
            run_row = connection.execute(
                """
                SELECT preview_run_id
                FROM review.preview_run
                WHERE preview_run_id = %s
                """,
                (preview_run_id,),
            ).fetchone()
            if run_row is None:
                raise LookupError("preview run not found")

            row = connection.execute(
                """
                INSERT INTO review.preview_feedback (
                  preview_run_id,
                  slide_id,
                  feedback_kind,
                  comment,
                  payload_json,
                  created_by_account_id
                )
                VALUES (%s, %s, %s::review.preview_feedback_kind, %s, %s, %s)
                RETURNING
                  preview_feedback_id,
                  preview_run_id,
                  slide_id,
                  feedback_kind,
                  comment,
                  payload_json,
                  created_by_account_id,
                  created_at
                """,
                (
                    preview_run_id,
                    slide_id,
                    feedback_kind,
                    comment or "",
                    Jsonb(payload or {}),
                    created_by_account_id,
                ),
            ).fetchone()
            connection.commit()

        return map_preview_feedback(row)
    def start_ui_review(
        self,
        payload: dict[str, Any],
        *,
        requested_by_account_id: str | None = None,
    ) -> dict[str, Any]:
        surface = str(payload.get("surface") or UI_REVIEW_DEFAULT_SURFACE).strip()
        scenario_set = str(payload.get("scenarioSet") or UI_REVIEW_DEFAULT_SCENARIO_SET).strip()
        base_url = str(payload.get("baseUrl") or UI_REVIEW_DEFAULT_BASE_URL).strip()
        queue_name = (
            str(payload.get("queueName")).strip()
            if isinstance(payload.get("queueName"), str) and str(payload.get("queueName")).strip()
            else DEFAULT_AGENT_TASK_QUEUE
        )
        queue_name = resolve_task_queue_name(UI_REVIEW_CAPTURE_TASK_KIND, queue_name)
        priority = int(payload.get("priority", 0))
        viewport_json = ensure_dict(payload.get("viewportJson")) or dict(UI_REVIEW_DEFAULT_VIEWPORT)
        manifest_json = ensure_dict(payload.get("manifestJson"))
        manifest_json.update(
            {
                "localOnly": True,
                "grader": {"enabled": False, "mode": "reserved"},
                "recordVideo": bool(payload.get("recordVideo", False)),
            }
        )

        with self.connect() as connection:
            run_row = connection.execute(
                """
                INSERT INTO review.ui_run (
                  surface,
                  scenario_set,
                  status,
                  base_url,
                  browser,
                  viewport_json,
                  requested_by_account_id,
                  manifest_json
                )
                VALUES (%s, %s, %s::review.run_status, %s, %s, %s, %s, %s)
                RETURNING
                  ui_review_run_id,
                  surface,
                  scenario_set,
                  status,
                  base_url,
                  browser,
                  viewport_json,
                  current_task_id,
                  capture_task_id,
                  analyze_task_id,
                  fix_draft_task_id,
                  manifest_json,
                  capture_summary_json,
                  analysis_summary_json,
                  created_at,
                  updated_at,
                  completed_at
                """,
                (
                    surface,
                    scenario_set,
                    UI_REVIEW_STATUS_PLANNED,
                    base_url,
                    UI_REVIEW_DEFAULT_BROWSER,
                    Jsonb(viewport_json),
                    requested_by_account_id,
                    Jsonb(manifest_json),
                ),
            ).fetchone()
            if run_row is None:
                raise RuntimeError("failed to create ui review run")

            ui_review_run_id = int(run_row["ui_review_run_id"])
            artifact_dir = self._build_ui_review_artifact_dir(
                ui_review_run_id,
                surface=surface,
                scenario_set=scenario_set,
            )
            capture_summary_path = artifact_dir / "capture" / "capture-summary.json"
            analysis_summary_path = artifact_dir / "analysis" / "analysis-summary.json"
            manifest_patch = {
                "artifactDir": self._relative_repo_path(artifact_dir),
                "captureSummaryPath": self._relative_repo_path(capture_summary_path),
                "analysisSummaryPath": self._relative_repo_path(analysis_summary_path),
                "surface": surface,
                "scenarioSet": scenario_set,
                "baseUrl": base_url,
                "viewport": viewport_json,
            }
            task_payload = {
                "uiReviewRunId": ui_review_run_id,
                "surface": surface,
                "scenarioSet": scenario_set,
                "baseUrl": base_url,
                "viewportJson": viewport_json,
                "recordVideo": bool(payload.get("recordVideo", False)),
                "manifestJson": manifest_patch,
                "requestedByAccountId": requested_by_account_id,
            }
            capture_task = self._create_review_task(
                connection,
                task_kind=UI_REVIEW_CAPTURE_TASK_KIND,
                queue_name=queue_name,
                priority=priority,
                payload=task_payload,
            )
            analyze_task = self._create_review_task(
                connection,
                task_kind=UI_REVIEW_ANALYZE_TASK_KIND,
                queue_name=queue_name,
                priority=priority,
                payload={"uiReviewRunId": ui_review_run_id},
            )
            fix_task = self._create_review_task(
                connection,
                task_kind=UI_REVIEW_FIX_DRAFT_TASK_KIND,
                queue_name=queue_name,
                priority=priority,
                payload={"uiReviewRunId": ui_review_run_id},
            )
            self._ensure_task_dependency(
                connection,
                int(analyze_task["agentTaskId"]),
                int(capture_task["agentTaskId"]),
            )
            self._ensure_task_dependency(
                connection,
                int(fix_task["agentTaskId"]),
                int(analyze_task["agentTaskId"]),
            )
            connection.execute(
                """
                UPDATE review.ui_run
                SET
                  current_task_id = %s,
                  capture_task_id = %s,
                  analyze_task_id = %s,
                  fix_draft_task_id = %s,
                  manifest_json = manifest_json || %s,
                  updated_at = NOW()
                WHERE ui_review_run_id = %s
                """,
                (
                    int(capture_task["agentTaskId"]),
                    int(capture_task["agentTaskId"]),
                    int(analyze_task["agentTaskId"]),
                    int(fix_task["agentTaskId"]),
                    Jsonb(manifest_patch),
                    ui_review_run_id,
                ),
            )
            for task in (capture_task, analyze_task, fix_task):
                self._notify_task_ready(
                    connection,
                    queue_name=queue_name,
                    task_kind=str(task["taskKind"]),
                )
            connection.commit()

        created = self.get_ui_review_run(ui_review_run_id)
        if created is None:
            raise LookupError("ui review run not found after creation")
        return created

    def list_ui_review_runs(
        self,
        *,
        surface: str | None = None,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                  ui_review_run_id,
                  surface,
                  scenario_set,
                  status,
                  base_url,
                  browser,
                  viewport_json,
                  current_task_id,
                  capture_task_id,
                  analyze_task_id,
                  fix_draft_task_id,
                  manifest_json,
                  capture_summary_json,
                  analysis_summary_json,
                  created_at,
                  updated_at,
                  completed_at
                FROM review.ui_run
                WHERE (%s::TEXT IS NULL OR surface = %s::TEXT)
                ORDER BY created_at DESC, ui_review_run_id DESC
                LIMIT %s
                """,
                (surface, surface, limit),
            ).fetchall()
        return [map_ui_review_run(row) for row in rows]

    def get_ui_review_run(self, ui_review_run_id: int) -> dict[str, Any] | None:
        if not self.configured:
            return None

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                  ui_review_run_id,
                  surface,
                  scenario_set,
                  status,
                  base_url,
                  browser,
                  viewport_json,
                  current_task_id,
                  capture_task_id,
                  analyze_task_id,
                  fix_draft_task_id,
                  manifest_json,
                  capture_summary_json,
                  analysis_summary_json,
                  created_at,
                  updated_at,
                  completed_at
                FROM review.ui_run
                WHERE ui_review_run_id = %s
                """,
                (ui_review_run_id,),
            ).fetchone()
        return map_ui_review_run(row) if row is not None else None

    def list_ui_review_findings(
        self,
        *,
        ui_review_run_id: int | None = None,
        status: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                  ui_review_finding_id,
                  ui_review_run_id,
                  category,
                  severity,
                  status,
                  title,
                  summary,
                  scenario_name,
                  checkpoint_name,
                  evidence_json,
                  analyzer_json,
                  fix_draft_json,
                  reviewed_by_account_id,
                  reviewed_at,
                  created_at
                FROM review.ui_finding
                WHERE (%s::BIGINT IS NULL OR ui_review_run_id = %s::BIGINT)
                  AND (%s::TEXT IS NULL OR status = %s::review.finding_status)
                ORDER BY created_at DESC, ui_review_finding_id DESC
                LIMIT %s
                """,
                (ui_review_run_id, ui_review_run_id, status, status, limit),
            ).fetchall()
        return [map_ui_review_finding(row) for row in rows]

    def list_ui_review_baselines(
        self,
        *,
        surface: str | None = None,
        status: str | None = UI_REVIEW_BASELINE_STATUS_ACTIVE,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                  ui_review_baseline_id,
                  surface,
                  scenario_name,
                  checkpoint_name,
                  browser,
                  viewport_key,
                  relative_path,
                  status,
                  source_run_id,
                  approved_by_account_id,
                  metadata_json,
                  created_at,
                  superseded_at
                FROM review.ui_baseline
                WHERE (%s::TEXT IS NULL OR surface = %s::TEXT)
                  AND (%s::TEXT IS NULL OR status = %s::review.baseline_status)
                ORDER BY created_at DESC, ui_review_baseline_id DESC
                LIMIT %s
                """,
                (surface, surface, status, status, limit),
            ).fetchall()
        return [map_ui_review_baseline(row) for row in rows]

    def start_preview_run(
        self,
        payload: dict[str, Any],
        *,
        requested_by_account_id: str | None = None,
    ) -> dict[str, Any]:
        deck_key = str(payload.get("deckKey") or "").strip()
        if not deck_key:
            raise ValueError("deckKey is required")

        markdown_path, companion_path, title = resolve_preview_source(deck_key)
        queue_name = (
            str(payload.get("queueName")).strip()
            if isinstance(payload.get("queueName"), str) and str(payload.get("queueName")).strip()
            else DEFAULT_AGENT_TASK_QUEUE
        )
        queue_name = resolve_task_queue_name(PREVIEW_RENDER_TASK_KIND, queue_name)
        priority = int(payload.get("priority", 0))
        viewport_json = ensure_dict(payload.get("viewportJson")) or dict(PREVIEW_DEFAULT_VIEWPORT)
        manifest_json = {
            "deckKey": deck_key,
            "markdownPath": self._relative_repo_path(markdown_path),
            "companionPath": self._relative_repo_path(companion_path) if companion_path else None,
            "viewport": viewport_json,
            "localOnly": True,
        }

        with self.connect() as connection:
            run_row = connection.execute(
                """
                INSERT INTO review.preview_run (
                  deck_key,
                  title,
                  markdown_path,
                  companion_path,
                  status,
                  browser,
                  viewport_json,
                  requested_by_account_id,
                  manifest_json
                )
                VALUES (%s, %s, %s, %s, %s::review.preview_run_status, %s, %s, %s, %s)
                RETURNING
                  preview_run_id,
                  deck_key,
                  title,
                  markdown_path,
                  companion_path,
                  status,
                  browser,
                  viewport_json,
                  current_task_id,
                  render_task_id,
                  analyze_task_id,
                  manifest_json,
                  render_summary_json,
                  analysis_summary_json,
                  created_at,
                  updated_at,
                  completed_at
                """,
                (
                    deck_key,
                    title,
                    self._relative_repo_path(markdown_path),
                    self._relative_repo_path(companion_path) if companion_path else None,
                    PREVIEW_STATUS_PLANNED,
                    PREVIEW_DEFAULT_BROWSER,
                    Jsonb(viewport_json),
                    requested_by_account_id,
                    Jsonb(manifest_json),
                ),
            ).fetchone()
            if run_row is None:
                raise RuntimeError("failed to create preview run")

            preview_run_id = int(run_row["preview_run_id"])
            artifact_dir = self._build_preview_artifact_dir(preview_run_id, deck_key=deck_key)
            render_summary_path = artifact_dir / "render-summary.json"
            analysis_summary_path = artifact_dir / "analysis-summary.json"
            manifest_patch = {
                **manifest_json,
                "artifactDir": self._relative_repo_path(artifact_dir),
                "renderSummaryPath": self._relative_repo_path(render_summary_path),
                "analysisSummaryPath": self._relative_repo_path(analysis_summary_path),
                "title": title,
            }
            render_task = self._create_review_task(
                connection,
                task_kind=PREVIEW_RENDER_TASK_KIND,
                queue_name=queue_name,
                priority=priority,
                payload={
                    "previewRunId": preview_run_id,
                    "deckKey": deck_key,
                    "markdownPath": self._relative_repo_path(markdown_path),
                    "companionPath": self._relative_repo_path(companion_path) if companion_path else None,
                    "viewportJson": viewport_json,
                    "manifestJson": manifest_patch,
                    "requestedByAccountId": requested_by_account_id,
                },
            )
            analyze_task = self._create_review_task(
                connection,
                task_kind=PREVIEW_ANALYZE_TASK_KIND,
                queue_name=queue_name,
                priority=priority,
                payload={"previewRunId": preview_run_id},
            )
            self._ensure_task_dependency(
                connection,
                int(analyze_task["agentTaskId"]),
                int(render_task["agentTaskId"]),
            )
            connection.execute(
                """
                UPDATE review.preview_run
                SET
                  current_task_id = %s,
                  render_task_id = %s,
                  analyze_task_id = %s,
                  manifest_json = manifest_json || %s,
                  updated_at = NOW()
                WHERE preview_run_id = %s
                """,
                (
                    int(render_task["agentTaskId"]),
                    int(render_task["agentTaskId"]),
                    int(analyze_task["agentTaskId"]),
                    Jsonb(manifest_patch),
                    preview_run_id,
                ),
            )
            for task in (render_task, analyze_task):
                self._notify_task_ready(
                    connection,
                    queue_name=queue_name,
                    task_kind=str(task["taskKind"]),
                )
            connection.commit()

        created = self.get_preview_run(preview_run_id)
        if created is None:
            raise LookupError("preview run not found after creation")
        return created

    def list_preview_runs(
        self,
        *,
        deck_key: str | None = None,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                  preview_run_id,
                  deck_key,
                  title,
                  markdown_path,
                  companion_path,
                  status,
                  browser,
                  viewport_json,
                  current_task_id,
                  render_task_id,
                  analyze_task_id,
                  manifest_json,
                  render_summary_json,
                  analysis_summary_json,
                  created_at,
                  updated_at,
                  completed_at
                FROM review.preview_run
                WHERE (%s::TEXT IS NULL OR deck_key = %s::TEXT)
                ORDER BY created_at DESC, preview_run_id DESC
                LIMIT %s
                """,
                (deck_key, deck_key, limit),
            ).fetchall()
        return [map_preview_run(row) for row in rows]

    def get_preview_run(self, preview_run_id: int) -> dict[str, Any] | None:
        if not self.configured:
            return None

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                  preview_run_id,
                  deck_key,
                  title,
                  markdown_path,
                  companion_path,
                  status,
                  browser,
                  viewport_json,
                  current_task_id,
                  render_task_id,
                  analyze_task_id,
                  manifest_json,
                  render_summary_json,
                  analysis_summary_json,
                  created_at,
                  updated_at,
                  completed_at
                FROM review.preview_run
                WHERE preview_run_id = %s
                """,
                (preview_run_id,),
            ).fetchone()
        return map_preview_run(row) if row is not None else None

    def list_preview_feedback(
        self,
        *,
        preview_run_id: int,
        slide_id: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        if not self.configured:
            return []

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                  preview_feedback_id,
                  preview_run_id,
                  slide_id,
                  feedback_kind,
                  comment,
                  payload_json,
                  created_by_account_id,
                  created_at
                FROM review.preview_feedback
                WHERE preview_run_id = %s
                  AND (%s::TEXT IS NULL OR slide_id = %s::TEXT)
                ORDER BY created_at DESC, preview_feedback_id DESC
                LIMIT %s
                """,
                (preview_run_id, slide_id, slide_id, limit),
            ).fetchall()
        return [map_preview_feedback(row) for row in rows]

    def create_preview_feedback(
        self,
        *,
        preview_run_id: int,
        feedback_kind: str,
        comment: str,
        payload: dict[str, Any] | None,
        created_by_account_id: str | None,
        slide_id: str | None = None,
    ) -> dict[str, Any]:
        if feedback_kind not in {"comment", "requested_changes", "approved", "rejected"}:
            raise ValueError("unsupported preview feedback kind")

        with self.connect() as connection:
            run_exists = connection.execute(
                "SELECT 1 FROM review.preview_run WHERE preview_run_id = %s",
                (preview_run_id,),
            ).fetchone()
            if run_exists is None:
                raise LookupError("preview run not found")

            row = connection.execute(
                """
                INSERT INTO review.preview_feedback (
                  preview_run_id,
                  slide_id,
                  feedback_kind,
                  comment,
                  payload_json,
                  created_by_account_id
                )
                VALUES (%s, %s, %s::review.preview_feedback_kind, %s, %s, %s)
                RETURNING
                  preview_feedback_id,
                  preview_run_id,
                  slide_id,
                  feedback_kind,
                  comment,
                  payload_json,
                  created_by_account_id,
                  created_at
                """,
                (
                    preview_run_id,
                    slide_id,
                    feedback_kind,
                    comment,
                    Jsonb(payload or {}),
                    created_by_account_id,
                ),
            ).fetchone()
            connection.commit()
        return map_preview_feedback(row)

    def review_ui_finding(
        self,
        ui_review_finding_id: int,
        *,
        status: str,
        reviewed_by_account_id: str,
        review_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if status not in {UI_REVIEW_FINDING_STATUS_ACCEPTED, UI_REVIEW_FINDING_STATUS_REJECTED}:
            raise ValueError("status must be accepted or rejected")

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                  ui_review_finding_id,
                  ui_review_run_id,
                  category,
                  severity,
                  status,
                  title,
                  summary,
                  scenario_name,
                  checkpoint_name,
                  evidence_json,
                  analyzer_json,
                  fix_draft_json,
                  reviewed_by_account_id,
                  reviewed_at,
                  created_at
                FROM review.ui_finding
                WHERE ui_review_finding_id = %s
                FOR UPDATE
                """,
                (ui_review_finding_id,),
            ).fetchone()
            if row is None:
                raise LookupError("ui review finding not found")

            fix_draft_json = dict(row["fix_draft_json"] or {})
            fix_draft_json["review"] = {
                "status": status,
                "reviewedByAccountId": reviewed_by_account_id,
                "payload": review_payload or {},
                "reviewedAt": datetime.now(timezone.utc).isoformat(),
            }
            updated = connection.execute(
                """
                UPDATE review.ui_finding
                SET
                  status = %s::review.finding_status,
                  fix_draft_json = %s,
                  reviewed_by_account_id = %s,
                  reviewed_at = NOW()
                WHERE ui_review_finding_id = %s
                RETURNING
                  ui_review_finding_id,
                  ui_review_run_id,
                  category,
                  severity,
                  status,
                  title,
                  summary,
                  scenario_name,
                  checkpoint_name,
                  evidence_json,
                  analyzer_json,
                  fix_draft_json,
                  reviewed_by_account_id,
                  reviewed_at,
                  created_at
                """,
                (
                    status,
                    Jsonb(fix_draft_json),
                    reviewed_by_account_id,
                    ui_review_finding_id,
                ),
            ).fetchone()
            connection.commit()

        return map_ui_review_finding(updated)

    def trigger_ui_review_baseline_promotion(
        self,
        ui_review_run_id: int,
        *,
        approved_by_account_id: str,
        queue_name: str = DEFAULT_AGENT_TASK_QUEUE,
        priority: int = 0,
    ) -> dict[str, Any]:
        queue_name = resolve_task_queue_name(UI_REVIEW_PROMOTE_BASELINE_TASK_KIND, queue_name)
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT ui_review_run_id, status, fix_draft_task_id
                FROM review.ui_run
                WHERE ui_review_run_id = %s
                FOR UPDATE
                """,
                (ui_review_run_id,),
            ).fetchone()
            if row is None:
                raise LookupError("ui review run not found")
            if row["status"] not in {
                UI_REVIEW_STATUS_ANALYZED,
                UI_REVIEW_STATUS_READY_FOR_REVIEW,
                UI_REVIEW_STATUS_BASELINE_PROMOTED,
            }:
                raise ValueError("ui review run must be analyzed before baseline promotion")

            task = self._create_review_task(
                connection,
                task_kind=UI_REVIEW_PROMOTE_BASELINE_TASK_KIND,
                queue_name=queue_name,
                priority=priority,
                payload={
                    "uiReviewRunId": ui_review_run_id,
                    "approvedByAccountId": approved_by_account_id,
                },
            )
            depends_on_task_id = as_int(row["fix_draft_task_id"])
            if depends_on_task_id is not None:
                self._ensure_task_dependency(
                    connection,
                    int(task["agentTaskId"]),
                    depends_on_task_id,
                )
            connection.execute(
                """
                UPDATE review.ui_run
                SET current_task_id = %s, updated_at = NOW()
                WHERE ui_review_run_id = %s
                """,
                (int(task["agentTaskId"]), ui_review_run_id),
            )
            self._notify_task_ready(
                connection,
                queue_name=queue_name,
                task_kind=UI_REVIEW_PROMOTE_BASELINE_TASK_KIND,
            )
            connection.commit()

        refreshed = self.get_ui_review_run(ui_review_run_id)
        if refreshed is None:
            raise LookupError("ui review run not found after baseline promotion request")
        return refreshed

    def enqueue_agent_task(
        self,
        *,
        task_kind: str,
        queue_name: str = DEFAULT_AGENT_TASK_QUEUE,
        priority: int = 0,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        queue_name = resolve_task_queue_name(task_kind, queue_name)
        with self.connect() as connection:
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
                (task_kind, queue_name, priority, Jsonb(payload or {})),
            ).fetchone()
            self._notify_task_ready(connection, queue_name=queue_name, task_kind=task_kind)
            connection.commit()

        return map_agent_task(row)

    def retry_agent_task(
        self,
        agent_task_id: int,
        *,
        note: str | None = None,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            current = connection.execute(
                """
                SELECT task_kind, queue_name, status
                FROM agent.task
                WHERE agent_task_id = %s
                """,
                (agent_task_id,),
            ).fetchone()
            if current is None:
                raise LookupError("agent task not found")
            if str(current["status"]) not in {"failed", "succeeded"}:
                raise ValueError("only failed or completed tasks may be retried")

            row = connection.execute(
                """
                UPDATE agent.task
                SET
                  status = 'queued',
                  lease_owner = NULL,
                  lease_expires_at = NULL,
                  attempt_count = 0,
                  available_at = NOW(),
                  last_error = %s,
                  completed_at = NULL,
                  updated_at = NOW()
                WHERE agent_task_id = %s
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
                (note, agent_task_id),
            ).fetchone()
            self._notify_task_ready(
                connection,
                queue_name=str(current["queue_name"]),
                task_kind=str(current["task_kind"]),
            )
            connection.commit()

        return map_agent_task(row)

    def _ensure_task_dependency(
        self,
        connection: psycopg.Connection[Any],
        task_id: int,
        depends_on_task_id: int,
    ) -> None:
        if task_id == depends_on_task_id:
            return
        connection.execute(
            """
            INSERT INTO agent.task_dependency (agent_task_id, depends_on_agent_task_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """,
            (task_id, depends_on_task_id),
        )

    def _create_hardware_task(
        self,
        connection: psycopg.Connection[Any],
        *,
        task_kind: str,
        queue_name: str,
        priority: int,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        queue_name = resolve_task_queue_name(task_kind, queue_name)
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
        return map_agent_task(row)

    def _record_inventory_event(
        self,
        connection: psycopg.Connection[Any],
        *,
        subject_kind: str,
        subject_id: int,
        event_kind: str,
        payload: dict[str, Any],
        actor: str | None = None,
        agent_task_id: int | None = None,
    ) -> int:
        row = connection.execute(
            """
            INSERT INTO inventory.event (
              subject_kind,
              subject_id,
              event_kind,
              payload_json,
              actor,
              agent_task_id
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING event_id
            """,
            (
                subject_kind,
                subject_id,
                event_kind,
                Jsonb(payload),
                actor,
                agent_task_id,
            ),
        ).fetchone()
        if row is None:
            raise RuntimeError("failed to write inventory event")
        return int(row["event_id"])

    def _create_hardware_build(self, payload: dict[str, Any]) -> dict[str, Any]:
        build_name = payload.get("buildName")
        if not isinstance(build_name, str) or not build_name.strip():
            raise ValueError("buildName is required")
        build_kind = payload.get("buildKind")
        if not isinstance(build_kind, str) or not build_kind.strip():
            raise ValueError("buildKind is required")
        base_unit_id = as_int(payload.get("baseUnitId"))
        rover_unit_id = as_int(payload.get("roverUnitId"))
        if base_unit_id is None or rover_unit_id is None:
            raise ValueError("baseUnitId and roverUnitId are required")

        queue_name = (
            payload.get("queueName")
            if isinstance(payload.get("queueName"), str) and payload.get("queueName")
            else DEFAULT_AGENT_TASK_QUEUE
        )
        queue_name = resolve_task_queue_name(HARDWARE_PREPARE_TASK_KIND, str(queue_name))
        priority = int(payload.get("priority", 0))
        expected_site = str(payload.get("expectedSite")) if payload.get("expectedSite") else None
        plan_json = payload.get("planJson")
        if plan_json is None:
            plan_json = {}
        if not isinstance(plan_json, dict):
            raise ValueError("planJson must be an object")

        with self.connect() as connection:
            build_row = connection.execute(
                """
                INSERT INTO inventory.build (
                  build_name,
                  build_kind,
                  status,
                  base_unit_id,
                  rover_unit_id,
                  expected_site,
                  plan_json
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING
                  build_id,
                  build_name,
                  build_kind,
                  status,
                  base_unit_id,
                  rover_unit_id,
                  reserved_by_account_id,
                  runtime_device_id,
                  current_task_id,
                  expected_site,
                  plan_json,
                  result_json,
                  latest_event_id,
                  created_at,
                  updated_at
                """,
                (
                    build_name.strip(),
                    build_kind,
                    HARDWARE_STATUS_BUILD_PLANNED,
                    base_unit_id,
                    rover_unit_id,
                    expected_site,
                    Jsonb(plan_json),
                ),
            ).fetchone()
            if build_row is None:
                raise RuntimeError("failed to create hardware build")

            build_id = int(build_row["build_id"])
            task_payload = {
                "buildId": build_id,
                "baseUnitId": base_unit_id,
                "roverUnitId": rover_unit_id,
                "buildKind": build_kind,
                "buildName": build_name,
            }

            prepare_task = self._create_hardware_task(
                connection,
                task_kind=HARDWARE_PREPARE_TASK_KIND,
                queue_name=queue_name,
                priority=priority,
                payload=task_payload,
            )
            reserve_task = self._create_hardware_task(
                connection,
                task_kind=HARDWARE_RESERVE_PARTS_TASK_KIND,
                queue_name=queue_name,
                priority=priority,
                payload=task_payload,
            )
            assemble_task = self._create_hardware_task(
                connection,
                task_kind=HARDWARE_BUILD_TASK_KIND,
                queue_name=queue_name,
                priority=priority,
                payload=task_payload,
            )
            validate_task = self._create_hardware_task(
                connection,
                task_kind=HARDWARE_BENCH_VALIDATE_TASK_KIND,
                queue_name=queue_name,
                priority=priority,
                payload=task_payload,
            )
            self._ensure_task_dependency(connection, int(reserve_task["agentTaskId"]), int(prepare_task["agentTaskId"]))
            self._ensure_task_dependency(connection, int(assemble_task["agentTaskId"]), int(reserve_task["agentTaskId"]))
            self._ensure_task_dependency(connection, int(validate_task["agentTaskId"]), int(assemble_task["agentTaskId"]))

            for task in (prepare_task, reserve_task, assemble_task, validate_task):
                self._notify_task_ready(
                    connection,
                    queue_name=queue_name,
                    task_kind=str(task["taskKind"]),
                )

            event_id = self._record_inventory_event(
                connection,
                subject_kind="build",
                subject_id=build_id,
                event_kind="build.pipeline_created",
                payload={"buildName": build_name, "queueName": queue_name},
            )
            connection.execute(
                """
                UPDATE inventory.build
                SET current_task_id = %s, latest_event_id = %s, updated_at = NOW()
                WHERE build_id = %s
                """,
                (int(prepare_task["agentTaskId"]), event_id, build_id),
            )
            connection.commit()

        return {
            "build": map_inventory_build(build_row),
            "tasks": [prepare_task, reserve_task, assemble_task, validate_task],
        }

    def start_hardware_build(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._create_hardware_build(payload)

    def trigger_hardware_runtime_publish(
        self,
        build_id: int,
        runtime_device_id: str,
        queue_name: str = DEFAULT_AGENT_TASK_QUEUE,
        priority: int = 0,
    ) -> dict[str, Any]:
        queue_name = resolve_task_queue_name(HARDWARE_RUNTIME_REGISTER_TASK_KIND, queue_name)
        with self.connect() as connection:
            build = connection.execute(
                """
                SELECT build_id, status
                FROM inventory.build
                WHERE build_id = %s
                FOR UPDATE
                """,
                (build_id,),
            ).fetchone()
            if build is None:
                raise LookupError("build not found")
            if build["status"] not in {HARDWARE_STATUS_BUILD_VALIDATED, HARDWARE_STATUS_BUILD_RUNTIME_PENDING}:
                raise ValueError("build must reach bench_validated before runtime publish request")

            dependency_task_id = connection.execute(
                """
                SELECT agent_task_id
                FROM agent.task
                WHERE (payload ->> 'buildId')::BIGINT = %s
                  AND task_kind IN (%s, %s, %s, %s)
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (
                    build_id,
                    HARDWARE_PREPARE_TASK_KIND,
                    HARDWARE_RESERVE_PARTS_TASK_KIND,
                    HARDWARE_BUILD_TASK_KIND,
                    HARDWARE_BENCH_VALIDATE_TASK_KIND,
                ),
            ).fetchone()
            dependency = dependency_task_id["agent_task_id"] if dependency_task_id is not None else None

            task = self._create_hardware_task(
                connection,
                task_kind=HARDWARE_RUNTIME_REGISTER_TASK_KIND,
                queue_name=queue_name,
                priority=priority,
                payload={
                    "buildId": build_id,
                    "runtimeDeviceId": runtime_device_id,
                    "trigger": "manual",
                },
            )
            if dependency is not None:
                self._ensure_task_dependency(connection, int(task["agentTaskId"]), int(dependency))

            self._notify_task_ready(
                connection,
                queue_name=queue_name,
                task_kind=HARDWARE_RUNTIME_REGISTER_TASK_KIND,
            )
            event_id = self._record_inventory_event(
                connection,
                subject_kind="build",
                subject_id=build_id,
                event_kind="build.runtime_register_requested",
                payload={"runtimeDeviceId": runtime_device_id, "taskId": int(task["agentTaskId"])},
            )
            connection.execute(
                """
                UPDATE inventory.build
                SET runtime_device_id = %s,
                    status = %s,
                    latest_event_id = %s,
                    current_task_id = %s,
                    updated_at = NOW()
                WHERE build_id = %s
                """,
                (
                    runtime_device_id,
                    HARDWARE_STATUS_BUILD_RUNTIME_PENDING,
                    event_id,
                    int(task["agentTaskId"]),
                    build_id,
                ),
            )
            connection.commit()

        return {
            "build": self.get_inventory_build(build_id),
            "task": task,
        }

    def seed_inventory_from_markdown(self, manifest_path: str, force: bool) -> dict[str, int]:
        manifest = parse_inventory_manifest(manifest_path)
        item_rows = manifest.get("items", [])
        unit_rows = manifest.get("units", [])

        upserted_items = 0
        upserted_units = 0
        skipped_rows = 0

        with self.connect() as connection:
            item_id_by_key: dict[str, int] = {}
            for row in item_rows:
                item_key = str(row.get("item_key", "")).strip()
                if not item_key:
                    skipped_rows += 1
                    continue

                part_name = str(row.get("part_name", item_key)).strip()
                row_status = str(row.get("status", "available") or "available").strip()
                if row_status not in {"available", "reserved", "deprecated"}:
                    skipped_rows += 1
                    continue

                item = connection.execute(
                    """
                    INSERT INTO inventory.item (
                      item_key,
                      part_name,
                      manufacturer,
                      model,
                      category,
                      classification,
                      status,
                      notes_json
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s::inventory.item_status, %s)
                    ON CONFLICT (item_key) DO UPDATE
                    SET
                      part_name = EXCLUDED.part_name,
                      manufacturer = EXCLUDED.manufacturer,
                      model = EXCLUDED.model,
                      category = EXCLUDED.category,
                      classification = EXCLUDED.classification,
                      status = CASE WHEN %s THEN EXCLUDED.status ELSE inventory.item.status END,
                      notes_json = CASE WHEN %s THEN EXCLUDED.notes_json ELSE inventory.item.notes_json END,
                      updated_at = NOW()
                    RETURNING item_id, item_key
                    """,
                    (
                        item_key,
                        part_name,
                        row.get("manufacturer"),
                        row.get("model"),
                        row.get("category"),
                        row.get("classification", "optional"),
                        row_status,
                        Jsonb(row.get("notes_json") or {}),
                        force,
                        force,
                    ),
                ).fetchone()
                if item is None:
                    skipped_rows += 1
                    continue

                item_id = int(item["item_id"])
                item_id_by_key[item_key] = item_id
                upserted_items += 1
                self._record_inventory_event(
                    connection,
                    subject_kind="item",
                    subject_id=item_id,
                    event_kind="seed.upserted",
                    payload={"itemKey": item_key, "source": manifest_path},
                )

            for row in unit_rows:
                item_key = str(row.get("item_key", "")).strip()
                item_id = as_int(row.get("item_id"))
                if item_id is None and item_key:
                    item_id = item_id_by_key.get(item_key)
                if item_id is None:
                    skipped_rows += 1
                    continue

                unit_label = str(row.get("unit_label", "")).strip()
                if not unit_label:
                    skipped_rows += 1
                    continue

                row_status = str(row.get("status", "new") or "new").strip()
                if row_status not in {
                    "new",
                    "available",
                    "reserved",
                    "in_build",
                    "validated",
                    "deployed",
                    "damaged",
                    "retired",
                }:
                    skipped_rows += 1
                    continue

                serial_number = str(row.get("serial_number", "")).strip() or None
                unit = connection.execute(
                    """
                    INSERT INTO inventory.unit (
                      item_id,
                      unit_label,
                      serial_number,
                      asset_tag,
                      status,
                      location,
                      metadata_json
                    )
                    VALUES (%s, %s, %s, %s, %s::inventory.unit_status, %s, %s)
                    ON CONFLICT (unit_label) DO UPDATE
                    SET
                      item_id = EXCLUDED.item_id,
                      serial_number = COALESCE(EXCLUDED.serial_number, inventory.unit.serial_number),
                      asset_tag = COALESCE(EXCLUDED.asset_tag, inventory.unit.asset_tag),
                      status = CASE WHEN %s THEN EXCLUDED.status ELSE inventory.unit.status END,
                      location = COALESCE(EXCLUDED.location, inventory.unit.location),
                      metadata_json = CASE WHEN %s THEN EXCLUDED.metadata_json ELSE inventory.unit.metadata_json END,
                      updated_at = NOW()
                    RETURNING unit_id
                    """,
                    (
                        item_id,
                        unit_label,
                        serial_number,
                        row.get("asset_tag"),
                        row_status,
                        row.get("location"),
                        Jsonb(row.get("metadata_json") or {}),
                        force,
                        force,
                    ),
                ).fetchone()
                if unit is None:
                    skipped_rows += 1
                    continue

                unit_id = int(unit["unit_id"])
                upserted_units += 1
                self._record_inventory_event(
                    connection,
                    subject_kind="unit",
                    subject_id=unit_id,
                    event_kind="seed.upserted",
                    payload={"itemId": item_id, "unitLabel": unit_label},
                )

            connection.commit()

        return {
            "upserted_items": upserted_items,
            "upserted_units": upserted_units,
            "source": manifest_path,
            "skipped_rows": skipped_rows,
        }

    def list_agent_runs(self, limit: int = 50) -> dict[str, Any]:
        if not self.configured:
            return {"items": [], "source": "unconfigured"}

        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT agent_run_id, agent_name, task_slug, status, started_at, finished_at
                FROM agent.run
                ORDER BY started_at DESC, agent_run_id DESC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()

        return {
            "items": [map_agent_run(row) for row in rows],
            "source": "dev-memory",
        }

    def get_agent_run_detail(self, agent_run_id: int) -> dict[str, Any] | None:
        if not self.configured:
            return None

        with self.connect() as connection:
            run_row = connection.execute(
                """
                SELECT agent_run_id, agent_name, task_slug, status, started_at, finished_at
                FROM agent.run
                WHERE agent_run_id = %s
                """,
                (agent_run_id,),
            ).fetchone()
            if run_row is None:
                return None

            event_rows = connection.execute(
                """
                SELECT agent_event_id, agent_run_id, event_type, payload, created_at
                FROM agent.event
                WHERE agent_run_id = %s
                ORDER BY created_at ASC, agent_event_id ASC
                """,
                (agent_run_id,),
            ).fetchall()
            artifact_rows = connection.execute(
                """
                SELECT artifact_id, agent_run_id, artifact_kind, uri, metadata, created_at
                FROM agent.artifact
                WHERE agent_run_id = %s
                ORDER BY created_at ASC, artifact_id ASC
                """,
                (agent_run_id,),
            ).fetchall()

            mapped_events = [map_agent_event(row) for row in event_rows]
            mapped_artifacts = [map_agent_artifact(row) for row in artifact_rows]

            task_id: int | None = None
            for event in mapped_events:
                if event["eventType"] == "task_claimed":
                    task_id = as_optional_int(event["payload"].get("agentTaskId"))
                    if task_id is not None:
                        break

            mapped_task = None
            mapped_dependencies: list[dict[str, Any]] = []
            if task_id is not None:
                task_row = connection.execute(
                    """
                    SELECT
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
                    FROM agent.task
                    WHERE agent_task_id = %s
                    """,
                    (task_id,),
                ).fetchone()
                mapped_task = map_agent_task(task_row) if task_row is not None else None
                dependency_rows = connection.execute(
                    """
                    SELECT agent_task_id, depends_on_agent_task_id, created_at
                    FROM agent.task_dependency
                    WHERE agent_task_id = %s
                    ORDER BY created_at ASC, depends_on_agent_task_id ASC
                    """,
                    (task_id,),
                ).fetchall()
                mapped_dependencies = [map_agent_task_dependency(row) for row in dependency_rows]

        return {
            "run": map_agent_run(run_row),
            "task": mapped_task,
            "dependencies": mapped_dependencies,
            "events": mapped_events,
            "artifacts": mapped_artifacts,
            "source": "dev-memory",
        }

    def get_coordination_status(self) -> dict[str, Any]:
        if not self.configured:
            return {
                "taskCount": 0,
                "runCount": 0,
                "reviewRunCount": 0,
                "blockedTaskCount": 0,
                "staleLeaseCount": 0,
                "queues": [],
                "latestRuns": [],
                "latestReviewRuns": [],
                "source": "unconfigured",
            }

        tasks = self.list_agent_tasks(limit=100)
        runs = self.list_agent_runs(limit=5)
        review_runs = self.list_ui_review_runs(limit=5)

        with self.connect() as connection:
            count_row = connection.execute(
                """
                SELECT
                  (SELECT COUNT(*) FROM agent.task) AS task_count,
                  (SELECT COUNT(*) FROM agent.run) AS run_count,
                  (SELECT COUNT(*) FROM review.ui_run) AS review_run_count,
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
                  ) AS blocked_task_count,
                  (
                    SELECT COUNT(*)
                    FROM agent.task
                    WHERE status = 'leased'
                      AND lease_expires_at IS NOT NULL
                      AND lease_expires_at < NOW()
                  ) AS stale_lease_count
                """
            ).fetchone()

        latest_review_runs = []
        for run in review_runs[:5]:
            latest_review_runs.append(
                {
                    "uiReviewRunId": int(run["uiReviewRunId"]),
                    "status": str(run["status"]),
                    "scenarioSet": str(run["scenarioSet"]),
                    "createdAt": str(run["createdAt"]),
                }
            )

        return {
            "taskCount": int(count_row["task_count"]),
            "runCount": int(count_row["run_count"]),
            "reviewRunCount": int(count_row["review_run_count"]),
            "blockedTaskCount": int(count_row["blocked_task_count"]),
            "staleLeaseCount": int(count_row["stale_lease_count"]),
            "queues": tasks.get("queues", []),
            "latestRuns": runs.get("items", [])[:5],
            "latestReviewRuns": latest_review_runs,
            "source": "dev-memory",
        }

    def create_dev_preference_signal(
        self,
        *,
        runtime_account_id: str,
        signal_kind: str,
        surface: str,
        panel_key: str | None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute(
                """
                INSERT INTO agent.dev_preference_signal (
                  runtime_account_id,
                  signal_kind,
                  surface,
                  panel_key,
                  payload
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING
                  dev_preference_signal_id,
                  runtime_account_id,
                  signal_kind,
                  surface,
                  panel_key,
                  payload,
                  created_at
                """,
                (
                    runtime_account_id,
                    signal_kind,
                    surface,
                    panel_key,
                    Jsonb(payload or {}),
                ),
            ).fetchone()
            self._enqueue_preference_score_task(
                connection,
                runtime_account_id=str(runtime_account_id),
                priority=90,
            )
            connection.commit()
        return map_dev_preference_signal(row)

    def create_dev_preference_decision(
        self,
        *,
        runtime_account_id: str,
        dev_preference_signal_id: int | None,
        decision_kind: str,
        subject_kind: str,
        subject_key: str,
        chosen_value: str | None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute(
                """
                INSERT INTO agent.dev_preference_decision (
                  runtime_account_id,
                  dev_preference_signal_id,
                  decision_kind,
                  subject_kind,
                  subject_key,
                  chosen_value,
                  payload
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING
                  dev_preference_decision_id,
                  runtime_account_id,
                  dev_preference_signal_id,
                  decision_kind,
                  subject_kind,
                  subject_key,
                  chosen_value,
                  payload,
                  created_at
                """,
                (
                    runtime_account_id,
                    dev_preference_signal_id,
                    decision_kind,
                    subject_kind,
                    subject_key,
                    chosen_value,
                    Jsonb(payload or {}),
                ),
            ).fetchone()
            self._enqueue_preference_score_task(
                connection,
                runtime_account_id=str(runtime_account_id),
                priority=95,
            )
            connection.commit()
        return map_dev_preference_decision(row)

    def get_dev_preference_profile(
        self,
        runtime_account_id: str,
        *,
        limit: int = 20,
    ) -> dict[str, Any]:
        if not self.configured:
            return {
                "score": None,
                "recentSignals": [],
                "recentDecisions": [],
                "source": "unconfigured",
            }

        with self.connect() as connection:
            score_row = connection.execute(
                """
                SELECT
                  runtime_account_id,
                  feature_summary,
                  scorecard,
                  computed_from_signal_count,
                  updated_at
                FROM agent.dev_preference_score
                WHERE runtime_account_id = %s
                """,
                (runtime_account_id,),
            ).fetchone()
            signal_rows = connection.execute(
                """
                SELECT
                  dev_preference_signal_id,
                  runtime_account_id,
                  signal_kind,
                  surface,
                  panel_key,
                  payload,
                  created_at
                FROM agent.dev_preference_signal
                WHERE runtime_account_id = %s
                ORDER BY created_at DESC, dev_preference_signal_id DESC
                LIMIT %s
                """,
                (runtime_account_id, limit),
            ).fetchall()
            decision_rows = connection.execute(
                """
                SELECT
                  dev_preference_decision_id,
                  runtime_account_id,
                  dev_preference_signal_id,
                  decision_kind,
                  subject_kind,
                  subject_key,
                  chosen_value,
                  payload,
                  created_at
                FROM agent.dev_preference_decision
                WHERE runtime_account_id = %s
                ORDER BY created_at DESC, dev_preference_decision_id DESC
                LIMIT %s
                """,
                (runtime_account_id, limit),
            ).fetchall()

        return {
            "score": map_dev_preference_score(score_row) if score_row is not None else None,
            "recentSignals": [map_dev_preference_signal(row) for row in signal_rows],
            "recentDecisions": [map_dev_preference_decision(row) for row in decision_rows],
            "source": "dev-memory",
        }

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
        queue_name: str = MEMORY_MAINTENANCE_TASK_QUEUE,
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
        queue_name: str = DEFAULT_AGENT_WORKER_QUEUE,
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
        queue_names = parse_queue_names(queue_name)
        with self.connect() as listener:
            listener.execute(f"LISTEN {TASK_READY_CHANNEL}")
            listener.commit()

            while True:
                self.schedule_maintenance_tasks(
                    queue_name=MEMORY_MAINTENANCE_TASK_QUEUE,
                    chunk_size=chunk_size,
                )
                self.requeue_expired_tasks()
                task = self.claim_task_from_queues(
                    queue_names=queue_names,
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
            "queueNames": queue_names,
        }

    def schedule_maintenance_tasks(
        self,
        *,
        queue_name: str = MEMORY_MAINTENANCE_TASK_QUEUE,
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

    def claim_task_from_queues(
        self,
        *,
        queue_names: list[str],
        worker_name: str,
        lease_seconds: int,
    ) -> dict[str, Any] | None:
        for current_queue_name in queue_names:
            task = self.claim_task(
                queue_name=current_queue_name,
                worker_name=worker_name,
                lease_seconds=lease_seconds,
            )
            if task is not None:
                return task
        return None

    def process_task(
        self,
        task: dict[str, Any],
        *,
        worker_name: str,
        chunk_size: int,
    ) -> dict[str, Any]:
        run_id = self._start_agent_run(worker_name, task)

        try:
            result = self._execute_task(task, run_id=run_id, chunk_size=chunk_size)
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
        queue_name = resolve_task_queue_name(task_kind, queue_name)
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

    def _enqueue_internal_task(
        self,
        connection: psycopg.Connection[Any],
        *,
        task_kind: str,
        payload: dict[str, Any],
        priority: int,
        queue_name: str = DEFAULT_AGENT_TASK_QUEUE,
    ) -> dict[str, Any]:
        queue_name = resolve_task_queue_name(task_kind, queue_name)
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
        return map_agent_task(row)

    def _enqueue_preference_score_task(
        self,
        connection: psycopg.Connection[Any],
        *,
        runtime_account_id: str,
        priority: int,
    ) -> dict[str, Any]:
        queue_name = resolve_task_queue_name(DEV_PREFERENCE_TASK_KIND, PREFERENCE_SCORE_TASK_QUEUE)
        existing_row = connection.execute(
            """
            SELECT
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
            FROM agent.task
            WHERE task_kind = %s
              AND queue_name = %s
              AND status IN ('queued', 'leased')
              AND payload ->> 'runtimeAccountId' = %s
            ORDER BY priority DESC, available_at ASC, agent_task_id ASC
            LIMIT 1
            """,
            (DEV_PREFERENCE_TASK_KIND, queue_name, runtime_account_id),
        ).fetchone()
        if existing_row is not None:
            return map_agent_task(existing_row)
        return self._enqueue_internal_task(
            connection,
            task_kind=DEV_PREFERENCE_TASK_KIND,
            payload={"runtimeAccountId": runtime_account_id},
            priority=priority,
            queue_name=queue_name,
        )

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
        run_id: int,
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

        if task_kind == DEV_PREFERENCE_TASK_KIND:
            return self.compute_dev_preference_scores(
                runtime_account_id=extract_string(payload, "runtimeAccountId"),
            )

        if task_kind == REFRESH_DOC_CATALOG_TASK_KIND:
            return scan_markdown_catalog()

        if task_kind == REFRESH_SKILL_CATALOG_TASK_KIND:
            return scan_skill_catalog()

        if task_kind == HARDWARE_PREPARE_TASK_KIND:
            return self._run_hardware_prepare(payload)
        if task_kind == HARDWARE_RESERVE_PARTS_TASK_KIND:
            return self._run_hardware_reserve_parts(payload)
        if task_kind == HARDWARE_BUILD_TASK_KIND:
            return self._run_hardware_build(payload)
        if task_kind == HARDWARE_BENCH_VALIDATE_TASK_KIND:
            return self._run_hardware_bench_validate(payload)
        if task_kind == HARDWARE_RUNTIME_REGISTER_TASK_KIND:
            return self._run_hardware_runtime_register(payload)
        if task_kind == PREVIEW_RENDER_TASK_KIND:
            return self._run_preview_render(payload, run_id=run_id, task=task)
        if task_kind == PREVIEW_ANALYZE_TASK_KIND:
            return self._run_preview_analyze(payload, run_id=run_id, task=task)
        if task_kind == UI_REVIEW_CAPTURE_TASK_KIND:
            return self._run_ui_review_capture(payload, run_id=run_id, task=task)
        if task_kind == UI_REVIEW_ANALYZE_TASK_KIND:
            return self._run_ui_review_analyze(payload, run_id=run_id, task=task)
        if task_kind == UI_REVIEW_FIX_DRAFT_TASK_KIND:
            return self._run_ui_review_fix_draft(payload, run_id=run_id, task=task)
        if task_kind == UI_REVIEW_PROMOTE_BASELINE_TASK_KIND:
            return self._run_ui_review_promote_baseline(payload, run_id=run_id, task=task)
        if task_kind == PREVIEW_RENDER_TASK_KIND:
            return self._run_preview_render(payload, run_id=run_id, task=task)
        if task_kind == PREVIEW_ANALYZE_TASK_KIND:
            return self._run_preview_analyze(payload, run_id=run_id, task=task)

        raise ValueError(f"unsupported task kind: {task_kind}")

    def _run_hardware_prepare(self, payload: dict[str, Any]) -> dict[str, Any]:
        build_id = as_int(payload.get("buildId"))
        if build_id is None:
            raise ValueError("buildId is required for hardware.prepare")

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                  build_id,
                  status,
                  base_unit_id,
                  rover_unit_id
                FROM inventory.build
                WHERE build_id = %s
                """,
                (build_id,),
            ).fetchone()
            if row is None:
                raise LookupError("build not found")

            connection.execute(
                """
                UPDATE inventory.build
                SET status = %s, updated_at = NOW()
                WHERE build_id = %s
                """,
                (HARDWARE_STATUS_BUILD_PREPARED, build_id),
            )

            unit_ids = [as_int(row["base_unit_id"]), as_int(row["rover_unit_id"])]
            for unit_id in unit_ids:
                if unit_id is None:
                    continue
                connection.execute(
                    """
                    UPDATE inventory.unit
                    SET status = 'in_build', current_build_id = %s, updated_at = NOW()
                    WHERE unit_id = %s
                    """,
                    (build_id, unit_id),
                )
            connection.commit()

        return {"buildId": build_id, "step": "prepare", "status": HARDWARE_STATUS_BUILD_PREPARED}

    def _run_hardware_reserve_parts(self, payload: dict[str, Any]) -> dict[str, Any]:
        build_id = as_int(payload.get("buildId"))
        if build_id is None:
            raise ValueError("buildId is required for hardware.reserve_parts")

        with self.connect() as connection:
            build = connection.execute(
                "SELECT base_unit_id, rover_unit_id FROM inventory.build WHERE build_id = %s",
                (build_id,),
            ).fetchone()
            if build is None:
                raise LookupError("build not found")

            unit_ids = [as_int(build["base_unit_id"]), as_int(build["rover_unit_id"])]
            for unit_id in unit_ids:
                if unit_id is None:
                    continue
                connection.execute(
                    """
                    UPDATE inventory.unit
                    SET status = 'reserved', updated_at = NOW()
                    WHERE unit_id = %s
                    """,
                    (unit_id,),
                )

            connection.execute(
                """
                UPDATE inventory.build
                SET status = %s, updated_at = NOW()
                WHERE build_id = %s
                """,
                (HARDWARE_STATUS_BUILD_PARTS_RESERVED, build_id),
            )
            connection.commit()

        return {"buildId": build_id, "step": "reserve_parts", "status": HARDWARE_STATUS_BUILD_PARTS_RESERVED}

    def _run_hardware_build(self, payload: dict[str, Any]) -> dict[str, Any]:
        build_id = as_int(payload.get("buildId"))
        if build_id is None:
            raise ValueError("buildId is required for hardware.build")

        with self.connect() as connection:
            connection.execute(
                """
                UPDATE inventory.build
                SET status = %s, updated_at = NOW()
                WHERE build_id = %s
                """,
                (HARDWARE_STATUS_BUILD_ASSEMBLED, build_id),
            )
            connection.commit()
        return {"buildId": build_id, "step": "build", "status": HARDWARE_STATUS_BUILD_ASSEMBLED}

    def _run_hardware_bench_validate(self, payload: dict[str, Any]) -> dict[str, Any]:
        build_id = as_int(payload.get("buildId"))
        if build_id is None:
            raise ValueError("buildId is required for hardware.bench_validate")
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE inventory.build
                SET status = %s, updated_at = NOW()
                WHERE build_id = %s
                """,
                (HARDWARE_STATUS_BUILD_VALIDATED, build_id),
            )
            build = connection.execute(
                """
                SELECT base_unit_id, rover_unit_id
                FROM inventory.build
                WHERE build_id = %s
                """,
                (build_id,),
            ).fetchone()
            if build is not None:
                for unit_id in [as_int(build["base_unit_id"]), as_int(build["rover_unit_id"])]:
                    if unit_id is None:
                        continue
                    connection.execute(
                        """
                        UPDATE inventory.unit
                        SET status = 'validated', updated_at = NOW()
                        WHERE unit_id = %s
                        """,
                        (unit_id,),
                    )
            connection.commit()
        return {"buildId": build_id, "step": "bench_validate", "status": HARDWARE_STATUS_BUILD_VALIDATED}

    def _run_hardware_runtime_register(self, payload: dict[str, Any]) -> dict[str, Any]:
        build_id = as_int(payload.get("buildId"))
        if build_id is None:
            raise ValueError("buildId is required for hardware.runtime_register")
        runtime_device_id = str(payload.get("runtimeDeviceId", "")).strip() or None
        with self.connect() as connection:
            result = connection.execute(
                """
                SELECT build_id, runtime_device_id
                FROM inventory.build
                WHERE build_id = %s
                """,
                (build_id,),
            ).fetchone()
            if result is None:
                raise LookupError("build not found")

            resolved_runtime_device_id = runtime_device_id
            if resolved_runtime_device_id is None:
                resolved_runtime_device_id = result["runtime_device_id"]
                if resolved_runtime_device_id is None:
                    resolved_runtime_device_id = None

            connection.execute(
                """
                UPDATE inventory.build
                SET runtime_device_id = COALESCE(%s, runtime_device_id), updated_at = NOW()
                WHERE build_id = %s
                """,
                (resolved_runtime_device_id, build_id),
            )
            connection.commit()

        return {
            "buildId": build_id,
            "step": "runtime_register",
            "status": HARDWARE_STATUS_BUILD_RUNTIME_PENDING,
            "runtimeDeviceId": resolved_runtime_device_id,
        }

    def _build_ui_fix_draft(
        self,
        finding: dict[str, Any],
        run: dict[str, Any] | None,
    ) -> dict[str, Any]:
        category = str(finding["category"])
        scenario_name = finding.get("scenarioName")
        checkpoint_name = finding.get("checkpointName")
        severity = str(finding["severity"])
        evidence_json = dict(finding.get("evidenceJson") or {})

        likely_paths = ["apps/dev-console-web/src/App.tsx"]
        regression_class = "frontend_regression"
        validation = [
            "Run `corepack yarn typecheck`.",
            "Run `node scripts/ui-review-smoke.mjs` against the same browser and viewport.",
        ]

        if category in {"api_error", "request_failure"}:
            likely_paths = [
                "apps/dev-console-web/src/App.tsx",
                "services/dev-console-api/src/index.ts",
                "services/agent-memory/src/agent_memory/service.py",
            ]
            regression_class = "frontend_backend_contract_regression"
            validation.append("Confirm the affected `/v1/*` route returns 2xx in the browser trace.")
        elif category in {"console_error", "page_error", "loading_stall", "missing_content"}:
            likely_paths = [
                "apps/dev-console-web/src/App.tsx",
                "packages/ui-web/src/index.ts",
            ]
            regression_class = "frontend_render_regression"
            validation.append("Reload the failing panel and confirm expected marker text is present.")
        elif category in {"layout_overflow", "visual_diff"}:
            likely_paths = [
                "apps/dev-console-web/src/App.tsx",
                "packages/design-tokens/src/index.ts",
                "packages/ui-web/src/index.ts",
            ]
            regression_class = "visual_layout_regression"
            validation.append("Compare the regenerated screenshot with the approved baseline.")

        evidence_links: list[str] = []
        for key in ("screenshot", "baseline", "diff"):
            descriptor = evidence_json.get(key)
            if isinstance(descriptor, dict):
                relative_path = descriptor.get("relativePath")
                if isinstance(relative_path, str) and relative_path:
                    evidence_links.append(relative_path)

        return {
            "draftVersion": 1,
            "failingScenario": scenario_name,
            "checkpoint": checkpoint_name,
            "regressionClass": regression_class,
            "severity": severity,
            "surface": run["surface"] if run is not None else UI_REVIEW_DEFAULT_SURFACE,
            "likelyAffectedPaths": likely_paths,
            "requiredValidation": validation,
            "evidenceLinks": sorted(set(evidence_links)),
            "operatorAction": "Create a bounded remediation task after reviewing the linked evidence.",
        }

    def _run_ui_review_capture(
        self,
        payload: dict[str, Any],
        *,
        run_id: int,
        task: dict[str, Any],
    ) -> dict[str, Any]:
        ui_review_run_id = as_int(payload.get("uiReviewRunId"))
        if ui_review_run_id is None:
            raise ValueError("uiReviewRunId is required for ui.review.capture")

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT ui_review_run_id, surface, scenario_set, base_url, viewport_json, manifest_json
                FROM review.ui_run
                WHERE ui_review_run_id = %s
                FOR UPDATE
                """,
                (ui_review_run_id,),
            ).fetchone()
            if row is None:
                raise LookupError("ui review run not found")

            surface = str(row["surface"])
            scenario_set = str(row["scenario_set"])
            base_url = str(row["base_url"])
            viewport_json = dict(row["viewport_json"] or {})
            artifact_dir = self._build_ui_review_artifact_dir(
                ui_review_run_id,
                surface=surface,
                scenario_set=scenario_set,
            )
            artifact_dir.mkdir(parents=True, exist_ok=True)
            manifest_patch = {
                "artifactDir": self._relative_repo_path(artifact_dir),
                "captureSummaryPath": self._relative_repo_path(artifact_dir / "capture" / "capture-summary.json"),
            }
            connection.execute(
                """
                UPDATE review.ui_run
                SET
                  status = %s::review.run_status,
                  current_task_id = %s,
                  manifest_json = manifest_json || %s,
                  updated_at = NOW()
                WHERE ui_review_run_id = %s
                """,
                (
                    UI_REVIEW_STATUS_CAPTURE_RUNNING,
                    task["agentTaskId"],
                    Jsonb(manifest_patch),
                    ui_review_run_id,
                ),
            )
            connection.commit()

        command = [
            UI_REVIEW_NODE_BINARY,
            str(UI_REVIEW_CAPTURE_SCRIPT),
            "--artifact-dir",
            str(artifact_dir),
            "--base-url",
            base_url,
            "--viewport",
            json.dumps(viewport_json or UI_REVIEW_DEFAULT_VIEWPORT),
        ]
        if payload.get("recordVideo"):
            command.extend(["--record-video", "true"])
        result = self._run_json_command(command)

        summary_path = REPO_ROOT / str(result["summaryPath"])
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        artifacts = [descriptor for descriptor in summary.get("artifacts", []) if isinstance(descriptor, dict)]
        artifacts.append(
            {
                "kind": "ui.review.capture_summary",
                "relativePath": self._relative_repo_path(summary_path),
                "mediaType": "application/json",
            }
        )

        with self.connect() as connection:
            connection.execute(
                """
                UPDATE review.ui_run
                SET
                  status = %s::review.run_status,
                  current_task_id = %s,
                  capture_summary_json = %s,
                  manifest_json = manifest_json || %s,
                  updated_at = NOW()
                WHERE ui_review_run_id = %s
                """,
                (
                    UI_REVIEW_STATUS_CAPTURED,
                    task["agentTaskId"],
                    Jsonb(summary),
                    Jsonb({"captureSummaryPath": self._relative_repo_path(summary_path)}),
                    ui_review_run_id,
                ),
            )
            self._record_agent_event(
                connection,
                run_id,
                "ui_review_capture_completed",
                {
                    "uiReviewRunId": ui_review_run_id,
                    "stepCount": len(summary.get("steps", [])),
                    "artifactCount": len(artifacts),
                },
            )
            self._record_ui_review_artifacts(connection, run_id, artifacts)
            connection.commit()

        return {
            "uiReviewRunId": ui_review_run_id,
            "status": summary.get("status", UI_REVIEW_STATUS_CAPTURED),
            "stepCount": len(summary.get("steps", [])),
            "artifactCount": len(artifacts),
            "summaryPath": self._relative_repo_path(summary_path),
        }

    def _run_ui_review_analyze(
        self,
        payload: dict[str, Any],
        *,
        run_id: int,
        task: dict[str, Any],
    ) -> dict[str, Any]:
        ui_review_run_id = as_int(payload.get("uiReviewRunId"))
        if ui_review_run_id is None:
            raise ValueError("uiReviewRunId is required for ui.review.analyze")

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT manifest_json
                FROM review.ui_run
                WHERE ui_review_run_id = %s
                FOR UPDATE
                """,
                (ui_review_run_id,),
            ).fetchone()
            if row is None:
                raise LookupError("ui review run not found")
            manifest_json = dict(row["manifest_json"] or {})
            capture_summary_path = manifest_json.get("captureSummaryPath")
            if not isinstance(capture_summary_path, str) or not capture_summary_path:
                raise ValueError("capture summary path is not available for ui.review.analyze")
            connection.execute(
                """
                UPDATE review.ui_run
                SET
                  status = %s::review.run_status,
                  current_task_id = %s,
                  updated_at = NOW()
                WHERE ui_review_run_id = %s
                """,
                (
                    UI_REVIEW_STATUS_ANALYSIS_RUNNING,
                    task["agentTaskId"],
                    ui_review_run_id,
                ),
            )
            connection.commit()

        summary_path = REPO_ROOT / capture_summary_path
        result = self._run_json_command(
            [
                UI_REVIEW_NODE_BINARY,
                str(UI_REVIEW_ANALYZE_SCRIPT),
                "--summary-path",
                str(summary_path),
                "--baseline-root",
                str(self._ui_review_baseline_root()),
            ]
        )
        analysis_summary_path = REPO_ROOT / str(result["analysisSummaryPath"])
        analysis_summary = json.loads(analysis_summary_path.read_text(encoding="utf-8"))
        findings = [finding for finding in analysis_summary.get("findings", []) if isinstance(finding, dict)]
        artifacts = [descriptor for descriptor in analysis_summary.get("artifacts", []) if isinstance(descriptor, dict)]
        artifacts.append(
            {
                "kind": "ui.review.analysis_summary",
                "relativePath": self._relative_repo_path(analysis_summary_path),
                "mediaType": "application/json",
            }
        )
        visual_assets = self._collect_visual_assets(
            artifacts,
            kind_prefixes=("ui.review.screenshot", "ui.review.failure_screenshot"),
        )
        ml_summary = run_local_visual_enrichment(
            visual_assets,
            analyzer_kind="ui.review.analyze",
        )
        ml_summary["summary"] = summarize_visual_signals(
            [signal for signal in ml_summary.get("signals", []) if isinstance(signal, dict)]
        )
        ml_artifact = self._write_visual_enrichment_artifact(
            analysis_summary_path.parent,
            ml_summary,
        )
        if ml_artifact is not None:
            ml_relative_path, stored_ml_summary = ml_artifact
            analysis_summary["ml"] = stored_ml_summary
            artifacts.append(
                {
                    "kind": "ui.review.ml_summary",
                    "relativePath": ml_relative_path,
                    "mediaType": "application/json",
                }
            )
            analysis_summary_path.write_text(
                json.dumps(analysis_summary, indent=2),
                encoding="utf-8",
            )

        with self.connect() as connection:
            run_row = connection.execute(
                """
                SELECT surface, scenario_set, capture_summary_json
                FROM review.ui_run
                WHERE ui_review_run_id = %s
                FOR UPDATE
                """,
                (ui_review_run_id,),
            ).fetchone()
            if run_row is None:
                raise LookupError("ui review run not found")
            capture_summary_json = dict(run_row["capture_summary_json"] or {})
            if capture_summary_json.get("error"):
                findings.append(
                    {
                        "category": "capture_error",
                        "severity": "critical",
                        "title": "Capture stage reported an execution error",
                        "summary": str(capture_summary_json["error"].get("message", "capture failed")),
                        "scenarioName": None,
                        "checkpointName": None,
                        "evidenceJson": {
                            "captureSummaryPath": capture_summary_path,
                            "error": capture_summary_json["error"],
                        },
                    }
                )

            connection.execute(
                "DELETE FROM review.ui_finding WHERE ui_review_run_id = %s",
                (ui_review_run_id,),
            )
            inserted_findings = 0
            for finding in findings:
                connection.execute(
                    """
                    INSERT INTO review.ui_finding (
                      ui_review_run_id,
                      category,
                      severity,
                      status,
                      title,
                      summary,
                      scenario_name,
                      checkpoint_name,
                      evidence_json,
                      analyzer_json
                    )
                    VALUES (%s, %s, %s::review.finding_severity, %s::review.finding_status, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        ui_review_run_id,
                        str(finding.get("category", "unknown")),
                        str(finding.get("severity", "warning")),
                        UI_REVIEW_FINDING_STATUS_PROPOSED,
                        str(finding.get("title", "Untitled finding")),
                        str(finding.get("summary", "")),
                        finding.get("scenarioName"),
                        finding.get("checkpointName"),
                        Jsonb(ensure_dict(finding.get("evidenceJson"))),
                        Jsonb(
                            {
                                "source": "deterministic-local-analyzer",
                                "threshold": analysis_summary.get("threshold"),
                            }
                        ),
                    ),
                )
                inserted_findings += 1

            outcome = (
                "failed"
                if any(str(finding.get("severity")) in {"error", "critical"} for finding in findings)
                else "passed"
            )
            connection.execute(
                """
                INSERT INTO eval.evaluation_result (subject, outcome, detail)
                VALUES (%s, %s, %s)
                """,
                (
                    f"dev-console-ui-review:{ui_review_run_id}",
                    outcome,
                    Jsonb(
                        {
                            "uiReviewRunId": ui_review_run_id,
                            "findingCount": inserted_findings,
                            "artifactCount": len(artifacts),
                            "surface": run_row["surface"],
                            "scenarioSet": run_row["scenario_set"],
                            "mlStatus": analysis_summary.get("ml", {}).get("status"),
                        }
                    ),
                ),
            )
            connection.execute(
                """
                UPDATE review.ui_run
                SET
                  status = %s::review.run_status,
                  current_task_id = %s,
                  analysis_summary_json = %s,
                  manifest_json = manifest_json || %s,
                  updated_at = NOW()
                WHERE ui_review_run_id = %s
                """,
                (
                    UI_REVIEW_STATUS_ANALYZED,
                    task["agentTaskId"],
                    Jsonb(analysis_summary),
                    Jsonb({"analysisSummaryPath": self._relative_repo_path(analysis_summary_path)}),
                    ui_review_run_id,
                ),
            )
            self._record_agent_event(
                connection,
                run_id,
                "ui_review_analysis_completed",
                {
                    "uiReviewRunId": ui_review_run_id,
                    "findingCount": inserted_findings,
                    "outcome": outcome,
                },
            )
            self._record_ui_review_artifacts(connection, run_id, artifacts)
            connection.commit()

        return {
            "uiReviewRunId": ui_review_run_id,
            "status": analysis_summary.get("status", "passed"),
            "findingCount": len(findings),
            "analysisSummaryPath": self._relative_repo_path(analysis_summary_path),
        }

    def _run_ui_review_fix_draft(
        self,
        payload: dict[str, Any],
        *,
        run_id: int,
        task: dict[str, Any],
    ) -> dict[str, Any]:
        ui_review_run_id = as_int(payload.get("uiReviewRunId"))
        if ui_review_run_id is None:
            raise ValueError("uiReviewRunId is required for ui.review.fix_draft")

        with self.connect() as connection:
            run_row = connection.execute(
                """
                SELECT
                  ui_review_run_id,
                  surface,
                  scenario_set,
                  status,
                  base_url,
                  browser,
                  viewport_json,
                  current_task_id,
                  capture_task_id,
                  analyze_task_id,
                  fix_draft_task_id,
                  manifest_json,
                  capture_summary_json,
                  analysis_summary_json,
                  created_at,
                  updated_at,
                  completed_at
                FROM review.ui_run
                WHERE ui_review_run_id = %s
                FOR UPDATE
                """,
                (ui_review_run_id,),
            ).fetchone()
            if run_row is None:
                raise LookupError("ui review run not found")
            connection.execute(
                """
                UPDATE review.ui_run
                SET
                  status = %s::review.run_status,
                  current_task_id = %s,
                  updated_at = NOW()
                WHERE ui_review_run_id = %s
                """,
                (
                    UI_REVIEW_STATUS_FIX_DRAFT_RUNNING,
                    task["agentTaskId"],
                    ui_review_run_id,
                ),
            )

            finding_rows = connection.execute(
                """
                SELECT
                  ui_review_finding_id,
                  ui_review_run_id,
                  category,
                  severity,
                  status,
                  title,
                  summary,
                  scenario_name,
                  checkpoint_name,
                  evidence_json,
                  analyzer_json,
                  fix_draft_json,
                  reviewed_by_account_id,
                  reviewed_at,
                  created_at
                FROM review.ui_finding
                WHERE ui_review_run_id = %s
                ORDER BY created_at ASC, ui_review_finding_id ASC
                """,
                (ui_review_run_id,),
            ).fetchall()

            drafted_count = 0
            run_payload = map_ui_review_run(run_row)
            for finding_row in finding_rows:
                mapped_finding = map_ui_review_finding(finding_row)
                fix_draft = self._build_ui_fix_draft(mapped_finding, run_payload)
                connection.execute(
                    """
                    UPDATE review.ui_finding
                    SET fix_draft_json = %s
                    WHERE ui_review_finding_id = %s
                    """,
                    (Jsonb(fix_draft), mapped_finding["uiReviewFindingId"]),
                )
                drafted_count += 1

            connection.execute(
                """
                UPDATE review.ui_run
                SET
                  status = %s::review.run_status,
                  current_task_id = %s,
                  completed_at = NOW(),
                  updated_at = NOW()
                WHERE ui_review_run_id = %s
                """,
                (
                    UI_REVIEW_STATUS_READY_FOR_REVIEW,
                    task["agentTaskId"],
                    ui_review_run_id,
                ),
            )
            self._record_agent_event(
                connection,
                run_id,
                "ui_review_fix_drafts_completed",
                {
                    "uiReviewRunId": ui_review_run_id,
                    "draftedCount": drafted_count,
                },
            )
            connection.commit()

        return {
            "uiReviewRunId": ui_review_run_id,
            "status": UI_REVIEW_STATUS_READY_FOR_REVIEW,
            "draftedCount": drafted_count,
        }

    def _run_ui_review_promote_baseline(
        self,
        payload: dict[str, Any],
        *,
        run_id: int,
        task: dict[str, Any],
    ) -> dict[str, Any]:
        ui_review_run_id = as_int(payload.get("uiReviewRunId"))
        if ui_review_run_id is None:
            raise ValueError("uiReviewRunId is required for ui.review.promote_baseline")

        approved_by_account_id = str(payload.get("approvedByAccountId", "")).strip() or None
        if approved_by_account_id is None:
            raise ValueError("approvedByAccountId is required for ui.review.promote_baseline")

        promoted_descriptors: list[dict[str, Any]] = []
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT surface, browser, capture_summary_json
                FROM review.ui_run
                WHERE ui_review_run_id = %s
                FOR UPDATE
                """,
                (ui_review_run_id,),
            ).fetchone()
            if row is None:
                raise LookupError("ui review run not found")
            capture_summary_json = dict(row["capture_summary_json"] or {})
            steps = capture_summary_json.get("steps", [])
            if not isinstance(steps, list) or not steps:
                raise ValueError("capture summary is required before baseline promotion")
            browser = str(capture_summary_json.get("browser") or row["browser"] or UI_REVIEW_DEFAULT_BROWSER)
            viewport_key = str(capture_summary_json.get("viewportKey") or "unknown")
            connection.execute(
                """
                UPDATE review.ui_run
                SET
                  status = %s::review.run_status,
                  current_task_id = %s,
                  updated_at = NOW()
                WHERE ui_review_run_id = %s
                """,
                (
                    UI_REVIEW_STATUS_BASELINE_PROMOTION_RUNNING,
                    task["agentTaskId"],
                    ui_review_run_id,
                ),
            )

            promoted_count = 0
            for step in steps:
                if not isinstance(step, dict):
                    continue
                screenshot = step.get("screenshot")
                if not isinstance(screenshot, dict):
                    continue
                relative_path = screenshot.get("relativePath")
                if not isinstance(relative_path, str) or not relative_path:
                    continue
                scenario_name = str(step.get("scenarioName") or step.get("panelKey") or "scenario")
                checkpoint_name = str(step.get("checkpointName") or "loaded")
                source_path = REPO_ROOT / relative_path
                if not source_path.exists():
                    continue
                baseline_path = self._build_ui_review_baseline_path(
                    surface=str(row["surface"]),
                    browser=browser,
                    viewport_key=viewport_key,
                    scenario_name=scenario_name,
                    checkpoint_name=checkpoint_name,
                )
                baseline_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_path, baseline_path)
                baseline_relative_path = self._relative_repo_path(baseline_path)
                connection.execute(
                    """
                    UPDATE review.ui_baseline
                    SET status = %s::review.baseline_status, superseded_at = NOW()
                    WHERE surface = %s
                      AND scenario_name = %s
                      AND checkpoint_name = %s
                      AND browser = %s
                      AND viewport_key = %s
                      AND status = %s::review.baseline_status
                    """,
                    (
                        UI_REVIEW_BASELINE_STATUS_SUPERSEDED,
                        str(row["surface"]),
                        scenario_name,
                        checkpoint_name,
                        browser,
                        viewport_key,
                        UI_REVIEW_BASELINE_STATUS_ACTIVE,
                    ),
                )
                connection.execute(
                    """
                    INSERT INTO review.ui_baseline (
                      surface,
                      scenario_name,
                      checkpoint_name,
                      browser,
                      viewport_key,
                      relative_path,
                      status,
                      source_run_id,
                      approved_by_account_id,
                      metadata_json
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s::review.baseline_status, %s, %s, %s)
                    """,
                    (
                        str(row["surface"]),
                        scenario_name,
                        checkpoint_name,
                        browser,
                        viewport_key,
                        baseline_relative_path,
                        UI_REVIEW_BASELINE_STATUS_ACTIVE,
                        ui_review_run_id,
                        approved_by_account_id,
                        Jsonb({"sourceScreenshotPath": relative_path}),
                    ),
                )
                promoted_descriptors.append(
                    {
                        "kind": "ui.review.baseline",
                        "relativePath": baseline_relative_path,
                        "mediaType": "image/png",
                    }
                )
                promoted_count += 1

            connection.execute(
                """
                UPDATE review.ui_run
                SET
                  status = %s::review.run_status,
                  current_task_id = %s,
                  updated_at = NOW(),
                  completed_at = NOW()
                WHERE ui_review_run_id = %s
                """,
                (
                    UI_REVIEW_STATUS_BASELINE_PROMOTED,
                    task["agentTaskId"],
                    ui_review_run_id,
                ),
            )
            self._record_agent_event(
                connection,
                run_id,
                "ui_review_baselines_promoted",
                {
                    "uiReviewRunId": ui_review_run_id,
                    "promotedCount": promoted_count,
                },
            )
            self._record_ui_review_artifacts(connection, run_id, promoted_descriptors)
            connection.commit()

        return {
            "uiReviewRunId": ui_review_run_id,
            "status": UI_REVIEW_STATUS_BASELINE_PROMOTED,
            "promotedCount": len(promoted_descriptors),
        }

    def _run_preview_render(
        self,
        payload: dict[str, Any],
        *,
        run_id: int,
        task: dict[str, Any],
    ) -> dict[str, Any]:
        preview_run_id = as_int(payload.get("previewRunId"))
        if preview_run_id is None:
            raise ValueError("previewRunId is required for preview.render")

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT deck_key, markdown_path, companion_path, viewport_json
                FROM review.preview_run
                WHERE preview_run_id = %s
                FOR UPDATE
                """,
                (preview_run_id,),
            ).fetchone()
            if row is None:
                raise LookupError("preview run not found")

            deck_key = str(row["deck_key"])
            markdown_path = REPO_ROOT / str(row["markdown_path"])
            companion_path = (
                REPO_ROOT / str(row["companion_path"])
                if row["companion_path"] is not None
                else None
            )
            viewport_json = dict(row["viewport_json"] or {}) or dict(PREVIEW_DEFAULT_VIEWPORT)
            artifact_dir = self._build_preview_artifact_dir(preview_run_id, deck_key=deck_key)
            artifact_dir.mkdir(parents=True, exist_ok=True)
            connection.execute(
                """
                UPDATE review.preview_run
                SET
                  status = %s::review.preview_run_status,
                  current_task_id = %s,
                  updated_at = NOW()
                WHERE preview_run_id = %s
                """,
                (
                    PREVIEW_STATUS_RENDER_RUNNING,
                    task["agentTaskId"],
                    preview_run_id,
                ),
            )
            connection.commit()

        result = self._run_json_command(
            [
                UI_REVIEW_NODE_BINARY,
                str(PREVIEW_RENDER_SCRIPT),
                "--artifact-dir",
                str(artifact_dir),
                "--deck-path",
                str(markdown_path),
                *(
                    ["--companion-path", str(companion_path)]
                    if companion_path is not None
                    else []
                ),
                "--viewport",
                json.dumps(viewport_json),
            ]
        )
        render_summary_path = REPO_ROOT / str(result["summaryPath"])
        render_summary = json.loads(render_summary_path.read_text(encoding="utf-8"))
        artifacts = [
            descriptor
            for descriptor in render_summary.get("artifacts", [])
            if isinstance(descriptor, dict)
        ]
        artifacts.append(
            {
                "kind": "preview.render_summary",
                "relativePath": self._relative_repo_path(render_summary_path),
                "mediaType": "application/json",
            }
        )

        with self.connect() as connection:
            connection.execute(
                """
                UPDATE review.preview_run
                SET
                  status = %s::review.preview_run_status,
                  current_task_id = %s,
                  render_summary_json = %s,
                  manifest_json = manifest_json || %s,
                  updated_at = NOW()
                WHERE preview_run_id = %s
                """,
                (
                    PREVIEW_STATUS_RENDERED,
                    task["agentTaskId"],
                    Jsonb(render_summary),
                    Jsonb(
                        {
                            "entryRelativePath": render_summary.get("entryRelativePath"),
                            "renderSummaryPath": self._relative_repo_path(render_summary_path),
                        }
                    ),
                    preview_run_id,
                ),
            )
            self._record_agent_event(
                connection,
                run_id,
                "preview_render_completed",
                {
                    "previewRunId": preview_run_id,
                    "slideCount": render_summary.get("slideCount", 0),
                    "artifactCount": len(artifacts),
                },
            )
            self._record_preview_artifacts(connection, run_id, artifacts)
            connection.commit()

        return {
            "previewRunId": preview_run_id,
            "status": PREVIEW_STATUS_RENDERED,
            "slideCount": render_summary.get("slideCount", 0),
            "artifactCount": len(artifacts),
            "summaryPath": self._relative_repo_path(render_summary_path),
        }

    def _run_preview_analyze(
        self,
        payload: dict[str, Any],
        *,
        run_id: int,
        task: dict[str, Any],
    ) -> dict[str, Any]:
        preview_run_id = as_int(payload.get("previewRunId"))
        if preview_run_id is None:
            raise ValueError("previewRunId is required for preview.analyze")

        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT manifest_json, render_summary_json
                FROM review.preview_run
                WHERE preview_run_id = %s
                FOR UPDATE
                """,
                (preview_run_id,),
            ).fetchone()
            if row is None:
                raise LookupError("preview run not found")

            render_summary_json = dict(row["render_summary_json"] or {})
            render_summary_path = render_summary_json.get("renderSummaryPath") or dict(
                row["manifest_json"] or {}
            ).get("renderSummaryPath")
            if not isinstance(render_summary_path, str) or not render_summary_path:
                raise ValueError("render summary path is not available for preview.analyze")
            connection.execute(
                """
                UPDATE review.preview_run
                SET
                  status = %s::review.preview_run_status,
                  current_task_id = %s,
                  updated_at = NOW()
                WHERE preview_run_id = %s
                """,
                (
                    PREVIEW_STATUS_ANALYSIS_RUNNING,
                    task["agentTaskId"],
                    preview_run_id,
                ),
            )
            connection.commit()

        summary_path = REPO_ROOT / render_summary_path
        artifact_dir = summary_path.parent
        result = self._run_json_command(
            [
                UI_REVIEW_NODE_BINARY,
                str(PREVIEW_ANALYZE_SCRIPT),
                "--artifact-dir",
                str(artifact_dir),
            ]
        )
        analysis_summary_path = REPO_ROOT / str(result["analysisSummaryPath"])
        analysis_summary = json.loads(analysis_summary_path.read_text(encoding="utf-8"))
        artifacts = [
            descriptor
            for descriptor in analysis_summary.get("artifacts", [])
            if isinstance(descriptor, dict)
        ]
        artifacts.append(
            {
                "kind": "preview.analysis_summary",
                "relativePath": self._relative_repo_path(analysis_summary_path),
                "mediaType": "application/json",
            }
        )
        visual_assets = self._collect_visual_assets(
            artifacts,
            kind_prefixes=("preview.analysis.screenshot",),
        )
        ml_summary = run_local_visual_enrichment(
            visual_assets,
            analyzer_kind="preview.analyze",
        )
        ml_summary["summary"] = summarize_visual_signals(
            [signal for signal in ml_summary.get("signals", []) if isinstance(signal, dict)]
        )
        ml_artifact = self._write_visual_enrichment_artifact(
            analysis_summary_path.parent,
            ml_summary,
        )
        if ml_artifact is not None:
            ml_relative_path, stored_ml_summary = ml_artifact
            analysis_summary["ml"] = stored_ml_summary
            artifacts.append(
                {
                    "kind": "preview.ml_summary",
                    "relativePath": ml_relative_path,
                    "mediaType": "application/json",
                }
            )
            analysis_summary_path.write_text(
                json.dumps(analysis_summary, indent=2),
                encoding="utf-8",
            )

        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO eval.evaluation_result (subject, outcome, detail)
                VALUES (%s, %s, %s)
                """,
                (
                    f"presentation-preview:{preview_run_id}",
                    "warning"
                    if analysis_summary.get("warnings")
                    else "passed",
                    Jsonb(
                        {
                            "previewRunId": preview_run_id,
                            "artifactCount": len(artifacts),
                            "warningCount": len(analysis_summary.get("warnings", [])),
                            "mlStatus": analysis_summary.get("ml", {}).get("status"),
                        }
                    ),
                ),
            )
            connection.execute(
                """
                UPDATE review.preview_run
                SET
                  status = %s::review.preview_run_status,
                  current_task_id = %s,
                  analysis_summary_json = %s,
                  manifest_json = manifest_json || %s,
                  updated_at = NOW(),
                  completed_at = NOW()
                WHERE preview_run_id = %s
                """,
                (
                    PREVIEW_STATUS_READY_FOR_REVIEW,
                    task["agentTaskId"],
                    Jsonb(analysis_summary),
                    Jsonb({"analysisSummaryPath": self._relative_repo_path(analysis_summary_path)}),
                    preview_run_id,
                ),
            )
            self._record_agent_event(
                connection,
                run_id,
                "preview_analysis_completed",
                {
                    "previewRunId": preview_run_id,
                    "artifactCount": len(artifacts),
                    "warningCount": len(analysis_summary.get("warnings", [])),
                },
            )
            self._record_preview_artifacts(connection, run_id, artifacts)
            connection.commit()

        return {
            "previewRunId": preview_run_id,
            "status": PREVIEW_STATUS_READY_FOR_REVIEW,
            "artifactCount": len(artifacts),
            "analysisSummaryPath": self._relative_repo_path(analysis_summary_path),
        }

    def compute_dev_preference_scores(
        self,
        *,
        runtime_account_id: str | None = None,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            if runtime_account_id is None:
                account_rows = connection.execute(
                    """
                    SELECT runtime_account_id
                    FROM (
                      SELECT runtime_account_id, MAX(created_at) AS activity_at
                      FROM agent.dev_preference_signal
                      GROUP BY runtime_account_id
                      UNION
                      SELECT runtime_account_id, MAX(created_at) AS activity_at
                      FROM agent.dev_preference_decision
                      GROUP BY runtime_account_id
                    ) AS combined
                    ORDER BY activity_at DESC
                    LIMIT 1
                    """
                ).fetchall()
                if not account_rows:
                    return {
                        "updatedAccounts": [],
                        "source": "dev-memory",
                    }
                account_ids = [str(account_rows[0]["runtime_account_id"])]
            else:
                account_ids = [runtime_account_id]

            updated_accounts: list[dict[str, Any]] = []
            for account_id in account_ids:
                signal_rows = connection.execute(
                    """
                    SELECT
                      dev_preference_signal_id,
                      runtime_account_id,
                      signal_kind,
                      surface,
                      panel_key,
                      payload,
                      created_at
                    FROM agent.dev_preference_signal
                    WHERE runtime_account_id = %s
                    ORDER BY created_at DESC, dev_preference_signal_id DESC
                    """,
                    (account_id,),
                ).fetchall()
                decision_rows = connection.execute(
                    """
                    SELECT
                      dev_preference_decision_id,
                      runtime_account_id,
                      dev_preference_signal_id,
                      decision_kind,
                      subject_kind,
                      subject_key,
                      chosen_value,
                      payload,
                      created_at
                    FROM agent.dev_preference_decision
                    WHERE runtime_account_id = %s
                    ORDER BY created_at DESC, dev_preference_decision_id DESC
                    """,
                    (account_id,),
                ).fetchall()

                mapped_signals = [map_dev_preference_signal(row) for row in signal_rows]
                mapped_decisions = [map_dev_preference_decision(row) for row in decision_rows]
                feature_summary, scorecard = build_dev_preference_scorecard(
                    mapped_signals,
                    mapped_decisions,
                )
                score_row = connection.execute(
                    """
                    INSERT INTO agent.dev_preference_score (
                      runtime_account_id,
                      feature_summary,
                      scorecard,
                      computed_from_signal_count,
                      updated_at
                    )
                    VALUES (%s, %s, %s, %s, NOW())
                    ON CONFLICT (runtime_account_id)
                    DO UPDATE
                    SET
                      feature_summary = EXCLUDED.feature_summary,
                      scorecard = EXCLUDED.scorecard,
                      computed_from_signal_count = EXCLUDED.computed_from_signal_count,
                      updated_at = EXCLUDED.updated_at
                    RETURNING
                      runtime_account_id,
                      feature_summary,
                      scorecard,
                      computed_from_signal_count,
                      updated_at
                    """,
                    (
                        account_id,
                        Jsonb(feature_summary),
                        Jsonb(scorecard),
                        len(mapped_signals),
                    ),
                ).fetchone()
                updated_accounts.append(map_dev_preference_score(score_row))

            connection.commit()

        return {
            "updatedAccounts": updated_accounts,
            "source": "dev-memory",
        }

    def _record_completed_task(
        self,
        task: dict[str, Any],
        *,
        run_id: int,
        result: dict[str, Any],
    ) -> dict[str, Any]:
        with self.connect() as connection:
            self._apply_hardware_task_side_effects(
                connection,
                task=task,
                result=result,
                success=True,
            )
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

    def _apply_hardware_task_side_effects(
        self,
        connection: psycopg.Connection[Any],
        *,
        task: dict[str, Any],
        result: dict[str, Any],
        success: bool,
    ) -> None:
        task_kind = str(task["taskKind"])
        if task_kind not in {
            HARDWARE_PREPARE_TASK_KIND,
            HARDWARE_RESERVE_PARTS_TASK_KIND,
            HARDWARE_BUILD_TASK_KIND,
            HARDWARE_BENCH_VALIDATE_TASK_KIND,
            HARDWARE_RUNTIME_REGISTER_TASK_KIND,
        }:
            return

        payload = dict(task["payload"] or {})
        build_id = as_int(payload.get("buildId"))
        if build_id is None:
            return

        next_status = None
        if success:
            if task_kind == HARDWARE_PREPARE_TASK_KIND:
                next_status = HARDWARE_STATUS_BUILD_PREPARED
            elif task_kind == HARDWARE_RESERVE_PARTS_TASK_KIND:
                next_status = HARDWARE_STATUS_BUILD_PARTS_RESERVED
            elif task_kind == HARDWARE_BUILD_TASK_KIND:
                next_status = HARDWARE_STATUS_BUILD_ASSEMBLED
            elif task_kind == HARDWARE_BENCH_VALIDATE_TASK_KIND:
                next_status = HARDWARE_STATUS_BUILD_VALIDATED
            elif task_kind == HARDWARE_RUNTIME_REGISTER_TASK_KIND:
                resolved_runtime_device_id = str(payload.get("runtimeDeviceId", "")).strip()
                if not resolved_runtime_device_id:
                    build_row = connection.execute(
                        """
                        SELECT runtime_device_id
                        FROM inventory.build
                        WHERE build_id = %s
                        """,
                        (build_id,),
                    ).fetchone()
                    if build_row is not None:
                        resolved_runtime_device_id = str(build_row["runtime_device_id"] or "").strip()
                next_status = (
                    HARDWARE_STATUS_BUILD_RUNTIME_PUBLISHED
                    if resolved_runtime_device_id
                    else HARDWARE_STATUS_BUILD_RUNTIME_REGISTRATION_FAILED
                )
        else:
            if task_kind == HARDWARE_RUNTIME_REGISTER_TASK_KIND:
                next_status = HARDWARE_STATUS_BUILD_RUNTIME_REGISTRATION_FAILED
            else:
                next_status = HARDWARE_STATUS_BUILD_FAILED

        if next_status is None:
            return

        event_id = self._record_inventory_event(
            connection,
            subject_kind="build",
            subject_id=build_id,
            event_kind=f"{task_kind.replace('.', '-')}.completed",
            payload={"status": next_status, "result": result},
            actor="agent-memory",
            agent_task_id=task.get("agentTaskId"),
        )

        if task_kind == HARDWARE_RUNTIME_REGISTER_TASK_KIND and success:
            runtime_device_id = str(payload.get("runtimeDeviceId", "")).strip()
            if not runtime_device_id:
                build_row = connection.execute(
                    """
                    SELECT runtime_device_id
                    FROM inventory.build
                    WHERE build_id = %s
                    """,
                    (build_id,),
                ).fetchone()
                if build_row is not None:
                    runtime_device_id = str(build_row["runtime_device_id"] or "").strip()

            if runtime_device_id:
                next_status = HARDWARE_STATUS_BUILD_RUNTIME_PUBLISHED
            else:
                next_status = HARDWARE_STATUS_BUILD_RUNTIME_REGISTRATION_FAILED

            if next_status == HARDWARE_STATUS_BUILD_RUNTIME_PUBLISHED:
                connection.execute(
                    """
                    UPDATE inventory.build
                    SET status = %s,
                        runtime_device_id = %s,
                        latest_event_id = %s,
                        current_task_id = %s,
                        updated_at = NOW()
                    WHERE build_id = %s
                    """,
                    (
                        HARDWARE_STATUS_BUILD_RUNTIME_PUBLISHED,
                        runtime_device_id,
                        event_id,
                        task.get("agentTaskId"),
                        build_id,
                    ),
                )
                return

        connection.execute(
            """
            UPDATE inventory.build
            SET status = %s,
                latest_event_id = %s,
                current_task_id = %s,
                updated_at = NOW()
            WHERE build_id = %s
            """,
            (
                next_status,
                event_id,
                task.get("agentTaskId"),
                build_id,
            ),
        )

    def _apply_ui_review_task_side_effects(
        self,
        connection: psycopg.Connection[Any],
        *,
        task: dict[str, Any],
        result: dict[str, Any],
        success: bool,
    ) -> None:
        task_kind = str(task["taskKind"])
        if task_kind not in {
            UI_REVIEW_CAPTURE_TASK_KIND,
            UI_REVIEW_ANALYZE_TASK_KIND,
            UI_REVIEW_FIX_DRAFT_TASK_KIND,
            UI_REVIEW_PROMOTE_BASELINE_TASK_KIND,
        }:
            return

        ui_review_run_id = as_int(dict(task["payload"] or {}).get("uiReviewRunId"))
        if ui_review_run_id is None or success:
            return

        connection.execute(
            """
            UPDATE review.ui_run
            SET
              status = %s::review.run_status,
              current_task_id = %s,
              manifest_json = manifest_json || %s,
              updated_at = NOW(),
              completed_at = NOW()
            WHERE ui_review_run_id = %s
            """,
            (
                UI_REVIEW_STATUS_FAILED,
                task.get("agentTaskId"),
                Jsonb(
                    {
                        "lastError": result.get("error"),
                        "failedTaskKind": task_kind,
                    }
                ),
                ui_review_run_id,
            ),
        )

    def _apply_preview_task_side_effects(
        self,
        connection: psycopg.Connection[Any],
        *,
        task: dict[str, Any],
        result: dict[str, Any],
        success: bool,
    ) -> None:
        task_kind = str(task["taskKind"])
        if task_kind not in {PREVIEW_RENDER_TASK_KIND, PREVIEW_ANALYZE_TASK_KIND}:
            return

        preview_run_id = as_int(dict(task["payload"] or {}).get("previewRunId"))
        if preview_run_id is None or success:
            return

        connection.execute(
            """
            UPDATE review.preview_run
            SET
              status = %s::review.preview_run_status,
              current_task_id = %s,
              analysis_summary_json = analysis_summary_json || %s,
              updated_at = NOW(),
              completed_at = NOW()
            WHERE preview_run_id = %s
            """,
            (
                PREVIEW_STATUS_FAILED,
                task.get("agentTaskId"),
                Jsonb(
                    {
                        "lastError": result.get("error"),
                        "failedTaskKind": task_kind,
                    }
                ),
                preview_run_id,
            ),
        )

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
            if exhausted:
                payload = dict(task["payload"] or {})
                self._apply_hardware_task_side_effects(
                    connection,
                    task=task,
                    result={"error": str(error)},
                    success=False,
                )
                self._apply_ui_review_task_side_effects(
                    connection,
                    task=task,
                    result={"error": str(error)},
                    success=False,
                )
                self._apply_preview_task_side_effects(
                    connection,
                    task=task,
                    result={"error": str(error)},
                    success=False,
                )
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


def map_agent_task_dependency(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "agentTaskId": int(row["agent_task_id"]),
        "dependsOnAgentTaskId": int(row["depends_on_agent_task_id"]),
        "createdAt": row["created_at"].isoformat(),
    }


def map_agent_run(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "agentRunId": int(row["agent_run_id"]),
        "agentName": row["agent_name"],
        "taskSlug": row["task_slug"],
        "status": row["status"],
        "startedAt": row["started_at"].isoformat(),
        "finishedAt": row["finished_at"].isoformat()
        if row["finished_at"] is not None
        else None,
    }


def map_agent_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "agentEventId": int(row["agent_event_id"]),
        "agentRunId": int(row["agent_run_id"]),
        "eventType": row["event_type"],
        "payload": row["payload"] or {},
        "createdAt": row["created_at"].isoformat(),
    }


def map_agent_artifact(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "artifactId": int(row["artifact_id"]),
        "agentRunId": int(row["agent_run_id"]),
        "artifactKind": row["artifact_kind"],
        "uri": row["uri"],
        "metadata": row["metadata"] or {},
        "createdAt": row["created_at"].isoformat(),
    }


def map_inventory_item(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "itemId": int(row["item_id"]),
        "itemKey": row["item_key"],
        "partName": row["part_name"],
        "manufacturer": row["manufacturer"],
        "model": row["model"],
        "category": row["category"],
        "classification": row["classification"],
        "status": row["status"],
        "totalUnits": int(row["total_units"]),
        "latestEventId": row["latest_event_id"],
        "notesJson": row["notes_json"] or {},
        "createdAt": row["created_at"].isoformat(),
        "updatedAt": row["updated_at"].isoformat(),
    }


def map_inventory_unit(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "unitId": int(row["unit_id"]),
        "itemId": int(row["item_id"]),
        "unitLabel": row["unit_label"],
        "serialNumber": row["serial_number"],
        "assetTag": row["asset_tag"],
        "status": row["status"],
        "location": row["location"],
        "currentBuildId": int(row["current_build_id"]) if row["current_build_id"] is not None else None,
        "latestEventId": row["latest_event_id"],
        "metadataJson": row["metadata_json"] or {},
        "createdAt": row["created_at"].isoformat(),
        "updatedAt": row["updated_at"].isoformat(),
    }


def map_inventory_build(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "buildId": int(row["build_id"]),
        "buildName": row["build_name"],
        "buildKind": row["build_kind"],
        "status": row["status"],
        "baseUnitId": int(row["base_unit_id"]) if row["base_unit_id"] is not None else None,
        "roverUnitId": int(row["rover_unit_id"]) if row["rover_unit_id"] is not None else None,
        "reservedByAccountId": int(row["reserved_by_account_id"]) if row["reserved_by_account_id"] is not None else None,
        "runtimeDeviceId": row["runtime_device_id"],
        "currentTaskId": int(row["current_task_id"]) if row["current_task_id"] is not None else None,
        "expectedSite": row["expected_site"],
        "planJson": row["plan_json"] or {},
        "resultJson": row["result_json"] or {},
        "latestEventId": row["latest_event_id"],
        "createdAt": row["created_at"].isoformat(),
        "updatedAt": row["updated_at"].isoformat(),
    }


def map_inventory_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "eventId": int(row["event_id"]),
        "subjectKind": row["subject_kind"],
        "subjectId": int(row["subject_id"]),
        "eventKind": row["event_kind"],
        "payloadJson": row["payload_json"] or {},
        "actor": row["actor"],
        "agentTaskId": int(row["agent_task_id"]) if row["agent_task_id"] is not None else None,
        "createdAt": row["created_at"].isoformat(),
    }


def map_ui_review_run(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "uiReviewRunId": int(row["ui_review_run_id"]),
        "surface": row["surface"],
        "scenarioSet": row["scenario_set"],
        "status": row["status"],
        "baseUrl": row["base_url"],
        "browser": row["browser"],
        "viewportJson": row["viewport_json"] or {},
        "currentTaskId": int(row["current_task_id"]) if row["current_task_id"] is not None else None,
        "captureTaskId": int(row["capture_task_id"]) if row["capture_task_id"] is not None else None,
        "analyzeTaskId": int(row["analyze_task_id"]) if row["analyze_task_id"] is not None else None,
        "fixDraftTaskId": int(row["fix_draft_task_id"]) if row["fix_draft_task_id"] is not None else None,
        "manifestJson": row["manifest_json"] or {},
        "captureSummaryJson": row["capture_summary_json"] or {},
        "analysisSummaryJson": row["analysis_summary_json"] or {},
        "createdAt": row["created_at"].isoformat(),
        "updatedAt": row["updated_at"].isoformat(),
        "completedAt": row["completed_at"].isoformat() if row["completed_at"] is not None else None,
    }


def map_ui_review_finding(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "uiReviewFindingId": int(row["ui_review_finding_id"]),
        "uiReviewRunId": int(row["ui_review_run_id"]),
        "category": row["category"],
        "severity": row["severity"],
        "status": row["status"],
        "title": row["title"],
        "summary": row["summary"],
        "scenarioName": row["scenario_name"],
        "checkpointName": row["checkpoint_name"],
        "evidenceJson": row["evidence_json"] or {},
        "analyzerJson": row["analyzer_json"] or {},
        "fixDraftJson": row["fix_draft_json"] or {},
        "reviewedByAccountId": row["reviewed_by_account_id"],
        "reviewedAt": row["reviewed_at"].isoformat() if row["reviewed_at"] is not None else None,
        "createdAt": row["created_at"].isoformat(),
    }


def map_ui_review_baseline(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "uiReviewBaselineId": int(row["ui_review_baseline_id"]),
        "surface": row["surface"],
        "scenarioName": row["scenario_name"],
        "checkpointName": row["checkpoint_name"],
        "browser": row["browser"],
        "viewportKey": row["viewport_key"],
        "relativePath": row["relative_path"],
        "status": row["status"],
        "sourceRunId": int(row["source_run_id"]) if row["source_run_id"] is not None else None,
        "approvedByAccountId": row["approved_by_account_id"],
        "metadataJson": row["metadata_json"] or {},
        "createdAt": row["created_at"].isoformat(),
        "supersededAt": row["superseded_at"].isoformat() if row["superseded_at"] is not None else None,
    }


def map_preview_run(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "previewRunId": int(row["preview_run_id"]),
        "deckKey": row["deck_key"],
        "title": row["title"],
        "markdownPath": row["markdown_path"],
        "companionPath": row["companion_path"],
        "status": row["status"],
        "browser": row["browser"],
        "viewportJson": row["viewport_json"] or {},
        "currentTaskId": int(row["current_task_id"]) if row["current_task_id"] is not None else None,
        "renderTaskId": int(row["render_task_id"]) if row["render_task_id"] is not None else None,
        "analyzeTaskId": int(row["analyze_task_id"]) if row["analyze_task_id"] is not None else None,
        "manifestJson": row["manifest_json"] or {},
        "renderSummaryJson": row["render_summary_json"] or {},
        "analysisSummaryJson": row["analysis_summary_json"] or {},
        "createdAt": row["created_at"].isoformat(),
        "updatedAt": row["updated_at"].isoformat(),
        "completedAt": row["completed_at"].isoformat() if row["completed_at"] is not None else None,
    }


def map_preview_feedback(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "previewFeedbackId": int(row["preview_feedback_id"]),
        "previewRunId": int(row["preview_run_id"]),
        "slideId": row["slide_id"],
        "feedbackKind": row["feedback_kind"],
        "comment": row["comment"],
        "payloadJson": row["payload_json"] or {},
        "createdByAccountId": row["created_by_account_id"],
        "createdAt": row["created_at"].isoformat(),
    }


def map_dev_preference_signal(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "devPreferenceSignalId": int(row["dev_preference_signal_id"]),
        "runtimeAccountId": str(row["runtime_account_id"]),
        "signalKind": row["signal_kind"],
        "surface": row["surface"],
        "panelKey": row["panel_key"],
        "payload": row["payload"] or {},
        "createdAt": row["created_at"].isoformat(),
    }


def map_dev_preference_decision(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "devPreferenceDecisionId": int(row["dev_preference_decision_id"]),
        "runtimeAccountId": str(row["runtime_account_id"]),
        "devPreferenceSignalId": row["dev_preference_signal_id"],
        "decisionKind": row["decision_kind"],
        "subjectKind": row["subject_kind"],
        "subjectKey": row["subject_key"],
        "chosenValue": row["chosen_value"],
        "payload": row["payload"] or {},
        "createdAt": row["created_at"].isoformat(),
    }


def map_dev_preference_score(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "runtimeAccountId": str(row["runtime_account_id"]),
        "featureSummary": row["feature_summary"] or {},
        "scorecard": row["scorecard"] or {},
        "computedFromSignalCount": int(row["computed_from_signal_count"]),
        "updatedAt": row["updated_at"].isoformat(),
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
                    mode = query.get("mode", ["hybrid"])[0]
                    limit = as_optional_int(query.get("limit", [None])[0]) or 50
                    self.send_json(
                        200,
                        repository.search_claims(needle, mode=str(mode), limit=limit),
                    )
                    return
                if parsed.path == "/v1/evaluations":
                    self.send_json(200, {"items": repository.list_evaluations()})
                    return
                if parsed.path == "/v1/internal/inventory/items":
                    self.require_internal_token()
                    status = query.get("status", [None])[0]
                    limit = as_optional_int(query.get("limit", [None])[0]) or 200
                    items = repository.list_inventory_items(status=status, limit=limit)
                    self.send_json(200, {"items": items, "source": "dev-memory", "total": len(items)})
                    return
                if (
                    len(path_parts) == 5
                    and path_parts[:4] == ["v1", "internal", "inventory", "items"]
                    and path_parts[4].isdigit()
                ):
                    self.require_internal_token()
                    item = repository.get_inventory_item(int(path_parts[4]))
                    if item is None:
                        self.send_json(404, {"error": "not found"})
                        return
                    self.send_json(200, item)
                    return
                if parsed.path == "/v1/internal/inventory/units":
                    self.require_internal_token()
                    item_id = as_optional_int(query.get("itemId", [None])[0])
                    status = query.get("status", [None])[0]
                    build_id = as_optional_int(query.get("buildId", [None])[0])
                    limit = as_optional_int(query.get("limit", [None])[0]) or 200
                    units = repository.list_inventory_units(
                        item_id=item_id,
                        status=status,
                        build_id=build_id,
                        limit=limit,
                    )
                    self.send_json(200, {"units": units, "source": "dev-memory", "total": len(units)})
                    return
                if (
                    len(path_parts) == 5
                    and path_parts[:4] == ["v1", "internal", "inventory", "units"]
                    and path_parts[4].isdigit()
                ):
                    self.require_internal_token()
                    unit = repository.get_inventory_unit(int(path_parts[4]))
                    if unit is None:
                        self.send_json(404, {"error": "not found"})
                        return
                    self.send_json(200, unit)
                    return
                if parsed.path == "/v1/internal/inventory/builds":
                    self.require_internal_token()
                    status = query.get("status", [None])[0]
                    build_kind = query.get("buildKind", [None])[0]
                    limit = as_optional_int(query.get("limit", [None])[0]) or 200
                    builds = repository.list_inventory_builds(
                        status=status,
                        build_kind=build_kind,
                        limit=limit,
                    )
                    self.send_json(
                        200,
                        {
                            "builds": builds,
                            "source": "dev-memory",
                            "total": len(builds),
                        },
                    )
                    return
                if (
                    len(path_parts) == 5
                    and path_parts[:4] == ["v1", "internal", "inventory", "builds"]
                    and path_parts[4].isdigit()
                ):
                    self.require_internal_token()
                    build = repository.get_inventory_build(int(path_parts[4]))
                    if build is None:
                        self.send_json(404, {"error": "not found"})
                        return
                    self.send_json(200, build)
                    return
                if parsed.path == "/v1/internal/inventory/events":
                    self.require_internal_token()
                    subject_kind = query.get("subjectKind", [None])[0]
                    subject_id = as_optional_int(query.get("subjectId", [None])[0])
                    limit = as_optional_int(query.get("limit", [None])[0]) or 200
                    events = repository.list_inventory_events(
                        subject_kind=subject_kind,
                        subject_id=subject_id,
                        limit=limit,
                    )
                    self.send_json(200, {"events": events, "source": "dev-memory", "total": len(events)})
                    return
                if parsed.path == "/v1/internal/coordination/tasks":
                    self.require_internal_token()
                    queue_name = query.get("queueName", [None])[0]
                    limit = as_optional_int(query.get("limit", [None])[0]) or 100
                    self.send_json(
                        200,
                        repository.list_agent_tasks(queue_name=queue_name, limit=limit),
                    )
                    return
                if parsed.path == "/v1/internal/coordination/status":
                    self.require_internal_token()
                    self.send_json(200, repository.get_coordination_status())
                    return
                if (
                    len(path_parts) == 5
                    and path_parts[:4] == ["v1", "internal", "coordination", "tasks"]
                    and path_parts[4].isdigit()
                ):
                    self.require_internal_token()
                    task = repository.get_agent_task(int(path_parts[4]))
                    if task is None:
                        self.send_json(404, {"error": "not found"})
                        return
                    self.send_json(200, task)
                    return
                if parsed.path == "/v1/internal/coordination/runs":
                    self.require_internal_token()
                    limit = as_optional_int(query.get("limit", [None])[0]) or 50
                    self.send_json(200, repository.list_agent_runs(limit=limit))
                    return
                if (
                    len(path_parts) == 5
                    and path_parts[:4] == ["v1", "internal", "coordination", "runs"]
                    and path_parts[4].isdigit()
                ):
                    self.require_internal_token()
                    detail = repository.get_agent_run_detail(int(path_parts[4]))
                    if detail is None:
                        self.send_json(404, {"error": "not found"})
                        return
                    self.send_json(200, detail)
                    return
                if parsed.path == "/v1/internal/reviews/ui/runs":
                    self.require_internal_token()
                    surface = query.get("surface", [None])[0]
                    limit = as_optional_int(query.get("limit", [None])[0]) or 25
                    runs = repository.list_ui_review_runs(surface=surface, limit=limit)
                    self.send_json(200, {"runs": runs, "source": "dev-memory", "total": len(runs)})
                    return
                if (
                    len(path_parts) == 6
                    and path_parts[:5] == ["v1", "internal", "reviews", "ui", "runs"]
                    and path_parts[5].isdigit()
                ):
                    self.require_internal_token()
                    run = repository.get_ui_review_run(int(path_parts[5]))
                    if run is None:
                        self.send_json(404, {"error": "not found"})
                        return
                    self.send_json(200, run)
                    return
                if parsed.path == "/v1/internal/reviews/ui/findings":
                    self.require_internal_token()
                    ui_review_run_id = as_optional_int(query.get("uiReviewRunId", [None])[0])
                    status = query.get("status", [None])[0]
                    limit = as_optional_int(query.get("limit", [None])[0]) or 200
                    findings = repository.list_ui_review_findings(
                        ui_review_run_id=ui_review_run_id,
                        status=status,
                        limit=limit,
                    )
                    self.send_json(
                        200,
                        {
                            "findings": findings,
                            "source": "dev-memory",
                            "total": len(findings),
                        },
                    )
                    return
                if parsed.path == "/v1/internal/reviews/ui/baselines":
                    self.require_internal_token()
                    surface = query.get("surface", [None])[0]
                    status = query.get("status", [UI_REVIEW_BASELINE_STATUS_ACTIVE])[0]
                    limit = as_optional_int(query.get("limit", [None])[0]) or 200
                    baselines = repository.list_ui_review_baselines(
                        surface=surface,
                        status=status,
                        limit=limit,
                    )
                    self.send_json(
                        200,
                        {
                            "baselines": baselines,
                            "source": "dev-memory",
                            "total": len(baselines),
                        },
                    )
                    return
                if parsed.path == "/v1/internal/previews/runs":
                    self.require_internal_token()
                    deck_key = query.get("deckKey", [None])[0]
                    limit = as_optional_int(query.get("limit", [None])[0]) or 25
                    runs = repository.list_preview_runs(deck_key=deck_key, limit=limit)
                    self.send_json(200, {"runs": runs, "source": "dev-memory", "total": len(runs)})
                    return
                if (
                    len(path_parts) == 5
                    and path_parts[:4] == ["v1", "internal", "previews", "runs"]
                    and path_parts[4].isdigit()
                ):
                    self.require_internal_token()
                    run = repository.get_preview_run(int(path_parts[4]))
                    if run is None:
                        self.send_json(404, {"error": "not found"})
                        return
                    self.send_json(200, run)
                    return
                if parsed.path == "/v1/internal/previews/feedback":
                    self.require_internal_token()
                    preview_run_id = as_optional_int(query.get("previewRunId", [None])[0])
                    if preview_run_id is None:
                        self.send_json(400, {"error": "previewRunId is required"})
                        return
                    slide_id = query.get("slideId", [None])[0]
                    limit = as_optional_int(query.get("limit", [None])[0]) or 200
                    items = repository.list_preview_feedback(
                        preview_run_id=preview_run_id,
                        slide_id=slide_id,
                        limit=limit,
                    )
                    self.send_json(200, {"items": items, "source": "dev-memory", "total": len(items)})
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
                if parsed.path == "/v1/internal/preferences/dev-profile":
                    self.require_internal_token()
                    runtime_account_id = query.get("runtimeAccountId", [None])[0]
                    if not runtime_account_id:
                        self.send_json(400, {"error": "runtimeAccountId is required"})
                        return
                    self.send_json(
                        200,
                        repository.get_dev_preference_profile(str(runtime_account_id)),
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
                if parsed.path == "/v1/internal/coordination/tasks":
                    self.require_internal_token()
                    self.send_json(
                        201,
                        repository.enqueue_agent_task(
                            task_kind=str(payload["taskKind"]),
                            queue_name=str(payload.get("queueName", DEFAULT_AGENT_TASK_QUEUE)),
                            priority=int(payload.get("priority", 0)),
                            payload=ensure_dict(payload.get("payload")),
                        ),
                    )
                    return
                if parsed.path == "/v1/internal/reviews/ui/runs":
                    self.require_internal_token()
                    self.send_json(
                        201,
                        repository.start_ui_review(
                            payload=payload,
                            requested_by_account_id=str(payload["requestedByAccountId"])
                            if payload.get("requestedByAccountId")
                            else None,
                        ),
                    )
                    return
                if parsed.path == "/v1/internal/previews/runs":
                    self.require_internal_token()
                    self.send_json(
                        201,
                        repository.start_preview_run(
                            payload=payload,
                            requested_by_account_id=str(payload["requestedByAccountId"])
                            if payload.get("requestedByAccountId")
                            else None,
                        ),
                    )
                    return
                if parsed.path == "/v1/internal/previews/feedback":
                    self.require_internal_token()
                    self.send_json(
                        201,
                        repository.create_preview_feedback(
                            preview_run_id=int(payload["previewRunId"]),
                            slide_id=str(payload["slideId"]) if payload.get("slideId") else None,
                            feedback_kind=str(payload["feedbackKind"]),
                            comment=str(payload.get("comment", "")),
                            payload=ensure_dict(payload.get("payload")),
                            created_by_account_id=str(payload["createdByAccountId"])
                            if payload.get("createdByAccountId")
                            else None,
                        ),
                    )
                    return
                if (
                    len(path_parts) == 6
                    and path_parts[:4] == ["v1", "internal", "previews", "runs"]
                    and path_parts[4].isdigit()
                    and path_parts[5] == "feedback"
                ):
                    self.require_internal_token()
                    self.send_json(
                        201,
                        repository.create_preview_feedback(
                            preview_run_id=int(path_parts[4]),
                            slide_id=str(payload["slideId"]) if payload.get("slideId") else None,
                            feedback_kind=str(payload["feedbackKind"]),
                            comment=str(payload.get("comment", "")),
                            payload=ensure_dict(payload.get("payload")),
                            created_by_account_id=str(payload["createdByAccountId"])
                            if payload.get("createdByAccountId")
                            else None,
                        ),
                    )
                    return
                if (
                    len(path_parts) == 7
                    and path_parts[:5] == ["v1", "internal", "reviews", "ui", "findings"]
                    and path_parts[5].isdigit()
                    and path_parts[6] == "review"
                ):
                    self.require_internal_token()
                    self.send_json(
                        200,
                        repository.review_ui_finding(
                            int(path_parts[5]),
                            status=str(payload["status"]),
                            reviewed_by_account_id=str(payload["reviewedByAccountId"]),
                            review_payload=ensure_dict(payload.get("reviewPayload")),
                        ),
                    )
                    return
                if (
                    len(path_parts) == 7
                    and path_parts[:5] == ["v1", "internal", "reviews", "ui", "runs"]
                    and path_parts[5].isdigit()
                    and path_parts[6] == "promote-baseline"
                ):
                    self.require_internal_token()
                    self.send_json(
                        200,
                        repository.trigger_ui_review_baseline_promotion(
                            int(path_parts[5]),
                            approved_by_account_id=str(payload["approvedByAccountId"]),
                            queue_name=str(payload.get("queueName", DEFAULT_AGENT_TASK_QUEUE)),
                            priority=int(payload.get("priority", 0)),
                        ),
                    )
                    return
                if (
                    len(path_parts) == 6
                    and path_parts[:4] == ["v1", "internal", "coordination", "tasks"]
                    and path_parts[4].isdigit()
                    and path_parts[5] == "retry"
                ):
                    self.require_internal_token()
                    self.send_json(
                        200,
                        repository.retry_agent_task(
                            int(path_parts[4]),
                            note=str(payload["note"]) if payload.get("note") else None,
                        ),
                    )
                    return
                if parsed.path == "/v1/internal/inventory/builds":
                    self.require_internal_token()
                    self.send_json(201, repository.start_hardware_build(payload))
                    return
                if (
                    len(path_parts) == 6
                    and path_parts[:4] == ["v1", "internal", "inventory", "builds"]
                    and path_parts[4].isdigit()
                    and path_parts[5] == "runtime-publish"
                ):
                    self.require_internal_token()
                    runtime_device_id = payload.get("runtimeDeviceId")
                    if runtime_device_id is None:
                        self.send_json(400, {"error": "runtimeDeviceId is required"})
                        return
                    self.send_json(
                        200,
                        repository.trigger_hardware_runtime_publish(
                            build_id=int(path_parts[4]),
                            runtime_device_id=str(runtime_device_id),
                            queue_name=str(payload.get("queueName", DEFAULT_AGENT_TASK_QUEUE)),
                            priority=int(payload.get("priority", 0)),
                        ),
                    )
                    return
                if parsed.path == "/v1/internal/inventory/seed":
                    self.require_internal_token()
                    self.send_json(
                        201,
                        repository.seed_inventory_from_markdown(
                            manifest_path=str(payload["manifestPath"]),
                            force=bool(payload.get("force", False)),
                        ),
                    )
                    return
                if parsed.path == "/v1/internal/preferences/dev-signals":
                    self.require_internal_token()
                    self.send_json(
                        201,
                        repository.create_dev_preference_signal(
                            runtime_account_id=str(payload["runtimeAccountId"]),
                            signal_kind=str(payload["signalKind"]),
                            surface=str(payload.get("surface", "dev_console")),
                            panel_key=str(payload["panelKey"]) if payload.get("panelKey") else None,
                            payload=ensure_dict(payload.get("payload")),
                        ),
                    )
                    return
                if parsed.path == "/v1/internal/preferences/dev-decisions":
                    self.require_internal_token()
                    self.send_json(
                        200,
                        repository.create_dev_preference_decision(
                            runtime_account_id=str(payload["runtimeAccountId"]),
                            dev_preference_signal_id=as_optional_int(
                                payload.get("devPreferenceSignalId")
                            ),
                            decision_kind=str(payload["decisionKind"]),
                            subject_kind=str(payload["subjectKind"]),
                            subject_key=str(payload["subjectKey"]),
                            chosen_value=str(payload["chosenValue"])
                            if payload.get("chosenValue")
                            else None,
                            payload=ensure_dict(payload.get("payload")),
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
        default=os.environ.get("CLARTK_AGENT_SCHEDULER_QUEUE", MEMORY_MAINTENANCE_TASK_QUEUE),
    )
    scheduler_parser.add_argument("--chunk-size", type=int, default=120)

    worker_parser = subparsers.add_parser("run-worker")
    worker_parser.add_argument(
        "--database-url",
        default=os.environ.get("CLARTK_DEV_DATABASE_URL"),
    )
    worker_parser.add_argument(
        "--queue-name",
        default=os.environ.get(
            "CLARTK_AGENT_TASK_QUEUES",
            os.environ.get("CLARTK_AGENT_TASK_QUEUE", DEFAULT_AGENT_WORKER_QUEUE),
        ),
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
