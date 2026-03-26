from agent_memory import (
    ClaimCandidate,
    build_preference_rationale,
    build_health_payload,
    chunk_document,
    suggestion_confidence_for_occurrences,
    summarize_claim,
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
    assert configured["jobs"] == ["run-embeddings", "run-evals"]


def test_suggestion_confidence_increases_with_repeat_observations() -> None:
    assert suggestion_confidence_for_occurrences(0) == 0.4
    assert suggestion_confidence_for_occurrences(2) == 0.7
    assert suggestion_confidence_for_occurrences(10) == 0.95


def test_build_preference_rationale_mentions_review_boundary() -> None:
    rationale = build_preference_rationale("view_override_updated", "view_override", 3)
    assert "Observed 3 repeated view_override_updated events" in rationale
    assert "operator review" in rationale
