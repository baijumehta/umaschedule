"use client";

import { useState } from "react";
import { HEADER } from "@/lib/auth";
import { displayTitle } from "@/lib/classes";
import type { Conflict } from "@/lib/conflicts";
import { CATEGORIES, fmtRange, fmtTime, toMinutes } from "@/lib/schedule";
import { readKey } from "./api";
import { CatDot } from "./bits";

interface Props {
  conflict: Conflict;
  /** The nudge this sits in, so the decision can be recorded against it. */
  nudgeId: string;
  /** Occurrence ids she is skipping, plus notes to show on the rest. */
  onResolved: (skippedIds: string[], notes: Record<string, string>) => void;
}

/**
 * "Which one are you actually at?"
 *
 * Doing both is a real answer, not a refusal to answer. Picking it records
 * that she is attending both and notes which one she will be late to, then
 * marks the clash settled so it does not come back tomorrow — an earlier
 * version cleared the records instead, which made "both" the one choice that
 * did not stick.
 *
 * Decisions are keyed per occurrence rather than per event, because half this
 * schedule is derived: practice on a given Thursday is a consequence of the
 * block calendar, not a row anyone can edit.
 */
export function ConflictChoice({ conflict, nudgeId, onResolved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Whatever starts last is what she arrives late to.
  const ordered = [...conflict.events].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const later = ordered[ordered.length - 1];
  const earlier = ordered[0];
  const lateBy = fmtTime(earlier.end);

  async function post(body: unknown) {
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "content-type": "application/json", [HEADER]: readKey() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Could not save that.");
  }

  /** Settle the clash so it stops being raised, whichever way it was answered. */
  async function settle() {
    await fetch("/api/nudges", {
      method: "POST",
      headers: { "content-type": "application/json", [HEADER]: readKey() },
      body: JSON.stringify({ id: nudgeId, done: true }),
    });
  }

  async function chooseOne(keepId: string) {
    setBusy(true);
    setError("");
    try {
      for (const ev of conflict.events) {
        await post({ occurrenceId: ev.id, attending: ev.id === keepId });
      }
      await settle();
      onResolved(conflict.events.filter((e) => e.id !== keepId).map((e) => e.id), {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseBoth() {
    setBusy(true);
    setError("");
    const note = `Arriving late — ${displayTitle(earlier)} runs to ${lateBy}`;
    try {
      for (const ev of conflict.events) {
        await post({
          occurrenceId: ev.id,
          attending: true,
          note: ev.id === later.id ? note : "",
        });
      }
      await settle();
      onResolved([], { [later.id]: note });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="clash">
      <p className="note" style={{ margin: "0 0 8px" }}>
        Which one are you actually going to? The others come off the calendar.
      </p>

      {conflict.events.map((ev) => (
        <button
          className="clash-pick" key={ev.id}
          disabled={busy}
          onClick={() => chooseOne(ev.id)}
        >
          <CatDot cat={ev.cat} />
          <span className="clash-name">{displayTitle(ev)}</span>
          <span className="clash-time mono">{fmtRange(ev.start, ev.end)}</span>
          <span
            className="tag"
            style={{
              background: `var(${CATEGORIES[ev.cat].cssVar}-bg)`,
              color: `var(${CATEGORIES[ev.cat].cssVar})`,
            }}
          >
            going to this
          </span>
        </button>
      ))}

      <button className="clash-pick clash-both" disabled={busy} onClick={chooseBoth}>
        <span className="clash-name">
          Both &mdash; late to {displayTitle(later)}
        </span>
        <span className="clash-time mono">from {lateBy}</span>
      </button>

      {error && <p className="status status-bad">{error}</p>}
    </div>
  );
}
