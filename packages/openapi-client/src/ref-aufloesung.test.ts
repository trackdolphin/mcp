import { test } from "node:test";
import assert from "node:assert/strict";
import { toolsFromOpenApi, type OpenApiDocument } from "./operations.ts";

/**
 * Der Fehler, den diese Datei festnagelt, war still und vollständig.
 *
 * NestJS schreibt jeden Anfragerumpf, der aus einer DTO-Klasse kommt, als
 * `{"$ref": "#/components/schemas/…"}` aus. Wer nur `schema.properties` liest,
 * findet dort nichts — und das Werkzeug kam ohne ein einziges Argument beim
 * Modell an. Am 2026-09-09 betraf das 42 von 42 Operationen mit Rumpf, also
 * jede schreibende Fähigkeit des Produkts. Gemessen: 146 statt 328 Felder.
 *
 * Warum es niemandem auffiel: Werkzeug und Beschreibung waren da, die
 * Beschreibung nannte die Felder sogar im Fliesstext. Ein Modell rief auf,
 * bekam „kind must be one of the following values" und konnte den Parameter
 * nirgends unterbringen.
 */

function spec(teile: Partial<OpenApiDocument>): OpenApiDocument {
  return { openapi: "3.0.0", info: { title: "t", version: "1" }, paths: {}, ...teile };
}

const mitRumpf = (ref: string) =>
  spec({
    paths: {
      "/api/x": {
        post: {
          operationId: "tuWas",
          summary: "Tu was",
          requestBody: { content: { "application/json": { schema: { $ref: ref } } } },
        },
      },
    },
    components: {
      schemas: {
        TuWasDto: {
          type: "object",
          properties: { kind: { type: "string", enum: ["a", "b"] }, note: { type: "string" } },
          required: ["kind"],
        },
      },
    },
  });

const felder = (s: OpenApiDocument) => toolsFromOpenApi(s, { includeAuth: true })[0]!.inputSchema;

test("Ein $ref auf ein Komponenten-Schema wird aufgelöst", () => {
  const i = felder(mitRumpf("#/components/schemas/TuWasDto"));
  assert.deepEqual(Object.keys(i.properties).sort(), ["kind", "note"]);
  assert.deepEqual(i.required, ["kind"]);
  assert.deepEqual((i.properties.kind as Record<string, unknown>).enum, ["a", "b"]);
});

test("Ein Verweis ins Leere wird durchgereicht, nicht verschluckt", () => {
  // Dann steht im Werkzeug wenigstens der Verweis, und jemand sieht, was fehlt.
  // Stiller Verlust wäre genau der Fehler, den diese Datei verhindert.
  const i = felder(mitRumpf("#/components/schemas/GibtEsNicht"));
  assert.deepEqual(Object.keys(i.properties), []);
});

test("Fehlt der components-Block ganz, wird nicht geworfen", () => {
  const s = mitRumpf("#/components/schemas/TuWasDto");
  delete s.components;
  assert.doesNotThrow(() => toolsFromOpenApi(s, { includeAuth: true }));
});

