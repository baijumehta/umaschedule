import { isFeedToken, refuse } from "@/lib/auth";
import { buildIcs } from "@/lib/calendar";
import { lastChangedAt, listEvents } from "@/lib/db";
import { collectRange, TERM_END, TERM_START } from "@/lib/schedule";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL: Category[] = ["lax", "piano", "math", "act", "study", "social", "email", "other"];

/**
 * The live calendar feed — the point of the whole backend.
 *
 * Subscribe a phone to this URL once and it re-reads on its own, so anything
 * added in the planner turns up on her calendar without another import. The
 * school year is generated fresh on every read: the block calendar comes from
 * code, Uma's own events come from Postgres.
 *
 *   webcal://<host>/api/feed/<FEED_TOKEN>.ics
 *
 * Query options, so different subscriptions can show different things:
 *   ?only=lax,piano   restrict to these categories
 *   ?school=0         leave out no-school days, breaks and minimum days
 *   ?alarms=0         no 30-minute reminders
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isFeedToken(token)) return refuse();

  const url = new URL(req.url);
  const only = url.searchParams.get("only");
  const cats = only
    ? (only.split(",").map((s) => s.trim()) as Category[]).filter((c) => ALL.includes(c))
    : ALL;
  const school = url.searchParams.get("school") !== "0";
  const alarms = url.searchParams.get("alarms") !== "0";

  try {
    const [events, changedAt] = await Promise.all([listEvents(), lastChangedAt()]);
    const body = buildIcs(
      collectRange(TERM_START, TERM_END, events, { school, cats }),
      { alarms, name: "Uma — School Year" },
    );

    return new Response(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="uma-schedule.ics"',
        // Subscribers poll on their own timetable; a short cache keeps a
        // burst of refreshes from hitting Neon for every one of them.
        "cache-control": "public, max-age=900, s-maxage=900",
        ...(changedAt ? { "last-modified": new Date(changedAt).toUTCString() } : {}),
      },
    });
  } catch (err) {
    console.error("[api/feed]", err);
    return new Response("Calendar feed is temporarily unavailable.", {
      status: 503,
      headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }
}
