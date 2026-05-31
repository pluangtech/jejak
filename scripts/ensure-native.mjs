#!/usr/bin/env node
// Self-heal the better-sqlite3 native binding. Runs via the `prepare` lifecycle (after
// `pnpm install` / `pnpm add`). A fresh install builds the binding via
// package.json#pnpm.onlyBuiltDependencies; an *incremental* `pnpm add` can re-link node_modules
// and skip the rebuild, leaving the binding missing. This rebuilds it only when actually absent,
// so the common (already-built) path is a no-op. Never fails the install.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

try {
  const Database = require("better-sqlite3");
  new Database(":memory:").close(); // forces the native binding to load (it's lazy)
  process.exit(0); // binding works — nothing to do
} catch {
  // fall through to rebuild
}

console.error("jejak: better-sqlite3 native binding missing — rebuilding…");
try {
  execFileSync("pnpm", ["rebuild", "better-sqlite3"], { stdio: "inherit" });
} catch {
  console.error("jejak: automatic rebuild failed — run `pnpm rebuild better-sqlite3` manually.");
}
