"use client";

import { useCallback, useEffect, useState } from "react";
import { HEADER } from "@/lib/auth";
import { briefingText, segments } from "@/lib/briefing";
import { addDays, DOW_NAMES, dow, fmtDate } from "@/lib/schedule";
import type { ISODate, StoredEvent } from "@/lib/types";
import { readKey } from "./api";

interface Recipient {
  id: string;
  name: string;
  phone: string;
  email: string;
  active: boolean;
}

/**
 * Who gets the nightly text, and exactly what it will say.
 *
 * The preview is rendered from the same function the cron job sends, so what
 * is on screen is the message — not an approximation of it.
 */
export function PeoplePanel({ today, events }: { today: ISODate; events: StoredEvent[] }) {
  const [people, setPeople] = useState<Recipient[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channels, setChannels] = useState<{ sms: boolean; email: boolean }>({ sms: false, email: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const headers = useCallback(
    () => ({ "content-type": "application/json", [HEADER]: readKey() }),
    [],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/recipients", { headers: headers(), cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setPeople(body.recipients ?? []);
    } catch {
      /* The panel still renders; the list just stays empty. */
    }
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  // A dry run reports which transports this deployment can actually use, so
  // the panel can say "email only" while Twilio registration is still clearing.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cron/daily?dry=1", { headers: headers(), cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!cancelled && b?.channels) setChannels(b.channels); })
      .catch(() => { /* The preview below still renders. */ });
    return () => { cancelled = true; };
  }, [headers]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setStatus("");
    try {
      const res = await fetch("/api/recipients", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ name, phone, email, active: true }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Could not add them."); return; }
      setName(""); setPhone(""); setEmail("");
      await load();
    } catch {
      setError("Could not reach the planner.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true); setError("");
    try {
      await fetch(`/api/recipients/${encodeURIComponent(id)}`, {
        method: "DELETE", headers: headers(),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    setBusy(true); setError(""); setStatus("Sending…");
    try {
      const res = await fetch("/api/cron/daily", { headers: headers(), cache: "no-store" });
      const body = await res.json();
      if (!res.ok) { setStatus(""); setError(body.error ?? "Could not send."); return; }
      const sent = (body.sent ?? []) as Array<{ name: string; via: string; ok: boolean; skipped?: boolean; error?: string }>;
      if (!sent.length) { setStatus(body.note ?? "Nobody to send to."); return; }
      setStatus(sent.map((s) => {
        const who = `${s.name} (${s.via === "sms" ? "text" : "email"})`;
        return s.skipped ? `${who}: already sent today`
          : s.ok ? `${who}: sent`
          : `${who}: ${s.error}`;
      }).join(" · "));
    } catch {
      setStatus(""); setError("Could not reach the planner.");
    } finally {
      setBusy(false);
    }
  }

  // The cron runs in the evening and summarises the day after.
  const target = addDays(today, 1);
  const preview = briefingText(target, events);
  const parts = segments(preview);

  return (
    <>
      <div className="panel">
        <h3>The nightly briefing</h3>
        <p className="lede">
          Every evening, everyone on this list gets the next day in one message &mdash; the block
          day, which classes meet, what is on after school, and anything due. Sent the night before
          on purpose: a summary that lands on the morning of a test is too late to act on.
        </p>

        <div className="brief-bar">
          <p className="eyebrow" style={{ margin: 0 }}>
            Tonight&rsquo;s message &mdash; {DOW_NAMES[dow(target)]}, {fmtDate(target, true)}
          </p>
          <span className="brief-count mono">
            {preview.length} chars
            {channels.sms && ` · ${parts} ${parts === 1 ? "segment" : "segments"}`}
          </span>
        </div>
        <pre className="sms-preview">{preview}</pre>

        <div className="actions">
          <button className="btn" onClick={sendNow} disabled={busy || !people.some((p) => p.active)}>
            Send it now
          </button>
        </div>
        {status && <p className="status status-ok">{status}</p>}

        <p className="note">
          {!channels.sms && !channels.email
            ? "Nothing can be sent yet — configure SMTP2GO or Twilio."
            : channels.sms && channels.email
              ? "Going out by text and email — everyone gets one of each channel they have."
              : channels.email
                ? "Going out by email. Texting turns itself on once Twilio is configured."
                : "Going out by text."}
        </p>
      </div>

      <div className="panel">
        <h3>Who gets it</h3>
        {people.length === 0 ? (
          <p className="lede">Nobody yet.</p>
        ) : (
          <div className="people">
            {people.map((p) => (
              <div className="person" key={p.id}>
                <span className="person-name">{p.name}</span>
                <span className="person-phone mono">
                  {[p.phone, p.email].filter(Boolean).join("  ·  ")}
                </span>
                <button
                  className="btn btn-ghost btn-danger" disabled={busy}
                  onClick={() => remove(p.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={add} style={{ marginTop: people.length ? 16 : 6 }}>
          <div className="row">
            <div className="field">
              <label htmlFor="p-name">Name</label>
              <input
                id="p-name" type="text" value={name} required
                placeholder="Nicole" onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="p-phone">Mobile <span className="plain">(for texts)</span></label>
              <input
                id="p-phone" type="tel" value={phone}
                placeholder="(714) 555-0142" autoComplete="off"
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="p-email">Email</label>
              <input
                id="p-email" type="email" value={email}
                placeholder="nicole@example.com" autoComplete="off"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="status status-bad">{error}</p>}
          <div className="actions" style={{ marginTop: 4 }}>
            <button className="btn btn-primary" type="submit" disabled={busy || !name || (!phone && !email)}>
              Add them
            </button>
          </div>
        </form>

        <p className="note">
Either one is enough, or give both. US numbers can be typed any way &mdash; they are stored in
          the international form Twilio needs. Addresses live only in the database, never in the
          repository.
        </p>
      </div>
    </>
  );
}
