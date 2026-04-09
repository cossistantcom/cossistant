---
title: Storage
description: Configure the object storage Cossistant needs for uploads, public asset reads, and optional CDN-backed delivery.
---

Start with the [Self-Host overview](/docs/self-host) if you want the bigger picture first, then come back here to configure storage. Once uploads are working, finish your infrastructure setup with [Email Setup](/docs/self-host/email-setup).

Cossistant needs object storage for user uploads, brand assets, and conversation attachments. For self-hosted deployments, the recommended path is Amazon S3 because the repo already includes a Terraform module that matches how the app generates upload URLs today.

## Why Cossistant needs storage

The app is built around direct browser uploads rather than proxying large files through the API server.

That gives you a few practical advantages:

- uploads go straight from the browser to object storage through presigned URLs
- the API only signs the upload request instead of buffering file contents itself
- uploaded assets can be read back through stable public URLs
- you can add a CDN later without changing the application-level upload flow

## How Cossistant uses storage internally

At runtime, the upload flow looks like this:

1. A client asks the API for a signed upload URL.
2. The API creates a presigned `PUT` for the configured bucket.
3. The client uploads the file directly to object storage.
4. The API returns a public URL that the app stores and renders later.

Uploads are not written into a flat bucket namespace. Keys are scoped by the tenant and feature area so the data stays organized by organization, website, and entity. Depending on the feature, that entity can be a conversation, visitor, user, or contact.

Example key shapes look like:

```text
<organizationId>/<websiteId>/<conversationId>/attachment.png
<organizationId>/<websiteId>/<userId>/avatar.png
cdn/<organizationId>/<websiteId>/<visitorId>/image.jpg
```

The exact suffixes vary, but the important part is that storage is tenancy-aware and feature-aware.

## Recommended setup path

The AWS-first storage module lives in `infra/aws/s3-public-setup`.

It creates:

- an S3 bucket for uploaded files
- public read access to exact object URLs
- CORS rules for direct browser uploads
- an IAM user that the API can use to generate presigned upload URLs

<Callout type="warning">
  This setup allows public reads to exact object URLs. It does not allow bucket
  listing, but you should still treat uploaded asset URLs as publicly reachable
  unless you add stricter delivery controls on top.
</Callout>

## Step 1: Deploy the storage module

Move into the Terraform module:

```bash
cd infra/aws/s3-public-setup
```

Copy the example vars file:

```bash
cp terraform.tfvars.example terraform.dev.tfvars
```

Set a globally unique bucket name and the region you want to use:

```hcl title="terraform.dev.tfvars"
bucket_name = "cossistant-dev-your-unique-suffix"
environment = "dev"
aws_region  = "us-east-1"
```

Initialize Terraform:

```bash
terraform init
```

Create or select a workspace, then apply:

```bash
terraform workspace new dev
terraform workspace select dev
terraform apply -var-file="terraform.dev.tfvars"
```

Repeat the same pattern for production with a production bucket name and workspace.

## Step 2: Collect the values the app needs

After `terraform apply`, record:

- the bucket name
- the AWS region
- the IAM access key ID
- the IAM secret access key

Those values are what the API uses when it generates presigned upload URLs.

## Step 3: Configure the runtime environment

For the standard AWS path, set these env vars in the API runtime:

```bash title=".env"
S3_BUCKET_NAME=cossistant-dev-your-unique-suffix
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_BASE_URL=https://cossistant-dev-your-unique-suffix.s3.us-east-1.amazonaws.com
S3_CDN_BASE_URL=
```

What each one does:

- `S3_BUCKET_NAME`: the bucket that receives uploads
- `S3_REGION`: the AWS region for that bucket
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`: credentials the API uses to sign uploads
- `S3_PUBLIC_BASE_URL`: the read base URL when you are serving files directly from S3
- `S3_CDN_BASE_URL`: an optional CDN base URL if you later put CloudFront or another CDN in front of reads

If you are not using a CDN yet, leave `S3_CDN_BASE_URL` empty.

## Step 4: Restart the API and verify uploads

Restart the API so it picks up the new storage config, then verify the full flow:

1. Generate a presigned upload URL from the app.
2. Upload a file from the browser.
3. Open the returned public URL directly.
4. Confirm the asset renders correctly where it was uploaded.

A good verification pass includes:

- profile avatar uploads
- website branding uploads
- conversation attachment uploads

## Advanced note: S3-compatible storage

The documented path is AWS-first, but the runtime also supports S3-compatible providers.

If you intentionally use another S3-compatible service, the extra settings are:

```bash title=".env"
S3_ENDPOINT=https://your-object-store.example.com
S3_FORCE_PATH_STYLE=true
```

Treat that as an advanced option. The Terraform module in this repo provisions AWS S3, not third-party object storage.

## Verification checklist

Before you consider storage finished, confirm all of the following:

- a presigned upload URL can be generated successfully
- a browser upload completes without CORS errors
- the returned public URL resolves correctly
- uploaded files render in the dashboard where you expect them
- the configured `S3_PUBLIC_BASE_URL` or `S3_CDN_BASE_URL` matches the URLs the app stores

## Common issues

- `403` during upload: the signing credentials or bucket permissions are wrong
- browser CORS failure: the bucket CORS rules were not applied or are too restrictive
- upload succeeds but the public URL fails: `S3_PUBLIC_BASE_URL` is wrong or missing
- URLs work directly but not in-app: confirm the stored `publicUrl` matches the configured base URL
