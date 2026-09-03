# @trackdolphin/mcp

MCP-Server für Trackdolphin. Er hält keine eigene Logik: Beim Start lädt er die
OpenAPI-Beschreibung der API und macht aus jedem Endpunkt ein Werkzeug. Damit
kann ein Agent fragen „läuft das Tracking bei meinshop.de sauber?“ und bekommt
eine Antwort aus echten Zahlen.

Konfiguration für Claude Desktop, Cursor und andere MCP-Clients:

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

Den Schlüssel erzeugst du im Dashboard unter Einstellungen → API. Ein Schlüssel
gilt für eine Organisation und ihre Shops.

Dokumentation: https://trackdolphin.com/docs/mcp
