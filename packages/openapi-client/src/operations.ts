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
  [extension: `x-${string}`]: unknown;
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
  /**
   * Ohne diese Sammlung ist die Beschreibung nur halb gelesen: NestJS/Swagger
   * schreibt jeden benannten Rumpf als `$ref` hierher aus, statt ihn an der
   * Operation einzubetten. Siehe `aufloese` unten.
   */
  components?: { schemas?: Record<string, Record<string, unknown>> };
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

const SCHEMA_PRAEFIX = "#/components/schemas/";

/**
 * OpenAPI-Schema in reines JSON Schema übersetzen: `$ref` und `allOf` auf
 * JEDER Ebene auflösen, `nullable` in die JSON-Schema-Schreibweise bringen.
 *
 * Der Fehler, den das behebt, war still und vollständig: NestJS schreibt
 * jeden Rumpf, der aus einer DTO-Klasse kommt, als
 * `{ "$ref": "#/components/schemas/StartLegalInterviewDto" }` aus. Wer nur
 * `schema.properties` liest, findet dort NICHTS — und das Werkzeug kam ohne
 * ein einziges Argument beim Modell an. Am 2026-09-09 betraf das **42 von 42**
 * Operationen mit Rumpf, also jede schreibende Fähigkeit des Produkts.
 *
 * Die erste Korrektur löste nur die oberste Ebene und die direkten Felder auf.
 * Ein Verweis in den Elementen einer Liste (`BackfillDto.records`,
 * `LegalProfileDto.representatives`) oder hinter einem `allOf` an einem Feld
 * (`SaveDashboardDto.layout`) blieb als `$ref` stehen — ein Verweis auf
 * `#/components/…`, die das Modell nie zu sehen bekommt. Gemessen gegen die
 * Produktions-API am 2026-09-11: 7 von 67 Werkzeugen mit Rumpf unvollständig.
 * Deshalb jetzt rekursiv, durch `properties`, `items`,
 * `additionalProperties`, `oneOf`/`anyOf`.
 *
 * `nullable: true` ist OpenAPI 3.0 und kein JSON Schema — ein Client, der das
 * Eingabeschema streng prüft, lehnte `null` ab, obwohl die API es als
 * „Einstellung entfernen“ versteht (`AutoApproveDto.set_budget_max_delta_micros`).
 * Es wird zu `type: ["…", "null"]`.
 *
 * `kette` hält die Namen der gerade aufgelösten Komponenten: Ein Schema, das
 * sich selbst enthält (ein Baum von Kategorien etwa), endet dort als offenes
 * Objekt mit Hinweis, statt endlos zu laufen.
 */
function aufloese(
  schema: Record<string, unknown> | undefined,
  spec: OpenApiDocument,
  kette: readonly string[] = [],
): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;

  const ref = schema["$ref"];
  if (typeof ref === "string") {
    const name = ref.startsWith(SCHEMA_PRAEFIX) ? ref.slice(SCHEMA_PRAEFIX.length) : "";
    const ziel = name ? spec.components?.schemas?.[name] : undefined;
    // Ein Verweis ins Leere wird durchgereicht, nicht verschluckt: Dann steht
    // im Werkzeug wenigstens der Verweis, und jemand sieht, was fehlt.
    if (!ziel) return schema;
    if (kette.includes(name) || kette.length >= 12) {
      return { type: "object", description: `${name} (verschachtelt sich selbst; Felder wie eine Ebene höher)` };
    }
    // Was neben dem Verweis steht (OpenAPI 3.1 erlaubt eine Beschreibung
    // daneben), gewinnt über das Ziel.
    const { $ref: _verweis, ...daneben } = schema;
    return aufloese({ ...ziel, ...daneben }, spec, [...kette, name]);
  }

  let out: Record<string, unknown> = { ...schema };

  // `allOf` entsteht, wenn eine DTO erbt oder Swagger einen Verweis mit einer
  // Beschreibung ergänzt (`layout: { description, allOf: [{ $ref }] }`).
  const allOf = out["allOf"];
  if (Array.isArray(allOf)) {
    const { allOf: _teile, ...daneben } = out;
    const teile = allOf.map((t) => aufloese(t as Record<string, unknown>, spec, kette) ?? {});
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    let zusammen: Record<string, unknown> = {};
    for (const teil of teile) {
      Object.assign(properties, (teil["properties"] ?? {}) as Record<string, unknown>);
      required.push(...(((teil["required"] as string[] | undefined) ?? [])));
      zusammen = { ...zusammen, ...teil };
    }
    Object.assign(properties, (daneben["properties"] ?? {}) as Record<string, unknown>);
    required.push(...(((daneben["required"] as string[] | undefined) ?? [])));
    out = { ...zusammen, ...daneben };
    if (Object.keys(properties).length) {
      out["type"] = "object";
      out["properties"] = properties;
    }
    if (required.length) out["required"] = [...new Set(required)];
    else delete out["required"];
    return aufloese(out, spec, kette);
  }

  const props = out["properties"];
  if (props && typeof props === "object") {
    const tief: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
      tief[k] = aufloese(v as Record<string, unknown>, spec, kette) ?? v;
    }
    out["properties"] = tief;
  }
  if (out["items"] && typeof out["items"] === "object") {
    out["items"] = aufloese(out["items"] as Record<string, unknown>, spec, kette);
  }
  if (out["additionalProperties"] && typeof out["additionalProperties"] === "object") {
    out["additionalProperties"] = aufloese(out["additionalProperties"] as Record<string, unknown>, spec, kette);
  }
  for (const k of ["oneOf", "anyOf"] as const) {
    const liste = out[k];
    if (Array.isArray(liste)) {
      out[k] = liste.map((t) => aufloese(t as Record<string, unknown>, spec, kette) ?? t);
    }
  }

  if (out["nullable"] === true) {
    delete out["nullable"];
    const typ = out["type"];
    if (typeof typ === "string") out["type"] = [typ, "null"];
    else if (Array.isArray(typ) && !typ.includes("null")) out["type"] = [...typ, "null"];
  } else if (out["nullable"] === false) {
    delete out["nullable"];
  }

  return out;
}

