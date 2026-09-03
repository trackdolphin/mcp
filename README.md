# Trackdolphin MCP server & CLI

**Server-side conversion tracking, as tools for your AI agent and as commands for your shell.**

[Trackdolphin](https://trackdolphin.com) sends purchases and leads server-to-server to Google Ads,
Meta, LinkedIn, TikTok, Pinterest and Microsoft Ads — deduplicated, consent-aware, hosted in the EU.
This repository holds the two ways to drive it from outside the dashboard.

| Package | npm | Docs | What it is |
| --- | --- | --- | --- |
| `apps/mcp` | [@trackdolphin/mcp](https://www.npmjs.com/package/@trackdolphin/mcp) | [docs/mcp](https://trackdolphin.com/docs/mcp) | MCP server: every API endpoint becomes a tool for Claude, Cursor and friends |
| `apps/cli` | [@trackdolphin/cli](https://www.npmjs.com/package/@trackdolphin/cli) | [docs/cli](https://trackdolphin.com/docs/cli) | Command line: every API endpoint becomes a command |

Looking for the browser and server SDK instead? That is
[@trackdolphin/sdk](https://www.npmjs.com/package/@trackdolphin/sdk) in
[trackdolphin/sdk](https://github.com/trackdolphin/sdk).

## Try it in one minute

```bash
export TRACKDOLPHIN_TOKEN=td_live_…   # Dashboard → Settings → API
npx @trackdolphin/cli shops
npx @trackdolphin/cli tracking-health shop_meinshop_de_ab12cd
```

For the MCP server, point your client at it:

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

## One source, two tools

Neither package maintains a hand-written list of what it can do. Both derive their
capabilities from the OpenAPI description of the Trackdolphin API
(`packages/openapi-client`): a new endpoint is a new tool and a new command the same
day. That is what API-first buys you — no second list that quietly goes stale.

## Development

```bash
pnpm install
pnpm test
pnpm build
```

Node.js 22 or newer.

## About this repository

This is a snapshot of the Trackdolphin monorepo; each commit names the revision it
came from. Issues and pull requests are welcome here — they are carried back by hand.

License: MIT.

---

## Auf Deutsch

Zwei Werkzeuge, eine Quelle: Der MCP-Server und die Kommandozeile leiten ihre
Fähigkeiten aus der OpenAPI-Beschreibung der Trackdolphin-API ab. Ein neuer Endpunkt
ist sofort ein neues Werkzeug und ein neuer Befehl.

Deutsche Dokumentation: <https://trackdolphin.com/docs/mcp> und
<https://trackdolphin.com/docs/cli>.
