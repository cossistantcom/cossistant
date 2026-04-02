# Fork Changes — Plasma Pandora

Forked from [cossistantcom/cossistant](https://github.com/cossistantcom/cossistant) at tag `upstream-base`.

This file tracks all modifications from the upstream Cossistant codebase to enable future cherry-picking of upstream fixes.

## Branding Changes (cosmetic)

| What              | Before                           | After                        |
| ----------------- | -------------------------------- | ---------------------------- |
| Package scope     | `@cossistant/*`                  | `@plasma/*`                  |
| Root package name | `cossistant`                     | `plasma-pandora`             |
| API key env var   | `NEXT_PUBLIC_COSSISTANT_API_KEY` | `NEXT_PUBLIC_PLASMA_API_KEY` |
| Database name     | `cossistant`                     | `plasma_pandora`             |
| Release binary    | `cossistant-release`             | `plasma-release`             |

Files affected: 51+ (all package.json, tsconfig.json, turbo.json, Dockerfiles, CI workflows, CSS, docs)

## New Packages (additive)

| Package              | Purpose                                                                                | Files   |
| -------------------- | -------------------------------------------------------------------------------------- | ------- |
| `packages/guards/`   | Input/output security guards (injection, PII, credit card, moderation, UAE compliance) | 9 files |
| `packages/channels/` | Multi-channel adapters (Telegram, Discord, Slack, Intercom)                            | 8 files |
| `packages/dossier/`  | Customer dossier system (sanitizer, session opener, writer)                            | 7 files |

## New Apps (additive)

| App                   | Purpose                                                                     | Files    |
| --------------------- | --------------------------------------------------------------------------- | -------- |
| `apps/voice-sidecar/` | Python FastAPI voice pipeline (Deepgram STT, Cartesia TTS, Daily.co WebRTC) | 11 files |

## Infrastructure Extensions (additive)

| File                 | Changes                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `docker-compose.yml` | Added Qdrant (6333), voice-sidecar (8001, opt-in profile), renamed DB |
| `.env.example`       | Extended with 20+ Pandora-specific env vars                           |

## Schema Extensions (additive)

| Table            | File                                  | Purpose                  |
| ---------------- | ------------------------------------- | ------------------------ |
| `dossier`        | `apps/api/src/db/schema/dossier.ts`   | Customer narrative files |
| `audit_log`      | `apps/api/src/db/schema/audit-log.ts` | Append-only audit trail  |
| `waitlist_entry` | `apps/api/src/db/schema/waitlist.ts`  | Prospect tracking        |

Modified: `apps/api/src/db/schema/index.ts` (+3 exports)

## API Extensions (additive)

### REST Routes

| Route            | File                                          | Purpose                                               |
| ---------------- | --------------------------------------------- | ----------------------------------------------------- |
| `/v1/voice/*`    | `apps/api/src/rest/routers/voice.ts`          | Proxy to voice sidecar                                |
| `/v1/channels/*` | `apps/api/src/rest/routers/channels/index.ts` | Channel webhooks (Telegram, Discord, Slack, Intercom) |

Modified: `apps/api/src/rest/routers/index.ts` (+2 route registrations)

### tRPC Routers

| Router         | File                                        | Procedures                                |
| -------------- | ------------------------------------------- | ----------------------------------------- |
| `intelligence` | `apps/api/src/trpc/routers/intelligence.ts` | vipList, digest, triageQueue, userProfile |
| `waitlist`     | `apps/api/src/trpc/routers/waitlist.ts`     | list, create, updateStatus                |

Modified: `apps/api/src/trpc/routers/_app.ts` (+2 router registrations)

## Pipeline Extensions (high conflict risk)

| Directory                                                | Purpose                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/api/src/ai-pipeline/shared/routing/`               | Tiered LLM model router (simple/medium/complex)                        |
| `apps/api/src/ai-pipeline/shared/retrieval/`             | 4-tier retrieval waterfall (exact → cache → vector → RAG → escalation) |
| `apps/api/src/ai-pipeline/shared/prompt/personas/`       | Mura persona system                                                    |
| `apps/api/src/ai-pipeline/shared/prompt/skills/`         | 6 skill-specific prompts + router                                      |
| `apps/api/src/ai-pipeline/shared/prompt/skill-router.ts` | Deterministic skill selection                                          |

## Services (additive)

| Directory                             | Purpose                                        |
| ------------------------------------- | ---------------------------------------------- |
| `apps/api/src/services/intelligence/` | VIP scoring, digest generation, triage queue   |
| `apps/api/src/services/audit/`        | Buffered audit logger with convenience helpers |

## Widget Extensions (additive)

| Directory                   | Purpose                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `packages/react/src/voice/` | VoiceOrb component, useVoiceSession hook, useAudioAnalyser hook |

## Middleware Extensions (additive)

| File                                            | Purpose                                                |
| ----------------------------------------------- | ------------------------------------------------------ |
| `apps/api/src/middleware/channel-rate-limit.ts` | Per-channel rate limiting (text: 10/min, voice: 3/day) |

## Test Infrastructure (additive)

| Directory                                   | Purpose                                          |
| ------------------------------------------- | ------------------------------------------------ |
| `apps/api/src/test-support/golden-dataset/` | 20-entry golden dataset + immutable eval harness |

## Cherry-Pick Guide

When pulling upstream Cossistant updates:

1. `git fetch upstream main`
2. `git cherry-pick <commit>` (not full merge)
3. Resolve conflicts — highest risk in `apps/api/src/ai-pipeline/` and `apps/api/src/trpc/routers/_app.ts`
4. Run `grep -r "@cossistant/" --include="*.ts"` to catch any un-renamed imports
5. Run eval harness: `bun run apps/api/src/test-support/golden-dataset/eval-harness.ts`
