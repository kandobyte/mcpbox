# Authentication

Omit the `auth` section entirely to run without authentication. Otherwise, choose [API Key](#api-key) or [OAuth](#oauth).

---

## API Key

Single shared secret — simplest setup.

```jsonc
{
  "auth": {
    "type": "apikey",
    "apiKey": "${MCPBOX_API_KEY}"
  }
}
```

Clients authenticate with `Authorization: Bearer <key>`. The key must be 16-128 characters (`[A-Za-z0-9_-]+`).

---

## OAuth

MCPBox is its own OAuth authorization server, supporting Authorization Code (user login) and Client Credentials (machine-to-machine) flows. MCP clients discover it via standard metadata endpoints. Use local users defined in config, or GitHub as an external identity provider.

```jsonc
{
  "auth": {
    "type": "oauth",
    "issuer": "https://mcp.example.com",
    "identityProviders": [
      { "type": "local", "users": [{ "username": "${MCPBOX_USER}", "password": "${MCPBOX_PASSWORD}" }] }
    ],
    "dynamicRegistration": true
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `issuer` | `string` (URL) | `http://localhost:{port}` | Public URL of the server. Set this for remote access. |
| `identityProviders` | `array` | `[]` | [Identity providers](#identity-providers) for user login |
| `clients` | `array` | `[]` | [Pre-registered clients](#clients) |
| `dynamicRegistration` | `boolean` | `false` | Allow clients to self-register via `/register` ([RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591)). Requires at least one identity provider. |

### Identity Providers

#### Local

Define usernames and passwords directly in config.

```jsonc
{
  "type": "local",
  "users": [
    { "username": "admin", "password": "${MCPBOX_PASSWORD}" }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `users` | `array` | At least one user required |
| `users[].username` | `string` | Username |
| `users[].password` | `string` | Plain text or bcrypt hash (`$2a$`, `$2b$`, `$2y$` prefix) |

#### GitHub

Authenticate users through GitHub OAuth. Optionally restrict access to specific orgs or usernames.

```jsonc
{
  "type": "github",
  "clientId": "${GITHUB_OAUTH_CLIENT_ID}",
  "clientSecret": "${GITHUB_OAUTH_CLIENT_SECRET}",
  "allowedOrgs": ["my-company"],
  "allowedUsers": ["octocat"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `clientId` | `string` | Yes | GitHub OAuth App Client ID |
| `clientSecret` | `string` | Yes | GitHub OAuth App Client Secret |
| `allowedOrgs` | `string[]` | No | Restrict to members of these orgs (case-insensitive) |
| `allowedUsers` | `string[]` | No | Restrict to these usernames (case-insensitive) |

If neither `allowedOrgs` nor `allowedUsers` is set, any GitHub user can log in.

**Setup:** Create a GitHub OAuth App at `https://github.com/settings/developers` and set the callback URL to `{issuer}/callback/github`.

### Clients

Pre-register clients for fixed client IDs or machine-to-machine access. Most user-facing MCP clients support dynamic registration — enable `dynamicRegistration` instead of pre-registering each one.

```jsonc
{
  "clients": [
    {
      "clientId": "web-app",
      "redirectUris": ["https://app.example.com/callback"],
      "grantType": "authorization_code"
    },
    {
      "clientId": "backend-service",
      "clientSecret": "${M2M_SECRET}",
      "grantType": "client_credentials"
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `clientId` | `string` | Yes | Unique client identifier |
| `clientName` | `string` | No | Human-readable display name |
| `clientSecret` | `string` | No | Client secret |
| `redirectUris` | `string[]` | No | Allowed redirect URIs (exact match) |
| `grantType` | `string` | Yes | `"authorization_code"` or `"client_credentials"` |

| Grant Type | Requires | Use Case |
|---|---|---|
| `authorization_code` | `redirectUris`, identity providers configured | User-facing apps — users log in via an identity provider |
| `client_credentials` | `clientSecret` | Machine-to-machine access, no user context |

---

## Storage

Persistence for tokens and dynamically registered clients. Only applies when using OAuth.

```jsonc
{
  "storage": { "type": "sqlite", "path": "./data/mcpbox.db" }
}
```

| Type | Description |
|---|---|
| `memory` | Default. In-memory, lost on restart. Fine for development. |
| `sqlite` | Persistent. `path` defaults to `./data/mcpbox.db`. Recommended for production. |
