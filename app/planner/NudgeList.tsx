"use client";

import { useMemo, useState } from "react";
import { HEADER } from "@/lib/auth";
import { studySlotsBefore, type Nudge, type Slot } from "@/lib/guidance";
import { classById } from "@/lib/classes";
import { DOW_SHORT, dow, fmtDate, fmtRange } from "@/lib/schedule";
import type { ISODate, StoredEvent } from "@/lib/types";
import { newId, readKey } from "./api";
import { ConflictChoice } from "./ConflictChoice";

interface Props {
  today: ISODate;
  nudges: Nudge[];
  events: StoredEvent[];
  onSave: (ev: StoredEvent) => Promise<void> | void;
  onDone: (id: string) => void;
  onSkipped: (ids: string[], notes: Record<string, string>) => void;
}

const LABEL: Record<Nudge["urgency"], string> = {
  now: "Do this today",
  soon: "This week",
  ahead: "Ahead",
};

/**
 * The part of the app that is not a calendar.
 *
 * Each item is something to act on, and where there is an obvious action the
 * app offers to take it — a test five days out comes with real free evenings
 * to put study time in, rather than an instruction to find some.
 */
export function NudgeList({ today, nudges, events, onSave, onDone, onSkipped }: Props) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!nudges.length) {
    return (
      <section className="panel">
        <p className="eyebrow">What to do</p>
        <p className="day-empty" style={{ padding: "4px 0 0" }}>
          Nothing needs chasing. Everything ahead is far enough out.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <p className="eyebrow">What to do</p>
      <div className="nudges">
        {nudges.map((n) => (
          <NudgeRow
            key={n.id}
            nudge={n}
            today={today}
            events={events}
            open={openFor === n.id}
            busy={busy}
            onToggleSlots={() => setOpenFor(openFor === n.id ? null : n.id)}
            onSave={async (ev) => { setBusy(true); try { await onSave(ev); } finally { setBusy(false); setOpenFor(null); } }}
            onDone={onDone}
            onSkipped={onSkipped}
          />
        ))}
      </div>
    </section>
  );
}

function NudgeRow({
  nudge, today, events, open, busy, onToggleSlots, onSave, onDone, onSkipped,
}: {
  nudge: Nudge;
  today: ISODate;
  events: StoredEvent[];
  open: boolean;
  busy: boolean;
  onToggleSlots: () => void;
  onSave: (ev: StoredEvent) => Promise<void>;
  onDone: (id: string) => void;
  onSkipped: (ids: string[], notes: Record<string, string>) => void;
}) {
  const minutes = nudge.suggestStudyMinutes ?? 0;

  const slots = useMemo(
    () => (minutes && nudge.aboutDate
      ? studySlotsBefore(today, nudge.aboutDate, events, minutes)
      : []),
    [minutes, nudge.aboutDate, today, events],
  );

  async function book(slot: Slot) {
    const cls = classById(nudge.classId);
    await onSave({
      id: newId(),
      title: cls ? `Study for ${cls.short}` : "Study",
      cat: "study",
      date: slot.date,
      start: slot.start,
      end: slot.end,
      allDay: false,
      classId: nudge.classId ?? "",
      loc: "",
      notes: nudge.aboutTitle ? `For ${nudge.aboutTitle}` : "",
      repeat: "none",
      days: [],
      until: "",
    });
  }

  async function dismiss() {
    try {
      await fetch("/api/nudges", {
        method: "POST",
        headers: { "content-type": "application/json", [HEADER]: readKey() },
        body: JSON.stringify({ id: nudge.id, done: true }),
      });
    } catch {
      /* Falls back to reappearing tomorrow, which is the safe direction. */
    }
    onDone(nudge.id);
  }

  return (
    <div className={"nudge nudge-" + nudge.urgency}>
      <div className="nudge-body">
        <div className="nudge-tag">{LABEL[nudge.urgency]}</div>
        <div className="nudge-title">{nudge.title}</div>
        <div className="nudge-detail">{nudge.detail}</div>
        {nudge.aboutDate && (
          <div className="nudge-about mono">
            {DOW_SHORT[dow(nudge.aboutDate)]} {fmtDate(nudge.aboutDate)}
            {nudge.aboutTitle ? ` · ${nudge.aboutTitle}` : ""}
          </div>
        )}

        {nudge.conflict && (
          <ConflictChoice
            conflict={nudge.conflict}
            nudgeId={nudge.id}
            onResolved={(ids, notes) => { onSkipped(ids, notes); onDone(nudge.id); }}
          />
        )}

        <div className="nudge-actions">
          {slots.length > 0 && (
            <button className="btn" onClick={onToggleSlots} disabled={busy}>
              {open ? "Never mind" : `Find time to study`}
            </button>
          )}
          {!nudge.conflict && (
            <button className="btn btn-ghost" onClick={dismiss} disabled={busy}>
              Done
            </button>
          )}
        </div>

        {open && slots.length > 0 && (
          <div className="slots">
            <p className="note" style={{ margin: "0 0 7px" }}>
              Free before it. Pick one and it goes on the calendar.
            </p>
            {slots.map((s) => (
              <button
                className="slot" key={s.date + s.start}
                onClick={() => book(s)} disabled={busy}
              >
                <span className="slot-day">{DOW_SHORT[dow(s.date)]} {fmtDate(s.date)}</span>
                <span className="slot-time mono">{fmtRange(s.start, s.end)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
