---
"@cossistant/protocol": minor
---

Add `@cossistant/protocol`, the canonical HTTP and WebSocket wire contract for
the Cossistant API.

The package owns all 65 public operations (64 REST routes plus the `/ws`
handshake) as `@hono/zod-openapi` route descriptors, along with the shared
security schemes, protocol headers, error responses, and operation-ID/tag
normalization. It is side-effect free: importing it initializes no database,
Redis, S3, billing, auth, or queue clients, and reads no environment variables.

- `@cossistant/protocol/routes` — descriptors and the recursive mount table,
  registerable with `app.openapi(route, yourHandler)`
- `@cossistant/protocol/openapi` — `buildCossistantOpenApiDocument()`, pure
  and deterministic, with server URLs as arguments
- `@cossistant/protocol/testkit` — compatibility checking so a second
  implementation can prove in its own CI that it still matches the contract
- `@cossistant/protocol/openapi.json` — the generated specification

`apps/api` now imports its descriptors from this package and keeps its
handlers. The served document is byte-identical to before the extraction.
