"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, clampTerm, D, dow, mondayOf } from "@/lib/schedule";
import type { ISODate, StoredEvent } from "@/lib/types";
import { api, NotAuthorized, readKey, writeKey } from "./api";
import { CalendarPanel } from "./CalendarPanel";
import { EventDialog } from "./EventDialog";
import { Gate } from "./Gate";
import { MonthView } from "./MonthView";
import { TodayCard } from "./TodayCard";
import { TodayView } from "./TodayView";
import { WeekView } from "./WeekView";

type Tab = "today" | "week" | "month" | "calendar";

export function Planner({ today }: { today: ISODate }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [gateError, setGateError] = useState("");
  const [gateBusy, setGateBusy] = useState(false);

  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loadError, setLoadError] = useState("");

  const [tab, setTab] = useState<Tab>("today");
  const [weekStart, setWeekStart] = useState<ISODate>(() => mondayOf(clampTerm(today)));
  const [month, setMonth] = useState<string>(() => clampTerm(today).slice(0, 7));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StoredEvent | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState("");

  const load = useCallback(async (key?: string) => {
    try {
      setEvents(await api.list(key));
      setLoadError("");
      setAuthed(true);
    } catch (err) {
      if (err instanceof NotAuthorized) {
        setAuthed(false);
      } else {
        setAuthed(true);
        setLoadError(err instanceof Error ? err.message : "Could not load the planner.");
      }
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!readKey()) { setAuthed(false); return; }
    load().catch(() => { /* Handled by state above. */ });
  }, [load]);

  async function unlock(key: string) {
    setGateBusy(true);
    setGateError("");
    try {
      await load(key);
      writeKey(key);
    } catch (err) {
      setGateError(err instanceof NotAuthorized
        ? "That passphrase does not match."
        : err instanceof Error ? err.message : "Could not reach the planner.");
    } finally {
      setGateBusy(false);
    }
  }

  async function save(ev: StoredEvent) {
    setSaveBusy(true);
    setSaveError("");
    const exists = events.some((e) => e.id === ev.id);
    try {
      const saved = exists ? await api.update(ev) : await api.create(ev);
      setEvents((prev) =>
        exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved],
      );
      setDialogOpen(false);
      setEditing(null);
    } catch (err) {
      if (err instanceof NotAuthorized) setAuthed(false);
      else setSaveError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function remove(id: string) {
    setSaveBusy(true);
    setSaveError("");
    try {
      await api.remove(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setDialogOpen(false);
      setEditing(null);
    } catch (err) {
      if (err instanceof NotAuthorized) setAuthed(false);
      else setSaveError(err instanceof Error ? err.message : "Could not delete that.");
    } finally {
      setSaveBusy(false);
    }
  }

  function openAdd(date?: ISODate) {
    setEditing(null);
    setSaveError("");
    if (date) setDefaultDate(date);
    setDialogOpen(true);
  }

  const [defaultDate, setDefaultDate] = useState<ISODate>(() => clampTerm(today));

  function openEdit(sourceId: string) {
    const found = events.find((e) => e.id === sourceId);
    if (!found) return;
    setEditing(found);
    setSaveError("");
    setDialogOpen(true);
  }

  function jumpToDay(date: ISODate) {
    setWeekStart(mondayOf(date));
    setTab("week");
    requestAnimationFrame(() => {
      document.getElementById("day-" + date)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  // Arrow keys page through weeks and months when nothing else has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialogOpen) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const step = e.key === "ArrowLeft" ? -1 : 1;
      if (tab === "week") setWeekStart((w) => addDays(w, step * 7));
      if (tab === "month") setMonth((m) => shiftMonth(m, step));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, dialogOpen]);

  if (authed === null) {
    return <div className="wrap"><p className="status" style={{ marginTop: 40 }}>Opening&hellip;</p></div>;
  }

  if (authed === false) {
    return <Gate onSubmit={unlock} error={gateError} busy={gateBusy} />;
  }

  return (
    <>
      <div className="mast">
        <div className="mast-in">
          <h1 className="brand">
            Uma&rsquo;s <span>Block</span> Planner
          </h1>
          <div className="tabs" role="tablist" aria-label="Views">
            {(["today", "week", "month", "calendar"] as Tab[]).map((t) => (
              <button
                key={t} className="tab" role="tab" aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                {t === "calendar" ? "Calendar" : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => openAdd()}>+ Add</button>
        </div>
      </div>

      <div className="wrap">
        {loadError && (
          <div className="alert" style={{ marginTop: 20 }}>
            <strong>{loadError}</strong>
          </div>
        )}

        {tab !== "today" && <TodayCard today={today} events={events} />}

        {tab === "today" && (
          <TodayView
            today={today} events={events}
            onEdit={openEdit}
            onAdd={(d) => openAdd(d)}
            onOpenWeek={jumpToDay}
          />
        )}

        {tab === "week" && (
          <WeekView
            weekStart={weekStart} today={today} events={events}
            onShift={(n) => setWeekStart((w) => addDays(w, n * 7))}
            onToday={() => setWeekStart(mondayOf(clampTerm(today)))}
            onEdit={openEdit}
          />
        )}

        {tab === "month" && (
          <MonthView
            month={month} today={today} events={events}
            onShift={(n) => setMonth((m) => shiftMonth(m, n))}
            onToday={() => setMonth(clampTerm(today).slice(0, 7))}
            onPickDay={jumpToDay}
          />
        )}

        {tab === "calendar" && <CalendarPanel today={today} events={events} />}

        <Footer />
      </div>

      <EventDialog
        open={dialogOpen}
        editing={editing}
        defaultDate={defaultDate}
        events={events}
        busy={saveBusy}
        error={saveError}
        onSave={save}
        onDelete={remove}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
      />
    </>
  );
}

function shiftMonth(month: string, by: number): string {
  const d = D(month + "-01");
  d.setUTCMonth(d.getUTCMonth() + by, 1);
  return d.toISOString().slice(0, 7);
}

function Footer() {
  return (
    <div className="foot">
      <p>
        <strong>Where the fixed schedule comes from.</strong> Canyon High School&rsquo;s 2026&ndash;27
        block calendar and the Orange Unified district calendar. Odd and even days, minimum days,
        breaks and no-school days are taken straight from them.
      </p>
      <p>
        <strong>Email.</strong> Ten minutes, 7:45&ndash;7:55, every school morning Monday to Friday.
      </p>
      <p>
        <strong>Practice.</strong> Monday, Wednesday and Thursday through the last day before winter
        break, Dec 18. Odd days: Upper Fields, 1:45&ndash;3:45. Even days: Crescent Elementary,
        3:45&ndash;5:45.
      </p>
      <p>
        <strong>Piano.</strong> Wednesdays at 1:45, an hour, on any school Wednesday when practice is
        not already at 1:45 &mdash; even Wednesdays during the season, every Wednesday after it.
      </p>
      <p>
        None of those are saved anywhere: they are worked out from the block calendar each time, so a
        holiday or a break clears them without anyone editing a thing.
      </p>
    </div>
  );
}

export { dow };
