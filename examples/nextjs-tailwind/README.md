# @cossistant/example-nextjs-tailwind

Integration test app for `@cossistant/next` using Next.js App Router + Tailwind CSS.

## Commands

```bash
bun run dev
bun run check-types
bun run build
bun run test:e2e
```

## Goal

This app follows docs usage patterns (`SupportProvider`, `Support`, `SupportConfig`, `IdentifySupportVisitor`, and `Support.Page`) so type regressions in the SDK fail CI before release.

When `NEXT_PUBLIC_COSSISTANT_API_KEY` is not set, the app uses a deterministic
mock support controller so browser positioning tests can run without real API
credentials.
