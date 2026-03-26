# Development Database

Logical database name: `clartk_dev`

Local development default: one PostgreSQL server on `5432`, with `clartk_runtime`
and `clartk_dev` kept as separate logical databases.

Primary table families:

- agent runs and events
- agent artifacts and future coordination state
- source documents and validated knowledge
- embeddings and evaluations

Requires the `vector` extension for embedding storage.

Current implementation note:

- The schema is coordination-ready, but the current Python service only stages embedding chunks with `pending_vector` metadata. Actual vector generation and DB-backed agent scheduling remain follow-on work.
