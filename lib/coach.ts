import Anthropic from "@anthropic-ai/sdk";
import type { Briefing } from "./briefing";
import { displayTitle } from "./classes";
import { describeConflict } from "./conflicts";
import { DOW_SHORT, dow, fmtDate, fmtRange } from "./schedule";

/**
 * One sentence of judgement on top of the day.
 *
 * Deliberately narrow. The reminders themselves are deterministic rules in
 * lib/guidance.ts, because a prompt to check ACT registration has to fire
 * whether or not a model is reachable. This only adds the connective tissue a
 * list cannot have — noticing that a test sits the day after a tournament, or
 * that the only free evening this week is Tuesday.
 *
 * It is allowed to fail. A briefing without a coaching line is still the
 * briefing; a briefing that did not send because an API was down is not.
 */

const SYSTEM = [
  "You write one or two sentences at the end of a daily briefing for Uma, a high-school junior.",
  "",
  "You are given her day and what is coming. Say the thing a parent would say if they had",
  "looked at it properly: what to watch out for, what to do first, where the squeeze is.",
  "",
  "Rules:",
  "- Two sentences at most. Often one is right.",
  "- Only use what you are given. Never invent an event, a time, a grade or a deadline.",
  "- Be specific. 'Tuesday is your only free evening before the test' beats 'manage your time'.",
  "- Do not repeat the reminders verbatim; they are already listed above you.",
  "- Address her directly, plainly. No greeting, no sign-off, no exclamation marks.",
  "- No praise for things she has not done, and no lecturing.",
  "- If the day is genuinely quiet, say so briefly. Do not manufacture urgency.",
  "- Never tell her to resolve a clash she has already decided. An item marked",
  "  NOT GOING is settled; treat that time as free.",
  "- If nothing useful can be added, reply with exactly: NOTHING",
].join("\n");

function describe(b: Briefing, freeEvenings: string[]): string {
  const lines: string[] = [];
  lines.push(`Day: ${b.heading}, ${b.kind}${b.minDay ? ", minimum day" : ""}`);

  if (b.classes.length) {
    lines.push("Classes today:");
    for (const c of b.classes) {
      lines.push(`  - period ${c.period} ${c.name}, ${fmtRange(c.start, c.end)}`);
    }
  }

  if (b.nudges.length) {
    lines.push("Reminders already shown to her:");
    for (const n of b.nudges) lines.push(`  - ${n.title}`);
  }

  if (b.schedule.length) {
    lines.push("On the day:");
    for (const ev of b.schedule) {
      const when = ev.allDay ? "all day" : fmtRange(ev.start, ev.end);
      const declined = ev.skipped ? " [SHE IS NOT GOING TO THIS - already decided]" : "";
      lines.push(`  - ${when}: ${displayTitle(ev)}${ev.loc ? ` at ${ev.loc}` : ""}${ev.notes ? ` (${ev.notes})` : ""}${declined}`);
    }
  } else {
    lines.push("On the day: nothing scheduled");
  }

  if (b.conflicts.length) {
    lines.push("Unresolved double-bookings she still has to choose between:");
    for (const c of b.conflicts) lines.push(`  - ${describeConflict(c)}`);
  } else {
    lines.push("No unresolved double-bookings.");
  }

  if (b.coming.length) {
    lines.push("Coming up:");
    for (const { ev, days } of b.coming.slice(0, 6)) {
      lines.push(`  - in ${days} day(s), ${DOW_SHORT[dow(ev.date)]} ${fmtDate(ev.date)}: ${displayTitle(ev)}`);
    }
  }

  if (freeEvenings.length) {
    lines.push(`Evenings with nothing booked, next week: ${freeEvenings.join(", ")}`);
  } else {
    lines.push("Evenings with nothing booked, next week: none");
  }

  return lines.join("\n");
}

export async function coachingLine(
  b: Briefing, freeEvenings: string[] = [],
): Promise<string | undefined> {
  if (!process.env.ANTHROPIC_API_KEY) return undefined;

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 300,
      thinking: { type: "adaptive" },
      // A short, well-specified writing task; high effort buys nothing here.
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: describe(b, freeEvenings) }],
    });

    if (res.stop_reason === "refusal") return undefined;

    const text = res.content
      .filter((blk): blk is Anthropic.TextBlock => blk.type === "text")
      .map((blk) => blk.text)
      .join(" ")
      .trim();

    if (!text || /^NOTHING\b/i.test(text)) return undefined;
    // A runaway answer is a bug in the prompt, not something to forward.
    return text.length > 400 ? undefined : text;
  } catch (err) {
    console.error("[coach]", err);
    return undefined;
  }
}
