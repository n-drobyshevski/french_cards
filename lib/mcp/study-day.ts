// The study day on the server. Devices start it at 04:00 local time (lib/session.ts uses the
// device clock); Vercel runs in UTC, so the connector computes 04:00 in MCP_TIMEZONE with Intl.

/** Same as DAY_START_HOUR in lib/session.ts, which can't be imported here (it pulls in Dexie). */
export const DAY_START_HOUR = 4;

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wallClock(ms: number, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) if (p.type !== "literal") parts[p.type] = Number(p.value);
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

/** Zone offset at an instant, in ms (Paris in summer: +2 h). */
function offsetAt(ms: number, timeZone: string): number {
  const w = wallClock(ms, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000;
}

/** The instant when the zone's clock shows y-m-d hh:00 (the day may overflow, as with Date.UTC). */
function zonedInstant(year: number, month: number, day: number, hour: number, timeZone: string): number {
  const wall = Date.UTC(year, month - 1, day, hour);
  let t = wall - offsetAt(wall, timeZone);
  // A second pass settles instants whose offset differs from the first guess (DST changes).
  const again = wall - offsetAt(t, timeZone);
  if (again !== t) t = again;
  return t;
}

export interface StudyDay {
  start: Date;
  end: Date;
}

/** [start, end) of the study day containing `now`: 04:00 to 04:00 on the zone's clock (23 or 25 h across DST). */
export function studyDay(now: Date, timeZone: string): StudyDay {
  const w = wallClock(now.getTime(), timeZone);
  const dayOffset = w.hour < DAY_START_HOUR ? -1 : 0;
  return {
    start: new Date(zonedInstant(w.year, w.month, w.day + dayOffset, DAY_START_HOUR, timeZone)),
    end: new Date(zonedInstant(w.year, w.month, w.day + dayOffset + 1, DAY_START_HOUR, timeZone)),
  };
}
