import { classById, classesFor, displayTitle, whenLabel } from "./classes";
import {
  addDays, collectRange, dayInfo, dow, DOW_SHORT, eventsFor, fmtDate, fmtTime,
} from "./schedule";
import type { ISODate, StoredEvent } from "./types";

/**
 * The day, in the length of a text message.
 *
 * Built from the same rules the Today tab renders, so the text and the app can
 * never disagree. Written to be read on a lock screen: the block letter first,
 * because it decides where practice is, then only what someone has to act on.
 */

/** The 7:45 inbox sweep is a habit, not news — it would be noise in a text. */
const SKIP_IN_SMS = new Set(["email"]);

/** Short clock, so "1:45pm" costs 6 characters rather than 8. */
const shortTime = (t: string) => fmtTime(t).replace("am", "a").replace("pm", "p");

export interface BriefingOptions {
  /** How far ahead to mention tests and deadlines. */
  horizonDays?: number;
  /** Prefix each line with her name — useful when several people get it. */
  name?: string;
}

export function briefingText(
  date: ISODate,
  events: StoredEvent[],
  opts: BriefingOptions = {},
): string {
  const horizon = opts.horizonDays ?? 10;
  const info = dayInfo(date);
  const who = opts.name ?? "Uma";
  const lines: string[] = [];

  const heading = `${who} · ${DOW_SHORT[dow(date)]} ${fmtDate(date)}`;
  lines.push(info.school ? `${heading} · ${info.block?.toUpperCase()}${info.min ? " · MIN DAY" : ""}` : heading);

  if (!info.school) {
    lines.push(info.reason ?? "No school");
  } else {
    const classes = classesFor(date);
    if (classes.length) {
      lines.push("Classes: " + classes.map((c) => `${c.period} ${c.short}`).join(", "));
    }
  }

  const all = eventsFor(date, events, { school: false })
    .filter((e) => !SKIP_IN_SMS.has(e.cat));

  const dueToday = all.filter((e) => e.allDay);
  const timed = all.filter((e) => !e.allDay);

  for (const ev of dueToday) {
    // Never "Today" — this is read the evening before, when today is the wrong day.
    const label = ev.cat === "test" ? "TEST" : ev.cat === "project" ? "DUE" : "All day";
    // An all-day item is the one whose timing is unresolved, so its note
    // ("schedule to be announced") is the part actually worth carrying.
    const note = ev.notes ? ` — ${ev.notes}` : "";
    // A test belongs to a period, so say which one rather than "all day".
    const where = classById(ev.classId) ? ` (${whenLabel(ev)})` : "";
    lines.push(`${label}: ${displayTitle(ev)}${where}${note}`);
  }

  for (const ev of timed) {
    lines.push(`${shortTime(ev.start)} ${ev.title}${ev.loc ? ` (${ev.loc})` : ""}`);
  }

  if (!dueToday.length && !timed.length) {
    lines.push(info.school ? "Nothing after school." : "Nothing scheduled.");
  }

  // Deadlines far enough out to still act on, but not so far they are noise.
  const ahead = collectRange(addDays(date, 1), addDays(date, horizon), events, {
    school: false,
    cats: ["test", "project"],
  });
  if (ahead.length) {
    const soon = ahead.slice(0, 3).map((ev) => {
      const days = daysBetween(date, ev.date);
      return `${displayTitle(ev)} ${DOW_SHORT[dow(ev.date)]} (${days}d)`;
    });
    lines.push("Coming: " + soon.join("; "));
  }

  return lines.join("\n");
}

function daysBetween(a: ISODate, b: ISODate): number {
  let n = 0;
  let cur = a;
  while (cur < b && n < 400) {
    cur = addDays(cur, 1);
    n++;
  }
  return n;
}

/** Roughly how many SMS segments a body will cost, for the preview in the UI. */
export function segments(body: string): number {
  const unicode = /[^\x00-\x7F]/.test(body);
  const limit = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return body.length <= limit ? 1 : Math.ceil(body.length / multi);
}

/**
 * The subject line — which, for an email, is the part that actually shows in
 * the notification. So it leads with the single most actionable thing on the
 * day rather than restating the date twice.
 */
export function briefingSubject(date: ISODate, events: StoredEvent[]): string {
  const info = dayInfo(date);
  const when = `${DOW_SHORT[dow(date)]} ${fmtDate(date)}`;
  const kind = info.school ? (info.min ? `${info.block}, min day` : info.block ?? "") : info.reason ?? "";
  const head = `Uma · ${when}${kind ? ` (${kind})` : ""}`;

  const all = eventsFor(date, events, { school: false }).filter((e) => !SKIP_IN_SMS.has(e.cat));
  const test = all.find((e) => e.cat === "test");
  const due = all.find((e) => e.cat === "project");
  const first = all.find((e) => !e.allDay) ?? all[0];

  const lead = test
    ? `${displayTitle(test)} test`
    : due
      ? `${displayTitle(due)} due`
      : first
        ? (first.allDay ? first.title : `${shortTime(first.start)} ${first.title}`)
        : "";

  if (!lead) return head + (info.school ? " — nothing after school" : "");

  const extra = all.length - 1;
  return `${head} — ${lead}${extra > 0 ? ` +${extra} more` : ""}`;
}
