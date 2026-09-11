import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  VERSION,
  createTrackdolphinServer,
  loadAccessScope,
  loadSpec,
  toolsFromOpenApi,
  werkzeugeFuerZugang,
  zugangsHinweis,
} from "./core.ts";

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
// Was dieser Schlüssel darf — beim Start einmal gefragt. Daraus entstehen der
// Zugangssatz in `instructions` und, bei reinem Lesezugang, die Liste ohne
// schreibende Werkzeuge (siehe zugang.ts in @trackdolphin/openapi-client).
const zugang = await loadAccessScope(spec, BASE_URL, TOKEN);
// Auth-Endpunkte (Passwort-Reset, SSO, E-Mail-Bestätigung) und alles, was
// eine Anmeldung im Dashboard oder Staff verlangt, bleiben außen vor — ein
// API-Schlüssel kann sie nie aufrufen (apiKeyOnly, x-trackdolphin-requires).
const tools = werkzeugeFuerZugang(toolsFromOpenApi(spec, { apiKeyOnly: true }), zugang.scope);

const server = createTrackdolphinServer({
  spec,
  tools,
  token: TOKEN,
  baseUrl: BASE_URL,
  instructions: zugangsHinweis(zugang.scope, zugang.fehler),
});

await server.connect(new StdioServerTransport());
process.stderr.write(
  `Trackdolphin MCP ${VERSION} bereit — ${tools.length} Werkzeuge von ${BASE_URL}; ` +
  `Zugang: ${zugang.scope?.stufe ?? `unbekannt (${zugang.fehler})`}\n`,
);
