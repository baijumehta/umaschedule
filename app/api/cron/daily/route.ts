import { hasHouseholdKey } from "@/lib/auth";
import { briefingSubject, briefingText, buildBriefing } from "@/lib/briefing";
import { briefingHtml } from "@/lib/briefing-html";
import { coachingLine } from "@/lib/coach";
import { listEvents } from "@/lib/db";
import { doneNudges } from "@/lib/nudges";
import { emailConfigured, sendEmail } from "@/lib/email";
import {
  claimSend, listRecipients, recordSend, releaseSend, type Channel, type Recipient,
} from "@/lib/recipients";
import { freeSlots } from "@/lib/guidance";
import { addDays, clampTerm, DOW_SHORT, dow, fmtDate, TERM_END, TERM_START } from "@/lib/schedule";
import { sendSms, smsConfigured } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** Vercel Cron signs its requests with CRON_SECRET; a person can use the key. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  // The household key lets someone send or preview it by hand from the app.
  return hasHouseholdKey(req);
}

const pacificToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

interface Outcome {
  name: string;
  via: Channel;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * The evening briefing: what tomorrow holds.
 *
 * Sent the night before on purpose — a summary that arrives on the morning of
 * is too late to do anything about a test. Each person is reached on whichever
 * channels they have, so email carries it while Twilio registration clears and
 * the same rows keep working once it does. `?dry=1` renders without sending.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "Not authorized" }, 401);

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const override = url.searchParams.get("date");

  const target = clampTerm(
    override && /^\d{4}-\d{2}-\d{2}$/.test(override) ? override : addDays(pacificToday(), 1),
  );

  if (target < TERM_START || target > TERM_END) {
    return json({ skipped: "outside the school year", target });
  }

  let body: string;
  let html: string;
  let subject: string;
  let people: Recipient[];
  let coaching: string | undefined;

  try {
    const [events, recipients, done] = await Promise.all([
      listEvents(), listRecipients(), doneNudges(),
    ]);

    const brief = buildBriefing(target, events, { done });

    // Which evenings are actually open, so the coaching line can name one
    // rather than telling her to "find time".
    const freeEvenings: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(target, i);
      if (freeSlots(d, events, 60).length) {
        freeEvenings.push(`${DOW_SHORT[dow(d)]} ${fmtDate(d)}`);
      }
    }

    // Best effort: a missing coaching line is fine, a missing briefing is not.
    coaching = await coachingLine(brief, freeEvenings);
    brief.coaching = coaching;

    body = briefingText(target, events, { done, coaching });
    subject = briefingSubject(target, events, { done });
    html = briefingHtml(brief, new URL(req.url).origin);
    people = recipients.filter((r) => r.active);
  } catch (err) {
    console.error("[cron/daily] build", err);
    return json({ error: "Could not build the briefing." }, 500);
  }

  const canText = smsConfigured();
  const canMail = emailConfigured();

  if (dry) {
    return json({
      dry: true, target, subject, body, html, coaching,
      channels: { sms: canText, email: canMail },
      wouldSendTo: people.flatMap((p) => [
        ...(p.phone && canText ? [`${p.name} (text)`] : []),
        ...(p.email && canMail ? [`${p.name} (email)`] : []),
      ]),
    });
  }

  if (!canText && !canMail) {
    return json({ error: "No way to send: neither SMTP2GO nor Twilio is configured.", target, body }, 501);
  }
  if (!people.length) {
    return json({ target, body, sent: [], note: "Nobody is set up to receive it." });
  }

  const sent: Outcome[] = [];

  for (const person of people) {
    const deliveries: Array<{ via: Channel; address: string }> = [];
    if (person.phone && canText) deliveries.push({ via: "sms", address: person.phone });
    if (person.email && canMail) deliveries.push({ via: "email", address: person.email });

    for (const { via, address } of deliveries) {
      // Claim first: a duplicate is worse than a miss.
      if (!(await claimSend(target, via, address))) {
        sent.push({ name: person.name, via, ok: true, skipped: true });
        continue;
      }

      // Each transport reports its own reference — Twilio a message SID,
      // SMTP2GO an email id — so unwrap them where the type is still known.
      let ok: boolean;
      let ref = "";
      let error: string | undefined;

      if (via === "sms") {
        const r = await sendSms(address, body);
        ok = r.ok; ref = r.sid ?? ""; error = r.error;
      } else {
        const r = await sendEmail(address, person.name, subject, body, html);
        ok = r.ok; ref = r.id ?? ""; error = r.error;
      }

      if (ok) {
        await recordSend(target, via, address, true, ref);
        sent.push({ name: person.name, via, ok: true });
      } else {
        // Let it retry rather than leaving a claim behind for a send that failed.
        await releaseSend(target, via, address);
        sent.push({ name: person.name, via, ok: false, error });
      }
    }

    if (!deliveries.length) {
      sent.push({
        name: person.name, via: person.email ? "email" : "sms", ok: false,
        error: person.email ? "email is not configured" : "texting is not configured",
      });
    }
  }

  return json({ target, subject, body, sent });
}
