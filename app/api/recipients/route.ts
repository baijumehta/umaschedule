import { hasHouseholdKey, refuse } from "@/lib/auth";
import { looksLikeEmail } from "@/lib/email";
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

  let body: { id?: string; name?: string; phone?: string; email?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }

  const name = (body.name ?? "").trim();
  if (!name || name.length > 60) return json({ error: "Give them a name." }, 400);

  // Both are optional individually, but a person needs at least one way to be
  // reached. Normalising here catches a typo on entry rather than at 6pm.
  const rawPhone = (body.phone ?? "").trim();
  const rawEmail = (body.email ?? "").trim();

  let phone = "";
  if (rawPhone) {
    const e164 = toE164(rawPhone);
    if (!e164) return json({ error: "That does not look like a phone number." }, 400);
    phone = e164;
  }

  let email = "";
  if (rawEmail) {
    const addr = looksLikeEmail(rawEmail);
    if (!addr) return json({ error: "That does not look like an email address." }, 400);
    email = addr;
  }

  if (!phone && !email) {
    return json({ error: "Add a mobile number, an email address, or both." }, 400);
  }

  const id = /^[A-Za-z0-9_-]{4,64}$/.test(body.id ?? "")
    ? body.id!
    : "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const recipient = { id, name, phone, email, active: body.active !== false };

  try {
    await upsertRecipient(recipient);
    return json({ recipient }, 201);
  } catch (err) {
    console.error("[api/recipients]", err);
    const message = err instanceof Error ? err.message : "";
    const dupPhone = /recipients_phone_uniq/.test(message);
    const dupEmail = /recipients_email_uniq/.test(message);
    if (dupPhone) return json({ error: "That number is already on the list." }, 400);
    if (dupEmail) return json({ error: "That email is already on the list." }, 400);
    return json({ error: "Could not save that." }, 500);
  }
}
