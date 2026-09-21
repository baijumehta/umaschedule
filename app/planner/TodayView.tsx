"use client";

import { classById, classesFor, displayTitle, whenLabel } from "@/lib/classes";
import { nudgesFor } from "@/lib/guidance";
import {
  addDays, breakSpan, collectRange, dayInfo, dow, DOW_NAMES, DOW_SHORT,
  eventsFor, fmtDate, nextSchoolDay, toMinutes,
} from "@/lib/schedule";
import type { ISODate, PlannerEvent, StoredEvent } from "@/lib/types";
import { BlockChip, CatDot } from "./bits";
import { NudgeList } from "./NudgeList";

/** How far ahead the "coming up" list looks for tests and deadlines. */
const HORIZON_DAYS = 21;

/** Classes do not count as commitments — they are not a choice. */
const NOT_A_COMMITMENT = new Set(["class", "email"]);

interface Props {
  today: ISODate;
  events: StoredEvent[];
  /** Nudge ids already ticked off, so they stay down. */
  doneNudges: Set<string>;
  /** Occurrences she has declined. */
  skipped: Set<string>;
  /** Notes attached to decisions, by occurrence. */
  notes: Map<string, string>;
  onSkipped: (ids: string[], notes: Record<string, string>) => void;
  onEdit: (sourceId: string) => void;
  onAdd: (date: ISODate) => void;
  onOpenWeek: (date: ISODate) => void;
  onSave: (ev: StoredEvent) => Promise<void> | void;
  onNudgeDone: (id: string) => void;
}

/**
 * The morning read.
 *
 * The day itself leads: it is what she opens this for, and it should be the
 * first thing on the screen rather than something to scroll past guidance to
 * reach. What to do about the day follows it.
 *
 * One stacked list per day, and each day appears exactly once. Tests and
 * deadlines sit in that list rather than in a panel of their own — they have
 * real times now, so a separate "due today" box was a third place to say the
 * same thing.
 */
