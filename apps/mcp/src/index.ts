import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { toolsFromOpenApi, buildRequest, type OpenApiDocument } from "@trackdolphin/openapi-client";

/**
 * MCP-Server für Trackdolphin.
 *
 * Er hält keine eigene Logik: Er lädt beim Start die OpenAPI-Beschreibung des
 * Backends und macht daraus Werkzeuge. Neue Endpunkte stehen dem Modell damit
 * ohne Änderung hier zur Verfügung — und es gibt keine zweite Liste, die
 * veralten kann.
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

async function loadSpec(): Promise<OpenApiDocument> {
  const res = await fetch(`${BASE_URL}/api/openapi.json`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(
      `Die API-Beschreibung war nicht abrufbar (HTTP ${res.status}). ` +
      `Stimmt TRACKDOLPHIN_URL? Aktuell: ${BASE_URL}`,
    );
  }
  return (await res.json()) as OpenApiDocument;
}

const spec = await loadSpec();
const tools = toolsFromOpenApi(spec);

const server = new Server(
  { name: "trackdolphin", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const prepared = buildRequest(spec, name, (args ?? {}) as Record<string, unknown>, BASE_URL);

    const res = await fetch(prepared.url, {
      method: prepared.method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/json",
        ...(prepared.body ? { "Content-Type": "application/json" } : {}),
      },
      body: prepared.body,
      signal: AbortSignal.timeout(60_000),
    });

    const text = await res.text();

    if (!res.ok) {
      // Den Fehler des Backends durchreichen statt zu verschlucken: Es
      // formuliert bereits in ganzen Sätzen („Für diesen Shop sind keine
      // Zugangsdaten hinterlegt.“), und das Modell kann dem Nutzer dann sagen,
      // was zu tun ist.
      return {
        isError: true,
        content: [{ type: "text" as const, text: `HTTP ${res.status}: ${text.slice(0, 2000)}` }],
      };
    }

    return { content: [{ type: "text" as const, text }] };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
    };
  }
});

await server.connect(new StdioServerTransport());
process.stderr.write(`Trackdolphin MCP bereit — ${tools.length} Werkzeuge von ${BASE_URL}\n`);
