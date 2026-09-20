import { neon } from "@neondatabase/serverless";

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/**
 * Nudges that have been dealt with.
 *
 * Ids are deterministic — rule, event, step — so ticking "upload your ACT
 * photo" off keeps it down without touching the event it came from, and it
 * does not reappear tomorrow.
 */
export async function doneNudges(): Promise<Set<string>> {
  const sql = client();
  const rows = await sql`select id from nudge_state`;
  return new Set((rows as Array<{ id: string }>).map((r) => String(r.id)));
}

export async function markNudgeDone(id: string): Promise<void> {
  const sql = client();
  await sql`
    insert into nudge_state (id) values (${id})
    on conflict (id) do update set done_at = now()
  `;
}

/** Undo, for a nudge ticked off by mistake. */
export async function clearNudge(id: string): Promise<void> {
  const sql = client();
  await sql`delete from nudge_state where id = ${id}`;
}
