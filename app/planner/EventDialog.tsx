"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CLASSES, classById, classesFor, classMeetsOn } from "@/lib/classes";
import {
  ADDABLE, ALL_DAY_BY_DEFAULT, CATEGORIES, dayInfo, dow, DOW_SHORT, eventsFor, findConflicts,
  fmtDate, fmtRange, fmtTime, occurrences, TERM_END, TERM_START, toMinutes,
} from "@/lib/schedule";
import type { ISODate, StoredEvent } from "@/lib/types";
import { newId } from "./api";

interface Props {
  open: boolean;
  /** The event being edited, or null when adding. */
  editing: StoredEvent | null;
  defaultDate: ISODate;
  events: StoredEvent[];
  busy: boolean;
  error: string;
  onSave: (ev: StoredEvent) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

interface Draft {
  id: string;
  title: string;
  cat: StoredEvent["cat"];
  date: ISODate;
  start: string;
  end: string;
  loc: string;
  notes: string;
  allDay: boolean;
  classId: string;
  repeats: boolean;
  days: number[];
  until: ISODate;
}

const blank = (date: ISODate): Draft => ({
  id: newId(), title: "", cat: "test", date, start: "16:00", end: "17:00",
  loc: "", notes: "", allDay: true, classId: "", repeats: false, days: [], until: TERM_END,
});

const fromEvent = (ev: StoredEvent): Draft => ({
  id: ev.id, title: ev.title, cat: ev.cat, date: ev.date,
  start: ev.start || "16:00", end: ev.end || "17:00",
  loc: ev.loc, notes: ev.notes, allDay: ev.allDay, classId: ev.classId, repeats: ev.repeat === "weekly",
  days: ev.days ?? [], until: ev.until || TERM_END,
});

const toEvent = (d: Draft): StoredEvent => ({
  id: d.id,
  title: d.title.trim() || CATEGORIES[d.cat].label,
  cat: d.cat, date: d.date,
  start: d.allDay ? "" : d.start, end: d.allDay ? "" : d.end,
  allDay: d.allDay, classId: d.classId,
  loc: d.loc.trim(), notes: d.notes.trim(),
  repeat: d.repeats && d.days.length ? "weekly" : "none",
  days: d.repeats ? d.days : [],
  until: d.repeats ? d.until : "",
});

/**
 * Adding something is where this app earns its keep: it checks the new
 * commitment against the block schedule before it is saved, so a tutoring slot
 * booked at 1:45 on an odd Monday gets flagged against practice rather than
 * discovered on the field.
 */
export function EventDialog(props: Props) {
  const { open, editing, defaultDate, events, busy, error, onSave, onDelete, onClose } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>(() => blank(defaultDate));

  // Reset the form each time the dialog is opened, not on every render.
  useEffect(() => {
    if (open) setDraft(editing ? fromEvent(editing) : blank(defaultDate));
  }, [open, editing, defaultDate]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const candidate = useMemo(() => toEvent(draft), [draft]);
  const timesValid = draft.allDay || toMinutes(draft.end) > toMinutes(draft.start);
  const isAcademic = draft.cat === "test" || draft.cat === "project";

  // A test on a day its class does not meet is almost always a wrong date.
  const wrongDay =
    isAcademic && draft.classId && dayInfo(draft.date).school &&
    !classMeetsOn(draft.classId, draft.date);

  const dates = useMemo(
    () => (timesValid ? occurrences(candidate) : []),
    [candidate, timesValid],
  );

  const conflicts = useMemo(
    () => (timesValid ? findConflicts(candidate, events) : []),
    [candidate, events, timesValid],
  );

  const offDays = useMemo(
    () => dates.filter((d) => !dayInfo(d).school && dow(d) !== 0 && dow(d) !== 6).length,
    [dates],
  );

  const firstDate = dates[0];
  const alreadyThere = firstDate
    ? eventsFor(firstDate, events, { school: false }).filter((e) => e.sourceId !== draft.id)
    : [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!timesValid) return;
    onSave(candidate);
  }

  function toggleDay(n: number) {
    setDraft((d) => ({
      ...d,
      days: d.days.includes(n) ? d.days.filter((x) => x !== n) : [...d.days, n].sort(),
    }));
  }

  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form className="dlg-in" onSubmit={submit}>
        <div className="dlg-head">
          <h3>{editing ? "Edit" : "Add to the week"}</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {error && <div className="alert"><strong>{error}</strong></div>}

        {!timesValid && (
          <div className="alert"><strong>It has to end after it starts.</strong></div>
        )}

        {conflicts.length > 0 && (
          <div className="alert">
            <strong>
              {conflicts.length === 1
                ? "That overlaps something:"
                : `That overlaps ${conflicts.length} things:`}
            </strong>
            <ul>
              {conflicts.slice(0, 6).map((c, i) => (
                <li key={i}>
                  {DOW_SHORT[dow(c.date)]} {fmtDate(c.date)} &mdash; {c.with.title},{" "}
                  {fmtRange(c.with.start, c.with.end)}
                </li>
              ))}
              {conflicts.length > 6 && <li>&hellip;and {conflicts.length - 6} more.</li>}
            </ul>
            <div style={{ marginTop: 6 }}>You can still add it &mdash; this is just a heads-up.</div>
          </div>
        )}

        {wrongDay && (
          <div className="alert">
            <strong>
              {classById(draft.classId)?.name} does not meet on {fmtDate(draft.date)}.
            </strong>
            <div style={{ marginTop: 4 }}>
              That is a {dayInfo(draft.date).block} day, when she has{" "}
              {classesFor(draft.date).map((c) => c.short).join(", ")}. Check the date — or the
              period mapping, if it is the app that has it wrong.
            </div>
          </div>
        )}

        {offDays > 0 && (
          <div className="alert">
            <strong>
              {offDays === 1
                ? "One date lands on a no-school day."
                : `${offDays} dates land on no-school days.`}
            </strong>
          </div>
        )}

        <div className="row">
          <div className="field grow">
            <label htmlFor="f-title">What</label>
            <input
              id="f-title" type="text" required value={draft.title}
              placeholder="Math tutoring with Mr. Alvarez"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-cat">Kind</label>
            <select
              id="f-cat" value={draft.cat}
              onChange={(e) => {
                const cat = e.target.value as Draft["cat"];
                setDraft((d) => ({
                  ...d,
                  cat,
                  allDay: ALL_DAY_BY_DEFAULT.includes(cat),
                  classId: cat === "test" || cat === "project" ? d.classId : "",
                }));
              }}
            >
              {ADDABLE.map((c) => (
                <option value={c} key={c}>{CATEGORIES[c].label}</option>
              ))}
            </select>
          </div>
        </div>

        {isAcademic && (
          <div className="row">
            <div className="field grow">
              <label htmlFor="f-class">Which class</label>
              <select id="f-class" value={draft.classId} onChange={(e) => set("classId", e.target.value)}>
                <option value="">— pick a class —</option>
                {CLASSES.map((c) => (
                  <option value={c.id} key={c.id}>
                    {"Period " + c.period + " · " + c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="row">
          <div className="field wide">
            <label className="opt" style={{ textTransform: "none", letterSpacing: 0 }}>
              <input
                type="checkbox" checked={draft.allDay}
                onChange={(e) => set("allDay", e.target.checked)}
              />
              All day — no particular time
            </label>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="f-date">{draft.repeats ? "Starting" : "Date"}</label>
            <input
              id="f-date" type="date" required value={draft.date}
              min={TERM_START} max={TERM_END}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>
          {!draft.allDay && (
            <>
              <div className="field">
                <label htmlFor="f-start">Starts</label>
                <input id="f-start" type="time" required value={draft.start}
                  onChange={(e) => set("start", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="f-end">Ends</label>
                <input id="f-end" type="time" required value={draft.end}
                  onChange={(e) => set("end", e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className="row">
          <div className="field wide">
            <label htmlFor="f-loc">Where <span className="plain">(optional)</span></label>
            <input id="f-loc" type="text" value={draft.loc} placeholder="Library, room 12"
              onChange={(e) => set("loc", e.target.value)} />
          </div>
        </div>

        <div className="row">
          <div className="field wide">
            <label>Repeat</label>
            <label className="opt">
              <input
                type="checkbox" checked={draft.repeats}
                onChange={(e) => {
                  const on = e.target.checked;
                  setDraft((d) => ({
                    ...d,
                    repeats: on,
                    days: on && !d.days.length ? [dow(d.date)] : d.days,
                  }));
                }}
              />
              Every week on the days below
            </label>

            {draft.repeats && (
              <div style={{ marginTop: 9 }}>
                <div className="checks" style={{ marginBottom: 11 }}>
                  {DOW_SHORT.map((label, n) => (
                    <label className="dcheck" key={label}>
                      <input
                        type="checkbox" checked={draft.days.includes(n)}
                        onChange={() => toggleDay(n)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="field" style={{ maxWidth: 220 }}>
                  <label htmlFor="f-until">Repeat through</label>
                  <input
                    id="f-until" type="date" value={draft.until}
                    min={draft.date} max={TERM_END}
                    onChange={(e) => set("until", e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="row">
          <div className="field wide">
            <label htmlFor="f-notes">Notes <span className="plain">(optional)</span></label>
            <textarea id="f-notes" value={draft.notes} placeholder="Bring the practice test"
              onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        {firstDate && (
          <p className="note">
            {DOW_SHORT[dow(firstDate)]} {fmtDate(firstDate)} &mdash;{" "}
            {dayInfo(firstDate).school ? `${dayInfo(firstDate).block} day` : dayInfo(firstDate).reason}
            {alreadyThere.length
              ? `. Already there: ${alreadyThere
                  .map((e) => `${e.title} ${e.allDay ? "" : fmtTime(e.start)}`.trim())
                  .join(", ")}`
              : ". Nothing else scheduled."}
            {dates.length > 1 && `  ·  ${dates.length} dates in all.`}
          </p>
        )}

        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !timesValid}>
            {busy ? "Saving…" : editing ? "Save" : "Add it"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <span className="spacer" />
          {editing && (
            <button
              type="button" className="btn btn-danger" disabled={busy}
              onClick={() => onDelete(editing.id)}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
