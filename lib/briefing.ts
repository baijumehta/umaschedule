import { classById, classesFor, displayTitle, whenLabel } from "./classes";
import { conflictsOn, type Conflict } from "./conflicts";
import { nudgesFor, type Nudge } from "./guidance";
import {
  addDays, collectRange, dayInfo, dow, DOW_SHORT, eventsFor, fmtDate, fmtTime,
} from "./schedule";
import type { ISODate, PlannerEvent, StoredEvent } from "./types";

/**
 * One day, as a structure — then rendered as text for SMS and as HTML for
 * email from that same structure, so the two can never drift apart.
 *
 * The ordering is the argument of the whole app: what she should *do* comes
 * before what is *on*. A list of commitments is what she already had.
 */

/** The 7:45 inbox sweep is a habit, not news — noise in a digest. */
const SKIP = new Set(["email"]);

const shortTime = (t: string) => fmtTime(t).replace("am", "a").replace("pm", "p");

export interface Briefing {
  date: ISODate;
  heading: string;
  /** "odd day", "Thanksgiving break". */
  kind: string;
  minDay: boolean;
  classes: Array<{ period: number; name: string; short: string }>;
  nudges: Nudge[];
  schedule: PlannerEvent[];
  coming: Array<{ ev: PlannerEvent; days: number }>;
  /** Double-bookings on the day, called out separately from the list. */
  conflicts: Conflict[];
  /** A sentence written by Claude, when one was available. */
  coaching?: string;
}

export function buildBriefing(
  date: ISODate,
  events: StoredEvent[],
  opts: { done?: Set<string>; horizonDays?: number; skipped?: Set<string> } = {},
): Briefing {
  const info = dayInfo(date);
  const all = eventsFor(date, events, { school: false, skipped: opts.skipped })
    .filter((e) => !SKIP.has(e.cat));

  const coming = collectRange(addDays(date, 1), addDays(date, opts.horizonDays ?? 10), events, {
    school: false,
    cats: ["test", "project", "act"],
    skipped: opts.skipped,
  }).filter((ev) => !ev.skipped).map((ev) => ({ ev, days: between(date, ev.date) }));

  return {
    date,
    heading: `${DOW_SHORT[dow(date)]} ${fmtDate(date)}`,
    kind: info.school ? `${info.block} day` : info.reason ?? "No school",
    minDay: Boolean(info.school && info.min),
    classes: classesFor(date).map((c) => ({ period: c.period, name: c.name, short: c.short })),
    // Nudges are computed for the day being briefed, which is why the evening
    // send still catches a "tomorrow" step.
    nudges: nudgesFor(date, events, opts.done, opts.skipped).slice(0, 7),
    // Declined occurrences still appear on the day, struck through, so it is
    // obvious what was dropped rather than the afternoon just looking empty.
    schedule: all,
    conflicts: conflictsOn(date, events, opts.skipped ?? new Set()),
    coming,
  };
}

function between(a: ISODate, b: ISODate): number {
  let n = 0;
  let cur = a;
  while (cur < b && n < 400) { cur = addDays(cur, 1); n++; }
  return n;
}

/* ------------------------------------------------------------------ *
 * Plain text — for SMS, and as the email's text alternative
 * ------------------------------------------------------------------ */

export function briefingText(
  date: ISODate,
  events: StoredEvent[],
  opts: { done?: Set<string>; coaching?: string; skipped?: Set<string> } = {},
): string {
  const b = buildBriefing(date, events, { done: opts.done, skipped: opts.skipped });
  const lines: string[] = [];

  lines.push(`Uma · ${b.heading} · ${b.kind.toUpperCase()}${b.minDay ? " · MIN DAY" : ""}`);

  if (b.nudges.length) {
    lines.push("");
    lines.push("DO THIS:");
    for (const n of b.nudges) lines.push(`• ${n.title}`);
  }

  if (b.classes.length) {
    lines.push("");
    lines.push("Classes: " + b.classes.map((c) => `${c.period} ${c.short}`).join(", "));
  }

  const timed = b.schedule.filter((e) => !e.allDay);
  const allDay = b.schedule.filter((e) => e.allDay);
  if (allDay.length || timed.length) lines.push("");
  for (const ev of allDay) {
    const label = ev.cat === "test" ? "TEST" : ev.cat === "project" ? "DUE" : "All day";
    const where = classById(ev.classId) ? ` (${whenLabel(ev)})` : "";
    lines.push(`${label}: ${displayTitle(ev)}${where}${ev.notes ? ` — ${ev.notes}` : ""}`);
  }
  for (const ev of timed) {
    const mark = ev.skipped ? " (not going)" : "";
    lines.push(`${shortTime(ev.start)} ${ev.title}${ev.loc ? ` (${ev.loc})` : ""}${mark}`);
  }
  if (!b.schedule.length) {
    lines.push(dayInfo(date).school ? "Nothing after school." : "Nothing scheduled.");
  }

  if (b.coming.length) {
    lines.push("");
    lines.push("Coming: " + b.coming.slice(0, 3)
      .map(({ ev, days }) => `${displayTitle(ev)} ${DOW_SHORT[dow(ev.date)]} (${days}d)`)
      .join("; "));
  }

  if (opts.coaching) {
    lines.push("");
    lines.push(opts.coaching);
  }

  return lines.join("\n");
}

/**
 * The subject line — for an email, the part that actually shows in the
 * notification. It leads with the most pressing thing to do, falling back to
 * the day's headline item, because "Uma · Mon Sep 21" tells nobody anything.
 */
export function briefingSubject(
  date: ISODate, events: StoredEvent[], opts: { done?: Set<string>; skipped?: Set<string> } = {},
): string {
  const b = buildBriefing(date, events, { done: opts.done, skipped: opts.skipped });
  const head = `Uma · ${b.heading} (${b.kind})`;

  const urgent = b.nudges.find((n) => n.urgency === "now") ?? b.nudges[0];
  // Nudge titles now carry their own subject and date, so appending the event
  // title again just stutters: "AP Biology test tomorrow, period 2 — Biology test".
  if (urgent) return `${head}: ${urgent.title}`;

  const test = b.schedule.find((e) => e.cat === "test");
  const first = b.schedule.find((e) => !e.allDay) ?? b.schedule[0];
  const lead = test
    ? (/\b(test|quiz|exam)s?\b/i.test(test.title) ? displayTitle(test) : `${displayTitle(test)} test`)
    : first
      ? (first.allDay ? displayTitle(first) : `${shortTime(first.start)} ${first.title}`)
      : "";

  if (!lead) return head + (dayInfo(date).school ? ": nothing after school" : "");
  const extra = b.schedule.length - 1;
  return `${head}: ${lead}${extra > 0 ? ` +${extra} more` : ""}`;
}

/** Roughly how many SMS segments a body costs, for the preview in the UI. */
export function segments(body: string): number {
  const unicode = /[^\x00-\x7F]/.test(body);
  const limit = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return body.length <= limit ? 1 : Math.ceil(body.length / multi);
}
