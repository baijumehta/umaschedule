/**
 * The fixed half of Uma's year — Canyon High School, 2026-27.
 *
 * Nothing in here is stored anywhere. The block calendar is transcribed from
 * the school's odd/even PDF, and every recurring commitment is *derived* from
 * it, so a school holiday or a break removes practice automatically instead of
 * leaving a stale entry behind.
 *
 * This module is framework-free on purpose: the browser renders from it and the
 * calendar feed route generates from it, so there is exactly one source of
 * truth for what an odd Wednesday means.
 */

import type { Category, DayInfo, ISODate, PlannerEvent, StoredEvent } from "./types";

/* ------------------------------------------------------------------ *
 * The block calendar
 *
 * Keys are Mondays; values are [Mon, Tue, Wed, Thu, Fri].
 *   "O" odd        "E" even
 *   "o" odd + minimum day     "e" even + minimum day
 *   "-" no school  ""  outside the school year
 *
 * Transcribed from "26-27 Odd-Even Block Schedule". The instructional-day
 * count this produces was checked month by month against the OUSD district
 * calendar and matches all twelve months, 180 days total.
 * ------------------------------------------------------------------ */
const WEEKS: Record<ISODate, string[]> = {
  "2026-08-17": ["", "", "O", "E", "O"],
  "2026-08-24": ["E", "O", "E", "O", "E"],
  "2026-08-31": ["O", "E", "O", "E", "O"],
  "2026-09-07": ["-", "E", "O", "E", "O"],
  "2026-09-14": ["E", "O", "E", "O", "E"],
  "2026-09-21": ["O", "E", "O", "E", "O"],
  "2026-09-28": ["E", "O", "E", "O", "E"],
  "2026-10-05": ["O", "E", "O", "E", "O"],
  "2026-10-12": ["E", "O", "e", "O", "E"],
  "2026-10-19": ["O", "E", "O", "E", "O"],
  "2026-10-26": ["E", "O", "E", "O", "E"],
  "2026-11-02": ["O", "-", "E", "O", "E"],
  "2026-11-09": ["O", "E", "-", "O", "E"],
  "2026-11-16": ["O", "E", "O", "E", "O"],
  "2026-11-23": ["-", "-", "-", "-", "-"],
  "2026-11-30": ["E", "O", "E", "O", "E"],
  "2026-12-07": ["O", "E", "O", "E", "O"],
  "2026-12-14": ["E", "O", "E", "o", "e"],
  "2026-12-21": ["-", "-", "-", "-", "-"],
  "2026-12-28": ["-", "-", "-", "-", "-"],
  "2027-01-04": ["-", "-", "-", "-", "-"],
  "2027-01-11": ["O", "E", "O", "E", "O"],
  "2027-01-18": ["-", "E", "O", "E", "O"],
  "2027-01-25": ["E", "O", "E", "O", "E"],
  "2027-02-01": ["O", "E", "O", "E", "O"],
  "2027-02-08": ["E", "O", "E", "O", "-"],
  "2027-02-15": ["-", "E", "O", "E", "O"],
  "2027-02-22": ["E", "O", "E", "O", "E"],
  "2027-03-01": ["O", "E", "O", "E", "O"],
  "2027-03-08": ["E", "O", "E", "O", "E"],
  "2027-03-15": ["O", "E", "O", "E", "O"],
  "2027-03-22": ["E", "O", "E", "O", "e"],
  "2027-03-29": ["-", "-", "-", "-", "-"],
  "2027-04-05": ["O", "E", "O", "E", "O"],
  "2027-04-12": ["E", "O", "E", "O", "E"],
  "2027-04-19": ["O", "E", "O", "E", "O"],
  "2027-04-26": ["E", "O", "E", "O", "E"],
  "2027-05-03": ["O", "E", "O", "E", "O"],
  "2027-05-10": ["E", "O", "E", "O", "E"],
  "2027-05-17": ["O", "E", "O", "E", "O"],
  "2027-05-24": ["E", "O", "E", "O", "E"],
  "2027-05-31": ["-", "O", "E", "O", "E"],
  "2027-06-07": ["O", "E", "o", "e", "-"],
};

