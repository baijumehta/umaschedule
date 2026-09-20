/**
 * Two things at once, and what to do about it.
 *
 * A planner that only lists commitments quietly lets them collide. The app
 * already warns when something is *added*, but the collisions that matter are
 * the ones already sitting there — a volunteering slot booked weeks ago that
 * eats an afternoon of practice.
 *
 * Detecting the clash is the easy half. The hard half is that she cannot
 * attend both, so one of them is fiction, and the calendar keeps showing it to
 * her and to everyone subscribed. Resolving means recording which one she is
 * actually at, per occurrence — including for practice and piano, which are
 * derived from the block calendar and so cannot simply be deleted.
 */

import { displayTitle } from "./classes";
import { eventsFor, fmtRange, toMinutes } from "./schedule";
import type { ISODate, PlannerEvent, StoredEvent } from "./types";

export interface Conflict {
  /** Stable for the day, so a resolved clash stays resolved. */
  id: string;
  date: ISODate;
  /** Two or more events sharing wall-clock time, in start order. */
  events: PlannerEvent[];
  /** The window they actually share. */
  from: string;
  to: string;
  minutes: number;
}

const overlap = (a: PlannerEvent, b: PlannerEvent) =>
  toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);

/**
 * Overlapping clusters on one day.
 *
 * Skipped occurrences are excluded before comparing, so choosing one side of a
 * clash makes it disappear rather than nagging about a decision already made.
 */
export function conflictsOn(
  date: ISODate,
  events: StoredEvent[],
  skipped: Set<string> = new Set(),
): Conflict[] {
  const timed = eventsFor(date, events, { school: false, skipped })
    .filter((e) => !e.allDay && !e.skipped)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const clusters: PlannerEvent[][] = [];
  for (const ev of timed) {
    const joined = clusters.find((c) => c.some((other) => overlap(other, ev)));
    if (joined) joined.push(ev);
    else clusters.push([ev]);
  }

  return clusters
    .filter((c) => c.length > 1)
    .map((c) => {
      // The shared window is the latest start to the earliest end.
      const from = Math.max(...c.map((e) => toMinutes(e.start)));
      const to = Math.min(...c.map((e) => toMinutes(e.end)));
      const hhmm = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return {
        id: `clash:${date}:${c.map((e) => e.id).sort().join("|")}`,
        date,
        events: c,
        from: hhmm(from),
        to: hhmm(to),
        minutes: Math.max(0, to - from),
      };
    });
}

/** Every clash in a window, for the briefing and the Today screen. */
export function conflictsBetween(
  from: ISODate,
  to: ISODate,
  events: StoredEvent[],
  skipped: Set<string> = new Set(),
): Conflict[] {
  const out: Conflict[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 400) {
    out.push(...conflictsOn(cur, events, skipped));
    const d = new Date(cur + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return out;
}

/** "Lacrosse practice and Volunteering overlap 2pm–3:45pm" */
export function describeConflict(c: Conflict): string {
  const names = c.events.map((e) => displayTitle(e));
  const list = names.length === 2
    ? `${names[0]} and ${names[1]}`
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} overlap ${fmtRange(c.from, c.to)}`;
}
