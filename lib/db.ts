import { neon } from "@neondatabase/serverless";
import type { Category, StoredEvent } from "./types";

/**
 * Neon over HTTP — one round trip per query, no pool to keep warm, which is
 * what serverless functions want.
 *
 * `sql` is a tagged template: every interpolated value is sent as a bound
 * parameter, never spliced into the statement text.
 */
function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

function toEvent(row: Record<string, unknown>): StoredEvent {
  return {
    id: String(row.id),
    title: String(row.title),
    cat: row.cat as Category,
    date: String(row.date),
    // Null for an all-day item, which has no slot.
    start: row.start ? String(row.start) : "",
    end: row.end ? String(row.end) : "",
    allDay: Boolean(row.allDay),
    classId: String(row.classId ?? ""),
    loc: String(row.loc ?? ""),
    notes: String(row.notes ?? ""),
    repeat: row.repeat === "weekly" ? "weekly" : "none",
    days: Array.isArray(row.days) ? (row.days as unknown[]).map(Number) : [],
    until: String(row.until ?? ""),
  };
}

/**
 * Dates and times are read back as text in exactly the shape the rest of the
 * app uses, so no Date object is ever built from a row and no server timezone
 * can shift a calendar day by one.
 */
export async function listEvents(): Promise<StoredEvent[]> {
  const sql = client();
  const rows = await sql`
    select
      id,
      title,
      cat,
      to_char(event_date, 'YYYY-MM-DD')  as date,
      to_char(start_time, 'HH24:MI')     as start,
      to_char(end_time,   'HH24:MI')     as "end",
      all_day                            as "allDay",
      class_id                           as "classId",
      loc,
      notes,
      repeat_mode                        as repeat,
      days,
      coalesce(to_char(until_date, 'YYYY-MM-DD'), '') as until
    from events
    order by event_date, all_day desc, start_time
  `;
  return (rows as Record<string, unknown>[]).map(toEvent);
}

export async function upsertEvent(ev: StoredEvent): Promise<StoredEvent> {
  const sql = client();
  // An all-day item stores null times rather than a sentinel like 00:00, so
  // "has no slot" is representable in the column itself.
  const start = ev.allDay ? null : ev.start;
  const end = ev.allDay ? null : ev.end;

  const rows = await sql`
    insert into events
      (id, title, cat, event_date, start_time, end_time, all_day, class_id,
       loc, notes, repeat_mode, days, until_date)
    values
      (${ev.id}, ${ev.title}, ${ev.cat}, ${ev.date}::date,
       ${start}::time, ${end}::time, ${ev.allDay}, ${ev.classId},
       ${ev.loc}, ${ev.notes}, ${ev.repeat}, ${ev.days}::smallint[],
       ${ev.until || null}::date)
    on conflict (id) do update set
      title       = excluded.title,
      cat         = excluded.cat,
      event_date  = excluded.event_date,
      start_time  = excluded.start_time,
      end_time    = excluded.end_time,
      all_day     = excluded.all_day,
      class_id    = excluded.class_id,
      loc         = excluded.loc,
      notes       = excluded.notes,
      repeat_mode = excluded.repeat_mode,
      days        = excluded.days,
      until_date  = excluded.until_date,
      updated_at  = now()
    returning id
  `;
  if (!rows.length) throw new Error("Event was not written");
  return ev;
}

export async function deleteEvent(id: string): Promise<boolean> {
  const sql = client();
  const rows = await sql`delete from events where id = ${id} returning id`;
  return rows.length > 0;
}

/** Latest change in the table — used as the feed's Last-Modified basis. */
export async function lastChangedAt(): Promise<string | null> {
  const sql = client();
  const rows = await sql`select max(updated_at) as at from events`;
  const at = (rows[0] as { at: unknown } | undefined)?.at;
  return at ? new Date(at as string).toISOString() : null;
}
