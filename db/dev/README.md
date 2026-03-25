# Development Database

Logical database name: `clartk_dev`

Local development default: one PostgreSQL server on `5432`, with `clartk_runtime`
and `clartk_dev` kept as separate logical databases.

Primary table families:

- agent runs and events
- source documents and validated knowledge
- embeddings and evaluations

Requires the `vector` extension for embedding storage.
