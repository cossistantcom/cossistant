# Changesets Workflow Guide

This guide explains how to use Changesets to manage versions and publish packages to npm.

## Overview

The monorepo uses Changesets to:

- Track changes across multiple packages
- Automatically version packages using semver
- Convert `workspace:*` dependencies to proper semver versions
- Publish packages to npm in the correct dependency order

## Published Packages

The following packages are published to npm:

- `@plasma/types` - Shared TypeScript types
- `@plasma/core` - Core library for API and data fetching
- `@plasma/react` - React SDK with hooks and primitives (depends on core & types)
- `@plasma/next` - Next.js bindings (depends on react)

All packages use **fixed versioning** - they always have the same version number.

## Automated Workflow

### 1. Create a Changeset

When you make changes to any publishable package, create a changeset:

```bash
bun changeset
```

This will:

- Prompt you to select which packages changed
- Ask for the type of change (patch/minor/major)
- Request a summary of the changes
- Create a markdown file in `.changeset/`

### 2. Commit and Push

Commit the generated changeset file with your changes:

```bash
git add .changeset/*.md
git commit -m "feat: add new feature"
git push
```

### 3. Automatic Version PR

When your PR merges to main, the CI will:

1. Detect pending changesets
2. Create or update a "Version Packages" PR
3. Update all package versions and CHANGELOGs

### 4. Publish

When the "Version Packages" PR is merged:

1. Packages are automatically published to npm
2. Git tags are created
3. GitHub releases are generated

## Using the Release CLI

For a more streamlined experience, use the AI-powered release CLI:

```bash
bun release create
```

This tool will guide you through the entire process with AI-generated changelogs.

## Configuration

### `.changeset/config.json`

```json
{
  "changelog": ["@changesets/changelog-github", { "repo": "cossistantcom/cossistant" }],
  "commit": false,
  "fixed": [["@plasma/core", "@plasma/react", "@plasma/types", "@plasma/next"]],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "minor",
  "ignore": ["@plasma/api", "@plasma/web", "@plasma/location", "@plasma/transactional"]
}
```

Key settings:

- `changelog`: Uses GitHub-style changelogs with PR links
- `fixed`: Packages that version together
- `updateInternalDependencies`: Bump internal deps on minor changes
- `ignore`: Packages excluded from versioning

## Troubleshooting

### "workspace:\* dependency not found" after npm install

This means `changeset version` wasn't run before publishing. The CI handles this automatically.

### Publishing fails with "You need to be logged in"

Ensure the `NPM_ACCESS_TOKEN` secret is set in GitHub repository settings.
