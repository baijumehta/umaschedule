/**
 * Turning the planner into something a calendar app understands.
 *
 * Two outputs, both built from the same `PlannerEvent[]`:
 *   - iCalendar, served live at /api/feed/<token>.ics and subscribed to once.
 *   - CSV, in the column layout Google Calendar's importer expects.
 */

import { displayTitle } from "./classes";
import { addDays, CATEGORIES, D } from "./schedule";
import type { PlannerEvent } from "./types";

/** Orange, California. Times in this app are Pacific wall-clock times. */
export const TZID = "America/Los_Angeles";

/**
 * Pacific time's own rules, so a subscribed calendar renders 1:45 practice at
 * 1:45 Pacific even when the phone reading the feed is in another timezone.
 * Without this the times would float and follow the traveller.
 */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "X-LIC-LOCATION:" + TZID,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const escapeText = (s: string): string =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

/** RFC 5545 caps a content line at 75 octets; continuations start with a space. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) {
    parts.push(rest.slice(0, 72));
    rest = rest.slice(72);
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

const compact = (date: string) => date.replace(/-/g, "");
const clock = (t: string) => t.replace(":", "") + "00";

/**
 * A stable UID per occurrence.
 *
 * This is what lets the feed be re-read forever and a file be re-imported
 * without piling up duplicates: the same practice always carries the same UID,
 * so a calendar updates the event it already has.
 */
function uidFor(ev: PlannerEvent): string {
  const base = ev.fixed ? ev.id : `${ev.sourceId ?? ev.id}-${ev.date}`;
  return base.replace(/[^A-Za-z0-9._-]/g, "") + "@umaschedule";
}

export interface IcsOptions {
  /** Add a 30-minute reminder to timed events. */
  alarms?: boolean;
  /** Shown as the calendar's name when it is subscribed to. */
  name?: string;
}

export function buildIcs(events: PlannerEvent[], opts: IcsOptions = {}): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//umaschedule//Block Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold("X-WR-CALNAME:" + escapeText(opts.name ?? "Uma — School Year")),
    "X-WR-TIMEZONE:" + TZID,
    // Ask subscribers to re-poll roughly every four hours.
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
    ...VTIMEZONE,
  ];

  for (const ev of events) {
    lines.push("BEGIN:VEVENT", "UID:" + uidFor(ev), "DTSTAMP:" + stamp);

    if (ev.allDay) {
      lines.push("DTSTART;VALUE=DATE:" + compact(ev.date));
      lines.push("DTEND;VALUE=DATE:" + compact(addDays(ev.date, 1)));
      // All-day school markers should not make her look busy.
      lines.push("TRANSP:TRANSPARENT");
    } else {
      const d = compact(ev.date);
      lines.push(`DTSTART;TZID=${TZID}:${d}T${clock(ev.start)}`);
      lines.push(`DTEND;TZID=${TZID}:${d}T${clock(ev.end)}`);
    }

    // A test reads as "AP Biology — Unit 3 exam", never a bare title with no subject.
    lines.push(fold("SUMMARY:" + escapeText(displayTitle(ev))));
    if (ev.loc) lines.push(fold("LOCATION:" + escapeText(ev.loc)));
    if (ev.notes) lines.push(fold("DESCRIPTION:" + escapeText(ev.notes)));
    lines.push(fold("CATEGORIES:" + escapeText(CATEGORIES[ev.cat].label)));

    if (opts.alarms && !ev.allDay && ev.cat !== "class" && ev.cat !== "email") {
      lines.push(
        "BEGIN:VALARM",
        "TRIGGER:-PT30M",
        "ACTION:DISPLAY",
        fold("DESCRIPTION:" + escapeText(ev.title)),
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ *
 * CSV, in Google Calendar's import layout
 * ------------------------------------------------------------------ */

const csvCell = (v: string): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const usDate = (s: string): string => {
  const d = D(s);
  return [
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
    d.getUTCFullYear(),
  ].join("/");
};

const usTime = (t: string): string => {
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
};

export function buildCsv(events: PlannerEvent[]): string {
  const rows: string[][] = [[
    "Subject", "Start Date", "Start Time", "End Date", "End Time",
    "All Day Event", "Description", "Location",
  ]];

  for (const ev of events) {
    const description = [ev.notes, CATEGORIES[ev.cat].label].filter(Boolean).join(" — ");
    const subject = displayTitle(ev);
    rows.push(ev.allDay
      ? [subject, usDate(ev.date), "", usDate(ev.date), "", "True", description, ""]
      : [subject, usDate(ev.date), usTime(ev.start), usDate(ev.date), usTime(ev.end),
         "False", description, ev.loc ?? ""]);
  }

  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
