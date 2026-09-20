/**
 * Sending the briefing by email, through SMTP2GO's HTTP API.
 *
 * HTTP rather than SMTP on purpose: a serverless function has nowhere to keep
 * a connection, and this is one fetch with no dependency.
 */

export interface EmailResult {
  to: string;
  ok: boolean;
  /** SMTP2GO's id for the accepted message. */
  id?: string;
  error?: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP2GO_API_KEY && process.env.SMTP2GO_SENDER);
}

/** Loose on purpose — the real test is whether SMTP2GO accepts it. */
export function looksLikeEmail(raw: string): string | null {
  const trimmed = raw.trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) ? trimmed : null;
}

/** SMTP2GO wants `Name <addr@example.com>`, and a bare address is also valid. */
const addressed = (name: string, addr: string) =>
  name.trim() ? `${name.replace(/[<>",]/g, "").trim()} <${addr}>` : addr;

export async function sendEmail(
  to: string, name: string, subject: string, text: string, html: string,
): Promise<EmailResult> {
  const key = process.env.SMTP2GO_API_KEY;
  const sender = process.env.SMTP2GO_SENDER;
  if (!key || !sender) return { to, ok: false, error: "SMTP2GO is not configured" };

  try {
    const res = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Smtp2go-Api-Key": key },
      body: JSON.stringify({
        sender,
        to: [addressed(name, to)],
        subject,
        text_body: text,
        html_body: html,
      }),
    });

    const payload = (await res.json()) as {
      data?: {
        succeeded?: number;
        failed?: number;
        failures?: unknown[];
        email_id?: string;
        error?: string;
        error_code?: string;
      };
    };
    const data = payload.data ?? {};

    if (!res.ok) {
      return { to, ok: false, error: data.error ?? `SMTP2GO returned ${res.status}` };
    }

    // Documented explicitly: a 200 can still carry per-recipient failures, so
    // the status code alone is not evidence that anything was delivered.
    if ((data.failed ?? 0) > 0 || !(data.succeeded ?? 0)) {
      const first = data.failures?.[0];
      return {
        to, ok: false,
        error: typeof first === "string" ? first : data.error ?? "SMTP2GO rejected the recipient",
      };
    }

    return { to, ok: true, id: data.email_id };
  } catch (err) {
    return { to, ok: false, error: err instanceof Error ? err.message : "Could not reach SMTP2GO" };
  }
}
