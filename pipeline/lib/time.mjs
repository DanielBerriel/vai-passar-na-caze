// All schedule sources publish kickoff times in Brasília time.
// Brazil has had no daylight saving time since 2019, so the offset is fixed.
export const TIME_ZONE = "America/Sao_Paulo";
const SAO_PAULO_OFFSET = "-03:00";

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" of the given instant, as seen in São Paulo. */
export function localDate(date = new Date()) {
  return ymdFormatter.format(date);
}

/** Adds whole days to a "YYYY-MM-DD" string. */
export function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Converts a São Paulo wall-clock date + "HH:MM" into an ISO UTC string. */
export function localToUtcIso(ymd, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  return new Date(`${ymd}T${pad(h)}:${pad(m)}:00${SAO_PAULO_OFFSET}`).toISOString();
}

/**
 * Resolves a day label from the schedule guide ("Hoje", "Amanhã", "Sex, 23/10")
 * into "YYYY-MM-DD". The year is inferred: a date more than ~6 months in the
 * past is assumed to belong to next year (late-December runs listing January).
 */
export function resolveDayLabel(label, now = new Date()) {
  const today = localDate(now);
  const clean = label.trim().toLowerCase();
  if (clean.startsWith("hoje")) return today;
  if (clean.startsWith("amanh")) return addDays(today, 1);

  const m = clean.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(today.slice(0, 4));
  const todayMonth = Number(today.slice(5, 7));
  if (month < todayMonth - 6) year += 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function minutesBetween(isoA, isoB) {
  return Math.abs(Date.parse(isoA) - Date.parse(isoB)) / 60000;
}
