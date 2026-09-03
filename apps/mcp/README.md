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

## Configuration

| Variable | Meaning | Default |
| --- | --- | --- |
| `TRACKDOLPHIN_TOKEN` | API token from **Settings → API**. Required. | — |
| `TRACKDOLPHIN_URL` | Point at another instance. | `https://api.trackdolphin.com` |

## Requirements

Node.js 22 or newer. The server speaks stdio only, so it needs a client on the
other end — running it in a container without one closes the input immediately.

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
