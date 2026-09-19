import { Planner } from "./planner/Planner";

export const dynamic = "force-dynamic";

/**
 * "Today" is resolved on the server, in the school's own timezone.
 *
 * Two reasons: server and client agree, so React does not hydrate a different
 * date than it rendered; and the app is about one school in Orange, California,
 * so its day should not change because a phone is on holiday in another zone.
 */
function todayAtSchool(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function Page() {
  return <Planner today={todayAtSchool()} />;
}