test("allOf wird zusammengelegt, required vereinigt", () => {
  // Entsteht, wenn eine DTO erbt oder Swagger einen Verweis mit einer
  // Beschreibung ergänzt.
  const s = spec({
    paths: {
      "/api/x": {
        post: {
          operationId: "tuWas",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Basis" },
                    { type: "object", properties: { extra: { type: "number" } }, required: ["extra"] },
                  ],
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: { Basis: { type: "object", properties: { a: { type: "string" } }, required: ["a"] } },
    },
  });
  const i = felder(s);
  assert.deepEqual(Object.keys(i.properties).sort(), ["a", "extra"]);
  assert.deepEqual(i.required?.sort(), ["a", "extra"]);
});

test("Verschachtelte Felder werden mit aufgelöst", () => {
  // Eine DTO mit einem Unterobjekt käme sonst als leeres {} beim Modell an,
  // und es müsste raten, was hineingehört.
  const s = spec({
    paths: {
      "/api/x": {
        post: {
          operationId: "tuWas",
          requestBody: {
            content: { "application/json": { schema: { $ref: "#/components/schemas/Aussen" } } },
          },
        },
      },
    },
    components: {
      schemas: {
        Aussen: { type: "object", properties: { adresse: { $ref: "#/components/schemas/Adresse" } } },
        Adresse: { type: "object", properties: { stadt: { type: "string" } } },
      },
    },
  });
  const adresse = felder(s).properties.adresse as Record<string, unknown>;
  assert.deepEqual(Object.keys((adresse.properties ?? {}) as object), ["stadt"]);
});

test("Ein Schema, das sich selbst referenziert, läuft nicht endlos", () => {
  const s = spec({
    paths: {
      "/api/x": {
        post: {
          operationId: "tuWas",
          requestBody: {
            content: { "application/json": { schema: { $ref: "#/components/schemas/Knoten" } } },
          },
        },
      },
    },
    components: {
      schemas: {
        Knoten: { type: "object", properties: { kind: { $ref: "#/components/schemas/Knoten" } } },
      },
    },
  });
  assert.doesNotThrow(() => toolsFromOpenApi(s, { includeAuth: true }));
});

test("Pfad- und Abfrageparameter kommen weiter mit", () => {
  // Gegenprobe: Die Auflösung darf nichts überschreiben, was vorher da war.
  const s = mitRumpf("#/components/schemas/TuWasDto");
  s.paths["/api/x"]!.post!.parameters = [
    { name: "projectId", in: "path", required: true, schema: { type: "string" } },
  ];
  const i = felder(s);
  assert.deepEqual(Object.keys(i.properties).sort(), ["kind", "note", "projectId"]);
  assert.ok(i.required?.includes("projectId"));
});

/**
 * Zweite Runde, gemessen gegen die Produktions-API am 2026-09-11: 7 von 67
 * Werkzeugen mit Rumpf hatten noch einen `$ref` im Eingabeschema — in den
 * Elementen einer Liste (`BackfillDto.records`) oder hinter einem `allOf` an
 * einem Feld (`SaveDashboardDto.layout`).
 */
const mitKomponenten = (rumpf: Record<string, unknown>, schemas: Record<string, Record<string, unknown>>) =>
  spec({
    paths: {
      "/api/x": {
        post: {
          operationId: "tuWas",
          requestBody: { content: { "application/json": { schema: rumpf } } },
        },
      },
    },
    components: { schemas },
  });

test("Ein $ref in den Elementen einer Liste wird aufgelöst", () => {
  const s = mitKomponenten(
    { $ref: "#/components/schemas/Backfill" },
    {
      Backfill: { type: "object", properties: { records: { type: "array", items: { $ref: "#/components/schemas/Satz" } } } },
      Satz: { type: "object", properties: { external_id: { type: "string" } }, required: ["external_id"] },
    },
  );
  const records = felder(s).properties.records as Record<string, unknown>;
  const items = records.items as Record<string, unknown>;
  assert.deepEqual(Object.keys(items.properties as object), ["external_id"]);
  assert.deepEqual(items.required, ["external_id"]);
  assert.ok(!JSON.stringify(felder(s)).includes("$ref"));
});

test("allOf an einem Feld: Felder aufgelöst, Beschreibung bleibt", () => {
  const s = mitKomponenten(
    { $ref: "#/components/schemas/Save" },
    {
      Save: { type: "object", properties: { layout: { description: "Das ganze Layout", allOf: [{ $ref: "#/components/schemas/Layout" }] } } },
      Layout: { type: "object", properties: { cards: { type: "array", items: { $ref: "#/components/schemas/Karte" } } } },
      Karte: { type: "object", properties: { widget: { type: "string" } } },
    },
  );
  const layout = felder(s).properties.layout as Record<string, unknown>;
  assert.equal(layout.description, "Das ganze Layout");
  assert.equal(layout.type, "object");
  const karte = ((layout.properties as Record<string, Record<string, unknown>>).cards!.items) as Record<string, unknown>;
  assert.deepEqual(Object.keys(karte.properties as object), ["widget"]);
});

test("nullable wird zu JSON Schema: null ist erlaubt", () => {
  const s = mitKomponenten(
    { $ref: "#/components/schemas/Regel" },
    { Regel: { type: "object", properties: { max: { type: "integer", nullable: true } } } },
  );
  const max = felder(s).properties.max as Record<string, unknown>;
  assert.deepEqual(max.type, ["integer", "null"]);
  assert.ok(!("nullable" in max));
});

test("Selbstverweis über eine Liste läuft nicht endlos und hinterlässt keinen $ref", () => {
  const s = mitKomponenten(
    { $ref: "#/components/schemas/Knoten" },
    { Knoten: { type: "object", properties: { kinder: { type: "array", items: { $ref: "#/components/schemas/Knoten" } } } } },
  );
  const i = felder(s);
  assert.ok(!JSON.stringify(i).includes("$ref"));
});

test("apiKeyOnly lässt Operationen weg, die eine Anmeldung oder Staff verlangen", () => {
  const s = spec({
    paths: {
      "/api/keys": {
        get: { operationId: "listApiKeys", "x-trackdolphin-requires": ["human_session"] },
      },
      "/api/admin/users": { get: { operationId: "listAdminUsers", "x-trackdolphin-requires": ["staff"] } },
      "/api/projects": { get: { operationId: "listProjects" } },
    },
  });
  assert.deepEqual(toolsFromOpenApi(s, { apiKeyOnly: true }).map((t) => t.name), ["listProjects"]);
  assert.equal(toolsFromOpenApi(s).length, 3, "ohne die Option bleibt die Liste, wie sie war (Kommandozeile)");
});
