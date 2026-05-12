---
title: Visitors
description: Anonymous users automatically tracked across your application.
---

## What are Visitors?

**Visitors** are automatically created when someone loads your application with the Cossistant SDK. They represent anonymous users before they're identified as [contacts](/docs/concepts/contacts).

Every visitor is unique per device/browser, persisting across page loads and sessions.

## How Visitors are Tracked

Cossistant uses a combination of techniques to maintain visitor identity:

- **LocalStorage**: Stores a unique visitor ID in the browser
- **Fingerprinting**: Browser and device characteristics for additional persistence
- **Automatic creation**: No setup required—visitors are created on first load

This means a visitor on desktop and the same person on mobile will be two different visitors until they're [identified](/docs/concepts/contacts).

## Anonymous by Default

Visitors start anonymous with no personal information:

- No name, email, or external ID
- Only browser-derived data (language, timezone)
- Can start [conversations](/docs/concepts/conversations) without authentication
- Perfect for public-facing pages or logged-out users

## Visitor Properties

Each visitor has:

- **id**: Unique identifier for this visitor
- **language**: Browser language (e.g., "en-US")
- **timezone**: Browser timezone (e.g., "America/New_York")
- **isBlocked**: Whether this visitor has been blocked from support
- **contact**: The associated contact (null until identified)

## Identifying Visitors

Transform anonymous visitors into identified [contacts](/docs/concepts/contacts) when users authenticate:

### Using the Component (Server Components)

```tsx showLineNumbers title="app/dashboard/layout.tsx"
import { IdentifySupportVisitor } from "@cossistant/next";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function DashboardLayout({ children }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <div>
      {session?.user && (
        <IdentifySupportVisitor
          externalId={session.user.id}
          email={session.user.email}
          name={session.user.name}
        />
      )}
      {children}
    </div>
  );
}
```

### Using the Hook (Client Components)

```tsx showLineNumbers title="components/auth-handler.tsx"
"use client";

import { useVisitor } from "@cossistant/next";
import { useEffect } from "react";

export function AuthHandler({ user }) {
  const { visitor, identify } = useVisitor();

  useEffect(() => {
    if (user && !visitor?.contact) {
      identify({
        externalId: user.id,
        email: user.email,
        name: user.name,
      });
    }
  }, [user, visitor?.contact, identify]);

  return null;
}
```

Once identified, all conversations and data are linked to the [contact](/docs/concepts/contacts), even across different devices.

Use a stable `externalId` from your own user records as the restore key. When the same user logs in after a reinstall, storage loss, or on another device, identifying with that `externalId` gives the new visitor access to the contact's existing conversation history. You do not need to store Cossistant's visitor ID for logged-in users.

## Learn More

- **[Contacts](/docs/concepts/contacts)**: Identified visitors with metadata and cross-device support
- **[IdentifySupportVisitor](/docs/support-component#identifying-visitors)**: Component for visitor identification
- **[useVisitor](/docs/support-component/hooks#usevisitor)**: Hook for programmatic visitor control
