import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Die Adressen in den veröffentlichten Paketen müssen es wirklich geben.
 *
 * Am 2026-09-08 zeigte `@trackdolphin/mcp` auf npm auf
 * `github.com/trackdolphin/platform` — ein privates Repo, das mit 404
 * antwortet. Auf der npm-Seite eines Pakets, das Leute in ihre Agenten
 * einbinden, liest sich ein toter Quelltext-Link wie ein aufgegebenes
 * Projekt. Der Spiegel `trackdolphin/mcp` ist öffentlich und ist das Ziel.
 *
 * Dieser Test prüft die Form, nicht das Netz: Ein Test, der beim Bauen
 * GitHub anruft, ist rot, sobald jemand ohne Netz arbeitet.
 */
const OEFFENTLICH = "git+https://github.com/trackdolphin/mcp.git";

for (const [name, pfad, ordner] of [
  ["@trackdolphin/mcp", "apps/mcp/package.json", "apps/mcp"],
  ["@trackdolphin/cli", "apps/cli/package.json", "apps/cli"],
] as const) {
  test(`${name}: verlinkt das öffentliche Repo, nicht das private Monorepo`, () => {
    const p = JSON.parse(readFileSync(new URL(`../../../${pfad}`, import.meta.url), "utf8"));
    assert.equal(p.repository?.url, OEFFENTLICH, "repository.url zeigt auf trackdolphin/mcp");
    assert.equal(p.repository?.directory, ordner);
    assert.match(p.bugs?.url ?? "", /^https:\/\/github\.com\/trackdolphin\/mcp\/issues$/);
    assert.doesNotMatch(JSON.stringify(p), /trackdolphin\/platform/, "platform ist privat (404)");
  });
}
