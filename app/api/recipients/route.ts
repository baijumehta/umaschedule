import { hasHouseholdKey, refuse } from "@/lib/auth";
import { listRecipients, upsertRecipient } from "@/lib/recipients";
import { toE164 } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function GET(req: Request) {
  if (!hasHouseholdKey(req)) return refuse();
  try {
    return json({ recipients: await listRecipients() });
  } catch (err) {
    console.error("[api/recipients]", err);
    return json({ error: "Could not reach the database." }, 500);
  }
}

export async function POST(req: Request) {
  if (!hasHouseholdKey(req)) return refuse();

  let body: { id?: string; name?: string; phone?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }

  const name = (body.name ?? "").trim();
  if (!name || name.length > 60) return json({ error: "Give them a name." }, 400);

  // Normalise here so a typo is caught on entry, not at 6pm when it fails.
  const phone = toE164(body.phone ?? "");
  if (!phone) return json({ error: "That does not look like a phone number." }, 400);

  const id = /^[A-Za-z0-9_-]{4,64}$/.test(body.id ?? "")
    ? body.id!
    : "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  try {
    await upsertRecipient({ id, name, phone, active: body.active !== false });
    return json({ recipient: { id, name, phone, active: body.active !== false } }, 201);
  } catch (err) {
    console.error("[api/recipients]", err);
    const duplicate = err instanceof Error && /recipients_phone_idx/.test(err.message);
    return json(
      { error: duplicate ? "That number is already on the list." : "Could not save that." },
      duplicate ? 400 : 500,
    );
  }
}
