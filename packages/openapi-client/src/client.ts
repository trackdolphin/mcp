import { buildRequest, type OpenApiDocument } from "./operations.ts";

export interface ClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof globalThis.fetch;
}

export interface CallResult {
  ok: boolean;
  status: number;
  /** Geparstes JSON, sonst der rohe Text. */
  data: unknown;
  /** Fehlermeldung des Backends, falls vorhanden. */
  message: string;
}

/** Lädt die API-Beschreibung. */
export async function fetchSpec(opts: ClientOptions): Promise<OpenApiDocument> {
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  const base = opts.baseUrl.replace(/\/+$/, "");
  const res = await doFetch(`${base}/api/openapi.json`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (!res.ok) {
    throw new Error(
      `Die API-Beschreibung war nicht abrufbar (HTTP ${res.status}). ` +
      `Stimmt die Adresse? Aktuell: ${base}`,
    );
  }
  return (await res.json()) as OpenApiDocument;
}

/** Führt eine Operation aus. */
export async function call(
  spec: OpenApiDocument,
  operationId: string,
  args: Record<string, unknown>,
  opts: ClientOptions,
): Promise<CallResult> {
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  const prepared = buildRequest(spec, operationId, args, opts.baseUrl);

  const res = await doFetch(prepared.url, {
    method: prepared.method,
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: "application/json",
      ...(prepared.body ? { "Content-Type": "application/json" } : {}),
    },
    body: prepared.body,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });

  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keine JSON-Antwort — Rohtext behalten */
  }

  const message =
    data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string"
      ? (data as { message: string }).message
      : res.ok
        ? ""
        : `HTTP ${res.status}`;

  return { ok: res.ok, status: res.status, data, message };
}
