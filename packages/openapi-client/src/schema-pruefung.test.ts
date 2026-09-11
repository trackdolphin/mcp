import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { pruefeEingabeschemas } from "./schema-pruefung.ts";
import type { OpenApiDocument } from "./operations.ts";

/**
 * Der Nachbau des Falls, an dem `@trackdolphin/mcp` 0.1.3 scheiterte:
 * `assignConnectionTargets` mit `konten` (Liste) und `freigabe` (Wahrheitswert)
 * hinter einem `$ref`.
 */
const assign: OpenApiDocument = {
  openapi: "3.0.0",
  info: { title: "t", version: "1" },
  paths: {
    "/api/projects/{projectId}/connections/{type}/assign": {
      post: {
        operationId: "assignConnectionTargets",
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
          { name: "type", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AssignDto" } } } },
      },
    },
  },
  components: {
    schemas: {
      AssignDto: {
        type: "object",
        properties: {
          ebene: { type: "string", enum: ["project", "org"] },
          konten: { type: "array", items: { type: "string" } },
          freigabe: { type: "boolean" },
        },
      },
    },
  },
};

test("assignConnectionTargets: konten als Liste, freigabe als Wahrheitswert", () => {
  const r = pruefeEingabeschemas(assign);
  assert.deepEqual(r.befunde, []);
  assert.equal(r.vollstaendig, 1);
});

test("Der Prüfer erkennt das Werkzeug ohne Felder (der Fehler von 0.1.3)", () => {
  const leer = pruefeEingabeschemas(assign, [
    {
      name: "assignConnectionTargets",
      description: "",
      inputSchema: { type: "object", properties: { projectId: { type: "string" }, type: { type: "string" } } },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
  ]);
  assert.equal(leer.vollstaendig, 0);
  assert.match(leer.befunde[0]!.fehler.join(" "), /konten: fehlt/);
});

test("Ein offener Rumpf ohne Felder ist ein Befund, kein stiller Erfolg", () => {
  const offen: OpenApiDocument = {
    ...assign,
    paths: {
      "/api/x": {
        put: {
          operationId: "saveConsentBanner",
          requestBody: { content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
        },
      },
    },
  };
  assert.equal(pruefeEingabeschemas(offen).vollstaendig, 0);
});

/**
 * Gegen eine echte Beschreibung: `TRACKDOLPHIN_OPENAPI_JSON=/pfad/openapi.json pnpm test`.
 * Ohne die Variable übersprungen — der Test soll ohne Netz und ohne Backend laufen.
 */
const datei = process.env.TRACKDOLPHIN_OPENAPI_JSON;
test("Echte OpenAPI-Beschreibung: jedes Werkzeug mit Rumpf ist vollständig", { skip: !datei || !existsSync(datei) }, () => {
  const r = pruefeEingabeschemas(JSON.parse(readFileSync(datei!, "utf8")) as OpenApiDocument);
  assert.deepEqual(r.befunde, [], `${r.vollstaendig}/${r.mitRumpf} vollständig`);
});
