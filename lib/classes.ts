/**
 * Uma's courses, when they meet, and at what time.
 *
 * Canyon High runs paired blocks — 1/2, 3/4, 5/6 — with zero period every
 * morning. The pairing is what makes the odd/even calendar mean something:
 * on an odd day the 1/2 block runs period 1, on an even day the same slot
 * runs period 2. So the block letter decides which three of her five classes
 * she actually has, and the bell schedule decides when.
 *
 *   Odd day   0 AP Calculus AB · 1 AP English Language · 3 French III Honors
 *   Even day  0 AP Calculus AB · 2 AP Biology          · 4 AP US History
 *
 * Bell times from canyonhighschool.org/about/bell-schedule. Two variants are
 * modelled: the traditional day and the minimum day, which the block calendar
 * already marks. A third, the double pep assembly, exists but its dates are
 * not published anywhere this app can see, so it is deliberately not guessed.
 */

import { dayInfo, fmtRange } from "./schedule";
import type { ISODate, PlannerEvent, StoredEvent } from "./types";

export interface SchoolClass {
  id: string;
  name: string;
  /** For tight spaces — the week grid and the month cells. */
  short: string;
  period: number;
  /** Zero period runs daily; the rest follow the block letter. */
  meets: "daily" | "odd" | "even";
}

export const CLASSES: SchoolClass[] = [
  { id: "calc",    name: "AP Calculus AB",      short: "AP Calc",    period: 0, meets: "daily" },
  { id: "english", name: "AP English Language", short: "AP English", period: 1, meets: "odd" },
  { id: "bio",     name: "AP Biology",          short: "AP Bio",     period: 2, meets: "even" },
  { id: "french",  name: "French III Honors",   short: "French III", period: 3, meets: "odd" },
  { id: "ushist",  name: "AP US History",       short: "APUSH",      period: 4, meets: "even" },
];

/** Which paired block a period sits in. */
type Block = "0" | "1/2" | "3/4" | "5/6";

const blockOf = (period: number): Block =>
  period === 0 ? "0" : period <= 2 ? "1/2" : period <= 4 ? "3/4" : "5/6";

type Bells = Record<Block, [string, string]>;

const TRADITIONAL: Bells = {
  "0":   ["08:30", "09:22"],
  "1/2": ["09:30", "11:10"],
  "3/4": ["11:30", "13:10"],
  "5/6": ["13:45", "15:25"],
};

/** The compressed bell the block calendar marks as a minimum day. */
const MINIMUM: Bells = {
  "0":   ["08:30", "09:22"],
  "1/2": ["09:30", "10:30"],
  "3/4": ["10:45", "11:45"],
  "5/6": ["11:55", "12:55"],
};

const bellsFor = (date: ISODate): Bells => (dayInfo(date).min ? MINIMUM : TRADITIONAL);

const BY_ID = new Map(CLASSES.map((c) => [c.id, c]));

export const classById = (id: string | undefined): SchoolClass | undefined =>
  id ? BY_ID.get(id) : undefined;

/** A class together with the hours it runs on a particular day. */
export interface ClassOnDay extends SchoolClass {
  start: string;
  end: string;
}

/** The classes that meet on `date`, in period order, with their times. */
export function classesFor(date: ISODate): ClassOnDay[] {
  const info = dayInfo(date);
  if (!info.school || !info.block) return [];
  const bells = bellsFor(date);
  return CLASSES
    .filter((c) => c.meets === "daily" || c.meets === info.block)
    .sort((a, b) => a.period - b.period)
    .map((c) => {
      const [start, end] = bells[blockOf(c.period)];
      return { ...c, start, end };
    });
}

/** When one class runs on one day, or null if it does not meet. */
export function classTimeOn(classId: string, date: ISODate): { start: string; end: string } | null {
  const hit = classesFor(date).find((c) => c.id === classId);
  return hit ? { start: hit.start, end: hit.end } : null;
}

/** Whether a class meets on a day — used to flag a test set on the wrong day. */
export function classMeetsOn(classId: string, date: ISODate): boolean {
  return classesFor(date).some((c) => c.id === classId);
}

/**
 * How a test or project reads once it carries a class:
 * "AP Biology — Unit 3 exam" rather than a bare "Unit 3 exam" with no subject.
 */
export function displayTitle(ev: StoredEvent | PlannerEvent): string {
  // A class event is already named after its class; prefixing would double it.
  if (ev.cat === "class") return ev.title;
  const cls = classById((ev as StoredEvent).classId ?? (ev as PlannerEvent).classId);
  return cls ? `${cls.name} — ${ev.title}` : ev.title;
}

/**
 * When a thing happens, in the most precise terms known.
 *
 * A test sits inside its class period. Now that the bell schedule is known,
 * that is a real time rather than a period number — and on a minimum day it is
 * automatically the compressed one.
 */
export function whenLabel(ev: PlannerEvent | StoredEvent): string {
  if (!ev.allDay) return fmtRange(ev.start, ev.end);

  const classId = (ev as StoredEvent).classId ?? (ev as PlannerEvent).classId;
  const cls = classById(classId);
  if (!cls) return "all day";

  const date = (ev as PlannerEvent).date ?? (ev as StoredEvent).date;
  const time = date ? classTimeOn(cls.id, date) : null;
  return time ? `period ${cls.period}, ${fmtRange(time.start, time.end)}` : `period ${cls.period}`;
}

/**
 * Her classes on one day, as schedule entries.
 *
 * Derived like everything else in the fixed half: no class is stored anywhere,
 * so a holiday or a minimum day reshapes the morning without anyone editing a
 * row. Only the three that actually meet are produced, which is the whole
 * point of the odd/even calendar.
 */
export function classEventsFor(date: ISODate): PlannerEvent[] {
  return classesFor(date).map((c) => ({
    id: `class-${c.id}-${date}`,
    date,
    cat: "class" as const,
    title: c.name,
    start: c.start,
    end: c.end,
    loc: "",
    notes: "",
    fixed: true,
    allDay: false,
    classId: c.id,
  }));
}
