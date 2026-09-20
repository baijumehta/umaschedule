import { classById, displayTitle, whenLabel } from "./classes";
import type { Briefing } from "./briefing";
import { describeConflict } from "./conflicts";
import { DOW_SHORT, dow, fmtDate, fmtRange } from "./schedule";
import type { Nudge } from "./guidance";

/**
 * The briefing as an email.
 *
 * Built from tables and explicit rows rather than a pre-formatted block:
 * Outlook ignores `white-space: pre-wrap`, which collapsed the whole message
 * into one run-on paragraph. Everything is inline-styled for the same reason —
 * mail clients strip stylesheets — and the layout stays single-column so it
 * survives a phone.
 */

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const INK = "#1a1815";
const MUTED = "#6c655b";
const RULE = "#e2ded4";
const PAPER = "#faf9f6";
const GOLD = "#8a6a1c";

const URGENCY: Record<Nudge["urgency"], { bar: string; label: string; tint: string }> = {
  now: { bar: "#c1121f", label: "Do this today", tint: "#fdf0f0" },
  soon: { bar: "#b5561f", label: "This week", tint: "#fdf4ee" },
  ahead: { bar: "#8a6a1c", label: "Ahead", tint: "#fbf6e9" },
};

function section(title: string, inner: string): string {
  return `
  <tr><td style="padding:22px 0 0">
    <div style="font:600 11px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.1em;
                text-transform:uppercase;color:${MUTED};padding-bottom:9px">${esc(title)}</div>
    ${inner}
  </td></tr>`;
}

function nudgeBlock(n: Nudge): string {
  const u = URGENCY[n.urgency];
  const about = n.aboutDate
    ? `${DOW_SHORT[dow(n.aboutDate)]} ${fmtDate(n.aboutDate)}${n.aboutTitle ? ` · ${esc(n.aboutTitle)}` : ""}`
    : "";
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="border-collapse:collapse;margin-bottom:9px">
    <tr>
      <td width="4" style="background:${u.bar};font-size:0;line-height:0">&nbsp;</td>
      <td style="background:${u.tint};padding:11px 13px">
        <div style="font:700 15px/1.35 Arial,Helvetica,sans-serif;color:${INK}">${esc(n.title)}</div>
        <div style="font:400 13px/1.5 Arial,Helvetica,sans-serif;color:${INK};padding-top:4px">
          ${esc(n.detail)}
        </div>
        ${about ? `<div style="font:400 11px/1.4 Arial,Helvetica,sans-serif;color:${MUTED};padding-top:6px">${about}</div>` : ""}
      </td>
    </tr>
  </table>`;
}

function row(left: string, right: string, strong = false): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="border-collapse:collapse;border-top:1px solid ${RULE}">
    <tr>
      <td width="96" valign="top"
          style="padding:8px 10px 8px 0;font:400 12px/1.5 Arial,Helvetica,sans-serif;color:${MUTED};white-space:nowrap">
        ${left}
      </td>
      <td valign="top" style="padding:8px 0;font:${strong ? "600" : "400"} 14px/1.5 Arial,Helvetica,sans-serif;color:${INK}">
        ${right}
      </td>
    </tr>
  </table>`;
}

