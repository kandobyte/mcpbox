---
description: Set up API key or OAuth authentication for MCPBox, including local users, GitHub identity providers, and client registration.
---

# Authentication

Omit the `auth` section entirely to run without authentication. Otherwise, choose [API Key](#api-key) or [OAuth](#oauth).

## API Key

```json
{
  "auth": {
    "type": "apikey",
    "apiKey": "${MCPBOX_API_KEY}"
  }
}
```

Clients authenticate with `Authorization: Bearer <key>`. The key must be 16-128 characters (`[A-Za-z0-9_-]+`).

## OAuth

MCPBox is its own OAuth 2.1 authorization server, supporting Authorization Code (user login) and Client Credentials (machine-to-machine) flows. MCP clients discover it via standard metadata endpoints. Use local users defined in config, or GitHub as an external identity provider.

```json
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

| Field | Type | Description |
|---|---|---|
| `issuer` | `string` | Public URL of the server. Set this for remote access. Defaults to `http://localhost:{port}`. |
| `identityProviders` | `array` | [Identity providers](#identity-providers) for user login. |
| `clients` | `array` | [Pre-registered clients](#clients). |
| `dynamicRegistration` | `boolean` | Allow clients to self-register via `/register` ([RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591)). Requires at least one identity provider. Defaults to `false`. |

### Identity Providers

#### Local

Define usernames and passwords directly in config.

```json
{
  "type": "local",
  "users": [
    { "username": "user1", "password": "${MCPBOX_PASSWORD}" }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `users` | `array` | Required. At least one user. |
| `users[].username` | `string` | Required. Username. |
| `users[].password` | `string` | Required. Plain text or bcrypt hash (`$2a$`, `$2b$`, `$2y$` prefix). |

#### GitHub

Authenticate users through GitHub OAuth. Optionally restrict access to specific orgs or usernames.

```json
{
  "type": "github",
  "clientId": "${GITHUB_OAUTH_CLIENT_ID}",
  "clientSecret": "${GITHUB_OAUTH_CLIENT_SECRET}",
  "allowedOrgs": ["my-company"],
  "allowedUsers": ["octocat"]
}
```

| Field | Type | Description |
|---|---|---|
| `clientId` | `string` | Required. GitHub OAuth App Client ID. |
| `clientSecret` | `string` | Required. GitHub OAuth App Client Secret. |
| `allowedOrgs` | `string[]` | Restrict to members of these orgs (case-insensitive). |
| `allowedUsers` | `string[]` | Restrict to these usernames (case-insensitive). |

If neither `allowedOrgs` nor `allowedUsers` is set, any GitHub user can log in.

**Setup:** Create a GitHub OAuth App at `https://github.com/settings/developers` and set the callback URL to `{issuer}/callback/github`.

### Clients

Pre-register clients for fixed client IDs or machine-to-machine access. Most user-facing MCP clients support dynamic registration — enable `dynamicRegistration` instead of pre-registering each one.

```json
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

| Field | Type | Description |
|---|---|---|
| `clientId` | `string` | Required. Unique client identifier. |
| `clientName` | `string` | Human-readable display name. |
| `clientSecret` | `string` | Client secret. Required for `client_credentials`. |
| `redirectUris` | `string[]` | Allowed redirect URIs (exact match). Required for `authorization_code`. |
| `grantType` | `string` | Required. `"authorization_code"` or `"client_credentials"`. |

## Storage

Persistence for tokens and dynamically registered clients. Only applies when using OAuth.

```json
{
  "storage": { "type": "sqlite", "path": "./data/mcpbox.db" }
}
```

| Field | Type | Description |
|---|---|---|
| `type` | `string` | `"memory"` (in-memory, lost on restart) or `"sqlite"` (persistent). Defaults to `"memory"`. |
| `path` | `string` | SQLite database path. Only applies when `type` is `"sqlite"`. Defaults to `"./data/mcpbox.db"`. |