const OFF_REASON: Record<ISODate, string> = {
  "2026-09-07": "Labor Day",
  "2026-11-03": "Staff development day",
  "2026-11-11": "Veterans Day",
  "2027-01-18": "Martin Luther King Jr. Day",
  "2027-02-12": "Lincoln's Birthday",
  "2027-02-15": "Washington's Birthday",
  "2027-05-31": "Memorial Day",
  "2027-06-11": "Teacher day",
};

const BREAKS: Array<[ISODate, ISODate, string]> = [
  ["2026-11-23", "2026-11-27", "Thanksgiving break"],
  ["2026-12-21", "2027-01-08", "Winter break"],
  ["2027-03-29", "2027-04-02", "Spring break"],
];

/** Dated notes from the school's "Important Dates" sheet. */
const SCHOOL_NOTES: Record<ISODate, string> = {
  "2026-08-19": "First day of instruction",
  "2026-09-16": "Back-to-School Night",
  "2026-10-14": "End of 1st quarter",
  "2026-10-15": "2nd quarter begins",
  "2026-12-17": "Finals",
  "2026-12-18": "Finals · end of 1st semester",
  "2027-01-11": "2nd semester begins",
  "2027-01-27": "Open House / Showcase",
  "2027-03-26": "End of 3rd quarter",
  "2027-05-03": "Athletic Open House / Physical Night",
  "2027-06-09": "Final exams",
  "2027-06-10": "Final exams · last day of school · graduation",
};

export const TERM_START: ISODate = "2026-08-19";
export const TERM_END: ISODate = "2027-06-10";

/* ------------------------------------------------------------------ *
 * The recurring commitments, as rules rather than entries
 * ------------------------------------------------------------------ */

/** Lacrosse runs through the last school day before winter break. */
export const LAX_LAST_DAY: ISODate = "2026-12-18";
/** Monday, Wednesday, Thursday. */
const LAX_DOW = [1, 3, 4];
const LAX_ODD = { start: "13:45", end: "15:45", loc: "Upper Fields" };
const LAX_EVEN = { start: "15:45", end: "17:45", loc: "Crescent Elementary" };

const PIANO_DOW = 3; // Wednesday
const PIANO = { start: "13:45", end: "14:45" };

/** A ten-minute inbox sweep before the school day, Monday to Friday. */
const EMAIL = { start: "07:45", end: "07:55" };

export const CATEGORIES: Record<Category, { label: string; cssVar: string }> = {
  lax: { label: "Lacrosse", cssVar: "--c-lax" },
  piano: { label: "Piano", cssVar: "--c-piano" },
  math: { label: "Math tutoring", cssVar: "--c-math" },
  act: { label: "ACT prep", cssVar: "--c-act" },
  study: { label: "Study group", cssVar: "--c-study" },
  social: { label: "Social", cssVar: "--c-social" },
  email: { label: "Email check", cssVar: "--c-email" },
  school: { label: "School", cssVar: "--c-school" },
  other: { label: "Other", cssVar: "--c-other" },
};

/** Categories Uma can pick when adding something. */
export const ADDABLE: Category[] = ["math", "act", "study", "social", "lax", "piano", "other"];

export const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/* ------------------------------------------------------------------ *
 * Date helpers
 *
 * Dates are strings end to end. Where a Date object is needed it is pinned to
 * UTC noon, so no server timezone and no daylight-saving shift can ever move a
 * calendar day by one.
 * ------------------------------------------------------------------ */

