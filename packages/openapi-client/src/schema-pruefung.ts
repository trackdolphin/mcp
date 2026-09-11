import { toolsFromOpenApi, type OpenApiDocument, type McpTool } from "./operations.ts";

/**
 * Prüft, ob jedes Werkzeug mit Anfragerumpf dem Modell alle Felder dieses
 * Rumpfs zeigt — mit dem richtigen JSON-Typ und den richtigen Pflichtfeldern.
 *
 * Anlass: `@trackdolphin/mcp` 0.1.3 zeigte bei `assignConnectionTargets` nur
 * `projectId` und `type`. Ein Modell, das `konten: ["6393828737"]` und
 * `freigabe: true` trotzdem mitschickte, bekam „konten must be an array,
 * freigabe must be a boolean value" — die Werte kamen als Text an, weil der
 * Client ohne Schema nicht wusste, dass es eine Liste und ein Wahrheitswert
 * sind. Dieser Prüfer vergleicht deshalb nicht mit unserer eigenen Auflösung,
 * sondern löst die Spec unabhängig davon auf und legt beides nebeneinander.
 */

export interface SchemaBefund {
  operationId: string;
  fehler: string[];
}

export interface SchemaPruefung {
  werkzeuge: number;
  mitRumpf: number;
  vollstaendig: number;
  befunde: SchemaBefund[];
}

type Schema = Record<string, unknown>;

function unabhaengigAufloesen(spec: OpenApiDocument, s: unknown, kette: string[] = []): Schema | undefined {
  if (!s || typeof s !== "object") return undefined;
  const x = s as Schema;
  if (typeof x.$ref === "string") {
    const name = x.$ref.split("/").pop()!;
    if (kette.includes(name)) return { type: "object" };
    return unabhaengigAufloesen(spec, spec.components?.schemas?.[name], [...kette, name]);
  }
  if (Array.isArray(x.allOf)) {
    const properties: Schema = {};
    const required: string[] = [];
    let typ: unknown;
    for (const t of x.allOf) {
      const r = unabhaengigAufloesen(spec, t, kette);
      Object.assign(properties, r?.properties ?? {});
      required.push(...((r?.required as string[]) ?? []));
      typ ??= r?.type;
    }
    Object.assign(properties, x.properties ?? {});
    required.push(...((x.required as string[]) ?? []));
    return { ...x, type: x.type ?? typ, properties, required };
  }
  return x;
}

function typen(s: Schema | undefined): string[] {
  const t = s?.type;
  return Array.isArray(t) ? (t as string[]) : typeof t === "string" ? [t] : [];
}

/** Irgendwo unterhalb noch ein Verweis, den das Modell nicht auflösen kann? */
function enthaeltVerweis(s: unknown): boolean {
  return JSON.stringify(s ?? {}).includes('"$ref"');
}

function vergleiche(spec: OpenApiDocument, pfad: string, soll: unknown, ist: Schema | undefined, fehler: string[]): void {
  const s = unabhaengigAufloesen(spec, soll);
  if (!s) return;
  if (!ist) {
    fehler.push(`${pfad}: fehlt`);
    return;
  }
  const sollTyp = typen(s);
  const istTyp = typen(ist);
  for (const t of sollTyp) {
    if (!istTyp.includes(t)) fehler.push(`${pfad}: Typ ${istTyp.join("|") || "—"} statt ${t}`);
  }
  if (s.nullable === true && !istTyp.includes("null")) fehler.push(`${pfad}: null nicht erlaubt, obwohl nullable`);
  if (Array.isArray(s.enum) && !Array.isArray(ist.enum)) fehler.push(`${pfad}: enum fehlt`);
  if (sollTyp.includes("array")) {
    if (!ist.items) fehler.push(`${pfad}: Liste ohne items`);
    else vergleiche(spec, `${pfad}[]`, s.items, ist.items as Schema, fehler);
  }
  const sollProps = (s.properties ?? {}) as Schema;
  const istProps = (ist.properties ?? {}) as Schema;
  for (const [k, v] of Object.entries(sollProps)) vergleiche(spec, `${pfad}.${k}`, v, istProps[k] as Schema, fehler);
  const req = new Set((ist.required as string[]) ?? []);
  for (const r of (s.required as string[]) ?? []) if (!req.has(r)) fehler.push(`${pfad}: Pflichtfeld ${r} nicht als required`);
}

export function pruefeEingabeschemas(spec: OpenApiDocument, tools?: McpTool[]): SchemaPruefung {
  const liste = tools ?? toolsFromOpenApi(spec, { includeAuth: true });
  const nachName = new Map(liste.map((t) => [t.name, t]));
  const befunde: SchemaBefund[] = [];
  let mitRumpf = 0;

  for (const operationen of Object.values(spec.paths ?? {})) {
    for (const op of Object.values(operationen)) {
      if (!op?.operationId || !op.requestBody) continue;
      const werkzeug = nachName.get(op.operationId);
      if (!werkzeug) continue;
      mitRumpf++;
      const fehler: string[] = [];
      const roh = op.requestBody.content?.["application/json"]?.schema;
      const rumpf = unabhaengigAufloesen(spec, roh);
      const ist = werkzeug.inputSchema;

      if (!rumpf?.properties || Object.keys(rumpf.properties as object).length === 0) {
        fehler.push("Rumpf ohne beschriebene Felder (nur ein offenes Objekt) — das Modell muss raten");
      }
      for (const [k, v] of Object.entries((rumpf?.properties ?? {}) as Schema)) {
        vergleiche(spec, k, v, ist.properties[k] as Schema | undefined, fehler);
      }
      const req = new Set(ist.required ?? []);
      for (const r of (rumpf?.required as string[]) ?? []) if (!req.has(r)) fehler.push(`Pflichtfeld ${r} nicht als required`);
      if (enthaeltVerweis(ist)) fehler.push("unaufgelöster $ref im Eingabeschema");

      if (fehler.length) befunde.push({ operationId: op.operationId, fehler });
    }
  }

  return { werkzeuge: liste.length, mitRumpf, vollstaendig: mitRumpf - befunde.length, befunde };
}
