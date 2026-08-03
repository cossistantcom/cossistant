# Cossistant React SDK

Build a ready-to-use support widget in React with good defaults, fast styling,
and a composable API when you need to go further.

## Install

```bash
bun add @cossistant/react
```

## Import styles

Use one stylesheet at your app root:

```tsx
import "@cossistant/react/styles.css";
```

Or, if your app already uses Tailwind CSS v4:

```tsx
import "@cossistant/react/support.css";
```

## Quickstart

Use the drop-in widget when you want Cossistant to own the runtime: client
lifecycle, visitor context, websocket state, routing, open state, slots, and
localization.

```tsx
import { LazySupport } from "@cossistant/react/lazy-support";
import { SupportProvider } from "@cossistant/react/provider";
import "@cossistant/react/styles.css";
import { Suspense } from "react";

export function App() {
  return (
    <SupportProvider publicKey="pk_live_...">
      <Suspense fallback={null}>
        <LazySupport />
      </Suspense>
    </SupportProvider>
  );
}
```

`LazySupport` code-splits the batteries-included widget. It ships with the
default trigger, router, home page, conversation page, timeline, composer, and
styling hooks while keeping that UI out of the initial application chunk. Use
`Support` from `@cossistant/react/support` when an eager component or compound
subcomponents such as `Support.Trigger` are required.

## Headless Primitives

Use hooks and primitives directly when you want to own the UI state and pass an
explicit client. This does not require wrapping that subtree in
`SupportProvider`.

```tsx
import { CossistantClient } from "@cossistant/core";
import { SupportTrigger } from "@cossistant/react/primitives/trigger";
import { useSubmitFeedback } from "@cossistant/react/hooks/use-submit-feedback";
import { useState } from "react";

const client = new CossistantClient({ publicKey: "pk_live_..." });

export function CustomFeedbackButton() {
  const [open, setOpen] = useState(false);
  const feedback = useSubmitFeedback({ client });

  return (
    <div>
      <SupportTrigger
        className="rounded-md bg-black px-3 py-2 text-white"
        isOpen={open}
        onToggleOpen={() => setOpen((value) => !value)}
        unreadCount={0}
      >
        {({ isOpen }) => (isOpen ? "Close" : "Send feedback")}
      </SupportTrigger>

      {open ? (
        <button
          onClick={() =>
            feedback.mutate({
              rating: 5,
              source: "headless",
              visitorId: "visitor_123",
            })
          }
          type="button"
        >
          Send rating
        </button>
      ) : null}
    </div>
  );
}
```

Provider-optional hooks include `useSubmitFeedback`, `useSendMessage`,
`useCreateConversation`, `useFileUpload`, and `useFeedbackForm`. If `client` is
omitted they fall back to `SupportProvider`; if no client is available they fail
with a clear missing-client error.

## Feedback Quickstart

Use `Feedback` when you want a lightweight rating/comment widget backed by the
same visitor context.

```tsx
import { Feedback, SupportProvider } from "@cossistant/react";
import "@cossistant/react/styles.css";

export function App() {
  return (
    <SupportProvider publicKey="pk_live_...">
      <Feedback topics={["Bug", "Feature request", "UX", "Other"]} />
    </SupportProvider>
  );
}
```

`Feedback` supports the same controlled open pattern as the support widget:

```tsx
import { Feedback } from "@cossistant/react/feedback";
import { useState } from "react";

export function ControlledFeedback() {
  const [open, setOpen] = useState(false);

  return (
    <Feedback.Root open={open} onOpenChange={setOpen}>
      <Feedback.Trigger asChild>
        <button type="button">Feedback?</button>
      </Feedback.Trigger>

      <Feedback.Content side="bottom" align="end">
        <div className="p-4">Build any feedback UI here.</div>
      </Feedback.Content>
    </Feedback.Root>
  );
}
```

## Support Styling Hooks

Start with:

- `classNames.trigger`
- `classNames.content`
- `slotProps`

The default support widget also exposes stable DOM hooks:

- `data-slot`
- `data-state`
- `data-page`
- `data-support-mode`

## Feedback Styling Hooks

Start with:

- `classNames.trigger`
- `classNames.content`

The default feedback widget also exposes stable DOM hooks:

- `data-slot`
- `data-state`
- `data-feedback-*`

Common slots include `feedback-root`, `feedback-trigger`, `feedback-content`,
`feedback-panel`, `feedback-form`, `feedback-rating-field`, and
`feedback-submit`.

## Swap One Part with `slots`

Use `slots` when you want better DX than rebuilding the whole widget tree.

```tsx
import {
  Support,
  type SupportHomePageSlotProps,
  type SupportTriggerSlotProps,
} from "@cossistant/react";
import * as React from "react";

function mergeClassNames(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const CustomBubble = React.forwardRef<
  HTMLButtonElement,
  SupportTriggerSlotProps
>(function CustomBubble({ isOpen, unreadCount, toggle, className, ...props }, ref) {
  return (
    <button
      {...props}
      className={mergeClassNames("fixed right-4 bottom-4 z-[9999]", className)}
      onClick={toggle}
      ref={ref}
      type="button"
    >
      {isOpen ? "Close" : "Need help?"} ({unreadCount})
    </button>
  );
});

function CustomHomePage({
  quickOptions,
  startConversation,
}: SupportHomePageSlotProps) {
  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <h2 className="text-2xl font-semibold">Real support, instantly.</h2>
      {quickOptions.map((option) => (
        <button
          key={option}
          onClick={() => startConversation(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

<Support
  slots={{
    trigger: CustomBubble,
    homePage: CustomHomePage,
  }}
  slotProps={{
    content: {
      className: "rounded-3xl border shadow-2xl",
    },
  }}
/>;
```

## Full Composition with `Support.Root`

Use `Support.Root` when you want a custom shell, explicit page registration, or
inline placement. In this mode, you own the trigger layout classes.

```tsx
import { Support } from "@cossistant/react";

function LaunchChecklistPage() {
  return <div className="p-6">Your custom home page</div>;
}

export function App() {
  return (
    <Support.Root open>
      <Support.Trigger asChild>
        <button className="fixed right-4 bottom-4 z-[9999]" type="button">
          Compose support
        </button>
      </Support.Trigger>

      <Support.Content className="rounded-3xl border shadow-2xl">
        <Support.Router>
          <Support.Page component={LaunchChecklistPage} name="HOME" />
        </Support.Router>
      </Support.Content>
    </Support.Root>
  );
}
```

## More Docs

- [React Support docs](https://cossistant.com/docs/support-component)
- [Customization guide](https://cossistant.com/docs/support-component/customization)
- [Routing guide](https://cossistant.com/docs/support-component/routing)