export function D(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
export const iso = (d: Date): ISODate => d.toISOString().slice(0, 10);

export function addDays(s: ISODate, n: number): ISODate {
  const d = D(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export const dow = (s: ISODate): number => D(s).getUTCDay();
/** The Monday of the week containing `s`. */
export const mondayOf = (s: ISODate): ISODate => addDays(s, -((dow(s) + 6) % 7));
const within = (s: ISODate, a: ISODate, b: ISODate) => s >= a && s <= b;
export const clampTerm = (s: ISODate): ISODate =>
  s < TERM_START ? TERM_START : s > TERM_END ? TERM_END : s;

export const toMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function fmtDate(s: ISODate, long = false): string {
  const d = D(s);
  const month = MONTHS[d.getUTCMonth()];
  return (long ? month : month.slice(0, 3)) + " " + d.getUTCDate();
}
export function fmtTime(hhmm: ClockLike): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + (m ? ":" + String(m).padStart(2, "0") : "") + suffix;
}
type ClockLike = string;
export const fmtRange = (a: string, b: string): string => fmtTime(a) + "–" + fmtTime(b);

/* ------------------------------------------------------------------ *
 * Day lookup
 * ------------------------------------------------------------------ */

const DAY_INFO: Record<ISODate, DayInfo> = (() => {
  const map: Record<ISODate, DayInfo> = {};
  for (const monday of Object.keys(WEEKS)) {
    WEEKS[monday].forEach((code, i) => {
      if (code === "") return;
      const date = addDays(monday, i);
      if (code === "-") {
        const brk = BREAKS.find((b) => within(date, b[0], b[1]));
        map[date] = { school: false, reason: OFF_REASON[date] ?? (brk ? brk[2] : "No school") };
      } else {
        map[date] = {
          school: true,
          block: code.toLowerCase() === "o" ? "odd" : "even",
          // A lowercase code marks a minimum day.
          min: code === code.toLowerCase(),
        };
      }
    });
  }
  // Holidays and break weekdays that fall outside the Mon-Fri table.
  for (const date of Object.keys(OFF_REASON)) {
    if (!map[date]) map[date] = { school: false, reason: OFF_REASON[date] };
  }
  for (const [from, to, label] of BREAKS) {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!map[d] && dow(d) !== 0 && dow(d) !== 6) map[d] = { school: false, reason: label };
    }
  }
  return map;
})();

export function dayInfo(date: ISODate): DayInfo {
  const hit = DAY_INFO[date];
  if (hit) return hit;
  if (date < TERM_START) return { school: false, reason: "Before the school year" };
  if (date > TERM_END) return { school: false, reason: "Summer" };
  const weekend = dow(date) === 0 || dow(date) === 6;
  return { school: false, reason: weekend ? "Weekend" : "No school" };
}

export const breakSpan = (date: ISODate) => BREAKS.find((b) => within(date, b[0], b[1]));

