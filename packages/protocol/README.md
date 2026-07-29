# @cossistant/protocol

The canonical HTTP and WebSocket wire contract for the Cossistant API.

This package is the single source of truth for Cossistant's public API surface:
65 operations (64 REST routes plus the `/ws` handshake), their request and
response schemas, shared error responses, security schemes, and protocol
headers.

It is **protocol only**. It contains no request handlers, no authentication
enforcement, no database or Redis clients, no billing, and no environment
parsing. Importing it starts nothing.

## Install

```bash
bun add @cossistant/protocol
```

## Mount a shared route with your own handler

Route descriptors are `createRoute()` results from `@hono/zod-openapi`, so a
Hono app can register one directly. Your handler is typed against the shared
contract: `c.req.valid(...)` and the allowed `c.json(...)` status codes come
from the descriptor.

```ts
import { getOrganizationRoute } from "@cossistant/protocol/routes";
import { OpenAPIHono } from "@hono/zod-openapi";

const app = new OpenAPIHono();

app.openapi(getOrganizationRoute, async (c) => {
  const id = c.req.param("id");
  // ... your implementation
  return c.json({ id, name: "Acme" }, 200);
});
```

Paths are **router-relative**, matching how Cossistant mounts them. Use
`REST_MOUNT_TABLE` to reproduce the full path layout:

```ts
import { REST_MOUNT_TABLE } from "@cossistant/protocol/routes";

for (const group of REST_MOUNT_TABLE) {
  // group.prefix  -> "/conversations"
  // group.routes  -> descriptors registered directly on the group
  // group.groups  -> nested sub-routers (an auth split, mounted at "/")
}
```

> **Descriptors declare security, they do not enforce it.** Mounting a route
> installs no authentication middleware. Every server must independently
> enforce the API keys the descriptor declares.

The nested `groups` are meaningful: `contacts`, `support` and `feedback` each
split into a public-key runtime sub-router and a private-key control
sub-router. Keep the split — collapsing it makes it easy to register a control
route on the runtime side, which exposes a private endpoint to public keys
without changing the OpenAPI document at all.

## Generate the specification

```ts
import { buildCossistantOpenApiDocument } from "@cossistant/protocol/openapi";

const document = buildCossistantOpenApiDocument({
  restServerUrl: "https://api.example.com/v1", // optional
  websocketServerUrl: "wss://api.example.com", // optional
});
```

This is pure: it runs in a process with no `DATABASE_URL`, Redis, S3, billing
credentials, or auth secrets, makes no network connections, and produces
deterministic output.

A pre-generated artifact ships with the package:

```ts
import document from "@cossistant/protocol/openapi.json" with { type: "json" };
```

## Prove your implementation still conforms

```ts
import { assertCossistantProtocolCompatibility } from "@cossistant/protocol/testkit";

// throws, listing every violation
assertCossistantProtocolCompatibility(myApp.getOpenAPI31Document(config));
```

It checks that every method/path pair exists, operation IDs match and are
unique, parameter names/locations/required flags match, request and response
media types and schemas match, security declarations match, and the `/ws`
handshake stays documented.

Use `checkCossistantProtocolCompatibility` for the non-throwing variant, which
returns a `CompatibilityViolation[]`.

Intentional differences go through an explicit allowlist. Each entry names the
exact operation and field, and says why:

```ts
assertCossistantProtocolCompatibility(document, {
  allow: [
    {
      operation: "POST /conversations/{conversationId}/resolve",
      field: "*",
      reason: "Not implemented by this service yet.",
    },
  ],
});
```

## Exports

| Entry point | Contents |
| --- | --- |
| `@cossistant/protocol` | Everything below, re-exported |
| `@cossistant/protocol/routes` | Route descriptors and `REST_MOUNT_TABLE` |
| `@cossistant/protocol/openapi` | `buildCossistantOpenApiDocument`, `buildRestApp`, `getCossistantRouteDefinitions` |
| `@cossistant/protocol/testkit` | Compatibility checking |
| `@cossistant/protocol/openapi.json` | Generated specification |

## Known contract quirks

These are preserved deliberately. They predate this package and are part of the
already-published contract, so changing them would be a breaking change:

- `GET /conversations/{conversationId}`, `.../context` and `.../export` each
  declare the `conversationId` path parameter twice — once explicitly and once
  derived from `request.params`. OpenAPI forbids duplicate `name`+`in` pairs.
- The two `/websites` routes are tagged `Website` (singular) while the tag
  fallback for that prefix is `Websites`.
- Several operation-ID overrides no longer match any live path.

## Schemas

Request and response schemas live in `@cossistant/types` and are re-used here
rather than duplicated.
