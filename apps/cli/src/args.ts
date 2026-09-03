/**
 * Aufrufe der Kommandozeile in Operationen der API übersetzen.
 *
 * Die Befehle werden nicht gepflegt, sondern aus der OpenAPI-Beschreibung
 * abgeleitet — dieselbe Quelle, aus der der MCP-Server seine Werkzeuge zieht.
 * Ein neuer Endpunkt ist damit sofort ein neuer Befehl.
 */

export interface ParsedArgs {
  command: string;
  /** Benannte Argumente (--shop-id shop_a). */
  args: Record<string, string | number | boolean>;
  /** Freie Argumente in der Reihenfolge ihres Auftretens. */
  positional: string[];
}

/** --shop-id → shopId */
function toCamel(flag: string): string {
  return flag.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Zahlen erkennen, aber vorsichtig: „2026-01-01“ ist ein Datum, keine Rechnung,
 * und „007“ eine Kennung, keine Sieben.
 */
function coerce(value: string): string | number {
  if (/^-?\d+(\.\d+)?$/.test(value) && !/^0\d/.test(value)) {
    const n = Number(value);
    if (Number.isSafeInteger(n) || !Number.isInteger(n)) return n;
  }
  return value;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "", ...rest] = argv;
  const args: Record<string, string | number | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      args[toCamel(body.slice(0, eq))] = coerce(body.slice(eq + 1));
      continue;
    }

    const next = rest[i + 1];
    // Kein Wert oder direkt der nächste Schalter → es ist ein Schalter.
    if (next === undefined || next.startsWith("--")) {
      args[toCamel(body)] = true;
    } else {
      args[toCamel(body)] = coerce(next);
      i++;
    }
  }

  return { command, args, positional };
}

/**
 * `getShopKpis` → `kpis`, `startShopImport` → `start-import`.
 *
 * Die Vorsilben `get`/`list` und das Wort `Shop` tragen auf der Kommandozeile
 * nichts bei: Man tippt ohnehin `trackdolphin kpis shop_a`.
 */
export function toCommandName(operationId: string): string {
  // `Shop` fällt nur weg, wenn danach ein NEUES Wort beginnt: aus
  // `getShopKpis` wird `kpis`, aus `listShops` aber `shops` — sonst bliebe
  // von der Shop-Liste ein einzelnes „s“ übrig.
  const name = operationId
    .replace(/^(get|list|fetch)/, "")
    .replace(/Shop(?=[A-Z])/g, "");

  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/^-+/, "")
    .toLowerCase();
}

/** Sucht die Operation zu einem Befehlsnamen. */
export function fromCommandName(command: string, operationIds: string[]): string | null {
  const wanted = command.toLowerCase();
  return operationIds.find((id) => toCommandName(id) === wanted) ?? null;
}
