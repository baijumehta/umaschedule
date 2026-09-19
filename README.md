# Uma's Block Planner

A scheduling app for a Canyon High School junior on an odd/even block schedule,
built around the fact that *what day it is* decides where she has to be.

## The fixed schedule is derived, not entered

`index.html` carries the Canyon High 2026-27 block calendar transcribed from the
district PDFs. Day counts were checked against the OUSD district calendar and
total 180 instructional days, month for month.

From that table the app derives:

- **Lacrosse** — Mon / Wed / Thu, through Dec 18 2026 (last day before winter break).
  Odd days: Upper Fields, 1:45-3:45. Even days: Crescent Elementary, 3:45-5:45.
  Skipped on no-school days.
- **Piano** — Wednesdays 1:45, one hour, on any school Wednesday when practice is
  *not* at 1:45. During the season that is even Wednesdays; after it, every Wednesday.
- **School markers** — no-school days, breaks, minimum days, quarter ends, finals,
  Back-to-School Night, Open House, graduation.

Everything else (math tutoring, ACT prep, study groups, social) is added in the app,
one-off or weekly, with overlap warnings against the fixed schedule.

## Calendar export

- **CSV** for Google Calendar import.
- **ICS** for Apple Calendar / Outlook.

Every event carries a stable UID, so re-importing updates events rather than
duplicating them.

## Running it

Open `index.html`. No build, no dependencies.
