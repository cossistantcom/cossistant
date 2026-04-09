---
title: Email Setup
description: Choose and configure the transactional email provider Cossistant uses for outbound mail, replies, and lifecycle events.
---

Start with the [Self-Host overview](/docs/self-host) if you want the broader architecture first, and pair this guide with [Storage](/docs/self-host/storage) so uploads and email are configured together.

Cossistant supports both `resend` and `ses` as transactional email transports. That choice is controlled by `EMAIL_TRANSPORT_PROVIDER`.

This page is intentionally provider-neutral at the top level because email is a responsibility, not a vendor. The app renders emails the same way either way: React Email still produces the content, and the provider choice only changes the transport and inbound plumbing around it.

## Choose your provider

Both providers are supported and both can live cleanly in the codebase today.

- `resend` is the default and is a good fit if you want the simplest hosted email path
- `ses` is the AWS-native option and is a good fit if you want the email infrastructure in your own AWS account

The main transport switch is:

```bash title=".env"
EMAIL_TRANSPORT_PROVIDER=resend
```

or:

```bash title=".env"
EMAIL_TRANSPORT_PROVIDER=ses
```

<Callout type="info">
  `EMAIL_TRANSPORT_PROVIDER` controls transactional outbound mail and the active
  reply domain for newly sent emails. It does not automatically replace every
  Resend-specific helper in the codebase, such as audience and contact helpers.
</Callout>

## Current capability comparison

Here is the practical difference between the two transports in the current implementation:

- both support transactional sending through the same app mail API
- both work with `EMAIL_TRANSPORT_PROVIDER`
- both coexist with provider-aware reply routing for new mail
- inbound reply parsing accepts both the Resend and SES inbound domains, which makes overlap possible
- Resend still owns its own audience and contact helpers outside the transport switch
- SES currently does not support scheduled sends or provider tags in this rollout

## How email works in Cossistant

No matter which provider you choose, the shape of the app flow stays the same:

1. React Email renders the outbound message inside the app.
2. `EMAIL_TRANSPORT_PROVIDER` selects the active transport for new sends.
3. New reply-to addresses are generated from the inbound domain for the active provider.
4. Inbound replies and lifecycle events are normalized back into the API.
5. The API turns those events into conversation messages, delivery tracking, and suppression updates.

That means Resend and SES can coexist during migration or overlap periods:

- new outbound mail follows the active provider
- old Resend reply chains can keep working through the Resend inbound path
- SES can be enabled and verified before you flip the transport flag

## Shared email environment

These env vars matter no matter which provider you choose:

```bash title=".env"
EMAIL_TRANSPORT_PROVIDER=resend
EMAIL_NOTIFICATION_FROM=support@example.com
EMAIL_MARKETING_FROM=hello@example.com
EMAIL_RESEND_INBOUND_DOMAIN=inbound.example.com
EMAIL_SES_INBOUND_DOMAIN=ses-inbound.example.com
```

What they control:

- `EMAIL_TRANSPORT_PROVIDER`: selects the active transactional transport for new outbound mail
- `EMAIL_NOTIFICATION_FROM`: sender address for notification-style email
- `EMAIL_MARKETING_FROM`: sender address for marketing-style email
- `EMAIL_RESEND_INBOUND_DOMAIN`: the inbound reply domain used by the Resend path
- `EMAIL_SES_INBOUND_DOMAIN`: the inbound reply domain used by the SES path

Even if you only plan to use one provider, it is useful to understand both domains because inbound parsing accepts both and overlap is a supported state.

## Resend setup

Resend is the default transport in the app today. It is a good choice if you want a simple hosted provider without adding SES infrastructure right away.

### What to configure

Set the Resend-specific env vars:

```bash title=".env"
EMAIL_TRANSPORT_PROVIDER=resend
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
EMAIL_RESEND_INBOUND_DOMAIN=inbound.example.com
EMAIL_NOTIFICATION_FROM=support@example.com
EMAIL_MARKETING_FROM=hello@example.com
```

### What the app expects from Resend

For the Resend path, Cossistant expects:

- a valid API key for outbound transactional sends
- a verified sender domain for the `from` addresses you use
- an inbound domain for reply handling
- webhook delivery back into the existing Resend webhook routes

### Webhook expectations

The legacy Resend path stays in place specifically so it can continue handling:

- replies to older Resend-sent threads
- Resend lifecycle events during overlap periods

If you keep Resend active while evaluating SES, do not remove the Resend inbound setup yet.

## SES setup

SES is the AWS-native option and the recommended path if you want the full email stack to live in your own AWS account.

### Why choose SES

SES is a strong fit for self-hosting because it gives Cossistant the full set of building blocks it needs:

- transactional outbound sending
- inbound reply handling
- delivery, bounce, complaint, and failure events
- infrastructure that runs in your AWS account instead of a separate email SaaS

### Recommended setup path

