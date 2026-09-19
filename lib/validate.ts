import { CLASSES } from "./classes";
import { TERM_END, TERM_START, toMinutes } from "./schedule";
import type { Category, StoredEvent } from "./types";

const CATEGORY_VALUES: Category[] = [
  "lax", "piano", "math", "act", "study", "social", "test", "project",
  "email", "school", "other",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export type Validated = { ok: true; value: StoredEvent } | { ok: false; error: string };

/**
 * Checks an event from the network before it reaches Postgres. The database
 * has its own constraints; this exists so a bad request comes back as a
 * readable sentence instead of a constraint violation.
 */
export function validateEvent(input: unknown, id?: string): Validated {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Expected an object" };
  const b = input as Record<string, unknown>;

  const eventId = id ?? (typeof b.id === "string" ? b.id : "");
  if (!ID_RE.test(eventId)) return { ok: false, error: "Bad event id" };

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return { ok: false, error: "Give it a name" };
  if (title.length > 200) return { ok: false, error: "That name is too long" };

  const cat = b.cat as Category;
  if (!CATEGORY_VALUES.includes(cat)) return { ok: false, error: "Unknown kind of event" };

  const date = typeof b.date === "string" ? b.date : "";
  if (!DATE_RE.test(date)) return { ok: false, error: "Bad date" };
  if (date < TERM_START || date > TERM_END) {
    return { ok: false, error: `Dates have to fall inside the school year (${TERM_START} to ${TERM_END})` };
  }

  // A test or a due date occupies the day, so it carries no times at all.
  const allDay = b.allDay === true;
  let start = "";
  let end = "";
  if (!allDay) {
    start = typeof b.start === "string" ? b.start : "";
    end = typeof b.end === "string" ? b.end : "";
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) return { ok: false, error: "Bad time" };
    if (toMinutes(end) <= toMinutes(start)) return { ok: false, error: "It has to end after it starts" };
  }

  const classId = typeof b.classId === "string" ? b.classId : "";
  if (classId && !CLASSES.some((c) => c.id === classId)) {
    return { ok: false, error: "That is not one of her classes" };
  }

  const repeat = b.repeat === "weekly" ? "weekly" : "none";

  let days: number[] = [];
  if (repeat === "weekly") {
    const raw = Array.isArray(b.days) ? b.days : [];
    days = [...new Set(raw.map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6).sort();
    if (!days.length) return { ok: false, error: "Pick at least one day to repeat on" };
  }

  let until = "";
  if (repeat === "weekly") {
    const raw = typeof b.until === "string" && b.until ? b.until : TERM_END;
    if (!DATE_RE.test(raw)) return { ok: false, error: "Bad repeat-through date" };
    until = raw > TERM_END ? TERM_END : raw;
    if (until < date) return { ok: false, error: "The repeat ends before it starts" };
  }

  const loc = typeof b.loc === "string" ? b.loc.trim().slice(0, 200) : "";
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 2000) : "";

  return {
    ok: true,
    value: { id: eventId, title, cat, date, start, end, allDay, classId, loc, notes, repeat, days, until },
  };
}

export const bad = (error: string) =>
  new Response(JSON.stringify({ error }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
