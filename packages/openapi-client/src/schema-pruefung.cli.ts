/**
 * `pnpm --filter @trackdolphin/openapi-client check:schemas <datei.json|url>`
 *
 * Zählt, wie viele Werkzeuge mit Anfragerumpf ein vollständiges
 * Eingabeschema haben, und nennt die übrigen. Ohne Argument gegen die
 * Produktions-API. Endet mit Code 1, wenn eines unvollständig ist.
 */
import { readFileSync } from "node:fs";
import { toolsFromOpenApi, type OpenApiDocument } from "./operations.ts";
import { pruefeEingabeschemas } from "./schema-pruefung.ts";

const quelle = process.argv[2] ?? "https://api.trackdolphin.com/api/openapi.json";
const spec = (quelle.startsWith("http")
  ? await (await fetch(quelle)).json()
  : JSON.parse(readFileSync(quelle, "utf8"))) as OpenApiDocument;

const r = pruefeEingabeschemas(spec);
const mcp = toolsFromOpenApi(spec, { apiKeyOnly: true }).length;
console.log(`Werkzeuge gesamt ${r.werkzeuge} (im MCP für API-Schlüssel ${mcp}), mit Rumpf ${r.mitRumpf}, vollständig ${r.vollstaendig}`);
for (const b of r.befunde) console.log(`  ${b.operationId}: ${b.fehler.join("; ")}`);
process.exit(r.befunde.length ? 1 : 0);
