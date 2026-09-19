import { hasHouseholdKey, refuse } from "@/lib/auth";
import { listEvents, upsertEvent } from "@/lib/db";
import { bad, validateEvent } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const failed = (err: unknown) => {
  console.error("[api/events]", err);
  return json({ error: "The planner could not reach its database." }, 500);
};

/** Everything Uma has added. The derived schedule is not stored, so not here. */
export async function GET(req: Request) {
  if (!hasHouseholdKey(req)) return refuse();
  try {
    return json({ events: await listEvents() });
  } catch (err) {
    return failed(err);
  }
}

/** Create or replace one event; the client mints the id so a retry is safe. */
export async function POST(req: Request) {
  if (!hasHouseholdKey(req)) return refuse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Expected JSON");
  }

  const checked = validateEvent(body);
  if (!checked.ok) return bad(checked.error);

  try {
    return json({ event: await upsertEvent(checked.value) }, 201);
  } catch (err) {
    return failed(err);
  }
}
