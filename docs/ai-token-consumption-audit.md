# AI Token Consumption Audit

Date: 2026-05-25

## Summary

Primary answer generation had several avoidable cost drivers: the saved output-token cap was not passed into the agent call, the credit guard existed but was not wired before generation, knowledge search returned large raw article bodies, and the generation window kept more history/tool entries than most support replies need.

This pass implements the low-risk controls directly: primary generation now enforces `maxOutputTokens`, runs the credit guard before expensive generation, clips knowledge-base search results to four 1,200-character snippets, and trims the primary generation window.

## Findings

- **P0: Primary max output cap was ignored.** The agent settings UI stored `maxOutputTokens`, but `ToolLoopAgent` was called without it. This allowed models to generate more output than the configured cap.
- **P0: Credit guard was not wired into primary generation.** `guardAiCreditRun` existed, but primary runs could reach the model before checking minimum available credits.
- **P0: Knowledge search returned large content bodies.** `searchKnowledgeBase` returned up to five full article bodies into the model context. This is now clipped to four results and 1,200 characters per result.
- **P1: Generation history was broad.** Primary generation kept up to 50 messages, 10 post-trigger messages, and 12 tool entries. These limits are now reduced to 40, 6, and 8.
- **P1: Prompt sections repeat behavior and safety rules.** Core prompt docs, runtime instructions, and tool skills repeat some grounding and tool-use policies. A later prompt compaction pass should dedupe those rules while preserving the reply contract.
- **P1: Background model calls need central billing review.** Title review, background analysis, and knowledge-gap review have their own token controls, but they should be audited separately for centralized metering and clearer per-phase usage telemetry.

## Implemented Controls

- Model-aware AI Thinking pricing and capability metadata.
- Default-off `aiThinkingEnabled` behavior setting.
- Provider reasoning only for supported primary answer models.
- Private `aiThinkingTrace` dev log with 4,000-character truncation and basic secret redaction.
- `thinkingCredits` and optional `reasoningTokens` in usage payloads.
- Primary credit guard before generation.
- Primary max output token enforcement.
- Knowledge search result clipping.
- Conservative generation history cap reductions.

## Follow-Ups

- Add prompt compaction for repeated safety/grounding/tool rules.
- Add per-phase billing and dashboards for background title review, background analysis, and knowledge-gap review.
- Add aggregate reporting for average input tokens, output tokens, reasoning tokens, and KB payload size by model.
