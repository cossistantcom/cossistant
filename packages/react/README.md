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

```tsx
import { Support, SupportProvider } from "@cossistant/react";
import "@cossistant/react/styles.css";

export function App() {
  return (
    <SupportProvider publicKey="pk_live_...">
      <Support />
    </SupportProvider>
  );
}
```

`Support` is the batteries-included widget. It ships with the default trigger,
router, home page, conversation page, timeline, composer, and styling hooks.

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

## Feedback Primitives with shadcn

Use `useSubmitFeedback` plus the feedback controls when you want to compose the
widget inside your own shadcn popover.

`useSubmitFeedback` is exported from both `@cossistant/react/hooks` and
`@cossistant/react/feedback`. Next.js apps can use the matching
`@cossistant/next/hooks` and `@cossistant/next/feedback` exports.

```tsx
"use client";

import { useSubmitFeedback } from "@cossistant/react/feedback";
import {
  FeedbackCommentInput,
  FeedbackRatingSelector,
  FeedbackTopicSelect,
} from "@cossistant/react/primitives";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const topics = ["Bug", "Feature request", "UX", "Other"];
const feedbackTrigger = "dashboard_topbar";

export function FeedbackPopover() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [topic, setTopic] = useState("");
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const { error, isPending, mutateAsync, reset } = useSubmitFeedback();

  const normalizedTopic = topic.trim();
  const normalizedComment = comment.trim();
  const isTopicMissing = attempted && normalizedTopic.length === 0;
  const isRatingMissing = attempted && rating == null;

  function resetForm() {
    setRating(null);
    setTopic("");
    setComment("");
    setSubmitted(false);
    setAttempted(false);
    reset();
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      resetForm();
    }
  }

  function clearSubmitError() {
    if (error) {
      reset();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    reset();

    if (!(rating && normalizedTopic)) {
      return;
    }

    try {
      await mutateAsync({
        rating,
        topic: normalizedTopic,
        comment: normalizedComment || undefined,
        trigger: feedbackTrigger,
      });
      setSubmitted(true);
    } catch {
      // The hook exposes the error for rendering.
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost">
          Feedback?
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {submitted ? (
          <div className="space-y-3">
            <p className="font-medium text-sm">Thanks for the feedback</p>
            <div className="flex gap-2">
              <Button onClick={resetForm} type="button" variant="secondary">
                Send another
              </Button>
              <Button onClick={() => handleOpenChange(false)} type="button">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="feedback-topic">Topic</Label>
              <FeedbackTopicSelect
                id="feedback-topic"
                disabled={isPending}
                invalid={isTopicMissing}
                onValueChange={(value) => {
                  clearSubmitError();
                  setTopic(value);
                }}
                options={topics}
                value={topic}
              />
              {isTopicMissing ? (
                <p className="text-destructive text-xs" role="alert">
                  Select a topic before sending feedback.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-comment">Comment</Label>
              <FeedbackCommentInput
                disabled={isPending}
                id="feedback-comment"
                onValueChange={(value) => {
                  clearSubmitError();
                  setComment(value);
                }}
                placeholder="What happened?"
                value={comment}
              />
            </div>

            <FeedbackRatingSelector
              disabled={isPending}
              onSelect={(value) => {
                clearSubmitError();
                setRating(value);
              }}
              value={rating}
            />
            {isRatingMissing ? (
              <p className="text-destructive text-xs" role="alert">
                Choose a rating before sending feedback.
              </p>
            ) : null}

            {error ? (
              <p className="text-destructive text-xs" role="alert">
                {error.message}
              </p>
            ) : null}

            <Button disabled={isPending} type="submit">
              {isPending ? "Sending..." : "Send"}
            </Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
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

function CustomBubble({
  isOpen,
  unreadCount,
  toggle,
  className,
  ...props
}: SupportTriggerSlotProps) {
  return (
    <button
      {...props}
      className={className}
      onClick={toggle}
      type="button"
    >
      {isOpen ? "Close" : "Need help?"} ({unreadCount})
    </button>
  );
}

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

Use `Support.Root` when you want a custom shell and explicit page registration.

```tsx
import { Support } from "@cossistant/react";

function LaunchChecklistPage() {
  return <div className="p-6">Your custom home page</div>;
}

export function App() {
  return (
    <Support.Root open>
      <Support.Trigger asChild>
        <button type="button">Compose support</button>
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
