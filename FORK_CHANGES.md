# Fork Changes — Plasma Pandora

Forked from [cossistantcom/cossistant](https://github.com/cossistantcom/cossistant) at commit `upstream-base`.

This file tracks all modifications from the upstream Cossistant codebase.

## Branding Changes (cosmetic, easy to re-apply)

- `@plasma/*` → `@plasma/*` across all package.json and imports
- `NEXT_PUBLIC_COSSISTANT_API_KEY` → `NEXT_PUBLIC_PLASMA_API_KEY`
- Database name: `cossistant` → `plasma_pandora`

## Infrastructure Extensions (additive)

- docker-compose.yml: Added Qdrant (port 6333) and voice-sidecar (port 8001) services
- .env.example: Extended with Pandora-specific env vars (voice, channels, guards, vector)

## New Packages (additive)

- `packages/guards/` — Input/output security guards (injection, PII, compliance)
- `packages/channels/` — Multi-channel adapters (Telegram, Discord, Slack, Intercom)
- `packages/dossier/` — Customer dossier system

## New Apps (additive)

- `apps/voice-sidecar/` — Python FastAPI voice pipeline (Deepgram STT + Cartesia TTS + Pipecat WebRTC)

## Schema Extensions (additive, low conflict risk)

- `ai_agent.behaviorSettings` — Extended with `tieredRouting` and `persona` fields
- New table: `dossier`
- New table: `audit_log`
- New table: `waitlist_entry`
- New table: `channel_config`

## Pipeline Modifications (high conflict risk)

- `apps/api/src/ai-pipeline/shared/retrieval/` — 4-tier retrieval waterfall
- `apps/api/src/ai-pipeline/shared/routing/` — Tiered LLM model routing
- `apps/api/src/ai-pipeline/shared/prompt/personas/` — Mura persona system
- `apps/api/src/ai-pipeline/shared/prompt/skills/` — Skill-specific prompts
