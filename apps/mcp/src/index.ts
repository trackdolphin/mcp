import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTrackdolphinServer, loadSpec, toolsFromOpenApi } from "./core.ts";

/**
 * MCP-Server für Trackdolphin — stdio-Weg.
 *
 * Er hält keine eigene Logik: Er lädt beim Start die OpenAPI-Beschreibung des
 * Backends und macht daraus Werkzeuge. Neue Endpunkte stehen dem Modell damit
 * ohne Änderung hier zur Verfügung — und es gibt keine zweite Liste, die
 * veralten kann. Die eigentliche Übersetzung Werkzeug → Backend-Anfrage steckt
 * in ./core.ts, geteilt mit dem HTTP-Weg (./http.ts).
 */

const BASE_URL = (process.env.TRACKDOLPHIN_URL ?? "https://api.trackdolphin.com").replace(/\/+$/, "");
const TOKEN = process.env.TRACKDOLPHIN_TOKEN ?? "";

if (!TOKEN) {
  // Nach stderr, nicht stdout: Über stdout läuft das MCP-Protokoll, und eine
  // Textzeile darin macht die Verbindung unbrauchbar.
  process.stderr.write(
    "TRACKDOLPHIN_TOKEN fehlt. Token im Dashboard unter Einstellungen → API erzeugen.\n",
  );
  process.exit(1);
}

const spec = await loadSpec(BASE_URL);
// Auth-Endpunkte (Passwort-Reset, SSO, E-Mail-Bestätigung, Einladungen)
// bleiben außen vor — siehe isAuthOperation in @trackdolphin/openapi-client.
const tools = toolsFromOpenApi(spec);

const server = createTrackdolphinServer({ spec, tools, token: TOKEN, baseUrl: BASE_URL });

await server.connect(new StdioServerTransport());
process.stderr.write(`Trackdolphin MCP bereit — ${tools.length} Werkzeuge von ${BASE_URL}\n`);
