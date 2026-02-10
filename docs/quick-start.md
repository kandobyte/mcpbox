---
description: Get MCPBox running in under a minute with npx or Docker.
---

# Quick Start

## Create a config file

Create `mcpbox.json` in your working directory:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

## Run

```bash
npx mcpbox
```

*MCP server commands (e.g., `uvx`, `docker`) must be available where MCPBox runs.*

Or with Docker:

```bash
docker run -v ./mcpbox.json:/config/config.json -p 8080:8080 ghcr.io/kandobyte/mcpbox
```

*The Docker image includes Node.js and Python, supporting MCP servers launched via `npx` and `uvx`.*

## Connect a client

MCPBox starts on `http://localhost:8080`. Add it to your MCP client's config:

```json
{
  "mcpServers": {
    "mcpbox": {
      "url": "http://localhost:8080"
    }
  }
}
```

## Next steps

- [Configuration](./configuration) — configure logging, server options, tool filtering
- [Authentication](./authentication) — configure API key or OAuth
- [Deployment](./deployment) — expose remotely with cloudflared or a reverse proxy
- [Connect AI](./connect-ai) — Claude Web, Claude Code, and other clients
