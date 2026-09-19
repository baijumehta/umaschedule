import { hasHouseholdKey } from "@/lib/auth";
import { briefingText } from "@/lib/briefing";
import { listEvents } from "@/lib/db";
import {
  claimSend, listRecipients, recordSend, releaseSend,
} from "@/lib/recipients";
import { addDays, clampTerm, TERM_END, TERM_START } from "@/lib/schedule";
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
  if (secret) {
    const header = req.headers.get("authorization");
    if (header === `Bearer ${secret}`) return true;
  }
  // The household key lets someone send or preview it by hand from the app.
  return hasHouseholdKey(req);
}

const pacificToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

/**
 * The evening text: what tomorrow holds.
 *
 * Sent the night before on purpose — a summary that arrives on the morning of
 * is too late to do anything about a test. `?dry=1` renders it without sending,
 * which is what the app's preview uses.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return json({ error: "Not authorized" }, 401);
  }

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const override = url.searchParams.get("date");

  const target = clampTerm(
    override && /^\d{4}-\d{2}-\d{2}$/.test(override) ? override : addDays(pacificToday(), 1),
  );

  // Outside the school year there is nothing worth texting about.
  if (target < TERM_START || target > TERM_END) {
    return json({ skipped: "outside the school year", target });
  }

  let body: string;
  let people: Awaited<ReturnType<typeof listRecipients>>;
  try {
    const [events, recipients] = await Promise.all([listEvents(), listRecipients()]);
    body = briefingText(target, events);
    people = recipients.filter((r) => r.active);
  } catch (err) {
    console.error("[cron/daily] build", err);
    return json({ error: "Could not build the briefing." }, 500);
  }

  if (dry) {
    return json({ dry: true, target, body, wouldSendTo: people.map((p) => p.name) });
  }

  if (!smsConfigured()) {
    return json({ error: "Twilio is not configured on this deployment.", target, body }, 501);
  }
  if (!people.length) {
    return json({ target, body, sent: [], note: "Nobody is set up to receive it." });
  }

  const sent: Array<{ name: string; ok: boolean; skipped?: boolean; error?: string }> = [];

  for (const person of people) {
    // Claim first: a duplicate text is worse than a missed one.
    const claimed = await claimSend(target, person.phone);
    if (!claimed) {
      sent.push({ name: person.name, ok: true, skipped: true });
      continue;
    }

    const result = await sendSms(person.phone, body);
    if (result.ok) {
      await recordSend(target, person.phone, true, result.sid ?? "");
      sent.push({ name: person.name, ok: true });
    } else {
      // Let it retry rather than leaving a claim behind for a send that failed.
      await releaseSend(target, person.phone);
      sent.push({ name: person.name, ok: false, error: result.error });
    }
  }

  return json({ target, body, sent });
}