The SES module lives in `infra/aws/ses-email-setup`.

It provisions:

- SES identities and configuration
- an inbound reply domain
- an S3 bucket for raw inbound mail
- SNS and SQS plumbing
- small TypeScript Lambda bridge functions
- IAM credentials for outbound SES sending

### Step 1: Fill the Terraform variables

Move into the module:

```bash
cd infra/aws/ses-email-setup
```

Copy the example vars file:

```bash
cp terraform.tfvars.example terraform.dev.tfvars
```

Then fill in the environment-specific values:

```hcl title="terraform.dev.tfvars"
aws_region           = "us-east-1"
environment          = "dev"
sender_domain        = "example.com"
inbound_domain       = "ses-inbound.example.com"
inbound_bucket_name  = "cossistant-dev-ses-example"
api_webhook_base_url = "https://api.example.com"
ses_webhook_secret   = "replace-me"
route53_zone_id      = "Z1234567890"
```

### Step 2: Install dependencies and deploy

The module builds the bridge lambdas from the monorepo with `bun build`, so make sure dependencies are installed at the repo root:

```bash
bun install
```

Then initialize and apply:

```bash
terraform init
terraform apply -var-file="terraform.dev.tfvars"
```

### Step 3: Confirm DNS and SES identity health

Do not move on until the sender identity and inbound domain are healthy.

If you use Route53 automation, Terraform can create the records for you. Otherwise, you need to add the outputs manually.

At minimum, verify:

- the SES sender verification record
- DKIM records
- MAIL FROM records
- the inbound MX record for your SES reply domain

### Step 4: Configure the SES runtime environment

Set the SES-specific env vars:

```bash title=".env"
EMAIL_TRANSPORT_PROVIDER=resend
EMAIL_NOTIFICATION_FROM=support@example.com
EMAIL_MARKETING_FROM=hello@example.com
EMAIL_RESEND_INBOUND_DOMAIN=inbound.example.com
EMAIL_SES_INBOUND_DOMAIN=ses-inbound.example.com
SES_REGION=us-east-1
SES_ACCESS_KEY_ID=AKIA...
SES_SECRET_ACCESS_KEY=...
SES_CONFIGURATION_SET=cossistant-email-dev
SES_WEBHOOK_SECRET=replace-me
```

SES-specific meanings:

- `EMAIL_SES_INBOUND_DOMAIN`: the inbound reply domain owned by SES
- `SES_REGION`: the AWS region used for outbound SES
- `SES_ACCESS_KEY_ID` and `SES_SECRET_ACCESS_KEY`: credentials used for outbound sends
- `SES_CONFIGURATION_SET`: the SES configuration set created by Terraform
- `SES_WEBHOOK_SECRET`: the shared secret used to sign the bridge webhook requests

### Step 5: Understand the webhook bridge

The SES path uses small serverless bridge functions that normalize inbound mail and lifecycle events before they hit the API.

Those bridges post back to:

- `/ses/webhooks/inbound`
- `/ses/webhooks/events`

Requests include these headers:

- `x-cossistant-timestamp`
- `x-cossistant-signature`
- `x-cossistant-event`

The signature is an HMAC-SHA256 over:

```text
<timestamp>.<raw-json-body>
```

You do not need to build this yourself if you use the Terraform module, but it is useful to know when debugging webhook traffic.

### Step 6: Roll SES out safely

The clean rollout path is:

1. Leave `EMAIL_TRANSPORT_PROVIDER=resend` first.
2. Deploy the SES infrastructure and verify DNS and identities.
3. Confirm the SES webhook endpoints are reachable from your public API host.
4. Test staging with outbound email, inbound replies, and lifecycle events.
5. Flip `EMAIL_TRANSPORT_PROVIDER=ses` only after SES is healthy.
6. Keep the Resend inbound path active during the overlap window so older reply chains still work.

If you are doing a greenfield SES-only deployment, you can switch directly to `ses` once the identities, webhooks, and inbound flow are fully verified.

## Verification checklist

No matter which provider you choose, make sure all of these work:

- a transactional email sends successfully
- the sender domain is verified and accepted by the provider
- replies land back in the correct conversation
- lifecycle events reach the API and update delivery or suppression state correctly

For SES specifically, also confirm:

- `/ses/webhooks/inbound` is receiving normalized bridge payloads
- `/ses/webhooks/events` is receiving delivery, bounce, complaint, and failure events
- older Resend reply chains still work if you are migrating gradually

## When to pick which provider

Choose `resend` if you want:

- the quickest setup path
- a fully hosted email transport
- to stay aligned with the default app configuration

Choose `ses` if you want:

- the email stack in your own AWS account
- one more self-hostable piece of infrastructure
- inbound replies and lifecycle events without leaning on a separate email SaaS long term

If you are unsure, start with Resend, keep the shared email env clean, and add SES when you are ready to own the infrastructure yourself.
