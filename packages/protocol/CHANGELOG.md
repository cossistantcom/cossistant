# @cossistant/protocol

## 0.3.0

### Minor Changes

- [#162](https://github.com/cossistantcom/cossistant/pull/162) [`ee31da8`](https://github.com/cossistantcom/cossistant/commit/ee31da86e0211cf321b139e191f255ce1a62ba63) Thanks [@Rieranthony](https://github.com/Rieranthony)! - Add `@cossistant/protocol`, the canonical HTTP and WebSocket wire contract for
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

### Patch Changes

- Updated dependencies [[`43d79f4`](https://github.com/cossistantcom/cossistant/commit/43d79f40caeaed8a0d72d8997643ef42654b0449)]:
  - @cossistant/types@0.3.0
