"use client";

import { useState } from "react";
import { HEADER } from "@/lib/auth";
import { displayTitle } from "@/lib/classes";
import type { Conflict } from "@/lib/conflicts";
import { CATEGORIES, fmtRange } from "@/lib/schedule";
import { readKey } from "./api";
import { CatDot } from "./bits";

interface Props {
  conflict: Conflict;
  /** Called with the occurrence ids she is skipping, once saved. */
  onResolved: (skippedIds: string[]) => void;
}

/**
 * "Which one are you actually at?"
 *
 * The decision is recorded per occurrence rather than by editing events,
 * because half this schedule is derived: practice on a given Monday is a
 * consequence of the block calendar, not a row anyone can delete. Choosing
 * marks the others as not attending, which takes them out of the feed so
 * nobody subscribed turns up expecting her.
 */
export function ConflictChoice({ conflict, onResolved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose(keepId: string | null) {
    setBusy(true);
    setError("");

    // Everything she is not at gets recorded; the one she picked is recorded
    // as a yes, so the clash stays resolved rather than resurfacing.
    const decisions = conflict.events.map((ev) => ({
      occurrenceId: ev.id,
      attending: keepId === null ? true : ev.id === keepId,
    }));

    try {
      for (const d of decisions) {
        const res = await fetch("/api/attendance", {
          method: "POST",
          headers: { "content-type": "application/json", [HEADER]: readKey() },
          body: JSON.stringify(keepId === null ? { occurrenceId: d.occurrenceId, clear: true } : d),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Could not save that.");
      }
      onResolved(decisions.filter((d) => !d.attending).map((d) => d.occurrenceId));
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
          onClick={() => choose(ev.id)}
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

      <div className="nudge-actions" style={{ marginTop: 8 }}>
        <button className="btn btn-ghost" disabled={busy} onClick={() => choose(null)}>
          Both, actually
        </button>
      </div>

      {error && <p className="status status-bad">{error}</p>}
    </div>
  );
}
