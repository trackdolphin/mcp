import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  VERSION,
  createTrackdolphinServer,
  loadAccessScope,
  loadSpec,
  toolsFromOpenApi,
  werkzeugeFuerZugang,
  zugangsHinweis,
  type OpenApiDocument,
  type McpTool,
  type ZugangsStand,
} from "./core.ts";

/**
 * MCP-Server für Trackdolphin — gehosteter Weg über Streamable HTTP.
 *
 * Für Clients, die keinen lokalen Prozess starten wollen (ChatGPT, ein
 * Browser-Agent, ein Server-zu-Server-Aufruf): eine URL statt eines
 * `npx`-Kommandos. Dieselben Werkzeuge, derselbe Kern (./core.ts) wie der
 * stdio-Weg (./index.ts) — nur die Herkunft von Schlüssel und Anfrage
 * unterscheidet sich.
 *
 * Sicherheitsmodell: Dieser Prozess speichert KEINEN Kundenschlüssel. Jede
 * Anfrage bringt ihren eigenen im Authorization-Header mit (denselben
 * `td_live_…`-Schlüssel wie die Kommandozeile), und der Schlüssel lebt nur
 * für die Dauer dieser einen Anfrage im Speicher — er reist bis zum Backend
 * durch und wird danach verworfen, nie geloggt, nie zwischengespeichert. Ein
 * gehosteter Dienst, der Kundenschlüssel selbst hielte, wäre ein eigenes
 * Angriffsziel; das umgeht dieses Modell von vornherein.
 *
 * Deshalb außerdem: eine neue MCP-`Server`- und `Transport`-Instanz PRO
 * ANFRAGE (`sessionIdGenerator: undefined`, „stateless“ laut SDK-Doku — siehe
 * docs/server.md des Pakets, Beispiel `simpleStatelessStreamableHttp.ts`).
 * Ein geteilter Server über mehrere Anfragen hinweg müsste den Schlüssel
 * irgendwo zwischen den Anfragen ablegen; das stateless Modell macht diese
 * Frage gegenstandslos, weil es sie nie stellt. Der Preis: Jede Anfrage lädt
 * keine neue Spec (die ist längst im Speicher, siehe unten), sondern baut
 * nur einen neuen, billigen Server um dieselbe Spec.
 *
 * Die OpenAPI-Beschreibung dagegen ist für alle Kundinnen gleich — sie
 * beschreibt die API, nicht den Zugang — und wird deshalb einmal beim Start
 * geladen und im Speicher gehalten, nicht pro Anfrage neu geholt.
 */

const API_BASE_URL = (process.env.TRACKDOLPHIN_URL ?? "https://api.trackdolphin.com").replace(/\/+$/, "");
// PORT ist der Name, den Container-Plattformen setzen (siehe apps/collector/src/server.ts).
const PORT = Number(process.env.PORT ?? 8788);

let spec: OpenApiDocument;
let tools: McpTool[];

try {
  spec = await loadSpec(API_BASE_URL);
  // Nur, was ein API-Schlüssel aufrufen kann — siehe index.ts.
  tools = toolsFromOpenApi(spec, { apiKeyOnly: true });
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}

/** `Authorization: Bearer td_live_…` → der Schlüssel, sonst null. */
function extractToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  const token = value?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return token || null;
}

/** Obergrenze für einen JSON-RPC-Rumpf. Werkzeugargumente sind klein; 4 MB lassen einen grossen Backfill durch. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const teile: Buffer[] = [];
  let groesse = 0;
  for await (const teil of req) {
    groesse += (teil as Buffer).length;
    if (groesse > MAX_BODY_BYTES) throw new Error("Anfrage zu gross.");
    teile.push(teil as Buffer);
  }
  return JSON.parse(Buffer.concat(teile).toString("utf8"));
}

function sendJsonRpcError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" }).end(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }),
  );
}

const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Antwortet ohne Schlüssel — ein Monitor soll nicht erst einen API-Schlüssel
  // besitzen müssen, um zu sehen, ob der Prozess lebt.
  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({ ok: true, version: VERSION, tools: tools.length }),
    );
    return;
  }

  if (url.pathname !== "/mcp") {
    res.writeHead(404).end();
    return;
  }

  if (req.method !== "POST") {
    // Wie im stateless-Beispiel des SDK: Ohne Sitzung gibt es keinen
    // langlebigen SSE-Strom, den ein GET öffnen könnte, und nichts, was ein
    // DELETE beenden könnte — jede Anfrage ist für sich vollständig.
    res.writeHead(405, { "Content-Type": "application/json" }).end(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }),
    );
    return;
  }

  const token = extractToken(req.headers.authorization);
  if (!token) {
    sendJsonRpcError(
      res,
      401,
      "Kein API-Schlüssel mitgeschickt. Header „Authorization: Bearer td_live_…“ setzen — " +
      "den Schlüssel erzeugst du im Dashboard unter Einstellungen → API.",
    );
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: e instanceof Error ? e.message : "Parse error" }, id: null }),
    );
    return;
  }

  try {
    // Die Rechte des Schlüssels nur dort abfragen, wo sie etwas ändern: beim
    // initialize (Zugangssatz) und bei tools/list (gefilterte Liste). Ein
    // Werkzeugaufruf braucht sie nicht — das Backend setzt die Rechte
    // ohnehin durch —, und jeder Aufruf einen zweiten Backend-Aufruf wäre
    // doppelte Last für nichts. Gespeichert wird nichts (siehe oben).
    const methoden = (Array.isArray(body) ? body : [body]).map((m) => (m as { method?: unknown } | null)?.method);
    const brauchtZugang = methoden.includes("initialize") || methoden.includes("tools/list");
    const zugang: ZugangsStand = brauchtZugang ? await loadAccessScope(spec, API_BASE_URL, token) : { scope: null };

    const server = createTrackdolphinServer({
      spec,
      tools: werkzeugeFuerZugang(tools, zugang.scope),
      token,
      baseUrl: API_BASE_URL,
      instructions: brauchtZugang ? zugangsHinweis(zugang.scope, zugang.fehler) : undefined,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" }).end(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Interner Fehler." }, id: null }),
      );
    }
  }
});

httpServer.listen(PORT, () => {
  process.stderr.write(
    `Trackdolphin MCP (HTTP) bereit auf Port ${PORT} — ${tools.length} Werkzeuge von ${API_BASE_URL}\n`,
  );
});

// SIGTERM ist das Signal, mit dem der Container beendet wird — ohne diese
// Behandlung reißt jeder Deploy laufende Werkzeugaufrufe ab.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    httpServer.close(() => process.exit(0));
  });
}
