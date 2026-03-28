# Development Database

Logical database name: `clartk_dev`

Local development default: one PostgreSQL server on `55432`, with `clartk_runtime`
and `clartk_dev` kept as separate logical databases.

Primary table families:

- agent runs and events
- agent artifacts and future coordination state
- agent task queue and dependency state
- source documents and validated knowledge
- embeddings and evaluations

Requires the `vector` extension for embedding storage.

Current implementation note:

- The schema now includes a PostgreSQL-backed task queue baseline in `agent.task` and `agent.task_dependency`.
- The current Python service now writes deterministic development vectors into `memory.embedding_chunk.embedding` and can process embedding/evaluation jobs through the `agent.*` control plane.
