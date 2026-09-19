import { hasHouseholdKey, refuse } from "@/lib/auth";
import { deleteEvent, upsertEvent } from "@/lib/db";
import { bad, validateEvent } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const failed = (err: unknown) => {
  console.error("[api/events/:id]", err);
  return json({ error: "The planner could not reach its database." }, 500);
};

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  if (!hasHouseholdKey(req)) return refuse();
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Expected JSON");
  }

  // The id in the path wins, so a mismatched body cannot rewrite a different row.
  const checked = validateEvent(body, id);
  if (!checked.ok) return bad(checked.error);

  try {
    return json({ event: await upsertEvent(checked.value) });
  } catch (err) {
    return failed(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!hasHouseholdKey(req)) return refuse();
  const { id } = await params;
  try {
    const removed = await deleteEvent(id);
    return json({ removed });
  } catch (err) {
    return failed(err);
  }
}
