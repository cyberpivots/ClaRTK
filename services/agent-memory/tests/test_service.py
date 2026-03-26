import pytest

from agent_memory import (
    ClaimCandidate,
    build_development_embedding,
    build_preference_rationale,
    build_default_worker_name,
    build_health_payload,
    chunk_document,
    suggestion_confidence_for_occurrences,
    summarize_claim,
    task_retry_delay_seconds,
)


def test_summarize_claim() -> None:
    candidate = ClaimCandidate(source_document_id="doc-1", summary="RTKLIB bridge pending validation")
    assert summarize_claim(candidate) == "doc-1:proposed:RTKLIB bridge pending validation"


def test_chunk_document_splits_on_word_boundaries() -> None:
    body = "one two three four five six"
    assert chunk_document(body, chunk_size=2) == ["one two", "three four", "five six"]


def test_build_health_payload_reports_database_configuration() -> None:
    configured = build_health_payload("postgresql://example/clartk_dev")
    unconfigured = build_health_payload(None)

    assert configured["devDatabaseConfigured"] is True
    assert unconfigured["devDatabaseConfigured"] is False
    assert configured["jobs"] == [
        "run-embeddings",
        "run-evals",
        "run-scheduler-once",
        "run-worker",
    ]
    assert configured["coordinationMode"] == "postgres"
    assert configured["embeddingProvider"] == "deterministic-dev"


def test_suggestion_confidence_increases_with_repeat_observations() -> None:
    assert suggestion_confidence_for_occurrences(0) == 0.4
    assert suggestion_confidence_for_occurrences(2) == 0.7
    assert suggestion_confidence_for_occurrences(10) == 0.95


def test_build_preference_rationale_mentions_review_boundary() -> None:
    rationale = build_preference_rationale("view_override_updated", "view_override", 3)
    assert "Observed 3 repeated view_override_updated events" in rationale
    assert "operator review" in rationale


def test_build_development_embedding_is_deterministic_and_normalized() -> None:
    first = build_development_embedding("claRTK vector test")
    second = build_development_embedding("claRTK vector test")
    empty = build_development_embedding("")

    assert len(first) == 1536
    assert first == second
    assert empty == [0.0] * 1536

    squared_norm = sum(value * value for value in first)
    assert squared_norm == pytest.approx(1.0, abs=1e-6)


def test_task_retry_delay_seconds_uses_bounded_exponential_backoff() -> None:
    assert task_retry_delay_seconds(0) == 2
    assert task_retry_delay_seconds(1) == 2
    assert task_retry_delay_seconds(3) == 8
    assert task_retry_delay_seconds(10) == 300


def test_build_default_worker_name_uses_hostname_and_pid() -> None:
    worker_name = build_default_worker_name()

    assert "-" in worker_name
    assert worker_name.split("-")[-1].isdigit()
