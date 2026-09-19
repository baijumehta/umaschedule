"use client";

import { classesFor } from "@/lib/classes";
import {
  addDays, breakSpan, dayInfo, dow, DOW_NAMES, eventsFor, fmtDate, mondayOf, D,
} from "@/lib/schedule";
import type { ISODate, StoredEvent } from "@/lib/types";
import { BlockChip, EventRow, Legend } from "./bits";

interface Props {
  weekStart: ISODate;
  today: ISODate;
  events: StoredEvent[];
  onShift: (weeks: number) => void;
  onToday: () => void;
  onEdit: (sourceId: string) => void;
}

/**
 * The week as a stack of day rows rather than a column grid: a day with five
 * things on it just gets taller, and the same layout works at phone width.
 */
export function WeekView({ weekStart, today, events, onShift, onToday, onEdit }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div>
      <div className="navbar">
        <button className="btn btn-ghost" onClick={() => onShift(-1)} aria-label="Previous week">
          &larr;
        </button>
        <h3>
          {fmtDate(weekStart, true)} &ndash; {fmtDate(addDays(weekStart, 6), true)},{" "}
          {D(weekStart).getUTCFullYear()}
        </h3>
        <button className="btn btn-ghost mono" onClick={onToday}>
          Today
        </button>
        <button className="btn btn-ghost" onClick={() => onShift(1)} aria-label="Next week">
          &rarr;
        </button>
      </div>

      <div className="days">
        {days.map((date) => {
          const info = dayInfo(date);
          const list = eventsFor(date, events);
          const brk = breakSpan(date);
          const classes = [
            "day",
            info.school ? "" : "day-off",
            date === today ? "day-today" : "",
          ].filter(Boolean).join(" ");

          return (
            <div className={classes} key={date} id={"day-" + date}>
              <div className="day-gut">
                <div className="day-dow">{DOW_NAMES[dow(date)]}</div>
                <div className="day-date mono">{fmtDate(date)}</div>
                {info.school ? (
                  <BlockChip info={info} />
                ) : (
                  <span className="chip chip-off">{brk ? brk[2] : info.reason}</span>
                )}
                {info.school && info.min && <span className="chip chip-min">min day</span>}
              </div>

              <div className="day-body">
                {info.school && (
                  <div className="classes-strip">
                    {classesFor(date).map((c) => (
                      <span className="cstrip" key={c.id}>
                        <b className="mono">{c.period}</b> {c.short}
                      </span>
                    ))}
                  </div>
                )}
                {list.length === 0 ? (
                  <div className="day-empty">{info.school ? "Nothing after school." : "Open."}</div>
                ) : (
                  list.map((ev) => <EventRow key={ev.id} ev={ev} onEdit={onEdit} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Legend />
    </div>
  );
}

export { mondayOf };
