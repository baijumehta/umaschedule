import { neon } from "@neondatabase/serverless";

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export interface Decision {
  occurrenceId: string;
  attending: boolean;
  note: string;
}

/**
 * The occurrences she has said she is not attending.
 *
 * Returned as a plain Set because that is all the schedule needs to know:
 * everything else about a decision is for the UI to show.
 */
export async function skippedOccurrences(): Promise<Set<string>> {
  const sql = client();
  const rows = await sql`
    select occurrence_id from attendance where attending = false
  `;
  return new Set((rows as Array<{ occurrence_id: string }>).map((r) => String(r.occurrence_id)));
}

/** Notes attached to decisions, by occurrence — "arriving late" and such. */
export async function attendanceNotes(): Promise<Map<string, string>> {
  const sql = client();
  const rows = await sql`
    select occurrence_id, note from attendance where note <> ''
  `;
  return new Map(
    (rows as Array<{ occurrence_id: string; note: string }>)
      .map((r) => [String(r.occurrence_id), String(r.note)]),
  );
}

export async function listDecisions(): Promise<Decision[]> {
  const sql = client();
  const rows = await sql`
    select occurrence_id, attending, note from attendance order by decided_at desc limit 500
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    occurrenceId: String(r.occurrence_id),
    attending: Boolean(r.attending),
    note: String(r.note ?? ""),
  }));
}

export async function setAttendance(
  occurrenceId: string, attending: boolean, note = "",
): Promise<void> {
  const sql = client();
  await sql`
    insert into attendance (occurrence_id, attending, note)
    values (${occurrenceId}, ${attending}, ${note.slice(0, 200)})
    on conflict (occurrence_id) do update set
      attending = excluded.attending, note = excluded.note, decided_at = now()
  `;
}

/** Undo a decision entirely, so the occurrence goes back to undecided. */
export async function clearAttendance(occurrenceId: string): Promise<void> {
  const sql = client();
  await sql`delete from attendance where occurrence_id = ${occurrenceId}`;
}
