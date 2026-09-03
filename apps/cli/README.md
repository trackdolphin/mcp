# @trackdolphin/cli

Trackdolphin auf der Kommandozeile. Die Befehle werden nicht gepflegt, sondern
aus der OpenAPI-Beschreibung der API abgeleitet: Ein neuer Endpunkt ist sofort
ein neuer Befehl.

```bash
export TRACKDOLPHIN_TOKEN=td_live_…   # Dashboard → Einstellungen → API
npx @trackdolphin/cli shops
npx @trackdolphin/cli tracking-health shop_meinshop_de_ab12cd
npx @trackdolphin/cli kpis shop_meinshop_de_ab12cd
npx @trackdolphin/cli --help
```

`TRACKDOLPHIN_URL` zeigt auf eine andere Instanz (Standard: https://api.trackdolphin.com).

Dokumentation: https://trackdolphin.com/docs/cli
