/**
 * Uma's courses, and which of them meet on a given day.
 *
 * On an odd/even block schedule the odd-numbered periods meet on odd days and
 * the even-numbered ones on even days, while zero period runs every morning.
 * So the block letter on a day is really a statement about which classes she
 * has — three a day, not five.
 *
 *   Odd day   0 AP Calculus AB · 1 AP English Language · 3 French III Honors
 *   Even day  0 AP Calculus AB · 2 AP Biology          · 4 AP US History
 *
 * No bell times here on purpose. The school's bell schedule was never given,
 * and inventing one would put wrong class times on a student's phone — the one
 * kind of error this app exists to prevent. Classes are listed in period order
 * instead, and stay out of the calendar feed until real times exist.
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

const BY_ID = new Map(CLASSES.map((c) => [c.id, c]));

export const classById = (id: string | undefined): SchoolClass | undefined =>
  id ? BY_ID.get(id) : undefined;

/** The classes that meet on `date`, in period order. Empty on a non-school day. */
export function classesFor(date: ISODate): SchoolClass[] {
  const info = dayInfo(date);
  if (!info.school || !info.block) return [];
  return CLASSES
    .filter((c) => c.meets === "daily" || c.meets === info.block)
    .sort((a, b) => a.period - b.period);
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
  const cls = classById((ev as StoredEvent).classId ?? (ev as PlannerEvent).classId);
  return cls ? `${cls.name} — ${ev.title}` : ev.title;
}

/**
 * When a thing happens, in the most precise terms actually known.
 *
 * A test sits inside its class period, not across the whole day — but without
 * the school's bell schedule there is no honest clock time to give it. Naming
 * the period says when it falls, in the school's own terms, and stops short of
 * inventing a time. Supply bell times and this becomes a real range.
 */
export function whenLabel(ev: PlannerEvent | StoredEvent): string {
  if (!ev.allDay) return fmtRange(ev.start, ev.end);
  const cls = classById((ev as StoredEvent).classId ?? (ev as PlannerEvent).classId);
  return cls ? `period ${cls.period}` : "all day";
}
