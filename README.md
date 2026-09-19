# Uma's Block Planner

A scheduling app for a Canyon High School junior on an odd/even block schedule,
built around the fact that *which block the day runs* decides where she has to be.

Next.js on Vercel, Neon Postgres, and a live calendar feed her phone subscribes to.

---

## The idea

Most of her week is not data worth typing in — it is a consequence of the school
calendar. So the app stores almost none of it.

`lib/schedule.ts` carries the Canyon High 2026–27 block calendar, transcribed
from the school's odd/even PDF. Every standing commitment is *derived* from it:

| | when | where |
|---|---|---|
| **Review emails** | 7:45–7:55am, every school morning Mon–Fri | — |
| **Lacrosse** | Mon/Wed/Thu through Dec 18 2026 — **odd** days 1:45–3:45, **even** days 3:45–5:45 | Upper Fields / Crescent Elementary |
| **Piano** | Wednesdays 1:45, one hour, whenever practice is *not* already at 1:45 | — |
| **School markers** | no-school days, breaks, minimum days, quarter ends, finals, Back-to-School Night, Open House, graduation | — |

Because these are rules rather than saved rows, a holiday or a break clears them
on its own. Nobody has to remember to delete practice on Veterans Day.

The piano rule is the interesting one: it resolves to **even Wednesdays** during
the season (practice is at 3:45 those days, so 1:45 is free) and to **every
Wednesday** once the season ends.

Only what Uma adds herself — math tutoring, ACT prep, study groups, social plans
— is stored in Postgres.

### The block table is checked, not trusted

The transcription was verified against the Orange Unified district calendar
month by month. It produces exactly 180 instructional days, matching all twelve
of the district's published monthly counts. The "review emails" event fires once
per school day, and the live feed emits exactly 180 of them.

---

## The calendar feed

The point of the backend. A subscribable URL:

```
https://<your-app>.vercel.app/api/feed/<FEED_TOKEN>.ics
```

Subscribe a phone to it once and it re-reads every few hours on its own —
anything added in the planner turns up on her calendar without another import.
The school year is generated fresh on every read: block calendar from code, her
own events from Postgres.

Query options, so different subscriptions can carry different things:

| parameter | effect |
|---|---|
| `?only=lax,piano` | restrict to these categories |
| `?school=0` | drop no-school days, breaks and minimum days |
| `?alarms=0` | no 30-minute reminders |

Times are emitted with a real `VTIMEZONE` for `America/Los_Angeles`, so 1:45
practice shows at 1:45 Pacific even if the phone reading the feed is elsewhere.
Every event carries a stable UID, so re-reading updates rather than duplicates.

**The feed URL is a credential.** Calendar apps cannot send headers, so the
token sits in the path — anyone holding that URL can read where she is all year.
To retire one, change `FEED_TOKEN` and redeploy; the old URL dies immediately.

---

## Access

Deliberately not a login system, but not open either.

- `HOUSEHOLD_KEY` — one shared passphrase, sent as the `x-household-key` header.
  Gates reading and writing through the app.
- `FEED_TOKEN` — separate, read-only, in the feed URL.

Keeping them separate means the feed URL can be handed to a calendar app, or
rotated after being pasted somewhere careless, without disturbing the key that
allows edits. Both are compared in constant time.

---

## Running it

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL
npm run db:setup               # creates the events table
npm run dev
```

`.env.local` is gitignored. Never commit it.

### Deploying

1. Push to GitHub, then import the repo at [vercel.com/new](https://vercel.com/new).
2. In the Vercel project, **Storage → Connect Store → Neon**, or set `DATABASE_URL`
   by hand under Settings → Environment Variables. Use the **pooled** Neon
   connection string — its host contains `-pooler`.
3. Add `HOUSEHOLD_KEY` and `FEED_TOKEN` as environment variables too. Use the
   same values as `.env.local`, or the feed URL will differ between local and
   production.
4. Deploy, then run `npm run db:setup` once against the same database.

Check it came up with **`/api/health`**:

```json
{ "ready": true, "configured": { ... }, "database": "ok" }
```

Every other route answers a missing variable and a wrong passphrase with the
same 401, so without this there is no way to tell a misconfigured deployment
from a mistyped passphrase. `/api/health` reports only whether each variable is
present — never a value.

> Vercel sets environment variables per environment. Adding one only to Preview
> leaves Production unconfigured, and the symptom is a 401 on everything.

---

## Layout

```
app/
  page.tsx                    resolves "today" server-side in the school's timezone
  planner/                    the UI — week, month, dialog, calendar panel
  api/events/                 list, create, update, delete
  api/feed/[token]/           the live .ics feed
  api/config/                 hands the feed URL to a holder of the household key
lib/
  schedule.ts                 the block calendar and every derived rule
  calendar.ts                 iCalendar and CSV builders
  db.ts  validate.ts  auth.ts
db/schema.sql                 one table
```

`lib/schedule.ts` and `lib/calendar.ts` are framework-free on purpose: the
browser renders from them and the feed route generates from them, so there is
exactly one definition of what an odd Wednesday means.

A zero-dependency single-file version of this app, with no backend, is preserved
in git history at commit `c908a16`.
