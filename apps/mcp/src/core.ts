import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  toolsFromOpenApi,
  buildRequest,
  API_KEY_UNAUTHORIZED_MESSAGE,
  type OpenApiDocument,
  type McpTool,
} from "@trackdolphin/openapi-client";

/**
 * Gemeinsamer Kern für stdio- und HTTP-Weg.
 *
 * Beide Transporte unterscheiden sich nur darin, woher Schlüssel und
 * Anfrage kommen — was ein Werkzeugaufruf tut, ist identisch. Diese Datei
 * ist deshalb die einzige Stelle, die die OpenAPI-Beschreibung in
 * Backend-Anfragen übersetzt; index.ts (stdio) und http.ts (Streamable HTTP)
 * sind nur noch dünne Einstiege, die Transport und Schlüsselherkunft klären.
 */

/** Lädt die OpenAPI-Beschreibung. Für beide Transporte identisch. */
export async function loadSpec(baseUrl: string): Promise<OpenApiDocument> {
  const res = await fetch(`${baseUrl}/api/openapi.json`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(
      `Die API-Beschreibung war nicht abrufbar (HTTP ${res.status}). ` +
      `Stimmt TRACKDOLPHIN_URL? Aktuell: ${baseUrl}`,
    );
  }
  return (await res.json()) as OpenApiDocument;
}

export interface ServerOptions {
  spec: OpenApiDocument;
  tools: McpTool[];
  /** API-Schlüssel, mit dem Werkzeugaufrufe an das Backend gehen. */
  token: string;
  baseUrl: string;
}

/**
 * Baut einen fertig verdrahteten MCP-Server: Werkzeugliste plus Ausführung.
 *
 * Bewusst eine neue `Server`-Instanz pro Aufruf statt eines geteilten
 * Singletons — im HTTP-Weg bringt jede Anfrage ihren eigenen Schlüssel mit
 * (siehe http.ts), und der Schlüssel steckt hier im Closure. Zwei Anfragen
 * mit verschiedenen Schlüsseln dürfen sich unter keinen Umständen eine
 * Server-Instanz teilen.
 */
export function createTrackdolphinServer(opts: ServerOptions): Server {
  const { spec, tools, token, baseUrl } = opts;

  // Werkzeugnamen, die tatsächlich angeboten werden — insbesondere ohne die
  // Auth-Endpunkte (siehe isAuthOperation in openapi-client). `buildRequest`
  // kennt die volle Spec und fände `confirmPasswordReset` trotzdem; dieser
  // Satz ist die zweite Sperre, falls ein Modell den Namen dennoch errät
  // oder sich aus einer alten Antwort merkt.
  const toolNames = new Set(tools.map((t) => t.name));

  const server = new Server(
    { name: "trackdolphin", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!toolNames.has(name)) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Unbekanntes Werkzeug: ${name}` }],
      };
    }

    try {
      const prepared = buildRequest(spec, name, (args ?? {}) as Record<string, unknown>, baseUrl);

      const res = await fetch(prepared.url, {
        method: prepared.method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(prepared.body ? { "Content-Type": "application/json" } : {}),
        },
        body: prepared.body,
        signal: AbortSignal.timeout(60_000),
      });

      const text = await res.text();

      if (res.status === 401) {
        // Dieselbe Meldung wie die Kommandozeile (siehe API_KEY_UNAUTHORIZED_MESSAGE):
        // Ein 401 bedeutet hier immer einen ungültigen oder widerrufenen
        // API-Schlüssel, nie eine abgelaufene Sitzung — MCP kennt keine.
        return { isError: true, content: [{ type: "text" as const, text: API_KEY_UNAUTHORIZED_MESSAGE }] };
      }

      if (!res.ok) {
        // Den Fehler des Backends durchreichen statt zu verschlucken: Es
        // formuliert bereits in ganzen Sätzen („Für diesen Shop sind keine
        // Zugangsdaten hinterlegt.“), und das Modell kann dem Nutzer dann
        // sagen, was zu tun ist.
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

  return server;
}

export { toolsFromOpenApi };
export type { OpenApiDocument, McpTool };
