---
description: Configure MCPBox servers, logging, tool filtering, and environment variable substitution.
---

# Configuration

MCPBox looks for `mcpbox.json` in the current working directory by default. To use a different path:

```bash
mcpbox --config /path/to/config.json
```

For a complete annotated example, see [`mcpbox.example.jsonc`](https://github.com/kandobyte/mcpbox/blob/main/mcpbox.example.jsonc). For API key and OAuth setup, see [Authentication](./authentication).

## Environment variable substitution

All string values in the config support `${VAR_NAME}` substitution. Variables are resolved from the process environment at startup. MCPBox will fail to start if a referenced variable is not set.

```json
{
  "mcpServers": {
    "github": {
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

## Server

```json
{
  "server": {
    "port": 8080
  }
}
```

| Field | Type | Description |
|---|---|---|
| `port` | `number` | HTTP port to listen on. Defaults to `8080`. |

## Logging

```json
{
  "log": {
    "level": "info",
    "format": "pretty",
    "redactSecrets": true,
    "mcpDebug": false
  }
}
```

| Field | Type | Description |
|---|---|---|
| `level` | `string` | `debug`, `info`, `warn`, `error`. Defaults to `"info"`. |
| `format` | `string` | `pretty` or `json`. Defaults to `"pretty"`. |
| `redactSecrets` | `boolean` | Redact sensitive values (tokens, secrets) in log output. Defaults to `true`. |
| `mcpDebug` | `boolean` | Pipe stderr from spawned MCP servers to MCPBox logs. May expose sensitive environment variables. Defaults to `false`. |

## MCP servers

Each key in `mcpServers` defines a stdio MCP server to spawn. The key becomes a namespace prefix — tools from the `github` server appear as `github__list_issues`, `github__create_issue`, etc. This prevents collisions when multiple servers expose tools with the same name.

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `command` | `string` | Required. Command to spawn the MCP server. |
| `args` | `string[]` | Arguments passed to the command. |
| `env` | `object` | Environment variables for the server process. Supports `${VAR}` substitution. |
| `tools` | `string[]` | Whitelist of tool names to expose. Omit to expose all. |

### Tool filtering

By default, all tools from a server are exposed. Use `tools` to limit which ones are available. This reduces the context sent to the AI and restricts what it can do with that server.

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "tools": ["list_issues", "create_issue", "get_pull_request"]
    }
  }
}
```
