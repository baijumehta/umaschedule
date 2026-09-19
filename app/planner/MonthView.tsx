"use client";

import {
  addDays, CATEGORIES, D, dayInfo, dow, DOW_NAMES, DOW_SHORT, eventsFor, MONTHS,
} from "@/lib/schedule";
import type { ISODate, StoredEvent } from "@/lib/types";
import { Legend } from "./bits";

interface Props {
  /** "YYYY-MM" */
  month: string;
  today: ISODate;
  events: StoredEvent[];
  onShift: (months: number) => void;
  onToday: () => void;
  onPickDay: (date: ISODate) => void;
}

/**
 * A month at a glance. Each cell carries the block letter — the pattern of O
 * and E across the month is the thing that is genuinely hard to hold in your
 * head — plus one dot per commitment.
 */
export function MonthView({ month, today, events, onShift, onToday, onPickDay }: Props) {
  const first = month + "-01";
  const firstOfNext = nextMonthStart(first);
  const lastOfMonth = addDays(firstOfNext, -1);

  const cells: ISODate[] = [];
  for (
    let d = addDays(first, -dow(first));
    d <= addDays(lastOfMonth, 6 - dow(lastOfMonth));
    d = addDays(d, 1)
  ) {
    cells.push(d);
  }

  return (
    <div>
      <div className="navbar">
        <button className="btn btn-ghost" onClick={() => onShift(-1)} aria-label="Previous month">
          &larr;
        </button>
        <h3>
          {MONTHS[D(first).getUTCMonth()]} {D(first).getUTCFullYear()}
        </h3>
        <button className="btn btn-ghost mono" onClick={onToday}>
          Today
        </button>
        <button className="btn btn-ghost" onClick={() => onShift(1)} aria-label="Next month">
          &rarr;
        </button>
      </div>

      <div className="mgrid" aria-hidden="true">
        {DOW_SHORT.map((d) => (
          <div className="mhead" key={d}>{d}</div>
        ))}
      </div>

      <div className="mgrid">
        {cells.map((date) => {
          const info = dayInfo(date);
          const list = eventsFor(date, events, { school: false });
          const classes = [
            "mcell",
            date.slice(0, 7) === month ? "" : "mcell-out",
            info.school ? "" : "mcell-off",
            date === today ? "mcell-today" : "",
          ].filter(Boolean).join(" ");

          return (
            <button
              type="button"
              className={classes}
              key={date}
              onClick={() => onPickDay(date)}
              aria-label={`${DOW_NAMES[dow(date)]} ${MONTHS[D(date).getUTCMonth()]} ${D(date).getUTCDate()}${
                info.school ? `, ${info.block} day` : `, ${info.reason}`
              }`}
            >
              <div className="mcell-top">
                <span className="mnum mono">{D(date).getUTCDate()}</span>
                {info.school && (
                  <span
                    className="mblk"
                    style={{
                      background: info.block === "odd" ? "var(--ink)" : "var(--gold)",
                      color: info.block === "odd" ? "var(--paper)" : "#1a1815",
                    }}
                  >
                    {info.block === "odd" ? "O" : "E"}
                  </span>
                )}
              </div>
              <div className="mdots">
                {list.map((ev) => (
                  <i
                    className="mdot"
                    key={ev.id}
                    style={{ background: `var(${CATEGORIES[ev.cat].cssVar})` }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <Legend />
    </div>
  );
}

function nextMonthStart(first: ISODate): ISODate {
  const d = D(first);
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}
