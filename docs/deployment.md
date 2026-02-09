---
description: Deploy MCPBox remotely with cloudflared or behind a reverse proxy.
---

# Deployment

MCPBox doesn't handle TLS — terminate it at a reverse proxy. For [OAuth](./authentication#oauth), set `issuer` to your public URL and use `sqlite` [storage](./authentication#storage) for persistence.

::: info
MCPBox is single-instance only — don't run multiple instances behind a load balancer.
:::

## Quick remote access

[cloudflared](https://github.com/cloudflare/cloudflared) gives you a public HTTPS URL with no account required:

```bash
cloudflared tunnel --url http://localhost:8080
```

Set the generated URL as your `issuer`:

```json
{
  "auth": {
    "type": "oauth",
    "issuer": "https://<tunnel-id>.trycloudflare.com",
    "identityProviders": [
      {
        "type": "local",
        "users": [{ "username": "admin", "password": "${MCPBOX_PASSWORD}" }]
      }
    ],
    "dynamicRegistration": true
  },
  "storage": {
    "type": "sqlite",
    "path": "./data/mcpbox.db"
  }
}
```

Run:

```bash
npx mcpbox
```

or

```bash
docker run -v ./mcpbox.json:/config/config.json -v ./data:/data -p 8080:8080 ghcr.io/kandobyte/mcpbox
```

The URL changes each time you restart cloudflared. For a stable URL, create a [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).
