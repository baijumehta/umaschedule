/**
 * Sending a text through Twilio.
 *
 * Raw HTTPS rather than the SDK: one form-encoded POST, no dependency, and it
 * runs anywhere the fetch API does.
 */

export interface SmsResult {
  to: string;
  ok: boolean;
  /** Twilio's message SID when it was accepted. */
  sid?: string;
  error?: string;
}

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM,
  );
}

/**
 * E.164, which is what Twilio requires: +1 then ten digits for the US.
 * Returns null when the input cannot be read as a number, so a typo is caught
 * when it is entered rather than at 6pm when the text fails to send.
 */
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return null;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (!sid || !token || !from) return { to, ok: false, error: "Twilio is not configured" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });

    const payload = (await res.json()) as { sid?: string; message?: string; code?: number };
    if (!res.ok) {
      // Twilio's own message is the useful part (e.g. unverified number on a
      // trial account); it names no secret, so it is safe to surface.
      return { to, ok: false, error: payload.message ?? `Twilio returned ${res.status}` };
    }
    return { to, ok: true, sid: payload.sid };
  } catch (err) {
    return { to, ok: false, error: err instanceof Error ? err.message : "Could not reach Twilio" };
  }
}
