/** A calendar date, always "YYYY-MM-DD". */
export type ISODate = string;

/** A wall-clock time, always 24-hour "HH:MM". */
export type ClockTime = string;

export type Category =
  | "lax"
  | "piano"
  | "math"
  | "act"
  | "study"
  | "social"
  | "test"
  | "project"
  | "email"
  | "class"
  | "school"
  | "other";

/** An event Uma added, as it is stored in Postgres. */
export interface StoredEvent {
  id: string;
  title: string;
  cat: Category;
  /** For a one-off, the date it happens. For a weekly repeat, the first date it may occur. */
  date: ISODate;
  /** Empty for an all-day item such as a test or a project deadline. */
  start: ClockTime;
  end: ClockTime;
  /** A test or a due date occupies a day, not a slot. */
  allDay: boolean;
  /** Which course a test or project belongs to. Empty for anything else. */
  classId: string;
  loc: string;
  notes: string;
  repeat: "none" | "weekly";
  /** Days of the week (0 = Sunday) a weekly event lands on. Empty for one-offs. */
  days: number[];
  /** Last date a weekly event may occur. Empty for one-offs. */
  until: ISODate | "";
}

/** One thing on one day — either derived from the block calendar or stored. */
export interface PlannerEvent {
  /** Unique within a day. Derived events reuse their generated id. */
  id: string;
  date: ISODate;
  cat: Category;
  title: string;
  start: ClockTime;
  end: ClockTime;
  loc: string;
  notes: string;
  /** True when the block calendar produced it, so it cannot be edited directly. */
  fixed: boolean;
  allDay: boolean;
  /** For a stored event, the row it came from — a weekly event has many days, one row. */
  sourceId?: string;
  /** Carried through from the stored row so the UI can name the course. */
  classId?: string;
  /** She has said she is not attending this occurrence. Shown, not deleted. */
  skipped?: boolean;
}

export interface DayInfo {
  school: boolean;
  /** Only present when `school` is true. */
  block?: "odd" | "even";
  /** True on a minimum day. */
  min?: boolean;
  /** Only present when `school` is false — "Winter break", "Labor Day", "Weekend". */
  reason?: string;
}
