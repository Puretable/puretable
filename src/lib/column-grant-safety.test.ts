import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Tables that only have COLUMN-level grants (not a blanket table-level `GRANT SELECT`) for anon
 * and/or authenticated — see supabase/migrations/20261015120000_fix_businesses_column_grants.sql
 * and the original site_settings grant in the baseline migration. On these tables,
 * `.select("*")` or a bare `.select()` fails outright (42501), it does not just omit the
 * ungranted columns — this broke production once already (see docs/HANDOFF.md, "Incident").
 * Always use an explicit column list (PUBLIC_BUSINESS_COLUMNS / AUTHENTICATED_BUSINESS_COLUMNS
 * for businesses) instead.
 */
const RESTRICTED_TABLES = ["businesses", "site_settings"];

const SRC_DIR = join(import.meta.dirname, "..");

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

test('no select("*") or bare select() on column-grant-restricted tables', () => {
  const violations: string[] = [];
  for (const file of listFiles(SRC_DIR)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (const table of RESTRICTED_TABLES) {
      const fromRe = new RegExp(`from\\(["']${table}["']\\)`);
      lines.forEach((line, i) => {
        if (!fromRe.test(line)) return;
        // An explicit "column-grant-safe: ..." comment on the line immediately before means the
        // author verified this call uses a client that bypasses grants (service role) — the only
        // legitimate reason select("*") is fine here.
        const precedingWindow = lines.slice(Math.max(0, i - 3), i).join("\n");
        if (/column-grant-safe:/.test(precedingWindow)) return;
        // Look at this line plus the next few for a chained .select(...) call before any other
        // terminal method, matching the real call-site style used throughout this codebase.
        const window = lines.slice(i, i + 4).join("\n");
        const selectMatch = window.match(/\.select\(([^)]*)\)/);
        if (!selectMatch) return;
        const arg = selectMatch[1].trim();
        if (arg === "" || arg === '"*"' || arg === "'*'" || /^[`"']\*/.test(arg)) {
          violations.push(`${file}:${i + 1} — select(${arg || "<empty>"}) on "${table}"`);
        }
      });
    }
  }
  assert.deepEqual(violations, [], `Found unsafe select() calls:\n${violations.join("\n")}`);
});