export function briefingHtml(b: Briefing, appUrl?: string): string {
  const parts: string[] = [];

  // --- headline -----------------------------------------------------
  const badge = b.kind.includes("day")
    ? `<span style="display:inline-block;background:${b.kind.startsWith("odd") ? INK : GOLD};
         color:#fff;font:700 11px/1 Arial,Helvetica,sans-serif;letter-spacing:.08em;
         text-transform:uppercase;padding:5px 9px;border-radius:3px">${esc(b.kind)}</span>`
    : `<span style="display:inline-block;background:#ece8e0;color:${MUTED};
         font:700 11px/1 Arial,Helvetica,sans-serif;letter-spacing:.06em;
         padding:5px 9px;border-radius:3px">${esc(b.kind)}</span>`;

  parts.push(`
  <tr><td>
    <div style="font:700 22px/1.25 Arial,Helvetica,sans-serif;color:${INK};padding-bottom:7px">
      Uma &middot; ${esc(b.heading)}
    </div>
    ${badge}
    ${b.minDay ? `<span style="display:inline-block;border:1px solid ${GOLD};color:${GOLD};
        font:700 10px/1 Arial,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase;
        padding:4px 8px;border-radius:3px;margin-left:5px">min day</span>` : ""}
  </td></tr>`);

  // A double-booking is an unmade decision, not a reminder, so it leads.
  if (b.conflicts.length) {
    parts.push(`
    <tr><td style="padding:18px 0 0">
      ${b.conflicts.map((c) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="border-collapse:collapse;margin-bottom:8px">
        <tr>
          <td width="4" style="background:#c1121f;font-size:0;line-height:0">&nbsp;</td>
          <td style="background:#fdf0f0;padding:11px 13px">
            <div style="font:700 15px/1.35 Arial,Helvetica,sans-serif;color:${INK}">
              Two things at once
            </div>
            <div style="font:400 13px/1.5 Arial,Helvetica,sans-serif;color:${INK};padding-top:4px">
              ${esc(describeConflict(c))}. You cannot be at both.
            </div>
            <div style="font:400 12px/1.5 Arial,Helvetica,sans-serif;padding-top:8px">
              <a href="${esc(appUrl ?? "#")}" style="color:#c1121f;font-weight:700">
                Say which one you are going to &rarr;
              </a>
            </div>
          </td>
        </tr>
      </table>`).join("")}
    </td></tr>`);
  }
  // The written sentence comes next: it frames the checklist under it.
  if (b.coaching) {
    parts.push(`
    <tr><td style="padding:16px 0 0">
      <div style="border-left:3px solid ${RULE};padding:2px 0 2px 12px;
                  font:400 14px/1.55 Arial,Helvetica,sans-serif;color:${INK}">
        ${esc(b.coaching)}
      </div>
    </td></tr>`);
  }

  // --- what to do, next --------------------------------------------
  if (b.nudges.length) {
    parts.push(section("What to do", b.nudges.map(nudgeBlock).join("")));
  }


  // --- classes ------------------------------------------------------
  if (b.classes.length) {
    parts.push(section("Classes", b.classes.map((c) => row(
      `<span style="display:inline-block;background:#f4e9cc;color:${GOLD};
        font:600 11px/1 Arial,Helvetica,sans-serif;padding:4px 7px;border-radius:3px">
        Period ${c.period}</span>`,
      esc(c.name),
    )).join("")));
  }

  // --- the day ------------------------------------------------------
  if (b.schedule.length) {
    parts.push(section("On the day", b.schedule.map((ev) => {
      const when = ev.allDay
        ? (classById(ev.classId) ? esc(whenLabel(ev)) : "all day")
        : esc(fmtRange(ev.start, ev.end));
      const title = ev.skipped
        ? `<span style="text-decoration:line-through;color:${MUTED}">${esc(displayTitle(ev))}</span>`
          + `<span style="color:${MUTED};font-weight:400"> — not going</span>`
        : esc(displayTitle(ev));
      const extra = [ev.loc, ev.notes].filter(Boolean).map(esc).join(" &middot; ");
      return row(
        when,
        title + (extra
          ? `<div style="font:400 12px/1.45 Arial,Helvetica,sans-serif;color:${MUTED};padding-top:2px">${extra}</div>`
          : ""),
        ev.cat === "test" || ev.cat === "project",
      );
    }).join("")));
  } else {
    parts.push(section("On the day", `
      <div style="font:400 14px/1.5 Arial,Helvetica,sans-serif;color:${MUTED}">
        Nothing scheduled.
      </div>`));
  }

  // --- horizon ------------------------------------------------------
  if (b.coming.length) {
    parts.push(section("Coming up", b.coming.slice(0, 5).map(({ ev, days }) => row(
      `<span style="color:${days <= 2 ? "#c1121f" : MUTED};font-weight:${days <= 2 ? 700 : 400}">
        ${days === 1 ? "tomorrow" : `${days} days`}</span>`,
      `${esc(displayTitle(ev))}<div style="font:400 12px/1.45 Arial,Helvetica,sans-serif;color:${MUTED};padding-top:2px">
        ${DOW_SHORT[dow(ev.date)]} ${fmtDate(ev.date)}</div>`,
    )).join("")));
  }

  const footer = `
  <tr><td style="padding:24px 0 0;border-top:1px solid ${RULE};margin-top:20px">
    <div style="font:400 11px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};padding-top:14px">
      Uma&rsquo;s Block Planner &middot; sent the evening before${
        appUrl ? ` &middot; <a href="${esc(appUrl)}" style="color:${GOLD}">open the planner</a>` : ""
      }
    </div>
  </td></tr>`;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:${PAPER};margin:0;padding:0">
  <tr><td align="center" style="padding:20px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="max-width:560px;background:#ffffff;border:1px solid ${RULE};
                  border-radius:10px;padding:22px 24px;border-collapse:separate">
      ${parts.join("")}
      ${footer}
    </table>
  </td></tr>
</table>`;
}
