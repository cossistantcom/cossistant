---
title: React
description: Install and launch the Cossistant support widget in React.
---

## Quick start with shadcn registry

```bash
bunx --bun shadcn@latest add cossistantcom/cossistant/support-react
```

The registry installs a React-ready `<Support />` starter, the `CossistantProvider`, the required dependencies, the widget CSS import, and a `VITE_COSSISTANT_API_KEY` placeholder.

### 1. Add your public API key

```bash title=".env"
VITE_COSSISTANT_API_KEY=pk_test_xxxx
```

### 2. Mount `CossistantProvider`

```tsx title="src/main.tsx"
import React from "react";
import ReactDOM from "react-dom/client";
import { CossistantProvider } from "@/components/cossistant/provider";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CossistantProvider>
      <App />
    </CossistantProvider>
  </React.StrictMode>,
);
```

### 3. Render `<Support />`

```tsx title="src/App.tsx"
import { Support } from "@/components/cossistant/support";

export default function App() {
  return (
    <main>
      <h1>You are ready to chat</h1>
      <Support />
    </main>
  );
}
```

## Quick start with AI prompt

<QuickstartAIPrompt framework="react" />

## Manual package install

### 1. Install the package

```bash
npm install @cossistant/react
```

### 2. Add your public API key

<Tabs defaultValue="vite" className="mt-6">
  <TabsList>
    <TabsTrigger value="vite">Vite</TabsTrigger>
    <TabsTrigger value="nextjs">Next.js</TabsTrigger>
    <TabsTrigger value="other">Other</TabsTrigger>
  </TabsList>
  <TabsContent value="vite">

```bash title=".env"
VITE_COSSISTANT_API_KEY=pk_test_xxxx
```

  </TabsContent>
  <TabsContent value="nextjs">

```bash title=".env.local"
NEXT_PUBLIC_COSSISTANT_API_KEY=pk_test_xxxx
```

  </TabsContent>
  <TabsContent value="other">

For other frameworks (CRA, Remix, etc.), either set the env variable:

```bash title=".env"
COSSISTANT_API_KEY=pk_test_xxxx
```

Or pass the key directly via the `publicKey` prop:

```tsx
<SupportProvider publicKey="pk_test_xxxx">
```

  </TabsContent>
</Tabs>

<Alert variant="info" className="mt-6">
  <Icon name="help" className="size-4" />
  <AlertTitle>Auto-detection</AlertTitle>
  <AlertDescription>
    The SDK automatically detects your framework and reads the right
    environment variable (`VITE_COSSISTANT_API_KEY`, `NEXT_PUBLIC_COSSISTANT_API_KEY`,
    or `COSSISTANT_API_KEY`). You can also pass the key explicitly through `publicKey`.
  </AlertDescription>
</Alert>

### 3. Add `SupportProvider`

```tsx title="src/main.tsx"
import React from "react";
import ReactDOM from "react-dom/client";
import { SupportProvider } from "@cossistant/react";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SupportProvider>
      <App />
    </SupportProvider>
  </React.StrictMode>,
);
```

<Alert variant="info" className="mt-6">
  <Icon name="help" className="size-4" />
  <AlertTitle>Passing the key explicitly</AlertTitle>
  <AlertDescription>
    If your framework does not support automatic env variable detection,
    pass `publicKey` directly:
    `<SupportProvider publicKey={import.meta.env.VITE_COSSISTANT_API_KEY}>`.
  </AlertDescription>
</Alert>

### 4. Import styles

The widget does not inject styles automatically. Import one CSS entrypoint at the app root.
Use `support.css` when your app already runs Tailwind CSS v4. Use `styles.css` everywhere else.
Both entrypoints share the same widget theme behavior. If your app already exposes standard shadcn-style tokens, the widget will usually pick up colors, radius, fonts, and dark mode automatically. No extra theme mapping is needed to start.

<Tabs defaultValue="plain" className="mt-6">
  <TabsList>
    <TabsTrigger value="plain">Plain CSS</TabsTrigger>
    <TabsTrigger value="tailwind">Tailwind v4</TabsTrigger>
  </TabsList>
  <TabsContent value="plain">

```tsx title="src/main.tsx"
import React from "react";
import ReactDOM from "react-dom/client";
import { SupportProvider } from "@cossistant/react";
import "@cossistant/react/styles.css";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SupportProvider>
      <App />
    </SupportProvider>
  </React.StrictMode>,
);
```

  </TabsContent>
  <TabsContent value="tailwind">

```css title="src/index.css"
@import "tailwindcss";

@import "@cossistant/react/support.css";
```

  </TabsContent>
</Tabs>

### 5. Render the widget

```tsx title="src/App.tsx"
import { Support } from "@cossistant/react";

export default function App() {
  return (
    <main>
      <h1>You are ready to chat</h1>
      <Support />
    </main>
  );
}
```

### 6. Identify logged-in visitors (optional)

```tsx title="src/App.tsx"
import { IdentifySupportVisitor, Support } from "@cossistant/react";

export default function App() {
  const user = {
    id: "user_123",
    email: "jane@acme.com",
    name: "Jane Doe",
  };

  return (
    <>
      <IdentifySupportVisitor
        externalId={user.id}
        email={user.email}
        name={user.name}
      />
      <Support />
    </>
  );
}
```

### 7. Display custom messages with `SupportConfig defaultMessages`

```tsx title="src/App.tsx"
import { Support, SupportConfig } from "@cossistant/react";
import { type DefaultMessage, SenderType } from "@cossistant/types";

const user: { name: string | null } = {
  name: "Jane Doe",
};

const defaultMessages: DefaultMessage[] = [
  {
    content: `Hi ${user.name ?? "there"}, anything I can help with?`,
    senderType: SenderType.TEAM_MEMBER,
  },
];

const quickOptions: string[] = ["How to identify a visitor?"];

export default function App() {
  return (
    <>
      <SupportConfig
        defaultMessages={defaultMessages}
        quickOptions={quickOptions}
      />
      <Support />
    </>
  );
}
```

## Next in the Support docs

1. [Overview](/docs/support-component) for the fastest path from first render to production-ready widget.
2. [Change One Thing](/docs/support-component/customization) to swap the bubble or first screen without rebuilding the widget.
3. [Match Your Brand](/docs/support-component/theme) to set colors, radius, and dark mode.