export function nextSchoolDay(from: ISODate): ISODate | null {
  for (let i = 1; i <= 45; i++) {
    const d = addDays(from, i);
    if (d > TERM_END) return null;
    if (dayInfo(d).school) return d;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Derived commitments
 * ------------------------------------------------------------------ */

function make(p: Partial<PlannerEvent> & Pick<PlannerEvent, "id" | "date" | "cat" | "title">): PlannerEvent {
  return {
    start: "", end: "", loc: "", notes: "", fixed: true, allDay: false, ...p,
  };
}

/**
 * The standing commitments for one day.
 *
 * Email: ten minutes before first period, every school morning Mon-Fri.
 *
 * Lacrosse: Mon/Wed/Thu while the season runs. Odd days start at 1:45 at Upper
 * Fields, even days at 3:45 at Crescent Elementary.
 *
 * Piano: Wednesdays at 1:45, but only when practice is not already at 1:45 —
 * during the season that works out to even Wednesdays, and after it, to every
 * Wednesday.
 *
 * A no-school day produces none of them, which is the whole reason these are
 * rules rather than saved entries.
 */
export function fixedFor(date: ISODate): PlannerEvent[] {
  const info = dayInfo(date);
  if (!info.school) return [];

  const out: PlannerEvent[] = [];
  const weekday = dow(date);
  let practiceAt145 = false;

  if (weekday >= 1 && weekday <= 5) {
    out.push(make({
      id: "email-" + date, date, cat: "email", title: "Review emails",
      start: EMAIL.start, end: EMAIL.end,
    }));
  }

  if (LAX_DOW.includes(weekday) && date <= LAX_LAST_DAY) {
    const odd = info.block === "odd";
    const slot = odd ? LAX_ODD : LAX_EVEN;
    practiceAt145 = odd;
    out.push(make({
      id: "lax-" + date, date, cat: "lax", title: "Lacrosse practice",
      start: slot.start, end: slot.end, loc: slot.loc,
    }));
  }

  if (weekday === PIANO_DOW && !practiceAt145) {
    out.push(make({
      id: "piano-" + date, date, cat: "piano", title: "Piano lesson",
      start: PIANO.start, end: PIANO.end,
    }));
  }

  return out;
}

/** All-day markers: no-school days, minimum days, and the dated school events. */
export function schoolMarkers(date: ISODate): PlannerEvent[] {
  const info = dayInfo(date);
  const out: PlannerEvent[] = [];
  const inTerm = date >= TERM_START && date <= TERM_END;
  const weekday = dow(date) !== 0 && dow(date) !== 6;

  const note = SCHOOL_NOTES[date];
  if (note) out.push(make({ id: "sch-" + date, date, cat: "school", title: note, allDay: true }));

  if (!info.school && inTerm && weekday) {
    out.push(make({
      id: "off-" + date, date, cat: "school", allDay: true,
      title: "No school — " + info.reason,
    }));
  }
  if (info.school && info.min && !note) {
    out.push(make({ id: "min-" + date, date, cat: "school", title: "Minimum day", allDay: true }));
  }
  return out;
}

/** Every date a stored event lands on, inside the school year. */
export function occurrences(ev: Pick<StoredEvent, "date" | "repeat" | "days" | "until">): ISODate[] {
  if (!ev.date) return [];
  if (ev.repeat !== "weekly") return [ev.date];
  const days = ev.days ?? [];
  if (!days.length) return [];
  const end = ev.until || TERM_END;
  const out: ISODate[] = [];
  for (let d = ev.date; d <= end && out.length < 400; d = addDays(d, 1)) {
    if (days.includes(dow(d))) out.push(d);
  }
  return out;
}

/** The stored events that land on one day, expanded into that day's occurrence. */
export function customFor(date: ISODate, items: StoredEvent[]): PlannerEvent[] {
  const out: PlannerEvent[] = [];
  for (const ev of items) {
    if (ev.repeat === "weekly") {
      if (!(ev.days ?? []).includes(dow(date))) continue;
      if (date < ev.date) continue;
      if (ev.until && date > ev.until) continue;
    } else if (ev.date !== date) {
      continue;
    }
    out.push({
      id: ev.id + "-" + date, sourceId: ev.id, date, cat: ev.cat, title: ev.title,
      start: ev.start, end: ev.end, loc: ev.loc ?? "", notes: ev.notes ?? "",
      fixed: false, allDay: false,
    });
  }
  return out;
}

/** Everything on one day, all-day markers first, then in time order. */
export function eventsFor(
  date: ISODate,
  items: StoredEvent[],
  opts: { school?: boolean } = {},
): PlannerEvent[] {
  const includeSchool = opts.school !== false;
  const list = [
    ...fixedFor(date),
    ...customFor(date, items),
    ...(includeSchool ? schoolMarkers(date) : []),
  ];
  return list.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    if (a.allDay) return 0;
    return toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end);
  });
}

/** Everything across a date range — what the feed and the exports are built from. */
export function collectRange(
  from: ISODate,
  to: ISODate,
  items: StoredEvent[],
  opts: { school?: boolean; cats?: Category[] } = {},
): PlannerEvent[] {
  const start = clampTerm(from);
  const end = clampTerm(to);
  if (end < start) return [];
  const out: PlannerEvent[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    for (const ev of eventsFor(d, items, { school: opts.school })) {
      if (ev.cat === "school") {
        if (opts.school !== false) out.push(ev);
      } else if (!opts.cats || opts.cats.includes(ev.cat)) {
        out.push(ev);
      }
    }
  }
  return out;
}

/** Overlaps between a candidate event and everything already on those days. */
export function findConflicts(
  candidate: Pick<StoredEvent, "id" | "date" | "start" | "end" | "repeat" | "days" | "until">,
  items: StoredEvent[],
): { date: ISODate; with: PlannerEvent }[] {
  const hits: { date: ISODate; with: PlannerEvent }[] = [];
  const from = toMinutes(candidate.start);
  const to = toMinutes(candidate.end);
  for (const date of occurrences(candidate)) {
    for (const other of eventsFor(date, items, { school: false })) {
      if (other.allDay) continue;
      if (other.sourceId && other.sourceId === candidate.id) continue;
      if (from < toMinutes(other.end) && toMinutes(other.start) < to) hits.push({ date, with: other });
    }
  }
  return hits;
}
