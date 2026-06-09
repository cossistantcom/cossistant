---
title: MCP
description: Connect AI agents to your Cossistant support context with the hosted MCP server.
---

Connect MCP-capable AI clients to Cossistant so agents can read the support context your signed-in teammate can already access.

Endpoint:

```txt
https://api.cossistant.com/mcp
```

The hosted MCP server uses remote HTTP MCP with OAuth. Your client will open a browser login flow when authentication is needed. Do not paste a Cossistant API key, bearer token, or client secret into your MCP config.

Access is scoped to your Cossistant account. Agents can only read websites and support data available to the teammate who signs in.

## Install

### Cursor

Create or update `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` for a global setup:

```json title=".cursor/mcp.json"
{
  "mcpServers": {
    "cossistant": {
      "url": "https://api.cossistant.com/mcp"
    }
  }
}
```

Restart Cursor or reload MCP after saving the file. When Cursor asks for authentication, complete the browser login flow.

### Claude Code

```bash
claude mcp add --transport http cossistant https://api.cossistant.com/mcp
```

Then open Claude Code and run:

```txt
/mcp
```

Use the MCP status view to authenticate with Cossistant in your browser.

### OpenCode

Add Cossistant to `opencode.json`:

```json title="opencode.json"
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "cossistant": {
      "type": "remote",
      "url": "https://api.cossistant.com/mcp",
      "enabled": true
    }
  }
}
```

Restart OpenCode or reload MCP so it discovers the new server.

### Manual

For clients that accept an `mcpServers` object, use:

```json title="mcp.json"
{
  "mcpServers": {
    "cossistant": {
      "type": "http",
      "url": "https://api.cossistant.com/mcp"
    }
  }
}
```

Some clients call remote HTTP transport `streamable-http`. Keep the same URL if your client uses that name.

## What agents can do

The first Cossistant MCP tools are read-only:

| Tool | Purpose |
| ---- | ------- |
| `cossistant_list_websites` | List websites your signed-in account can access. |
| `cossistant_search_knowledge` | Search indexed support knowledge for a website. |
| `cossistant_list_conversations` | List recent support conversations for a website. |
| `cossistant_get_conversation` | Read context, timeline, and feedback for one conversation. |

Mutation tools like replying, resolving, or changing priority are not exposed yet.

## Try it

Ask your agent:

```txt
List my Cossistant websites.
```

```txt
Search Acme Support knowledge for billing cancellation.
```

```txt
Show recent open conversations for Acme Support.
```

```txt
Open conversation <conversationId> and summarize the latest customer issue.
```

## Troubleshooting

- Reconnect or reload MCP after editing config.
- Use your client's MCP status view to complete OAuth.
- Confirm you are signed in with a Cossistant account that has access to the website.
- Remove any `Authorization` headers if OAuth does not start.
