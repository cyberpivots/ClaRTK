# ADR-013: Runtime PostgreSQL Uses A Self-Hosted Reliability-First Baseline

- Status: Draft
- Date: 2026-03-28

## Decision

ClaRTK runtime PostgreSQL hardening will target a self-hosted, single-primary, reliability-first baseline before HA-specific work.

The baseline is:

- `clartk_runtime` remains isolated from `clartk_dev`
- runtime services do not share a superuser DSN with migration tooling
- runtime schema changes are tracked through a migration ledger and repo-owned migration runner
- runtime telemetry uses explicit time-range partitions rather than only a default partition
- runtime API readiness checks database reachability and migration state explicitly

## Why

- The repo already treats runtime and development data as separate trust domains.
- The current runtime integration is real for auth/profile data, but ingest tables remain empty and the gateway still stops at diagnostics.
- Ordered SQL replay is adequate for local bootstrap, but it is not a sufficient production migration control surface.
- Reliability-first runtime work needs deterministic migration state, bounded read patterns, and predictable partition/index maintenance before failover and multi-node work.

## Consequences

- Production runtime work now has a dedicated task slice in `TASK-0240`.
- Runtime schema/index/partition maintenance becomes explicit operational work rather than an implicit side effect of `dev-db-init.sh`.
- Dedicated runtime role/bootstrap automation, compose-backed WAL archiving, base-backup capture, observability collection, and replay-backed gateway persistence are now repo-owned surfaces.
- Disposable restore-drill automation and non-compose production config templates are now repo-owned surfaces.
- Final host-specific deployment rollout remains a follow-on.
- Runtime authorization stays service-layer-owned in this phase; row-level security is deferred.
