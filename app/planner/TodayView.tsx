"use client";

import { classesFor, classById, displayTitle } from "@/lib/classes";
import {
  addDays, breakSpan, collectRange, dayInfo, dow, DOW_NAMES, DOW_SHORT,
  eventsFor, fmtDate, fmtRange, nextSchoolDay, TERM_END, toMinutes,
} from "@/lib/schedule";
import type { ISODate, PlannerEvent, StoredEvent } from "@/lib/types";
import { BlockChip, CatDot } from "./bits";

/** How far ahead the "coming up" list looks for tests and deadlines. */
const HORIZON_DAYS = 21;

interface Props {
  today: ISODate;
  events: StoredEvent[];
  onEdit: (sourceId: string) => void;
  onAdd: (date: ISODate) => void;
  onOpenWeek: (date: ISODate) => void;
}

/**
 * The morning read.
 *
 * Ordered by what she can still act on: what is due or being tested today, then
 * which classes actually meet (the block letter decides), then the day's
 * timeline, then deadlines far enough out to still do something about.
 */
export function TodayView({ today, events, onEdit, onAdd, onOpenWeek }: Props) {
  const info = dayInfo(today);
  const classes = classesFor(today);
  const timed = eventsFor(today, events, { school: false }).filter((e) => !e.allDay);
  const dueToday = eventsFor(today, events, { school: false }).filter(
    (e) => e.allDay && (e.cat === "test" || e.cat === "project"),
  );

  const upcoming = collectRange(addDays(today, 1), addDays(today, HORIZON_DAYS), events, {
    school: false,
    cats: ["test", "project"],
  });

  const nextDay = nextSchoolDay(info.school ? today : addDays(today, -1));
  const showNext = nextDay && nextDay !== today;

  const busyMinutes = timed.reduce((t, e) => t + (toMinutes(e.end) - toMinutes(e.start)), 0);
  const brk = breakSpan(today);

  return (
    <div className="brief">
      {/* ---- the headline: what kind of day is this ---- */}
      <section className="panel brief-head">
        <p className="eyebrow">{DOW_NAMES[dow(today)]}, {fmtDate(today, true)}</p>
        <h2>
          {info.school
            ? info.block === "odd" ? "Odd day" : "Even day"
            : brk ? brk[2] : info.reason}{" "}
          <BlockChip info={info} />
          {info.school && info.min && <span className="chip chip-min">min day</span>}
        </h2>

        {info.school ? (
          <>
            <p className="eyebrow" style={{ marginTop: 16 }}>Classes today</p>
            <ul className="classlist">
              {classes.map((c) => (
                <li className="classrow" key={c.id}>
                  <span className="period mono">{c.period}</span>
                  <span className="classname">{c.name}</span>
                </li>
              ))}
            </ul>
          </>
        ) : showNext ? (
          <NextUp date={nextDay!} events={events} onOpenWeek={onOpenWeek} />
        ) : null}
      </section>

      {/* ---- anything that needs attention right now ---- */}
      {dueToday.length > 0 && (
        <section className="panel">
          <p className="eyebrow">Today</p>
          {dueToday.map((ev) => (
            <div className="due due-now" key={ev.id}>
              <CatDot cat={ev.cat} />
              <div>
                <div className="due-title">{displayTitle(ev)}</div>
                <div className="due-meta">
                  {ev.cat === "test" ? "Test" : "Project due"}
                  {classById(ev.classId) && !classesFor(today).some((c) => c.id === ev.classId) && (
                    <span className="due-flag">
                      {" · "}that class does not meet today
                    </span>
                  )}
                </div>
                {ev.notes && <div className="due-notes">{ev.notes}</div>}
              </div>
              {ev.sourceId && (
                <button className="btn btn-ghost" onClick={() => onEdit(ev.sourceId!)}>Edit</button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ---- the day itself ---- */}
      <section className="panel">
        <div className="brief-bar">
          <p className="eyebrow" style={{ margin: 0 }}>
            {info.school ? "After school" : "Today"}
          </p>
          <span className="brief-count mono">
            {busyMinutes ? formatHours(busyMinutes) + " committed" : "nothing booked"}
          </span>
        </div>

        {timed.length === 0 ? (
          <p className="day-empty" style={{ padding: "4px 0 0" }}>
            Nothing scheduled. <button className="linkish" onClick={() => onAdd(today)}>Add something</button>
          </p>
        ) : (
          <div className="timeline">
            {timed.map((ev) => (
              <div className="tl" key={ev.id}>
                <span className="tl-time mono">{fmtRange(ev.start, ev.end)}</span>
                <span className="tl-rail" style={{ background: railFor(ev) }} />
                <span className="tl-main">
                  <span className="tl-title">{displayTitle(ev)}</span>
                  {ev.loc && <span className="tl-loc">{ev.loc}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- what is bearing down ---- */}
      <section className="panel">
        <p className="eyebrow">Coming up</p>
        {upcoming.length === 0 ? (
          <p className="day-empty" style={{ padding: "4px 0 0" }}>
            No tests or projects in the next three weeks.
          </p>
        ) : (
          <div className="upcoming">
            {upcoming.map((ev) => {
              const away = daysBetween(today, ev.date);
              return (
                <button
                  className="up" key={ev.id}
                  onClick={() => onOpenWeek(ev.date)}
                  title="Show that week"
                >
                  <span className={"countdown" + (away <= 2 ? " countdown-soon" : "")}>
                    {away === 1 ? "tomorrow" : `${away} days`}
                  </span>
                  <span className="up-main">
                    <span className="up-title">
                      <CatDot cat={ev.cat} />
                      {displayTitle(ev)}
                    </span>
                    <span className="up-when mono">
                      {DOW_SHORT[dow(ev.date)]} {fmtDate(ev.date)}
                      {" · "}
                      {dayInfo(ev.date).school ? `${dayInfo(ev.date).block} day` : dayInfo(ev.date).reason}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function NextUp({ date, events, onOpenWeek }: {
  date: ISODate; events: StoredEvent[]; onOpenWeek: (d: ISODate) => void;
}) {
  const info = dayInfo(date);
  const classes = classesFor(date);
  const list = eventsFor(date, events, { school: false });

  return (
    <>
      <p className="eyebrow" style={{ marginTop: 16 }}>Next school day</p>
      <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>
        {DOW_NAMES[dow(date)]}, {fmtDate(date, true)} <BlockChip info={info} />
      </h3>
      <ul className="classlist">
        {classes.map((c) => (
          <li className="classrow" key={c.id}>
            <span className="period mono">{c.period}</span>
            <span className="classname">{c.name}</span>
          </li>
        ))}
      </ul>
      {list.length > 0 && (
        <p className="today-sub" style={{ marginTop: 10 }}>
          {list.map((e) => (e.allDay ? displayTitle(e) : `${fmtRange(e.start, e.end)} ${e.title}`)).join("  ·  ")}
        </p>
      )}
      <button className="linkish" style={{ marginTop: 10 }} onClick={() => onOpenWeek(date)}>
        See that week
      </button>
    </>
  );
}

const railFor = (ev: PlannerEvent) =>
  `var(--c-${ev.cat === "lax" ? "lax" : ev.cat})`;

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return (minutes % 60 ? hours.toFixed(1) : String(hours)) + " hrs";
}

/** Whole days from `a` to `b`, both plain dates, so no clock arithmetic. */
function daysBetween(a: ISODate, b: ISODate): number {
  let n = 0;
  let cur = a;
  while (cur < b && n < 400) {
    cur = addDays(cur, 1);
    n++;
  }
  return n;
}

export { TERM_END };
