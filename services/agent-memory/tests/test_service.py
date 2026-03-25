from agent_memory import (
    ClaimCandidate,
    build_health_payload,
    chunk_document,
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
