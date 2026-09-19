import { hasHouseholdKey, refuse } from "@/lib/auth";
import { deleteRecipient } from "@/lib/recipients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasHouseholdKey(req)) return refuse();
  const { id } = await params;
  try {
    return json({ removed: await deleteRecipient(id) });
  } catch (err) {
    console.error("[api/recipients/:id]", err);
    return json({ error: "Could not remove that." }, 500);
  }
}
