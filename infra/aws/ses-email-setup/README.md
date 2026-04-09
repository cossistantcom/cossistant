# Cossistant SES Hybrid Email Infrastructure

This Terraform module provisions the AWS side of the SES rollout that stays behind `EMAIL_TRANSPORT_PROVIDER`.

It creates:

- SES sending identity, DKIM, and optional MAIL FROM records
- SES configuration set with SNS lifecycle event publishing
- SES inbound receipt rule set that stores raw emails in S3
- SNS and SQS fanout for inbound mail and lifecycle events
- Two Node 20 Lambda bridge functions compiled from infra-local TypeScript
- An IAM user and access key for the app to send mail through SES

## What This Enables

- Outbound mail through Amazon SES while keeping React Email rendering in-app
- Inbound replies through a dedicated SES domain such as `ses-inbound.example.com`
- Bounce, complaint, and failure events delivered back to the API through signed webhooks
- Clean parallel operation with Resend still alive for old threads

## Quick Start

1. Move into the module:

   ```bash
   cd infra/aws/ses-email-setup
   ```

2. Copy the example vars file:

   ```bash
   cp terraform.tfvars.example terraform.dev.tfvars
   ```

3. Fill in:

   - `sender_domain`, usually your root domain such as `example.com`
   - `inbound_domain`
   - `inbound_bucket_name`
   - `api_webhook_base_url`
   - `ses_webhook_secret`
   - `route53_zone_id` if the domain is hosted in Route53

4. Install repo dependencies from the monorepo root so `bun build` can bundle the Lambda source:

   ```bash
   bun install
   ```

5. Initialize and apply:

   ```bash
   terraform init
   terraform apply -var-file="terraform.dev.tfvars"
   ```

Terraform compiles the TypeScript handlers under `lambda-src/`, bundles them with `bun build`, and zips the generated `.mjs` artifacts before creating the Lambda functions.

## DNS Behavior

- If `route53_zone_id` is set and `create_route53_records=true`, Terraform creates the records for you.
- Otherwise Terraform outputs the exact DNS records you need to add manually.

The important records are:

- SES sender verification TXT
- DKIM CNAME records
- MAIL FROM MX and SPF TXT
- Inbound MX record for the SES reply domain

## API Contract

The Lambda adapters sign requests with:

- `x-cossistant-timestamp`
- `x-cossistant-signature`
- `x-cossistant-event`

The signature format is `sha256=<hex>` over:

```text
<timestamp>.<raw-json-body>
```

Point `api_webhook_base_url` at the API host that serves:

- `/ses/webhooks/inbound`
- `/ses/webhooks/events`

## Suggested App Env

Terraform outputs a sensitive `runtime_env` map with the values needed for the SES path, including:

- `EMAIL_TRANSPORT_PROVIDER`
- `EMAIL_RESEND_INBOUND_DOMAIN`
- `EMAIL_SES_INBOUND_DOMAIN`
- `SES_REGION`
- `SES_ACCESS_KEY_ID`
- `SES_SECRET_ACCESS_KEY`
- `SES_CONFIGURATION_SET`
- `SES_WEBHOOK_SECRET`

## Rollout Notes

- Keep `EMAIL_TRANSPORT_PROVIDER=resend` until the SES webhooks and inbound flow are verified.
- Once SES is healthy in staging, flip the single provider flag there first.
- Keep the Resend inbound webhook active in production after the SES flip so replies to older Resend-sent threads still land correctly.
