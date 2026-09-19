"use client";

import { useEffect, useState } from "react";
import { buildCsv, buildIcs } from "@/lib/calendar";
import { CATEGORIES, clampTerm, collectRange, TERM_END, TERM_START } from "@/lib/schedule";
import type { Category, ISODate, StoredEvent } from "@/lib/types";
import { readKey } from "./api";
import { HEADER } from "@/lib/auth";

const EXPORTABLE: Category[] = ["lax", "piano", "math", "act", "study", "social", "email", "other"];

/**
 * Subscribing beats importing: the feed is read by her phone on its own
 * schedule, so anything added here turns up without a second thought. The file
 * downloads stay for the one-off case — a coach who wants the season, a
 * calendar that will not subscribe.
 */
export function CalendarPanel({ today, events }: { today: ISODate; events: StoredEvent[] }) {
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [from, setFrom] = useState<ISODate>(clampTerm(today));
  const [to, setTo] = useState<ISODate>(TERM_END);
  const [cats, setCats] = useState<Category[]>(EXPORTABLE);
  const [school, setSchool] = useState(true);
  const [alarms, setAlarms] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config", { headers: { [HEADER]: readKey() }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setFeedUrl(d.feedUrl); })
      .catch(() => { /* The panel still works without it. */ });
    return () => { cancelled = true; };
  }, []);

  const selection = collectRange(from, to, events, { school, cats });

  function toggleCat(c: Category) {
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function download(filename: string, body: string, mime: string) {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus(`Downloaded ${filename}`);
  }

  async function copyFeed() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setStatus("Could not copy. Select the URL above and copy it by hand.");
    }
  }

  const webcal = feedUrl ? feedUrl.replace(/^https?:/, "webcal:") : "";

  return (
    <div>
      <div className="panel">
        <h3>Subscribe once, and stop thinking about it</h3>
        <p className="lede">
          Point a calendar at this address and it re-reads on its own every few hours. Anything added
          here &mdash; a study session, a tutoring slot &mdash; turns up on her phone without another
          import. Practice and piano follow the block calendar, so a holiday clears them automatically.
        </p>

        {feedUrl ? (
          <>
            <code className="urlbox">{feedUrl}</code>
            <div className="actions">
              <button className="btn btn-primary" onClick={copyFeed}>
                {copied ? "Copied" : "Copy the address"}
              </button>
              <a className="btn" href={webcal}>Open in the calendar app</a>
            </div>
            <p className="note">
              <strong>Treat this address like a password.</strong> Anyone who has it can read where
              she is all year. To retire it, change <code>FEED_TOKEN</code> and redeploy &mdash; the
              old address stops working immediately.
            </p>
          </>
        ) : (
          <p className="note">
            No feed address yet &mdash; set <code>FEED_TOKEN</code> in the environment and redeploy.
          </p>
        )}
      </div>

      <div className="panel">
        <h3>Where to paste it</h3>
        <p className="lede" style={{ marginBottom: 10 }}>
          <strong>iPhone</strong> &mdash; Calendar &rarr; Calendars &rarr; Add Calendar &rarr; Add
          Subscription Calendar, then paste.
        </p>
        <p className="lede" style={{ marginBottom: 10 }}>
          <strong>Google Calendar</strong> &mdash; on a computer, Other calendars &rarr; + &rarr; From
          URL, then paste. Google refreshes on its own timetable, which can run to several hours.
        </p>
        <p className="lede" style={{ marginBottom: 0 }}>
          <strong>Outlook</strong> &mdash; Add calendar &rarr; Subscribe from web.
        </p>
      </div>

      <div className="panel">
        <h3>Or take a one-off file</h3>
        <p className="lede">
          A snapshot that will not update itself &mdash; useful for handing a coach the season, or for
          a calendar that will not subscribe.
        </p>

        <div className="row">
          <div className="field">
            <label htmlFor="ex-from">From</label>
            <input id="ex-from" type="date" value={from} min={TERM_START} max={TERM_END}
              onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ex-to">Through</label>
            <input id="ex-to" type="date" value={to} min={TERM_START} max={TERM_END}
              onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="field" style={{ marginBottom: 13 }}>
          <label>Include</label>
          <div className="checks">
            {EXPORTABLE.map((c) => (
              <label className="dcheck" key={c}>
                <input type="checkbox" checked={cats.includes(c)} onChange={() => toggleCat(c)} />
                {CATEGORIES[c].label}
              </label>
            ))}
          </div>
        </div>

        <label className="opt" style={{ marginBottom: 4 }}>
          <input type="checkbox" checked={alarms} onChange={(e) => setAlarms(e.target.checked)} />
          Add a 30-minute reminder to each timed event
        </label>
        <label className="opt">
          <input type="checkbox" checked={school} onChange={(e) => setSchool(e.target.checked)} />
          Include school markers &mdash; no-school days, breaks, minimum days, finals, graduation
        </label>

        <div className="actions">
          <button
            className="btn"
            disabled={!selection.length}
            onClick={() => download("uma-schedule.ics", buildIcs(selection, { alarms }), "text/calendar")}
          >
            Download .ics
          </button>
          <button
            className="btn"
            disabled={!selection.length}
            onClick={() => download("uma-schedule.csv", buildCsv(selection), "text/csv")}
          >
            Download .csv for Google
          </button>
        </div>

        <p className="status">{status}</p>
        <p className="note">
          {selection.length} {selection.length === 1 ? "event" : "events"} in that range. Every event
          carries a stable id, so re-importing updates what is already there instead of duplicating it.
        </p>
      </div>
    </div>
  );
}
