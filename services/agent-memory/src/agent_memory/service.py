from dataclasses import dataclass


@dataclass(frozen=True)
class ClaimCandidate:
    source_document_id: str
    summary: str
    status: str = "proposed"


def summarize_claim(candidate: ClaimCandidate) -> str:
    return f"{candidate.source_document_id}:{candidate.status}:{candidate.summary}"

