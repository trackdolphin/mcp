# @trackdolphin/cli

**Trackdolphin on the command line — every API endpoint is a command.**

[Trackdolphin](https://trackdolphin.com) is server-side conversion tracking for
WooCommerce, Shopware, Shopify and custom frontends. This package gives you the
whole API as a CLI: check tracking health in CI, pull KPIs into a script, start
an import without opening the dashboard.

- 📚 Docs: <https://trackdolphin.com/docs/cli>
- 🌍 Website: <https://trackdolphin.com>
- 🤖 MCP server for AI agents: [`@trackdolphin/mcp`](https://www.npmjs.com/package/@trackdolphin/mcp)
- 📦 Browser & server SDK: [`@trackdolphin/sdk`](https://www.npmjs.com/package/@trackdolphin/sdk)

## Quick start

```bash
export TRACKDOLPHIN_TOKEN=td_live_…      # Dashboard → Settings → API

npx @trackdolphin/cli shops               # list your shops
npx @trackdolphin/cli tracking-health shop_meinshop_de_ab12cd
npx @trackdolphin/cli kpis shop_meinshop_de_ab12cd --from 2026-09-01
npx @trackdolphin/cli --help              # every command, generated
```

Install it globally if you use it often:

```bash
npm install -g @trackdolphin/cli
trackdolphin shops
```

## Use it in CI

`tracking-health` exits non-zero when delivery to an ad platform is broken, so a
silent tracking outage fails the build instead of going unnoticed for weeks:

```yaml
- name: Tracking still healthy?
  run: npx @trackdolphin/cli tracking-health ${{ vars.TD_SHOP_ID }}
  env:
    TRACKDOLPHIN_TOKEN: ${{ secrets.TRACKDOLPHIN_TOKEN }}
```

Output is JSON, so `jq` works as you would expect:

```bash
npx @trackdolphin/cli kpis "$SHOP" | jq '.purchases, .revenue'
```

## How it works

The command list is not maintained by hand. It is derived from the OpenAPI
description of the Trackdolphin API — today that is **more than 50 operations**
across shops, tracking health, KPIs, daily events, channels, pages, funnel,
event types, onboarding, connections, cohorts, imports and API keys. A new
endpoint is a new command the same day.

## Configuration

| Variable | Meaning | Default |
| --- | --- | --- |
| `TRACKDOLPHIN_TOKEN` | API token from **Settings → API**. Required. | — |
| `TRACKDOLPHIN_URL` | Point at another instance. | `https://api.trackdolphin.com` |

## Requirements

Node.js 22 or newer.

## Support

Issues and pull requests: <https://github.com/trackdolphin/mcp>.
This repository is a snapshot of the Trackdolphin monorepo; every commit names
the revision it came from.

License: MIT.

---

## Auf Deutsch

Trackdolphin auf der Kommandozeile. Die Befehle werden nicht gepflegt, sondern
aus der OpenAPI-Beschreibung der API abgeleitet: Ein neuer Endpunkt ist sofort
ein neuer Befehl.

Nützlich vor allem in der Pipeline: `tracking-health` endet mit einem
Fehlercode, wenn die Zustellung an eine Werbeplattform klemmt. Ein
Tracking-Ausfall ist still — der Shop verkauft weiter, die Seite lädt, nur die
Messung ist tot. So fällt er beim Bauen auf statt Wochen später.

Deutsche Dokumentation: <https://trackdolphin.com/docs/cli>
