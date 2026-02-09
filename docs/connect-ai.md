---
description: Connect Claude Web, Claude Code, and other MCP clients to MCPBox.
---

# Connect AI

Any MCP client that supports Streamable HTTP can connect to MCPBox. How you connect depends on your [authentication](./authentication) setup.

## With dynamic registration (OAuth)

Most MCP clients support dynamic registration:

```json
{
  "mcpServers": {
    "mcpbox": {
      "type": "http",
      "url": "https://your-mcpbox-url.com"
    }
  }
}
```

When prompted, sign in with your configured identity provider:

<img src="/login.png" alt="MCPBox login screen" width="360">

| Client | How to connect |
|---|---|
| Claude Web & Mobile | [Add a Custom Connector](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp) with your MCPBox URL |
| Claude Code | `claude mcp add --transport http mcpbox https://your-mcpbox-url.com` |

## With API key

Pass the key in the `Authorization` header:

```json
{
  "mcpServers": {
    "mcpbox": {
      "type": "http",
      "url": "https://your-mcpbox-url.com",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

| Client | How to connect |
|---|---|
| Claude Code | `claude mcp add --transport http mcpbox https://your-mcpbox-url.com --header "Authorization: Bearer YOUR_API_KEY"` |
