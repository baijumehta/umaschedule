import { hasHouseholdKey, refuse } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands the feed URL to someone who has already proved they hold the household
 * key. The feed token is a secret — it is never baked into the page, because
 * the page is served before anyone has authenticated.
 */
export async function GET(req: Request) {
  if (!hasHouseholdKey(req)) return refuse();

  const token = process.env.FEED_TOKEN;
  const origin = new URL(req.url).origin;

  return new Response(
    JSON.stringify({
      feedUrl: token ? `${origin}/api/feed/${token}.ics` : null,
      configured: Boolean(token),
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}
