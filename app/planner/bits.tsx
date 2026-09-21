"use client";

import { classById, displayTitle, whenLabel } from "@/lib/classes";
import { CATEGORIES } from "@/lib/schedule";
import type { DayInfo, PlannerEvent } from "@/lib/types";

/** The single most useful fact about a school day: which block it runs. */
export function BlockChip({ info }: { info: DayInfo }) {
  if (!info.school) return null;
  const odd = info.block === "odd";
  return <span className={"chip " + (odd ? "chip-odd" : "chip-even")}>{info.block} day</span>;
}

export function CatDot({ cat }: { cat: PlannerEvent["cat"] }) {
  return <i className="ev-dot" style={{ background: `var(${CATEGORIES[cat].cssVar})` }} />;
}

export function EventRow({ ev, onEdit }: { ev: PlannerEvent; onEdit?: (sourceId: string) => void }) {
  // Practice location follows the block day, so label which one it came from.
  const laxTag = ev.cat === "lax"
    ? ev.loc === "Upper Fields" ? "odd · upper" : "even · crescent"
    : null;

  // A test or project earns a word, not just a coloured dot.
  const kindTag = ev.cat === "test" ? "test" : ev.cat === "project" ? "due" : null;
  const cls = classById(ev.classId);

  return (
    <div className={"ev" + (ev.skipped ? " ev-skipped" : "")}>
      <div className="ev-time mono">{whenLabel(ev)}</div>
      <div className="ev-main">
        <div className="ev-title">
          <CatDot cat={ev.cat} />
          {kindTag && (
            <span
              className="tag"
              style={{ background: `var(${CATEGORIES[ev.cat].cssVar}-bg)`, color: `var(${CATEGORIES[ev.cat].cssVar})` }}
            >
              {kindTag}
            </span>
          )}
          <span>{cls ? displayTitle(ev) : ev.title}</span>
          {laxTag && (
            <span className="tag" style={{ background: "var(--c-lax-bg)", color: "var(--c-lax)" }}>
              {laxTag}
            </span>
          )}
        </div>
        {ev.skipped
          ? <div className="ev-loc ev-declined">Not going</div>
          : ev.loc && <div className="ev-loc">{ev.loc}</div>}
        {ev.decisionNote && !ev.skipped && (
          <div className="ev-loc ev-late">{ev.decisionNote}</div>
        )}
        {ev.notes && <div className="ev-notes">{ev.notes}</div>}
      </div>
      {!ev.fixed && onEdit ? (
        <button
          type="button"
          className="btn btn-ghost ev-edit"
          onClick={() => onEdit(ev.sourceId ?? ev.id)}
        >
          Edit
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend">
      {(Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>).map((k) => (
        <span className="lg" key={k}>
          <i style={{ background: `var(${CATEGORIES[k].cssVar})` }} />
          {CATEGORIES[k].label}
        </span>
      ))}
    </div>
  );
}
