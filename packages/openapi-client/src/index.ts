/**
 * Gemeinsame Grundlage für alles, was Trackdolphin über seine eigene API
 * bedient: der MCP-Server und die Kommandozeile.
 *
 * Beide leiten ihre Fähigkeiten aus der OpenAPI-Beschreibung ab, statt sie zu
 * pflegen. Das ist der Sinn von „API-first“: Was die API kann, können sie
 * auch — ohne dass jemand eine zweite Liste nachzieht, die dann veraltet.
 */
export * from "./operations.ts";
export * from "./client.ts";
