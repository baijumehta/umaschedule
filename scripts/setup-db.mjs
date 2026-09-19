// One-time schema setup. Run with:  npm run db:setup
//
// Reads DATABASE_URL from .env.local, which is gitignored — the connection
// string never leaves your machine and is never written into the repo.
//
// Uses Client rather than the HTTP `neon()` helper: the HTTP helper takes one
// statement per call, while Client speaks the wire protocol and runs the whole
// schema file in one go. Every statement is `if not exists`, so re-running is
// harmless.
import { Client } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const client = new Client(url);

try {
  await client.connect();
  await client.query(schema);

  const { rows } = await client.query("select count(*)::int as count from events");
  console.log(`Schema is ready. The events table holds ${rows[0].count} row(s).`);
} catch (err) {
  console.error("Schema setup failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
