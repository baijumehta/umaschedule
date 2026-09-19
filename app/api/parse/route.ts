import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { hasHouseholdKey, refuse } from "@/lib/auth";
import { classById, classMeetsOn, classesFor } from "@/lib/classes";
import { buildSystemPrompt, ParseSchema, type Draft } from "@/lib/nlp";
import { clampTerm, dayInfo, findConflicts, fmtDate, fmtRange, occurrences } from "@/lib/schedule";
import type { StoredEvent } from "@/lib/types";
import { validateEvent } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Thinking plus a round trip; comfortably inside Vercel's limit.
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * "Bio test on the 23rd" in, a draft event out.
 *
 * Nothing here writes to the database. The response is a set of drafts plus the
 * warnings this app already knows how to compute — clashes with practice, a
 * test on a day its class does not meet, a guessed duration — so the person
 * confirming sees what was inferred before anything is saved.
 */
export async function POST(req: Request) {
  if (!hasHouseholdKey(req)) return refuse();

  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "Natural-language entry is not configured on this deployment." }, 501);
  }

  let body: { text?: string; today?: string; events?: StoredEvent[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }

  const text = (body.text ?? "").trim();
  if (!text) return json({ error: "Say what to add." }, 400);
  if (text.length > 2000) return json({ error: "That is too long to parse at once." }, 400);

  const today = clampTerm(
    typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
      ? body.today
      : new Date().toISOString().slice(0, 10),
  );
  const existing = Array.isArray(body.events) ? body.events : [];

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(ParseSchema) },
      system: buildSystemPrompt(today),
      messages: [{ role: "user", content: text }],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "That could not be parsed." }, 422);
    }

    const parsed = response.parsed_output;
    if (!parsed) return json({ error: "That could not be read as an event." }, 422);
    if (!parsed.events.length) {
      return json({ error: parsed.problem || "Nothing schedulable in that." }, 422);
    }

    // The model proposes; this code decides. Every draft goes through the same
    // validator the API uses, then picks up the app's own warnings.
    const drafts = parsed.events.map((d, i) => review(d, i, existing));
    return json({ drafts });
  } catch (err) {
    console.error("[api/parse]", err);
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: "The parsing service rejected this deployment's key." }, 502);
    }
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "Too many at once — give it a moment." }, 429);
    }
    return json({ error: "Could not parse that just now." }, 502);
  }
}

interface Reviewed {
  ok: boolean;
  error?: string;
  event?: StoredEvent;
  warnings: string[];
  assumptions: string[];
}

function review(draft: Draft, index: number, existing: StoredEvent[]): Reviewed {
  const assumptions = Array.isArray(draft.assumptions) ? draft.assumptions.slice(0, 5) : [];

  const candidate = {
    id: `nl${Date.now().toString(36)}${index}`,
    title: draft.title,
    cat: draft.cat,
    date: draft.date,
    start: draft.allDay ? "" : draft.start,
    end: draft.allDay ? "" : draft.end,
    allDay: draft.allDay,
    classId: draft.classId || "",
    loc: draft.loc || "",
    notes: draft.notes || "",
    repeat: draft.repeat,
    days: draft.days ?? [],
    until: draft.until || "",
  };

  const checked = validateEvent(candidate);
  if (!checked.ok) return { ok: false, error: checked.error, warnings: [], assumptions };

  const event = checked.value;
  const warnings: string[] = [];

  for (const hit of findConflicts(event, existing)) {
    warnings.push(
      `Overlaps ${hit.with.title} on ${fmtDate(hit.date)}, ${fmtRange(hit.with.start, hit.with.end)}`,
    );
  }

  if (event.classId && dayInfo(event.date).school && !classMeetsOn(event.classId, event.date)) {
    warnings.push(
      `${classById(event.classId)?.name} does not meet on ${fmtDate(event.date)} — that is a ` +
      `${dayInfo(event.date).block} day (${classesFor(event.date).map((c) => c.short).join(", ")})`,
    );
  }

  for (const d of occurrences(event)) {
    const info = dayInfo(d);
    if (!info.school && info.reason && info.reason !== "Weekend") {
      warnings.push(`${fmtDate(d)} is not a school day — ${info.reason.toLowerCase()}`);
      break;
    }
  }

  return { ok: true, event, warnings, assumptions };
}
