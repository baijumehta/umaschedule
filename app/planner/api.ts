import { HEADER } from "@/lib/auth";
import type { StoredEvent } from "@/lib/types";

const KEY_STORAGE = "uma.householdKey";

/** Thrown when the household key is missing or wrong, so the gate can reappear. */
export class NotAuthorized extends Error {
  constructor() {
    super("Not authorized");
    this.name = "NotAuthorized";
  }
}

export function readKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function writeKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* Private browsing — the key just will not be remembered. */
  }
}

async function request<T>(path: string, init: RequestInit = {}, key?: string): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      [HEADER]: key ?? readKey(),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401) throw new NotAuthorized();

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* Fall through to the status-based message below. */
  }

  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  /** Also doubles as the key check the gate uses. */
  list: (key?: string) =>
    request<{ events: StoredEvent[] }>("/api/events", {}, key).then((r) => r.events),

  create: (ev: StoredEvent) =>
    request<{ event: StoredEvent }>("/api/events", {
      method: "POST",
      body: JSON.stringify(ev),
    }).then((r) => r.event),

  update: (ev: StoredEvent) =>
    request<{ event: StoredEvent }>(`/api/events/${encodeURIComponent(ev.id)}`, {
      method: "PUT",
      body: JSON.stringify(ev),
    }).then((r) => r.event),

  /** Which occurrences she has declined. Fetched with the same key as the
   *  event list, so it cannot race the key being written to storage. */
  decisions: (key?: string) =>
    request<{ decisions: Array<{ occurrenceId: string; attending: boolean; note: string }> }>(
      "/api/attendance", {}, key,
    ).then((r) => r.decisions),

  /** Reminders and clashes already dealt with. Loaded with everything else so
   *  a settled clash does not reappear on the next page load. */
  doneNudges: (key?: string) =>
    request<{ done: string[] }>("/api/nudges", {}, key).then((r) => r.done),

  remove: (id: string) =>
    request<{ removed: boolean }>(`/api/events/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).then((r) => r.removed),
};

/** Ids are minted client-side so a retried create cannot make a second row. */
export function newId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return "e" + Date.now().toString(36) + rand;
}
