# Cossistant React SDK

Build fully featured customer support experiences in React with the official `@plasma/react` package. The SDK wraps the REST and WebSocket APIs, comes with a prebuilt widget, hooks, and UI primitives so you can ship your support quickly and customize later.

> 📚 **New to Cossistant?** Follow the [Quickstart guide](https://cossistant.com/docs/quickstart) in our official documentation.

## Installation

Pick the command that matches your package manager:

```bash
bun add @plasma/react
# or
npm install @plasma/react
# or
yarn add @plasma/react
```

## CSS Imports

The widget does not inject styles automatically. Import one CSS entrypoint at your app root:

### Option 1: Plain CSS

If you're using Tailwind CSS v4, import the source file to enable full theme customization:

```tsx
import "@plasma/react/support.css";
```

### Option 2: Plain CSS

Import the pre-compiled CSS with no Tailwind dependency:

```tsx
import "@plasma/react/styles.css";
```

This file contains all the compiled styles and works in any React application without requiring Tailwind CSS.

### Option 2: Tailwind v4 Source

Only use this entrypoint if your app already runs Tailwind CSS v4 and you want the widget styles compiled through your Tailwind pipeline:

```tsx
import "@cossistant/react/support.css";
```

> **Note:** Tailwind v3 is not supported. Use the plain CSS import if you're on Tailwind v3.

## Render the widget

```tsx
import { SupportProvider, Support } from "@plasma/react";
import "@plasma/react/styles.css";

export function App() {
  return (
    <SupportProvider>
      <Support />
    </SupportProvider>
  );
}
```

The SDK auto-detects your public key from environment variables: `VITE_COSSISTANT_API_KEY` (Vite), `NEXT_PUBLIC_COSSISTANT_API_KEY` (Next.js), or `COSSISTANT_API_KEY` (other). You can also pass it explicitly via `publicKey`.

1. Wrap the subtree that should access support data with `SupportProvider` (A Cossistant account is mandatory)
2. Drop the `Support` component anywhere inside that provider to mount the floating widget.
3. Optionally pass `defaultOpen`, `quickOptions`, `defaultMessages`, or locale overrides straight into `Support` for instant personalization.

### Render the widget inline

Use `mode="responsive"` when you want the widget to live inside your app layout instead of opening from a floating trigger.

```tsx
import { Support, SupportProvider } from "@cossistant/react";
import "@cossistant/react/styles.css";

export function App() {
  return (
    <SupportProvider>
      <div style={{ height: 640, width: "100%" }}>
        <Support mode="responsive" />
      </div>
    </SupportProvider>
  );
}
```

In responsive mode, the widget always renders and fills its parent container. The parent is responsible for height, width, and any outer shell styling.

### Identify visitors and seed defaults

Use the helper components to identify a visitor, attach metadata or display different default messages or quick options.

```tsx
import {
  IdentifySupportVisitor,
  Support,
  SupportConfig,
  SupportProvider,
  SenderType,
} from "@plasma/react";

export function Dashboard({
  visitor,
}: {
  visitor: { id: string; email: string };
}) {
  return (
    <>
      <IdentifySupportVisitor externalId={visitor.id} email={visitor.email} />
      <SupportConfig
        defaultMessages={[
          {
            content:
              "Welcome to your dashboard. If you need any help, I'm here!",
            senderType: SenderType.TeamMember,
          },
        ]}
      />
    </>
  );
}
```

Make sure `IdentifySupportVisitor` and `SupportConfig` are rendered inside `SupportProvider`, and keep `<Support />` mounted somewhere in that tree.

## Need help or spot a typo?

Open an issue in the main repository or start a discussion so we can improve the docs together. Screenshots, reproduction steps, and suggestions are welcome.
