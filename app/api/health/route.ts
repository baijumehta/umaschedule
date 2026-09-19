import { listEvents } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { smsConfigured } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Is this deployment wired up?
 *
 * Every other route answers a misconfiguration and a wrong passphrase with the
 * same 401, which is right for them and useless for deploying. This one reports
 * only whether each secret is *present* and whether the database answers.
 *
 * It never returns a secret, or any part of one, and never echoes a driver
 * error — a failed Neon connection can carry the host and user in its message.
 * A "false" here reveals nothing exploitable: an app missing its key rejects
 * every request anyway.
 */
export async function GET() {
  const configured = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    HOUSEHOLD_KEY: Boolean(process.env.HOUSEHOLD_KEY),
    FEED_TOKEN: Boolean(process.env.FEED_TOKEN),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    SMTP2GO: emailConfigured(),
    TWILIO: smsConfigured(),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
  };

  let database: "ok" | "unreachable" | "not configured" = "not configured";
  if (configured.DATABASE_URL) {
    try {
      await listEvents();
      database = "ok";
    } catch {
      database = "unreachable";
    }
  }

  const ready = configured.DATABASE_URL && configured.HOUSEHOLD_KEY && database === "ok";

  return new Response(
    JSON.stringify({
      ready,
      configured,
      database,
      // The planner works without a feed token; only subscribing needs one.
      feed: configured.FEED_TOKEN ? "available" : "no FEED_TOKEN set",
      naturalLanguage: configured.ANTHROPIC_API_KEY ? "available" : "no ANTHROPIC_API_KEY set",
      nightlyBriefing: !configured.SMTP2GO && !configured.TWILIO
        ? "no way to send — configure SMTP2GO or Twilio"
        : !configured.CRON_SECRET
          ? "a sender is set, but CRON_SECRET is missing so the schedule cannot run"
          : [configured.SMTP2GO ? "email" : null, configured.TWILIO ? "text" : null]
              .filter(Boolean).join(" and ") + " available",
    }, null, 2),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}
