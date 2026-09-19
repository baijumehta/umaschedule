import { neon } from "@neondatabase/serverless";

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export type Channel = "sms" | "email";

export interface Recipient {
  id: string;
  name: string;
  /** E.164, or empty when this person is reached only by email. */
  phone: string;
  /** Empty when this person is reached only by text. */
  email: string;
  active: boolean;
}

export async function listRecipients(): Promise<Recipient[]> {
  const sql = client();
  const rows = await sql`
    select id, name, phone, email, active from recipients order by created_at
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    phone: String(r.phone ?? ""),
    email: String(r.email ?? ""),
    active: Boolean(r.active),
  }));
}

export async function upsertRecipient(r: Recipient): Promise<void> {
  const sql = client();
  await sql`
    insert into recipients (id, name, phone, email, active)
    values (${r.id}, ${r.name}, ${r.phone}, ${r.email}, ${r.active})
    on conflict (id) do update set
      name = excluded.name, phone = excluded.phone,
      email = excluded.email, active = excluded.active
  `;
}

export async function deleteRecipient(id: string): Promise<boolean> {
  const sql = client();
  const rows = await sql`delete from recipients where id = ${id} returning id`;
  return rows.length > 0;
}

/**
 * Claims the right to reach one address, on one channel, for one day.
 *
 * The primary key does the work: a second attempt conflicts and returns no
 * row, so a retried cron run or a manual send cannot deliver the same briefing
 * twice. Claim before sending — a duplicate is worse than a miss. Channels are
 * claimed separately, so someone with both a phone and an email gets one of
 * each rather than two of either.
 */
export async function claimSend(
  date: string, channel: Channel, address: string,
): Promise<boolean> {
  const sql = client();
  const rows = await sql`
    insert into send_log (send_date, channel, address, ok, detail)
    values (${date}::date, ${channel}, ${address}, false, 'sending')
    on conflict (send_date, channel, address) do nothing
    returning address
  `;
  return rows.length > 0;
}

export async function recordSend(
  date: string, channel: Channel, address: string, ok: boolean, detail: string,
): Promise<void> {
  const sql = client();
  await sql`
    update send_log set ok = ${ok}, detail = ${detail.slice(0, 300)}, sent_at = now()
    where send_date = ${date}::date and channel = ${channel} and address = ${address}
  `;
}

/** Releases a claim when the send never happened, so it can be retried. */
export async function releaseSend(
  date: string, channel: Channel, address: string,
): Promise<void> {
  const sql = client();
  await sql`
    delete from send_log
    where send_date = ${date}::date and channel = ${channel} and address = ${address}
  `;
}
