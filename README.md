# Trackdolphin MCP-Server und CLI

Zwei Werkzeuge, eine Quelle: Beide leiten ihre Fähigkeiten aus der OpenAPI-Beschreibung
der Trackdolphin-API ab (`packages/openapi-client`). Ein neuer Endpunkt ist sofort ein
neues Werkzeug bzw. ein neuer Befehl.

| Paket | npm | Doku |
| --- | --- | --- |
| `apps/mcp` | [@trackdolphin/mcp](https://www.npmjs.com/package/@trackdolphin/mcp) | https://trackdolphin.com/docs/mcp |
| `apps/cli` | [@trackdolphin/cli](https://www.npmjs.com/package/@trackdolphin/cli) | https://trackdolphin.com/docs/cli |

```bash
pnpm install
pnpm test
pnpm build
```

Dieses Repo ist eine Momentaufnahme aus dem Trackdolphin-Monorepo; jeder Commit nennt den
Stand, aus dem er stammt. Fehler und Vorschläge gern als Issue hier.

Lizenz: MIT.
