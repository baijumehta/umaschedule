/**
 * The part that isn't a calendar.
 *
 * This project exists because a listing was not enough: Uma was registered for
 * the ACT, an email asked her to upload a photo, she did not read it, and the
 * test was cancelled on the day. Nothing she owned was going to say "go and
 * check that". So the app works out, from what is coming, what she should
 * actually *do* about it and when.
 *
 * The rules here are deterministic on purpose. A reminder to check ACT
 * registration has to fire every time, a month out, whether or not a model is
 * reachable or in a good mood. Claude writes the covering sentence on top of
 * these; it never decides what they are.
 */

import { classById } from "./classes";
import {
  addDays, dayInfo, dow, DOW_SHORT, eventsFor, fmtDate, fmtTime, toMinutes,
} from "./schedule";
import type { ISODate, PlannerEvent, StoredEvent } from "./types";

export type Urgency = "now" | "soon" | "ahead";

export interface Nudge {
  /** Stable across days, so marking it done keeps it down. */
  id: string;
  urgency: Urgency;
  title: string;
  detail: string;
  /** The event it is about, for context in the UI. */
  aboutDate?: ISODate;
  aboutTitle?: string;
  /** Offer to find study time for this many minutes. */
  suggestStudyMinutes?: number;
  /** A class to attach any study session to. */
  classId?: string;
}

/**
 * What a rule says, given the thing it is about.
 *
 * Titles and details are built from the event rather than written flat.
 * "Final review tonight" is a fortune cookie; "AP Biology test tomorrow,
 * period 2" is an instruction. A digest is read in ten seconds on a phone with
 * nothing to cross-reference against, so every line carries its own subject,
 * date and stakes.
 */
interface StepContext {
  /** "AP Biology" for a class test, otherwise the event's own title. */
  subject: string;
  /** The event title as entered. */
  title: string;
  /** "Tue Sep 22". */
  when: string;
  /** Whole days from today. */
  days: number;
  /** "period 2", when the event names a class. */
  period: string;
  /** "7am", for a timed event. */
  time: string;
}

interface Step {
  daysBefore: number;
  title: (c: StepContext) => string;
  detail: (c: StepContext) => string;
}

/** "in 5 days", "tomorrow", "today" — phrased the same way everywhere. */
const inDays = (n: number): string => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/**
 * The standardised-test checklist — written directly from what went wrong.
 *
 * The photo step leads because that is the one that cancelled a test. These
 * are prompts to go and verify, not claims about current ACT policy: the app
 * cannot see her ACT account, so the only honest instruction is "check".
 */
const EXAM_STEPS: Step[] = [
  {
    daysBefore: 30,
    title: (c) => `Check your ${c.subject} registration — the photo especially`,
    detail: (c) =>
      `${c.subject} is ${c.when}, ${inDays(c.days)}. Log in and confirm your photo is uploaded ` +
      `and the test centre is right. A missing photo got a test cancelled on the day once ` +
      `already — do not let that be the reason twice.`,
  },
  {
    daysBefore: 14,
    title: (c) => `Print your ${c.subject} admission ticket`,
    detail: (c) =>
      `The ${c.subject} is ${c.when}, ${inDays(c.days)}. Print it now, and check the photo ID ` +
      `you plan to bring is current — both are needed at the door.`,
  },
  {
    daysBefore: 7,
    title: (c) => `Confirm where the ${c.subject} is and when to be there`,
    detail: (c) =>
      `The ${c.subject} is ${inDays(c.days)}. Check the centre address, how long it takes to get there` +
      `${c.time ? ` for a ${c.time} start` : ""}, and what you are allowed to bring in.`,
  },
  {
    daysBefore: 2,
    title: (c) => `Pack for the ${c.subject} tonight, not in the morning`,
    detail: (c) =>
      `${c.when}${c.time ? `, starting ${c.time}` : ""}. Admission ticket, photo ID, approved ` +
      `calculator, pencils, water, a snack — in a bag by the door.`,
  },
  {
    daysBefore: 1,
    title: (c) => `The ${c.subject} is tomorrow${c.time ? ` at ${c.time}` : ""} — early night`,
    detail: () =>
      `Nothing you learn tonight will show up tomorrow. Lay it all by the door and set two alarms.`,
  },
];

