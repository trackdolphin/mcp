# @trackdolphin/mcp

**Ask your AI agent whether your shop's tracking is actually working — and get an
answer from real numbers.**

[Trackdolphin](https://trackdolphin.com) is server-side conversion tracking for
WooCommerce, Shopware, Shopify and custom frontends. This package is its
[Model Context Protocol](https://modelcontextprotocol.io) server: it turns every
endpoint of the Trackdolphin API into a tool your agent can call.

- 📚 Docs: <https://trackdolphin.com/docs/mcp>
- 🌍 Website: <https://trackdolphin.com>
- 🧰 Command line: [`@trackdolphin/cli`](https://www.npmjs.com/package/@trackdolphin/cli)
- 📦 Browser & server SDK: [`@trackdolphin/sdk`](https://www.npmjs.com/package/@trackdolphin/sdk)

## Quick start

Add this to your MCP client configuration (Claude Desktop, Claude Code, Cursor,
Windsurf, Zed, or anything else that speaks MCP over stdio):

```json
{
  "mcpServers": {
    "trackdolphin": {
      "command": "npx",
      "args": ["-y", "@trackdolphin/mcp"],
      "env": { "TRACKDOLPHIN_TOKEN": "td_live_…" }
    }
  }
}
```

Create the token in the dashboard under **Settings → API**. One token covers one
organisation and all of its shops. Nothing else to install.

## What you can ask

Once connected, these are ordinary questions for your agent:

- *"Is tracking healthy on meinshop.de?"* → checks delivery to every connected ad
  platform and names what is broken.
- *"How many purchases did we send to Google Ads last week, and what did Google
  accept?"* → sent, accepted and rejected side by side.
- *"Which channels convert best this month?"*
- *"Where does the funnel leak between add-to-cart and purchase?"*
- *"Start the historical import for this shop."*

## How it works

The server holds no hand-written tool list. On start it fetches the OpenAPI
description of the Trackdolphin API and derives one tool per operation — today
that is **more than 50 operations**, covering shops, tracking health, KPIs,
daily events, channels, pages, funnel, event types, onboarding, connections,
cohorts, imports and API keys.

That is the point of API-first: a new endpoint is a new tool the same day, with
no second list to keep in sync and no chance of the two drifting apart.

## Access: read or write

On start the server asks the API what its token may do (`getAccessScope`) and
says so in its MCP `instructions`, in one sentence: *"This access may read and
write in organisation X"*, or *"read only"*, or which shared projects are
view-only. A read-only access does not see write tools at all. Tools that no
API token can ever call (creating API keys, inviting team members, billing,
the internal admin console) are left out, so the agent is never offered a
button that always answers 403.

Every tool carries MCP annotations derived from its HTTP method:
`readOnlyHint` for GET, `destructiveHint` for DELETE, `idempotentHint` for
GET/PUT/PATCH/DELETE.

## Configuration

| Variable | Meaning | Default |
| --- | --- | --- |
| `TRACKDOLPHIN_TOKEN` | API token from **Settings → API**. Required. | — |
| `TRACKDOLPHIN_URL` | Point at another instance. | `https://api.trackdolphin.com` |

## Requirements

Node.js 22 or newer. The server speaks stdio only, so it needs a client on the
other end — running it in a container without one closes the input immediately.

## Changelog

### 0.1.4

- **Input schemas are complete.** 0.1.3 showed no body fields for any tool, so
  arrays and booleans reached the API as text (`konten must be an array`).
  Request bodies are now resolved through `$ref`, `allOf`, list items and
  nested objects; `nullable` becomes JSON Schema `type: [..., "null"]`.
  Checked against the production API: 66 of 67 tools with a body complete
  (the last, `saveConsentBanner`, is fixed in the API itself).
- **Knows its access.** `instructions` state whether the token may read or
  write, and where; read-only access hides write tools; tools that need a
  dashboard login or staff rights are no longer listed (needs an API that
  publishes `getAccessScope` and `x-trackdolphin-requires`; older APIs get
  the full list and an honest "access unknown").
- The server reports its real version instead of `0.1.0`.

### 0.1.3

- Tools carry MCP annotations; auth endpoints are not offered as tools.

## Support

Issues and pull requests: <https://github.com/trackdolphin/mcp>.
This repository is a snapshot of the Trackdolphin monorepo; every commit names
the revision it came from.

License: MIT.

---

## Auf Deutsch

Der MCP-Server macht aus jedem Endpunkt der Trackdolphin-API ein Werkzeug für
deinen Agenten. Damit lässt sich fragen „läuft das Tracking bei meinshop.de
sauber?“, und die Antwort kommt aus echten Zahlen statt aus einer Vermutung.

Die Werkzeugliste wird nicht gepflegt, sondern beim Start aus der
OpenAPI-Beschreibung abgeleitet: Ein neuer Endpunkt ist sofort ein neues
Werkzeug. Den API-Schlüssel erzeugst du im Dashboard unter **Einstellungen →
API**; er gilt für eine Organisation und alle ihre Shops.

Deutsche Dokumentation: <https://trackdolphin.com/docs/mcp>