function jsonBodySchema(
  op: OpenApiOperation,
  spec: OpenApiDocument,
): Record<string, unknown> | undefined {
  const roh = op.requestBody?.content?.["application/json"]?.schema;
  return aufloese(roh, spec);
}

/**
 * Wer eine Operation überhaupt aufrufen kann, schreibt das Backend als
 * Erweiterung an die Operation (`buildOpenApiDocument` in
 * apps/backend/src/shared/openapi.ts, abgeleitet aus den Guards):
 *
 *  - `human_session`: nur eine Anmeldung im Dashboard, kein API-Schlüssel
 *    (Schlüsselverwaltung, Kontolöschung, Einladungen, Bezahlung …).
 *  - `staff`: nur das interne Team.
 *
 * Der MCP-Server arbeitet ausschliesslich mit API-Schlüsseln. Solche
 * Werkzeuge anzubieten hiesse, dem Modell Knöpfe zu zeigen, die IMMER mit 403
 * oder 404 antworten — es probiert sie trotzdem und berichtet dann, das
 * Produkt sei kaputt.
 */
export const ACCESS_EXTENSION = "x-trackdolphin-requires";
export type AccessRequirement = "human_session" | "staff";

export function accessRequirements(op: OpenApiOperation): AccessRequirement[] {
  const roh = (op as Record<string, unknown>)[ACCESS_EXTENSION];
  return Array.isArray(roh) ? (roh.filter((x) => x === "human_session" || x === "staff") as AccessRequirement[]) : [];
}

export interface ToolsOptions {
  /**
   * Auth-Endpunkte mit aufnehmen. Voreingestellt aus (siehe isAuthOperation) —
   * die Kommandozeile setzt dies nur für die Befehlsauflösung selbst auf
   * `true`, nie für die Hilfe-Auflistung: Wer den Befehlsnamen kennt, darf ihn
   * weiter nutzen, nur die Liste soll kein Rauschen zeigen.
   */
  includeAuth?: boolean;
  /**
   * Nur Operationen, die ein API-Schlüssel aufrufen kann — ohne die mit
   * `x-trackdolphin-requires` (siehe ACCESS_EXTENSION). Der MCP-Server setzt
   * das; die Kommandozeile nicht, dort bleibt die Liste, wie sie war.
   */
  apiKeyOnly?: boolean;
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
      if (options?.apiKeyOnly && accessRequirements(op).length > 0) continue;

      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const p of op.parameters ?? []) {
        if (p.in !== "path" && p.in !== "query") continue;
        // Ein leeres Schema (`@ApiQuery` ohne `type`, z. B. `dry_run` an
        // undoProjectBackfill) hiesse „beliebig“ — ein Abfrageparameter reist
        // aber immer als Text. Ohne Typ also Text, wie ohne Schema.
        const hatTyp = p.schema && ["type", "$ref", "enum", "oneOf", "anyOf", "allOf"].some((k) => k in p.schema!);
        properties[p.name] = {
          ...(hatTyp ? p.schema : { type: "string" }),
          ...(p.description ? { description: p.description } : {}),
        };
        if (p.required) required.push(p.name);
      }

      // Ein Modell kennt keine Pfad-, Abfrage- und Körperparameter, sondern
      // nur Argumente. Alles landet deshalb in einem Schema.
      const body = jsonBodySchema(op, spec);
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
  const bodySchema = jsonBodySchema(op, spec);
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
