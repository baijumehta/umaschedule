import { neon } from "@neondatabase/serverless";

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export interface Recipient {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}

export async function listRecipients(): Promise<Recipient[]> {
  const sql = client();
  const rows = await sql`select id, name, phone, active from recipients order by created_at`;
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    phone: String(r.phone),
    active: Boolean(r.active),
  }));
}

export async function upsertRecipient(r: Recipient): Promise<void> {
  const sql = client();
  await sql`
    insert into recipients (id, name, phone, active)
    values (${r.id}, ${r.name}, ${r.phone}, ${r.active})
    on conflict (id) do update set
      name = excluded.name, phone = excluded.phone, active = excluded.active
  `;
}

export async function deleteRecipient(id: string): Promise<boolean> {
  const sql = client();
  const rows = await sql`delete from recipients where id = ${id} returning id`;
  return rows.length > 0;
}

/**
 * Claims the right to text one person for one day.
 *
 * The primary key does the work: the second attempt conflicts and returns no
 * row, so a retried cron run or a manual send cannot text anyone twice. Claim
 * before sending — a duplicate text is worse than a missed one.
 */
export async function claimSend(date: string, phone: string): Promise<boolean> {
  const sql = client();
  const rows = await sql`
    insert into sms_log (send_date, phone, ok, detail)
    values (${date}::date, ${phone}, false, 'sending')
    on conflict (send_date, phone) do nothing
    returning phone
  `;
  return rows.length > 0;
}

export async function recordSend(
  date: string, phone: string, ok: boolean, detail: string,
): Promise<void> {
  const sql = client();
  await sql`
    update sms_log set ok = ${ok}, detail = ${detail.slice(0, 300)}, sent_at = now()
    where send_date = ${date}::date and phone = ${phone}
  `;
}

/** Releases a claim when the send never actually happened, so it can retry. */
export async function releaseSend(date: string, phone: string): Promise<void> {
  const sql = client();
  await sql`delete from sms_log where send_date = ${date}::date and phone = ${phone}`;
}