export function TodayView({
  today, events, doneNudges, skipped, notes, onSkipped, onEdit, onAdd, onOpenWeek, onSave,
  onNudgeDone,
}: Props) {
  const info = dayInfo(today);
  const brk = breakSpan(today);

  const todayItems = eventsFor(today, events, { school: false, skipped, notes });

  // The next day worth showing: tomorrow when something is on it, otherwise
  // the next school day — so a Friday briefing still reaches into Monday.
  const tomorrow = addDays(today, 1);
  const tomorrowItems = eventsFor(tomorrow, events, { school: false, skipped, notes });
  const ahead = tomorrowItems.length ? tomorrow : nextSchoolDay(today);
  const aheadItems = ahead && ahead !== tomorrow
    ? eventsFor(ahead, events, { school: false, skipped, notes })
    : tomorrowItems;

  const upcoming = collectRange(addDays(today, 1), addDays(today, HORIZON_DAYS), events, {
    school: false, cats: ["test", "project"], skipped,
  }).filter((ev) => !ev.skipped);

  const nextDay = info.school ? null : nextSchoolDay(addDays(today, -1));

  return (
    <div className="brief">
      {/* ---- what kind of day is this ---- */}
      <section className="panel brief-head">
        <p className="eyebrow">{DOW_NAMES[dow(today)]}, {fmtDate(today, true)}</p>
        <h2>
          {info.school
            ? info.block === "odd" ? "Odd day" : "Even day"
            : brk ? brk[2] : info.reason}{" "}
          <BlockChip info={info} />
          {info.school && info.min && <span className="chip chip-min">min day</span>}
        </h2>

        {!info.school && nextDay && (
          <p className="today-sub" style={{ marginTop: 10 }}>
            Next school day is {DOW_NAMES[dow(nextDay)]}, {fmtDate(nextDay, true)}
            {dayInfo(nextDay).school ? ` — ${dayInfo(nextDay).block} day` : ""}.
          </p>
        )}
      </section>

      <DayList
        label="Today"
        date={today}
        items={todayItems}
        onEdit={onEdit}
        empty={
          <p className="day-empty" style={{ padding: "4px 0 0" }}>
            Nothing scheduled.{" "}
            <button className="linkish" onClick={() => onAdd(today)}>Add something</button>
          </p>
        }
      />

      {ahead && aheadItems.length > 0 && (
        <DayList
          label={ahead === tomorrow ? "Tomorrow" : DOW_NAMES[dow(ahead)]}
          date={ahead}
          items={aheadItems}
          onEdit={onEdit}
        />
      )}

      {/* ---- then what to do about it ---- */}
      <NudgeList
        today={today}
        nudges={nudgesFor(today, events, doneNudges, skipped)}
        events={events}
        onSave={onSave}
        onDone={onNudgeDone}
        onSkipped={onSkipped}
      />

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
                      {dayInfo(ev.date).school
                        ? `${dayInfo(ev.date).block} day`
                        : dayInfo(ev.date).reason}
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

/**
 * One day, stacked: time in its own column, everything in start order.
 *
 * The same component renders today and the day ahead, so the two can never
 * drift into different formats.
 */
function DayList({ label, date, items, onEdit, empty }: {
  label: string;
  date: ISODate;
  items: PlannerEvent[];
  onEdit: (sourceId: string) => void;
  empty?: React.ReactNode;
}) {
  const info = dayInfo(date);
  const committed = items
    .filter((e) => !e.allDay && !e.skipped && !NOT_A_COMMITMENT.has(e.cat))
    .reduce((t, e) => t + (toMinutes(e.end) - toMinutes(e.start)), 0);

  return (
    <section className="panel">
      <div className="brief-bar">
        <p className="eyebrow" style={{ margin: 0 }}>{label}</p>
        <span className="brief-count mono">
          {DOW_SHORT[dow(date)]} {fmtDate(date)}
          {info.school ? ` · ${info.block}` : ""}
          {committed ? ` · ${formatHours(committed)} booked` : ""}
        </span>
      </div>

      {items.length === 0 ? (empty ?? null) : (
        <div className="timeline">
          {items.map((ev) => (
            <div className={"tl" + (ev.skipped ? " tl-skipped" : "")} key={ev.id}>
              <span className="tl-time mono">
                {ev.allDay ? whenLabel(ev) : shortRange(ev)}
              </span>
              <span className="tl-rail" style={{ background: `var(--c-${ev.cat})` }} />
              <span className="tl-main">
                <span className="tl-title">
                  {displayTitle(ev)}
                  {(ev.cat === "test" || ev.cat === "project") && (
                    <span
                      className="tag tl-kind"
                      style={{
                        background: `var(--c-${ev.cat}-bg)`,
                        color: `var(--c-${ev.cat})`,
                      }}
                    >
                      {ev.cat === "test" ? "test" : "due"}
                    </span>
                  )}
                </span>
                {ev.skipped
                  ? <span className="tl-loc tl-declined">Not going</span>
                  : ev.loc && <span className="tl-loc">{ev.loc}</span>}
                {ev.decisionNote && !ev.skipped && (
                  <span className="tl-loc tl-late">{ev.decisionNote}</span>
                )}
                {classById(ev.classId) && (ev.cat === "test" || ev.cat === "project") &&
                  !classesFor(date).some((c) => c.id === ev.classId) && (
                    <span className="tl-loc tl-wrongday">
                      That class does not meet this day
                    </span>
                  )}
              </span>
              {!ev.fixed && ev.sourceId && (
                <button
                  className="btn btn-ghost ev-edit"
                  onClick={() => onEdit(ev.sourceId!)}
                >
                  Edit
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** "1:45–3:45pm" — one suffix when both ends share it, so the column stays narrow. */
function shortRange(ev: PlannerEvent): string {
  const [sh] = ev.start.split(":").map(Number);
  const [eh] = ev.end.split(":").map(Number);
  const half = (h: number) => (h < 12 ? "am" : "pm");
  const clock = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (m ? ":" + String(m).padStart(2, "0") : "");
  };
  return half(sh) === half(eh)
    ? `${clock(ev.start)}–${clock(ev.end)}${half(eh)}`
    : `${clock(ev.start)}${half(sh)}–${clock(ev.end)}${half(eh)}`;
}

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
