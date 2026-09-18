# Polar SDK and API version

Billing uses the exact SDK release `@polar-sh/sdk@1.0.0-alpha.22` and the
`@polar-sh/sdk/2026-04` entrypoint. This sets `Polar-Version: 2026-04` on every
request. The SDK is a prerelease; updating its package and updating the API
contract are separate changes. Keep the workspace dependencies and root override
in sync, and commit `bun.lock`.

The shared client selects production only for `NODE_ENV=production`; other
environments use Polar sandbox. Initialization remains lazy so self-hosted
deployments with Polar disabled do not require a token.

The SDK returns snake_case JSON fields and string timestamps. Map these at the
billing boundary into the application's existing camelCase types. Preserve
custom metadata keys such as `websiteId` and `workflowRunId`.

The unused Polar Better Auth, Hono, and Next.js adapters have been removed.
Organization provisioning still creates customers through the shared client;
the billing page creates portal sessions directly. The unused Better Auth
`/customer/*` and `/usage/*` endpoints are no longer registered.

## Deployment verification

1. In sandbox, verify organization customer creation, free subscription creation,
   paid checkout, upgrade/proration, cancellation, billing portal, and credit
   ingestion. Confirm a paid website retains its entitlements and the live credit
   balance is populated.
2. Inventory existing webhook endpoints in both Polar environments. Record their
   current API version, URL and event subscriptions. Set `api_version` to
   `2026-04` on the existing endpoints; retain URLs, signing secrets and events.
   This is a separate Polar configuration change, not performed by installing
   the SDK. Do not create duplicate endpoints.
3. Coordinate the endpoint change with the API, web and workers deployment. Test
   signed subscription and customer-state delivery. Existing queued events keep
   their original version on redelivery; the handler accepts their common
   snake_case fields without requiring a new version header. Inspect delivery
   failures rather than repeatedly changing an endpoint's version.
4. Verify a production customer-state read and its `Polar-Version: 2026-04`
   response header, the customer's paid plan, portal navigation and webhook
   delivery status. Monitor Polar errors and credit-meter outage state.

If a rollback is needed, restore a previously verified client/API/webhook
combination. Reverting the package alone to the old unpinned integration can
reintroduce the outage.

## Checks and upkeep

Run billing tests in isolated processes from `apps/api`:

```sh
bun scripts/test-isolated.ts src/lib/plans src/lib/ai-credits src/lib/polar.test src/polar src/trpc/routers/plan src/trpc/routers/admin.test src/trpc/routers/website.test
```

Run API, web and worker type checks and builds. The transport tests use the real
SDK with mocked HTTP responses; they do not replace sandbox verification.

Review Polar's supported contracts before each January, April, July and October
release. Upgrade before the pinned contract is removed, test the new contract in
sandbox, and migrate webhook endpoints separately. Never replace the exact
package pin with a floating `next` tag.

The repository retains its three-day package release-age policy. `bunfig.toml`
exempts `@polar-sh/sdk` so fresh CI installs can resolve the explicitly pinned
alpha release immediately. This package-specific exception applies to ordinary
and frozen-lockfile installs; other external packages retain the age restriction.
Remove the exception once the pinned release is at least three days old.

References: [TypeScript SDK](https://polar.sh/docs/integrate/sdk/typescript),
[API versioning](https://polar.sh/docs/api-reference/2026-04/versioning).
