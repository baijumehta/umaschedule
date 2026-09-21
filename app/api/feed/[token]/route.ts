import { isFeedToken, refuse } from "@/lib/auth";
import { buildIcs } from "@/lib/calendar";
import { skippedOccurrences } from "@/lib/attendance";
import { lastChangedAt, listEvents } from "@/lib/db";
import { collectRange, TERM_END, TERM_START } from "@/lib/schedule";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL: Category[] = [
  "lax", "piano", "math", "act", "study", "social", "test", "project",
  "class", "email", "other",
];

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
    const [events, changedAt, skipped] = await Promise.all([
      listEvents(), lastChangedAt(), skippedOccurrences(),
    ]);
    const body = buildIcs(
      // A declined occurrence leaves the feed entirely — anyone subscribed
      // should see it disappear, not see it and expect her there.
      collectRange(TERM_START, TERM_END, events, { school, cats, skipped })
        .filter((ev) => !ev.skipped),
      { alarms, name: "Uma — School Year" },
    );

    return new Response(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="uma-schedule.ics"',
        // Short enough that a manual "refresh calendars" reflects something
        // just added, long enough that several devices polling at once do not
        // each hit Neon. stale-while-revalidate lets the edge answer instantly
        // and refresh behind the request.
        "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
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
