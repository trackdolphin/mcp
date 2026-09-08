/**
 * Werkzeuge aus der OpenAPI-Beschreibung.
 *
 * Der Kern des Versprechens „API-first, MCP-first“: Es gibt keine zweite,
 * handgepflegte Werkzeugliste, die veralten könnte. Jeder Endpunkt, den das
 * Produkt anbietet, ist damit automatisch auch für ein Sprachmodell nutzbar —
 * und was die API nicht kann, kann das Modell auch nicht.
 */

export interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: Record<string, unknown>;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
}

/**
 * Hinweise an den MCP-Client, was ein Werkzeug anrichten kann. Sie kommen
 * aus der HTTP-Methode, nicht aus einer Liste: GET liest, DELETE zerstört,
 * PUT/PATCH/DELETE sind wiederholbar. Ein Client darf danach entscheiden, ob
 * er vor dem Aufruf nachfragt.
 *
 * Es sind HINWEISE, keine Sperre. Was am Werbekonto Geld bewegt, bekommt
 * seine Sicherung nicht hier, sondern in der API selbst — Vorschau, Freigabe,
 * Anwenden als drei getrennte Operationen (docs/ads-modul.md). Ein Client,
 * der die Hinweise ignoriert, kann damit trotzdem nichts überspringen.
 */
export interface McpToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  annotations: McpToolAnnotations;
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/**
 * Auth-Endpunkte: Passwort-Reset, SSO-Austausch, E-Mail-Bestätigung,
 * Einladungen. Für ein Sprachmodell sind das reine Nebenwirkungs-Werkzeuge —
 * im schlimmsten Fall löst ein Agent damit ungewollt einen Passwort-Reset
 * oder eine SSO-Anmeldung aus. Sie gehören nicht in die Werkzeugliste.
 *
 * Erkannt wird am OpenAPI-Tag „Authentication“ (im Backend per @ApiTags an
 * genau diesem Controller gesetzt), mit dem Pfadpräfix „/api/auth/“ als
 * Rückfallebene. Eine Namensliste („requestPasswordReset“, „verifyEmail“, …)
 * wäre die naheliegendere Abkürzung, aber sie veraltet lautlos: Ein neuer
 * Auth-Endpunkt mit einem Namen, der nicht auf die Liste passt, würde ohne
 * Warnung in der Werkzeugliste landen. Tag und Pfad kommen dagegen aus der
 * Spec selbst und decken sich im Backend exakt.
 */
function isAuthOperation(path: string, op: OpenApiOperation): boolean {
  return (op.tags ?? []).includes("Authentication") || path.startsWith("/api/auth/");
}

function annotationsFor(method: (typeof METHODS)[number]): McpToolAnnotations {
  // POST steht bewusst nicht als „zerstörend“: Es legt in dieser API an oder
  // stösst an (Import, Abruf, Vorschau). Die MCP-Voreinstellung wäre `true`
  // und liesse jeden Client vor jedem POST warnen — dann warnt er vor allem,
  // und niemand liest die Warnung mehr, wenn sie einmal zählt.
  return {
    readOnlyHint: method === "get",
    destructiveHint: method === "delete",
    idempotentHint: method !== "post",
  };
}

function jsonBodySchema(op: OpenApiOperation): Record<string, unknown> | undefined {
  return op.requestBody?.content?.["application/json"]?.schema;
}

export interface ToolsOptions {
  /**
   * Auth-Endpunkte mit aufnehmen. Voreingestellt aus (siehe isAuthOperation) —
   * die Kommandozeile setzt dies nur für die Befehlsauflösung selbst auf
   * `true`, nie für die Hilfe-Auflistung: Wer den Befehlsnamen kennt, darf ihn
   * weiter nutzen, nur die Liste soll kein Rauschen zeigen.
   */
  includeAuth?: boolean;
}

export function toolsFromOpenApi(spec: OpenApiDocument, options?: ToolsOptions): McpTool[] {
  const tools: McpTool[] = [];

  for (const [path, operations] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = operations[method];
      // Ohne operationId gäbe es keinen stabilen Werkzeugnamen. Einen zu
      // erfinden wäre schlimmer als das Weglassen: Er änderte sich beim
      // nächsten Umbenennen einer Methode, und Modelle, die ihn gelernt haben,
      // riefen ins Leere.
      if (!op?.operationId) continue;
      if (!options?.includeAuth && isAuthOperation(path, op)) continue;

      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const p of op.parameters ?? []) {
        if (p.in !== "path" && p.in !== "query") continue;
        properties[p.name] = {
          ...(p.schema ?? { type: "string" }),
          ...(p.description ? { description: p.description } : {}),
        };
        if (p.required) required.push(p.name);
      }

      // Ein Modell kennt keine Pfad-, Abfrage- und Körperparameter, sondern
      // nur Argumente. Alles landet deshalb in einem Schema.
      const body = jsonBodySchema(op);
      if (body && typeof body === "object") {
        const bodyProps = (body.properties ?? {}) as Record<string, unknown>;
        for (const [key, schema] of Object.entries(bodyProps)) properties[key] = schema;
        for (const key of (body.required as string[] | undefined) ?? []) required.push(key);
      }

      const description = [op.summary, op.description]
        .filter((t): t is string => Boolean(t && t.trim()))
        .join(" — ");

      tools.push({
        name: op.operationId,
        description: description || op.operationId,
        inputSchema: {
          type: "object",
          properties,
          ...(required.length ? { required: [...new Set(required)] } : {}),
        },
        annotations: annotationsFor(method),
      });
    }
  }

  return tools;
}

export interface PreparedRequest {
  method: string;
  url: string;
  body?: string;
}

/** Findet die Operation zu einem Werkzeugnamen. */
function locate(
  spec: OpenApiDocument,
  toolName: string,
): { path: string; method: string; op: OpenApiOperation } {
  for (const [path, operations] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = operations[method];
      if (op?.operationId === toolName) return { path, method, op };
    }
  }
  throw new Error(`Unbekanntes Werkzeug: ${toolName}`);
}

export function buildRequest(
  spec: OpenApiDocument,
  toolName: string,
  args: Record<string, unknown>,
  baseUrl: string,
): PreparedRequest {
  const { path, method, op } = locate(spec, toolName);

  const pathNames = new Set(
    (op.parameters ?? []).filter((p) => p.in === "path").map((p) => p.name),
  );
  const queryNames = new Set(
    (op.parameters ?? []).filter((p) => p.in === "query").map((p) => p.name),
  );

  let resolved = path;
  for (const name of pathNames) {
    const value = args[name];
    if (value === undefined || value === null || value === "") {
      throw new Error(`Pflichtangabe fehlt: ${name}`);
    }
    // Kodieren ist hier keine Kosmetik: Ohne sie könnte ein Wert wie
    // „a/../b“ den Pfad verlassen und einen anderen Endpunkt treffen.
    resolved = resolved.replace(`{${name}}`, encodeURIComponent(String(value)));
  }

  const url = new URL(resolved, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  for (const name of queryNames) {
    const value = args[name];
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(name, String(value));
    }
  }

  // Alles, was weder Pfad noch Abfrage ist, gehört in den Körper.
  const bodySchema = jsonBodySchema(op);
  let body: string | undefined;
  if (bodySchema) {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (pathNames.has(key) || queryNames.has(key)) continue;
      if (value !== undefined) payload[key] = value;
    }
    body = JSON.stringify(payload);
  }

  return { method: method.toUpperCase(), url: url.toString(), body };
}
