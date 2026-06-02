---
title: Next.js
description: Install and launch the Cossistant support widget in Next.js.
---

If you are contributing to the Cossistant repo itself, start with the [Contributor Setup Guide](/docs/others/contributors) so you boot the full monorepo and local services, not just the widget in an existing app.

## Quick start with shadcn registry

```bash
bunx --bun shadcn@latest add cossistantcom/cossistant/support
```

The registry installs a Next.js-ready `<Support />` starter, the `CossistantProvider`, the required dependencies, the widget CSS import, and a `NEXT_PUBLIC_COSSISTANT_API_KEY` placeholder.

### 1. Add your public API key

```bash title=".env.local"
NEXT_PUBLIC_COSSISTANT_API_KEY=pk_test_xxxx
```

### 2. Mount `CossistantProvider`

```tsx title="app/layout.tsx"
import { CossistantProvider } from "@/components/cossistant/provider";

import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <CossistantProvider>{children}</CossistantProvider>
      </body>
    </html>
  );
}
```

### 3. Render `<Support />`

```tsx title="app/page.tsx"
import { Support } from "@/components/cossistant/support";

export default function Page() {
  return (
    <main>
      <h1>You are ready to chat</h1>
      <Support />
    </main>
  );
}
```

## Quick start with AI prompt

<QuickstartAIPrompt framework="nextjs" />

## Manual package install

### 1. Install the package

```bash
npm install @cossistant/next
```

### 2. Add your public API key

```bash title=".env.local"
NEXT_PUBLIC_COSSISTANT_API_KEY=pk_test_xxxx
```

### 3. Add `SupportProvider`

```tsx title="app/layout.tsx"
import { SupportProvider } from "@cossistant/next";

import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SupportProvider>{children}</SupportProvider>
      </body>
    </html>
  );
}
```

### 4. Import styles

The widget does not inject styles automatically. Use `support.css` when your app already runs Tailwind CSS v4. Use `styles.css` everywhere else.
Both entrypoints share the same widget theme behavior. If your app already exposes standard shadcn-style tokens, the widget will usually pick up colors, radius, fonts, and dark mode automatically. No extra theme mapping is needed to start.

<Tabs defaultValue="tailwind" className="mt-6">
  <TabsList>
    <TabsTrigger value="tailwind">Tailwind v4</TabsTrigger>
    <TabsTrigger value="plain">Plain CSS</TabsTrigger>
  </TabsList>
  <TabsContent value="tailwind">

```css title="app/globals.css"
@import "tailwindcss";

@import "@cossistant/next/support.css";
```

  </TabsContent>
  <TabsContent value="plain">

```tsx title="app/layout.tsx"
import { SupportProvider } from "@cossistant/next";
import "@cossistant/next/styles.css";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SupportProvider>{children}</SupportProvider>
      </body>
    </html>
  );
}
```

  </TabsContent>
</Tabs>

### 5. Render the widget

```tsx title="app/page.tsx"
import { Support } from "@cossistant/next";

export default function Page() {
  return (
    <main>
      <h1>You are ready to chat</h1>
      <Support />
    </main>
  );
}
```

### 6. Identify logged-in visitors (optional)

```tsx title="app/(app)/layout.tsx"
import { IdentifySupportVisitor } from "@cossistant/next";

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
      {children}
    </>
  );
}
```

### 7. Display custom messages with `SupportConfig defaultMessages`

```tsx title="app/page.tsx"
import { Support, SupportConfig } from "@cossistant/next";
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

export default function Page() {
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
