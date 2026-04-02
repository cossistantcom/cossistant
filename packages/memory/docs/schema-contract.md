# Schema Contract

## Ownership

`@plasma/memory` does not create or migrate its own tables.

The host application owns:

- the Drizzle schema definition
- the SQL migrations
- pgvector enablement
- any helper SQL functions used for id defaults

The package assumes the host app passes its existing Drizzle PostgreSQL
database instance directly to `new Memory({ db, ... })`.

## Required Table

The runtime assumes a PostgreSQL table named `memory_records`.

Required columns:

- `id`: string-compatible primary key exposed to TypeScript as `string`
- `content`: `text`, not null
- `metadata`: `jsonb`, not null, default `'{}'::jsonb`
- `priority`: integer, not null, default `1`
- `embedding`: `vector(1536)`, nullable
- `source`: varchar/text, nullable
- `created_at`: timestamptz, not null
- `updated_at`: timestamptz, not null

## Id Rules

The package treats ids as opaque strings.

- Cossistant default: ULID-backed ids
- also supported: UUID-backed ids
- not allowed: package-side assumptions about UUID-only generation or formatting

Important:

`remember()` relies on a database-level default for `memory_records.id`.
Drizzle-only `$defaultFn()` helpers are not enough on their own because the
package writes through its own runtime table contract.

That means your migration must provide a real SQL default for `id`.

## Metadata Rules

- metadata must be a flat key-value object
- allowed values: `string | number | boolean | null`
- nested objects and arrays are out of scope
- filters compile to JSONB containment checks

## Recommended Indexes

Minimum useful indexes:

- btree index on `created_at`
- btree index on `priority`
- GIN index on `metadata`
- HNSW index on `embedding` using `vector_cosine_ops`

## Summary Convention

Summary rows currently use the same table.

Recommended metadata convention:

- `kind: "summary"`

`context({ includeSummary: true })` looks for a stored summary row in the same
metadata scope and returns its content separately from the ranked `items`.

## Example

Use the example file as the canonical contract starter:

- [../examples/drizzle-example.ts](../examples/drizzle-example.ts)

That example uses ULID as the default shape and documents the UUID-compatible
alternative.
