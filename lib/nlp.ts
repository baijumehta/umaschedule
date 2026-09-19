import * as z from "zod";
import { CLASSES } from "./classes";
import { addDays, CATEGORIES, dayInfo, DOW_NAMES, dow, TERM_END, TERM_START } from "./schedule";
import type { ISODate } from "./types";

/**
 * Turning "bio test on the 23rd" into a draft event.
 *
 * The model's job is deliberately narrow: pull out what was said. It never
 * writes to the database — every parse comes back as a draft that a person
 * confirms, and the block calendar stays authoritative in code, which checks
 * the result afterwards. An LLM that mis-hears a date should cost a correction,
 * not a missed practice.
 */

const CATEGORY_IDS = Object.keys(CATEGORIES) as [string, ...string[]];

export const DraftSchema = z.object({
  title: z.string().describe("Short name, e.g. 'Behind-the-wheel lesson'. No date or time in it."),
  cat: z.enum(CATEGORY_IDS).describe("Best-fitting category id."),
  classId: z.string().describe("Class id for a test or project, else an empty string."),
  date: z.string().describe("YYYY-MM-DD. For a repeat, the first date it can occur."),
  allDay: z.boolean().describe("True when no clock time was given, as for a test or a due date."),
  start: z.string().describe("HH:MM 24-hour, or empty when allDay."),
  end: z.string().describe("HH:MM 24-hour, or empty when allDay."),
  loc: z.string().describe("Where, if said. 'Online' counts. Else empty."),
  notes: z.string().describe("Anything left over worth keeping, such as an instructor's name."),
  repeat: z.enum(["none", "weekly"]),
  days: z.array(z.number()).describe("For a weekly repeat, weekday numbers, 0 = Sunday. Else []."),
  until: z.string().describe("YYYY-MM-DD last date of a weekly repeat, else empty."),
  assumptions: z.array(z.string()).describe(
    "Anything filled in that was not actually said — above all a guessed duration. " +
    "Write them as short phrases a parent would read, e.g. 'assumed 1 hour'.",
  ),
});

export const ParseSchema = z.object({
  events: z.array(DraftSchema),
  /** Set when nothing schedulable was found, so the UI can say why. */
  problem: z.string(),
});

export type Draft = z.infer<typeof DraftSchema>;
export type ParseResult = z.infer<typeof ParseSchema>;

/** A compact block calendar so phrases like "next odd day" can resolve. */
function calendarWindow(today: ISODate, days = 45): string {
  const lines: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    if (d > TERM_END) break;
    const info = dayInfo(d);
    lines.push(
      `${d} ${DOW_NAMES[dow(d)].slice(0, 3)} ${
        info.school ? `${info.block} day` : `no school (${info.reason})`
      }`,
    );
  }
  return lines.join("\n");
}

export function buildSystemPrompt(today: ISODate): string {
  return [
    "You turn a parent's or student's shorthand into draft calendar entries for Uma,",
    "a junior at Canyon High School. You only extract; a person confirms every draft",
    "before it is saved.",
    "",
    `Today is ${DOW_NAMES[dow(today)]}, ${today}.`,
    `The school year runs ${TERM_START} to ${TERM_END}.`,
    "Resolve every relative date ('tomorrow', 'next Tuesday', 'the 23rd') against today.",
    "'The 23rd' means the next 23rd that has not passed.",
    "",
    "CATEGORIES (use the id):",
    ...Object.entries(CATEGORIES).map(([id, c]) => `  ${id} — ${c.label}`),
    "Use 'test' for an exam or quiz and 'project' for something due.",
    "Use 'other' when nothing fits; never invent a category id.",
    "",
    "HER CLASSES (use the id for a test or project):",
    ...CLASSES.map((c) => `  ${c.id} — ${c.name}, period ${c.period}`),
    "A subject named in a test or project maps to its class id. Otherwise classId is ''.",
    "",
    "TIMES",
    "  A test or a due date has no clock time: allDay true, start and end empty.",
    "  Something with a start but no end: pick a sensible duration and RECORD IT in",
    "  assumptions. A driving lesson is about 2 hours, a tutoring session or a",
    "  meeting about 1, a lesson about 1. Never leave a timed event without an end.",
    "  Assume afternoon for a bare hour that would otherwise land at night:",
    "  'practice at 4' is 16:00, not 04:00.",
    "",
    "REPEATS",
    "  'every Tuesday', 'Mondays and Thursdays' → repeat 'weekly' with days set.",
    "  A phrase like 'until winter break' → until '2026-12-18'.",
    "  One-off otherwise: repeat 'none', days [], until ''.",
    "",
    "Several things in one sentence become several events.",
    "If nothing schedulable was said, return an empty events array and explain in problem.",
    "",
    "The school calendar, for resolving weekday and odd/even references:",
    calendarWindow(today),
  ].join("\n");
}
