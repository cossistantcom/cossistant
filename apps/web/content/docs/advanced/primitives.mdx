---
title: Primitives
description: Headless building blocks for teams that want to build their own support UI.
search:
  kind: component
  tags:
    - headless
    - composition
    - ui-primitives
    - advanced
  aliases:
    - Primitives.Trigger
    - Primitives.Window
    - Primitives.Avatar
    - Primitives.ConversationTimeline
---

This page is for the full-custom path. If you want the ready-made widget, stay in [`<Support />`](/docs/support-component). If you want to build your own support UI, these primitives are the building blocks underneath it.

Templates with full examples are coming soon. If you want to start today, use the [support source](https://github.com/cossistantcom/cossistant/tree/main/packages/react/src/support) as your base and pull in the primitives you need.

Primitives are headless UI pieces. Inside the widget runtime they can read
provider state, but outside that runtime you should pass explicit state,
handlers, and data.

## Use this page when

- `Support` and `slots` are no longer enough
- you want to own the support shell, layout, and interaction model
- you want reusable building blocks instead of copying a monolithic widget

## Import

Access primitives through the `Primitives` namespace:

```tsx
import { Primitives } from "@cossistant/react";
```

## Smallest working example

```tsx
import { Primitives } from "@cossistant/react";
import { useState } from "react";

function CustomWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Primitives.Trigger
        isOpen={isOpen}
        isTyping={false}
        onToggleOpen={() => setIsOpen((value) => !value)}
        unreadCount={0}
      >
        {({ isOpen }) => (
          <span>{isOpen ? "Close support" : "Open support"}</span>
        )}
      </Primitives.Trigger>

      {isOpen ? (
        <div className="fixed bottom-20 right-4 w-96 border bg-white shadow-xl">
          <button onClick={() => setIsOpen(false)} type="button">
            Close
          </button>
          <p>Custom support content</p>
        </div>
      ) : null}
    </>
  );
}
```

`Primitives.Trigger` is provider-free when you pass `isOpen`, `onToggleOpen`,
`unreadCount`, and optional `isTyping`. `Primitives.Window` is designed for the
widget runtime and should stay inside `SupportProvider` or `Support.Root`.

```tsx
import { Primitives, useSupportConfig } from "@cossistant/react";

function RuntimeWindow() {
  const { isOpen } = useSupportConfig();

  return (
    <Primitives.Window>
      {({ close }) =>
        isOpen ? (
          <div className="fixed bottom-20 right-4 w-96 border bg-white shadow-xl">
            <button onClick={close} type="button">
              Close
            </button>
            <p>Custom support content</p>
          </div>
        ) : null
      }
    </Primitives.Window>
  );
}
```

## Common building blocks

### Shell and routing

- `Primitives.Trigger`
- `Primitives.Window`
- `Primitives.Router`
- `Primitives.Config`

### Conversation UI

- `Primitives.ConversationTimeline`
- `Primitives.TimelineItem`
- `Primitives.TimelineItemGroup`
- `Primitives.ToolActivityRow`

### Input and feedback

- `Primitives.MultimodalInput`
- `Primitives.FileInput`
- `Primitives.FeedbackCommentInput`
- `Primitives.FeedbackRatingSelector`
- `Primitives.FeedbackTopicSelect`

### Shared display pieces

- `Primitives.Avatar`
- `Primitives.DaySeparator`
- `Primitives.TypingIndicator`
- `Primitives.Button`

## When to stop here

- the headless build is working and you only need hooks or shared types next
- you still want Cossistant state, navigation, and message APIs under your own UI

## Next step

- [Advanced](/docs/advanced) for the full-custom path and source-code starting point
- [Hooks Reference](/docs/support-component/hooks) for state, visitor, and navigation control
- [Types Reference](/docs/support-component/types) for the shared data models behind the primitives
