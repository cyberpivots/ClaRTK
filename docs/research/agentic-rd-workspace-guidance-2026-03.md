# Agentic R&D Workspace Guidance 2026-03

- Status: Draft
- Date: 2026-03-27
- Scope: verified guidance for ClaRTK R&D reporting, agent configuration, and benchmark tracking

## Verified repo baseline

- `.codex/config.toml` previously only carried bounded parallelism settings (`max_threads = 4`, `max_depth = 1`).
- Repo-local Codex roles already existed for:
  - documentation research
  - GNSS protocol research
  - implementation work
  - repo exploration
  - verification
- Repo-local skills already existed for:
  - fixture validation
  - GNSS protocols
  - RTKLIB sync
  - task handoff
- `services/dev-console-api/src/index.ts` previously classified docs as `task`, `adr`, `operations`, `research`, `plan`, or `guide`; there was no first-class `presentation` kind.
- `docs/hardware/` and [`../adr/ADR-009-hardware-lab-governance.md`](../adr/ADR-009-hardware-lab-governance.md) already describe the current hardware governance slice.
- Direct workspace checks on 2026-03-27 found:
  - no existing ClaRTK Canva design
  - Canva brand-aware publication is currently blocked because the connector lacks `brandkit:read`

## External findings

### Codex configuration and repo-scoped guidance

- OpenAI Codex best practices recommend keeping personal defaults in `~/.codex/config.toml`, repo-specific behavior in `.codex/config.toml`, and one-off changes as CLI overrides only when needed.
- The same guide recommends configuring Codex for the real environment early and keeping permissions tight by default.

### OpenAI model-selection guidance

- OpenAI’s current model guide says `gpt-5.4` is the default model for important work across general-purpose and coding tasks.
- The OpenAI code-generation guide says Codex works best with the latest GPT-5 family and recommends using the general-purpose model for most code-generation tasks starting with `gpt-5.4`.

### Eval-driven multi-agent guidance

- OpenAI evaluation best practices say multi-agent systems add nondeterminism and should be adopted only when evals justify the added complexity.
- OpenAI’s prompt-optimization and self-evolving-agent cookbook examples both reinforce an eval-first improvement loop rather than uncontrolled agent sprawl.

### Long-running research execution patterns

- OpenAI’s deep-research guidance recommends background mode for long-running research tasks.
- The same guidance recommends webhooks for completion signaling and `max_tool_calls` as the main control for cost and latency.

### Current software-agent benchmark direction

- SWE-Lancer evaluates real-world freelance software engineering tasks and is specifically framed around paid software work rather than synthetic issue summaries.
- Multi-SWE-bench extends issue-resolution evaluation across seven programming languages instead of centering only Python.
- OSWorld evaluates open-ended computer-use tasks across desktop and web applications, which captures a different failure surface than repository-only coding benchmarks.
- Inference from these benchmark scopes:
  ClaRTK should treat SWE-bench Verified as historical comparison context only, not as the primary frontier-reporting benchmark, because newer benchmark families cover broader software-engineering and computer-use behaviors.

## ClaRTK decisions from this digest

- Keep the default ClaRTK agent workflow single-owner and bounded by write set.
- Keep `max_depth = 1` until ClaRTK-specific evals justify deeper delegation.
- Keep research parallelism bounded and read-only by default.
- Expand multi-agent specialization only when evals show a measurable gain.
- Track benchmark freshness and contamination risk in docs before making capability claims.
- Keep the repo deck canonical and treat Canva output as a derived publication artifact.

## Planned self-improvement direction

- Improve repo-local Codex configuration before adding more autonomous structure.
- Add narrow specialist roles and skills only when they remove repeated manual packaging or verification work.
- Use eval-backed prompt or workflow optimization patterns for repeated R&D tasks instead of relying on broader autonomous freedom.

## References

- OpenAI Codex best practices:
  https://developers.openai.com/codex/learn/best-practices/
- OpenAI latest model guide:
  https://developers.openai.com/api/docs/guides/latest-model/
- OpenAI code-generation guide:
  https://developers.openai.com/api/docs/guides/code-generation/
- OpenAI evaluation best practices:
  https://developers.openai.com/api/docs/guides/evaluation-best-practices/
- OpenAI deep-research guide:
  https://developers.openai.com/api/docs/guides/deep-research/
- OpenAI optimize prompts cookbook:
  https://developers.openai.com/cookbook/examples/optimize_prompts/
- OpenAI self-evolving agents cookbook:
  https://developers.openai.com/cookbook/examples/partners/self_evolving_agents/autonomous_agent_retraining/
- SWE-Lancer paper:
  https://arxiv.org/abs/2502.12115
- Multi-SWE-bench paper:
  https://arxiv.org/abs/2504.02605
- OSWorld paper:
  https://arxiv.org/abs/2404.07972
- OSWorld project site:
  https://os-world.github.io/

