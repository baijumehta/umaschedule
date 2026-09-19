/**
 * Access control, sized to what this actually is: a family app holding a
 * teenager's week.
 *
 * It is not a login system, but it is not open either — the schedule says where
 * a sixteen-year-old is at specific times, which is worth keeping off the open
 * internet. Two separate secrets:
 *
 *   HOUSEHOLD_KEY  read and write through the app. Sent as a header.
 *   FEED_TOKEN     read-only calendar feed. Sits in the URL, because calendar
 *                  apps cannot send headers — so the URL is the credential and
 *                  must be long, random, and treated like a password.
 *
 * Separating them means the feed URL can be handed to a calendar app, or
 * rotated after being pasted somewhere careless, without touching the key that
 * allows edits.
 */

/** Compares without leaking, through timing, how much of the value matched. */
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  // Fold the length difference in rather than returning early on it.
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export const HEADER = "x-household-key";

/** True when the request carries the household key. */
export function hasHouseholdKey(req: Request): boolean {
  const expected = process.env.HOUSEHOLD_KEY;
  if (!expected) return false;
  const given = req.headers.get(HEADER);
  return typeof given === "string" && constantTimeEqual(given, expected);
}

/** True when `token` is the feed token. Accepts a trailing ".ics". */
export function isFeedToken(token: string): boolean {
  const expected = process.env.FEED_TOKEN;
  if (!expected) return false;
  return constantTimeEqual(token.replace(/\.ics$/i, ""), expected);
}

/** Refuses without saying which secret was wrong or whether one is configured. */
export const refuse = () =>
  new Response(JSON.stringify({ error: "Not authorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
