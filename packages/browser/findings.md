# Findings & Decisions

## Requirements
- Create a new `packages/browser` workspace package now.
- Keep planning artifacts inside `packages/browser`.
- Make `@cossistant/core` the source of widget runtime control before shipping a browser-global API.
- Validate the new controller path through React before packaging for CDN or updating docs.
- Keep browser delivery automatically aligned with React/runtime releases.
- Ship isolated browser CSS without breaking existing `--co-*` theming.

## Research Findings
- `@cossistant/core` already owns REST, realtime, and multiple widget-related stores.
- `packages/react/src/provider.tsx` still owns key widget runtime behavior such as configuration errors, unread derivation, visitor prefetch, and websocket orchestration.
- `@cossistant/next` is currently a thin wrapper over `@cossistant/react`.
- There is no existing browser embed entrypoint, custom element, or global `window.Cossistant` runtime in the repo.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Package path is `packages/browser` | Matches the requested rollout structure |
| Package name is `@cossistant/browser` | Aligns with the workspace naming pattern |
| Introduce a core support controller | Gives React and browser a shared runtime contract |
| Use controller-scoped support state in React | Removes the module singleton as a blocker for future browser instances |
| Let browser own the controller and pass it into React | Gives browser a clean imperative surface without depending on React internals |
| Reuse `@cossistant/react` for rendering | Makes browser updates follow React widget changes automatically on each build |
| Alias React to Preact compat only for the embed bundle | Shrinks CDN payload without changing the npm React package |
| Mount in a ShadowRoot by default | Prevents Tailwind utility clashes with the host page |
| Keep `--co-*` and `--co-theme-*` as the public styling contract | Lets existing theming flow through the shadow host cleanly |
| Put `@cossistant/browser` in the Changesets fixed group | Ensures browser versions track core/react changes automatically |
| Deploy immutable versioned assets plus `latest/` | Supports both pinned installs and the easiest integration path |
| Use a dedicated OIDC role variable for AWS auth | Keeps CDN deploys secretless in GitHub Actions |

## Implementation Findings
- The controller boundary belongs in `@cossistant/core`, not in React, because the parity-sensitive logic is runtime behavior rather than JSX rendering.
- React can stay backward compatible while delegating runtime control to core as long as provider context and imperative APIs are preserved.
- Browser mounting works cleanly once `SupportProvider` can accept an injected controller.
- The browser adapter can stay small if it only owns DOM mounting, controller ownership, and lifecycle teardown.
- Shadow DOM still allows theming through inherited custom properties as long as theme variables are applied on the host element.
- Dark-mode auto detection has to be handled in the browser runtime because host `.dark` selectors do not cross the shadow boundary.
- A dedicated embed build is required; the library build cannot be shipped directly because it externalizes React/runtime dependencies.
- tsdown currently emits `.iife.js` for IIFE bundles, so the build step normalizes those outputs back to `loader.js` and `widget.js` to preserve a stable CDN contract.

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Existing React provider mixed runtime control with React-specific concerns | Extract controller responsibilities into `@cossistant/core` and keep JSX concerns in React |
| React build touched a sandbox-restricted CSS step | Re-ran the build with escalation and confirmed success |
| Browser tests did not have a resolvable `react` runtime in this workspace path | Mock `react` in the browser adapter test and keep the test focused on mount orchestration |

## Resources
- `packages/core/src/client.ts`
- `packages/core/src/store/support-store.ts`
- `packages/react/src/provider.tsx`
- `packages/react/src/support/store/support-store.ts`
- `packages/react/src/support/context/events.tsx`
- `packages/browser/src/mount-support-widget.ts`
- `packages/browser/src/mount-support-widget.test.ts`
- `packages/browser/src/embed/widget-runtime.ts`
- `packages/browser/src/embed/loader-runtime.ts`
- `.github/workflows/release.yml`
- `.changeset/config.json`

## Visual/Browser Findings
- CSS isolation comes from two layers together: compiled widget CSS plus Shadow DOM injection.
- The browser embed should never inject widget CSS into `document.head`.
