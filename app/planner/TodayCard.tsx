"use client";

import {
  breakSpan, dayInfo, DOW_NAMES, DOW_SHORT, eventsFor, fixedFor,
  fmtDate, fmtRange, fmtTime, nextSchoolDay, toMinutes,
} from "@/lib/schedule";
import type { ISODate, PlannerEvent, StoredEvent } from "@/lib/types";
import { BlockChip } from "./bits";

const oneLine = (list: PlannerEvent[]) =>
  list.map((e) => (e.allDay ? "" : fmtTime(e.start) + " ") + e.title).join("  ·  ");

/**
 * The answer to "what is today?" before any scrolling — which block it runs,
 * and therefore where practice is. On a weekend or a break it looks ahead to
 * the next school day instead, which is the thing actually worth knowing then.
 */
export function TodayCard({ today, events }: { today: ISODate; events: StoredEvent[] }) {
  const info = dayInfo(today);
  const mine = eventsFor(today, events, { school: false });

  let headline: string;
  let sub = "";

  if (info.school) {
    headline = info.block === "odd" ? "Odd day" : "Even day";
    const practice = fixedFor(today).find((e) => e.cat === "lax");
    sub = practice
      ? `Practice ${fmtRange(practice.start, practice.end)} at ${practice.loc}`
      : "No practice today.";
    if (info.min) sub = "Minimum day. " + sub;
  } else {
    const brk = breakSpan(today);
    headline = brk ? brk[2] : info.reason ?? "No school";
    const back = brk ? nextSchoolDay(brk[1]) : null;
    if (back) sub = `Back ${DOW_NAMES[new Date(back + "T12:00:00Z").getUTCDay()]}, ${fmtDate(back, true)}.`;
  }

  const upcoming = info.school ? nextSchoolDay(today) : nextSchoolDay(addBack(today));
  const showNext = upcoming && upcoming !== today;

  const busyMinutes = mine
    .filter((e) => !e.allDay)
    .reduce((total, e) => total + (toMinutes(e.end) - toMinutes(e.start)), 0);

  return (
    <section className="today">
      <div className="today-l">
        <p className="eyebrow">
          {DOW_NAMES[new Date(today + "T12:00:00Z").getUTCDay()]}, {fmtDate(today, true)}
        </p>
        <h2>
          {headline} <BlockChip info={info} />
        </h2>
        {sub && <p className="today-sub">{sub}</p>}
        {mine.length > 0 && <p className="today-sub">{oneLine(mine)}</p>}
      </div>

      <div className="today-next">
        {showNext ? <NextDay date={upcoming!} events={events} /> : (
          <>
            <p className="eyebrow">Committed today</p>
            <h2>{busyMinutes ? formatHours(busyMinutes) : "Free"}</h2>
            <p className="today-sub">
              {mine.length} {mine.length === 1 ? "thing" : "things"} on the list.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function NextDay({ date, events }: { date: ISODate; events: StoredEvent[] }) {
  const info = dayInfo(date);
  const list = eventsFor(date, events, { school: false });
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  return (
    <>
      <p className="eyebrow">Next school day</p>
      <h2>
        {DOW_SHORT[weekday]}, {fmtDate(date)} <BlockChip info={info} />
      </h2>
      <p className="today-sub">{list.length ? oneLine(list) : "Nothing scheduled."}</p>
    </>
  );
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return (minutes % 60 ? hours.toFixed(1) : String(hours)) + " hrs";
}

/** nextSchoolDay looks strictly forward, so step back a day to include today. */
function addBack(date: ISODate): ISODate {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
