# R&D Reporting And Presentation Workflow

- Status: Draft
- Date: 2026-03-27
- Scope: how ClaRTK agents should research, verify, package, and publish R&D updates

## Canonical rule

- The repo is the source of truth.
- Presentation content must be derived from:
  - task files
  - ADRs
  - implementation docs
  - research digests
  - checks actually run for the current task
- Canva output is derived and never authoritative.

## Tool and role selection

- Use `openai-docs` when the R&D update references OpenAI products, Codex behavior, model selection, or agent/evals guidance.
- Use `hardware_rd_researcher` when the work needs verified read-only synthesis across hardware docs, vendor sources, and ClaRTK implementation state.
- Use `docs_researcher` for general version-sensitive documentation questions that do not need hardware specialization.
- Use `verification_runner` when a claim depends on a command, test, smoke check, or reproducibility statement.
- Use `research-to-deck` when the job is to turn verified repo changes into:
  - a versioned deck source in `docs/presentations/`
  - a paired Canva brief
- Use `presentation_packager` when the evidence is already assembled and the remaining task is shaping that evidence into slide-ready language.
- Use `canva:canva-branded-presentation` only after the repo-native deck source is complete and publication prerequisites are verified.

## Recommended workflow

1. Identify the development slice being reported and the owning task file.
2. Gather repo-local evidence from task files, ADRs, docs, and checks.
3. Pull any external guidance only from primary or official sources.
4. Write or update the research digest if external guidance materially affects decisions.
5. Generate the repo-native deck source in `docs/presentations/`.
6. Generate the paired Canva brief in `docs/presentations/`.
7. Publish to Canva only if the connector and brand path are available.

## Verification rule for slide content

- Each slide must have at least one evidence link.
- Any claim about completed implementation must point to a repo file or a check recorded in the current task.
- If a statement is an inference from sources, label it as an inference in the supporting digest or speaker notes.

## Canva publication playbook

- Blocked path:
  - If Canva still lacks `brandkit:read`, stop at the repo deck source and Canva brief.
  - Record that publication is blocked by connector scope.
  - Do not create unverified brand lookalikes.
- Ready path:
  - Reconnect Canva with `brandkit:read`.
  - List available brand kits.
  - If a ClaRTK brand kit exists, use it.
  - If no brand kit exists, use a neutral template and preserve repo facts verbatim.

## Current workspace findings

- Verified on 2026-03-27:
  - Canva brand-kit discovery is blocked because the connector currently lacks `brandkit:read`.
  - No existing ClaRTK Canva design was found.

## Output expectations

- Repo-native deck source:
  versioned markdown file under `docs/presentations/`
- Canva brief:
  paired markdown file under `docs/presentations/`
- Source map:
  evidence links on every slide, with the task file as the place to record current verification commands and outcomes

