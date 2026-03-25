from agent_memory import ClaimCandidate, summarize_claim


def test_summarize_claim() -> None:
    candidate = ClaimCandidate(source_document_id="doc-1", summary="RTKLIB bridge pending validation")
    assert summarize_claim(candidate) == "doc-1:proposed:RTKLIB bridge pending validation"