const TEST_STEPS: Step[] = [
  {
    daysBefore: 5,
    title: (c) => `Start reviewing for ${c.subject}`,
    detail: (c) =>
      `The test is ${c.when}, ${inDays(c.days)}. Two short sessions this week beat one long one ` +
      `the night before, and there is still room in the week to put them somewhere.`,
  },
  {
    daysBefore: 2,
    title: (c) => `${c.subject}: two evenings left before the test`,
    detail: (c) =>
      `It is ${c.when}${c.period ? `, ${c.period}` : ""}. This is the last point where new ` +
      `material still sticks. After tonight you are only revising what you already know.`,
  },
  {
    daysBefore: 1,
    title: (c) => `${c.subject} test tomorrow${c.period ? `, ${c.period}` : ""}`,
    detail: () =>
      `Final review tonight: go back over whatever you flagged as shaky, then stop. Late ` +
      `cramming costs more in tiredness than it adds in recall.`,
  },
];

const PROJECT_STEPS: Step[] = [
  {
    daysBefore: 7,
    title: (c) => `Start ${c.title} this week`,
    detail: (c) =>
      `Due ${c.when}${c.subject !== c.title ? ` for ${c.subject}` : ""}. A week is comfortable ` +
      `if it starts now and miserable if it starts Thursday.`,
  },
  {
    daysBefore: 3,
    title: (c) => `${c.title}: there should be a draft by now`,
    detail: (c) =>
      `Due ${c.when}, ${inDays(c.days)}. Rough is fine — the point is having something to cut ` +
      `rather than something to begin.`,
  },
  {
    daysBefore: 1,
    title: (c) => `${c.title} is due tomorrow`,
    detail: (c) =>
      `${c.when}${c.subject !== c.title ? `, ${c.subject}` : ""}. Finish it tonight and read it ` +
      `once out loud before you hand it in.`,
  },
];

/** Long enough that a cat:"act" entry is the exam itself, not a prep session. */
const EXAM_MINUTES = 180;

const isExam = (ev: PlannerEvent) =>
  ev.cat === "act" && !ev.allDay && toMinutes(ev.end) - toMinutes(ev.start) >= EXAM_MINUTES;

function daysBetween(a: ISODate, b: ISODate): number {
  let n = 0;
  let cur = a;
  while (cur < b && n < 400) { cur = addDays(cur, 1); n++; }
  return n;
}

const urgencyFor = (days: number): Urgency =>
  days <= 1 ? "now" : days <= 4 ? "soon" : "ahead";

/**
 * Everything worth acting on, as of `today`.
 *
 * A step fires on the day it is due and stays up until its event passes, so a
 * nudge missed on the exact day does not vanish — the ACT photo reminder is
 * not something to show once and drop.
 */
export function nudgesFor(
  today: ISODate,
  events: StoredEvent[],
  done: Set<string> = new Set(),
): Nudge[] {
  const out: Nudge[] = [];
  const horizon = 45;

  for (let i = 0; i <= horizon; i++) {
    const date = addDays(today, i);
    const away = i;

    for (const ev of eventsFor(date, events, { school: false })) {
      const key = ev.sourceId ?? ev.id;
      const when = `${DOW_SHORT[dow(date)]} ${fmtDate(date)}`;

      const emit = (
        steps: Step[], tag: string, cumulative: boolean, extra: Partial<Nudge> = {},
      ) => {
        for (const step of steps) {
          if (away > step.daysBefore) continue;
          const id = `${tag}:${key}:${step.daysBefore}`;
          if (done.has(id)) continue;
          // Escalating reminders of the same task collapse to the tightest one,
          // so a test does not produce three versions of "study" in a morning.
          //
          // A checklist does NOT collapse. Each exam step is a separate thing
          // to have done, and "check your photo is uploaded" must not be hidden
          // by a later "pack your bag" — an unchecked photo two days out is
          // more urgent than it was at thirty, not less. It stays until it is
          // ticked off, which is the whole point of the done set.
          if (!cumulative &&
              steps.some((s) => s.daysBefore < step.daysBefore && away <= s.daysBefore)) continue;
          const cls = classById(ev.classId);
          const ctx: StepContext = {
            subject: cls ? cls.name : ev.title,
            title: ev.title,
            when,
            days: away,
            period: cls ? `period ${cls.period}` : "",
            time: ev.allDay ? "" : fmtTime(ev.start),
          };
          out.push({
            id,
            // A checklist item still outstanding takes the urgency of how close
            // the exam now is, not of the step that spawned it.
            urgency: urgencyFor(away),
            title: step.title(ctx),
            detail: step.detail(ctx),
            aboutDate: date,
            aboutTitle: ev.title,
            ...extra,
          });
        }
      };

      if (isExam(ev)) {
        emit(EXAM_STEPS, "exam", true);
      } else if (ev.cat === "test") {
        emit(TEST_STEPS, "test", false, {
          suggestStudyMinutes: 60,
          classId: ev.classId,
        });
      } else if (ev.cat === "project") {
        emit(PROJECT_STEPS, "project", false, {
          suggestStudyMinutes: 60,
          classId: ev.classId,
        });
      } else if (ev.cat === "lax" && ev.allDay && /to be announced|tba/i.test(ev.notes)) {
        // A tournament whose schedule never arrived is a question for the coach.
        if (away <= 3) {
          const id = `tba:${key}`;
          if (!done.has(id)) {
            out.push({
              id,
              urgency: urgencyFor(away),
              title: `Still no start time for ${ev.title}`,
              detail:
                `It is ${when}, ${inDays(away)}, and the schedule still says to be announced. ` +
                `Ask the coach today — a morning start changes what the rest of that day can hold.`,
              aboutDate: date,
              aboutTitle: ev.title,
            });
          }
        }
      }
    }
  }

  // The habit that failed: checking email. Make it pointed when a registered
  // exam is close, because that is exactly when the message that matters lands.
  const exam = upcomingExam(today, events);
  const examAway = exam ? daysBetween(today, exam.date) : Infinity;
  if (exam && examAway <= 35 && examAway >= 3) {
    const id = `mail:${exam.id}`;
    if (!done.has(id)) {
      out.unshift({
        id,
        urgency: daysBetween(today, exam.date) <= 7 ? "now" : "soon",
        title:
          `The ${exam.title} is ${inDays(examAway)} — ` +
          `open their email the day it arrives`,
        detail:
          `${exam.title} is ${DOW_SHORT[dow(exam.date)]} ${fmtDate(exam.date)}. Registration ` +
          `problems come by email and they expire. This is exactly how a test got cancelled ` +
          `before: the message arrived and went unread.`,
        aboutDate: exam.date,
        aboutTitle: exam.title,
      });
    }
  }

  const rank: Record<Urgency, number> = { now: 0, soon: 1, ahead: 2 };
  return out.sort(
    (a, b) => rank[a.urgency] - rank[b.urgency] || (a.aboutDate ?? "").localeCompare(b.aboutDate ?? ""),
  );
}

