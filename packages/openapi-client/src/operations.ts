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

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function jsonBodySchema(op: OpenApiOperation): Record<string, unknown> | undefined {
  return op.requestBody?.content?.["application/json"]?.schema;
}

export function toolsFromOpenApi(spec: OpenApiDocument): McpTool[] {
  const tools: McpTool[] = [];

  for (const [, operations] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = operations[method];
      // Ohne operationId gäbe es keinen stabilen Werkzeugnamen. Einen zu
      // erfinden wäre schlimmer als das Weglassen: Er änderte sich beim
      // nächsten Umbenennen einer Methode, und Modelle, die ihn gelernt haben,
      // riefen ins Leere.
      if (!op?.operationId) continue;

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
