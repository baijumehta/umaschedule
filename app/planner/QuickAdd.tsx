"use client";

import { useEffect, useRef, useState } from "react";
import { HEADER } from "@/lib/auth";
import { classById } from "@/lib/classes";
import { CATEGORIES, DOW_SHORT, dow, fmtDate, fmtRange } from "@/lib/schedule";
import type { ISODate, StoredEvent } from "@/lib/types";
import { readKey } from "./api";
import { CatDot } from "./bits";

interface Reviewed {
  ok: boolean;
  error?: string;
  event?: StoredEvent;
  warnings: string[];
  assumptions: string[];
}

interface Props {
  today: ISODate;
  events: StoredEvent[];
  onSave: (ev: StoredEvent) => Promise<void> | void;
  onTweak: (ev: StoredEvent) => void;
}

/* The browser's own dictation. Chrome and Safari expose it under a prefix;
   Firefox has none, so the button simply does not appear there. */
interface SpeechSession {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechCtor = new () => SpeechSession;

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechCtor | null;
}

/**
 * Say it, don't fill in a form.
 *
 * The phrase is parsed server-side into drafts, which land here for review —
 * with whatever the parser had to guess spelled out, and the same clash checks
 * the dialog runs. Nothing is saved until someone presses Add.
 */
export function QuickAdd({ today, events, onSave, onTweak }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Reviewed[] | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const recog = useRef<SpeechSession | null>(null);

  useEffect(() => setCanListen(speechCtor() !== null), []);

  useEffect(() => () => { try { recog.current?.stop(); } catch { /* already stopped */ } }, []);

  function toggleDictation() {
    if (listening) {
      try { recog.current?.stop(); } catch { /* already stopped */ }
      setListening(false);
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;

    const r = new Ctor();
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      const heard = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript)
        .join(" ")
        .trim();
      // Append, so two dictations in a row build one phrase.
      setText((prev) => (prev ? prev.trim() + " " + heard : heard));
    };
    r.onerror = () => { setListening(false); setError("Could not hear that. Try typing it."); };
    r.onend = () => setListening(false);

    recog.current = r;
    setError("");
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  }

  async function parse() {
    const phrase = text.trim();
    if (!phrase) return;
    setBusy(true);
    setError("");
    setDrafts(null);
    setSaved([]);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "content-type": "application/json", [HEADER]: readKey() },
        body: JSON.stringify({ text: phrase, today, events }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error || "Could not parse that."); return; }
      setDrafts(body.drafts as Reviewed[]);
    } catch {
      setError("Could not reach the parser.");
    } finally {
      setBusy(false);
    }
  }

  async function accept(d: Reviewed, i: number) {
    if (!d.event) return;
    await onSave(d.event);
    setSaved((prev) => [...prev, String(i)]);
  }

  function reset() {
    setText(""); setDrafts(null); setError(""); setSaved([]);
  }

  return (
    <div className="panel">
      <h3>Just say it</h3>
      <p className="lede">
        &ldquo;Bio test on the 23rd&rdquo;, &ldquo;driving lesson Tuesday 3:30&rdquo;, &ldquo;study
        with Maya Fridays 4 to 6 until winter break&rdquo;. It works out the date and checks it
        against practice before anything is saved.
      </p>

      <div className="qa-row">
        <textarea
          className="qa-input"
          value={text}
          placeholder="What should go on the calendar?"
          rows={2}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); parse(); }
          }}
        />
        {canListen && (
          <button
            className={"btn qa-mic" + (listening ? " qa-mic-on" : "")}
            onClick={toggleDictation}
            type="button"
            aria-pressed={listening}
            aria-label={listening ? "Stop dictating" : "Dictate"}
            title={listening ? "Stop" : "Dictate"}
          >
            {listening ? "■" : "●"} {listening ? "Listening" : "Speak"}
          </button>
        )}
      </div>

      <div className="actions" style={{ marginTop: 11 }}>
        <button className="btn btn-primary" onClick={parse} disabled={busy || !text.trim()}>
          {busy ? "Reading…" : "Read it"}
        </button>
        {(text || drafts) && <button className="btn" onClick={reset} disabled={busy}>Clear</button>}
      </div>

      {error && <p className="status status-bad">{error}</p>}

      {drafts && (
        <div className="qa-drafts">
          {drafts.map((d, i) => {
            const isSaved = saved.includes(String(i));
            if (!d.ok || !d.event) {
              return (
                <div className="qa-draft" key={i}>
                  <div className="alert" style={{ margin: 0 }}>
                    <strong>{d.error ?? "That one did not make sense."}</strong>
                  </div>
                </div>
              );
            }
            const ev = d.event;
            const cls = classById(ev.classId);
            return (
              <div className={"qa-draft" + (isSaved ? " qa-draft-done" : "")} key={i}>
                <div className="qa-head">
                  <CatDot cat={ev.cat} />
                  <span className="qa-title">{cls ? `${cls.name} — ${ev.title}` : ev.title}</span>
                  <span className="tag" style={{
                    background: `var(${CATEGORIES[ev.cat].cssVar}-bg)`,
                    color: `var(${CATEGORIES[ev.cat].cssVar})`,
                  }}>
                    {CATEGORIES[ev.cat].label}
                  </span>
                </div>

                <div className="qa-when mono">
                  {DOW_SHORT[dow(ev.date)]} {fmtDate(ev.date, true)}
                  {" · "}
                  {ev.allDay ? "all day" : fmtRange(ev.start, ev.end)}
                  {ev.repeat === "weekly" && ` · weekly until ${fmtDate(ev.until)}`}
                  {ev.loc && ` · ${ev.loc}`}
                </div>
                {ev.notes && <div className="qa-notes">{ev.notes}</div>}

                {d.assumptions.length > 0 && (
                  <p className="qa-assume">
                    Filled in: {d.assumptions.join("; ")}.
                  </p>
                )}

                {d.warnings.length > 0 && (
                  <div className="alert" style={{ marginTop: 9, marginBottom: 0 }}>
                    <ul style={{ margin: 0 }}>
                      {d.warnings.map((w, k) => <li key={k}>{w}</li>)}
                    </ul>
                  </div>
                )}

                <div className="actions" style={{ marginTop: 11 }}>
                  {isSaved ? (
                    <span className="status status-ok" style={{ margin: 0 }}>Added</span>
                  ) : (
                    <>
                      <button className="btn btn-primary" onClick={() => accept(d, i)}>Add it</button>
                      <button className="btn" onClick={() => onTweak(ev)}>Change something</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