function upcomingExam(today: ISODate, events: StoredEvent[]) {
  for (let i = 0; i <= 60; i++) {
    const date = addDays(today, i);
    for (const ev of eventsFor(date, events, { school: false })) {
      if (isExam(ev)) return { id: ev.sourceId ?? ev.id, date, title: ev.title };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Finding time to actually do the work
 * ------------------------------------------------------------------ */

export interface Slot {
  date: ISODate;
  start: string;
  end: string;
  minutes: number;
}

/** Earliest she would realistically start on a school day, and the cutoff. */
const DAY_START_SCHOOL = "15:00";
const DAY_START_FREE = "10:00";
const DAY_END = "21:00";

/**
 * Open windows on a day, after school and existing commitments.
 *
 * Used to answer "shall I put study time in?" with a real slot rather than a
 * suggestion she has to find room for herself.
 */
export function freeSlots(date: ISODate, events: StoredEvent[], minMinutes = 30): Slot[] {
  const info = dayInfo(date);
  const open = toMinutes(info.school ? DAY_START_SCHOOL : DAY_START_FREE);
  const close = toMinutes(DAY_END);

  const busy = eventsFor(date, events, { school: false })
    .filter((e) => !e.allDay)
    .map((e) => ({ from: toMinutes(e.start), to: toMinutes(e.end) }))
    .sort((a, b) => a.from - b.from);

  const slots: Slot[] = [];
  let cursor = open;
  for (const b of busy) {
    if (b.to <= cursor) continue;
    if (b.from - cursor >= minMinutes) {
      slots.push(makeSlot(date, cursor, Math.min(b.from, close)));
    }
    cursor = Math.max(cursor, b.to);
  }
  if (close - cursor >= minMinutes) slots.push(makeSlot(date, cursor, close));

  return slots.filter((s) => s.minutes >= minMinutes);
}

function makeSlot(date: ISODate, from: number, to: number): Slot {
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return { date, start: hhmm(from), end: hhmm(to), minutes: to - from };
}

/**
 * The best study slots before a deadline — nearest days first, because work
 * done the night before is worth less than work done three evenings out.
 */
export function studySlotsBefore(
  today: ISODate,
  deadline: ISODate,
  events: StoredEvent[],
  minutes = 60,
): Slot[] {
  const found: Slot[] = [];
  for (let d = today; d < deadline && found.length < 6; d = addDays(d, 1)) {
    for (const slot of freeSlots(d, events, minutes)) {
      // Cap the proposal at the requested length, starting at the window's open.
      const end = toMinutes(slot.start) + minutes;
      if (end <= toMinutes(slot.end)) {
        found.push(makeSlot(d, toMinutes(slot.start), end));
        break;
      }
    }
  }
  return found;
}

export { classById };
