# @cossistant/example-react-vite

Integration test app for `@cossistant/react` using Vite + React.

## Commands

```bash
bun run dev
bun run check-types
bun run build
bun run test:e2e
```

## Goal

This app imports `@cossistant/react/styles.css` and renders the real React
support widget in a Vite browser runtime, so positioning and packaging
regressions fail before release.
