/**
 * Pure date helpers for the weekly-plan `start_date` field (WEEK-01).
 * No external date library (04-RESEARCH.md Assumption A2 / Don't Hand-Roll).
 */

/**
 * Returns the upcoming Monday on/after `from` (default: today) as an ISO
 * `YYYY-MM-DD` string, suitable as the value of a native
 * `<input type="date">`.
 */
export function getUpcomingMonday(from: Date = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysUntilMonday = (8 - day) % 7; // day===1 (Monday) -> 0
  date.setDate(date.getDate() + daysUntilMonday);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

/**
 * Formats a stored `start_date` value as "Week of Jul 6, 2026"-style text.
 * PocketBase `date`-type fields serialize with either a space or `T`
 * separator (04-RESEARCH.md Assumption A1) — normalize before parsing.
 * Guards empty/null input by returning "" so callers can conditionally
 * render (e.g. `{formatWeekOf(plan.start_date) && <Typography>...}`).
 */
export function formatWeekOf(startDate: string | null | undefined): string {
  if (!startDate) return "";

  const normalized = startDate.includes("T")
    ? startDate
    : startDate.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";

  const formatted = parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Week of ${formatted}`;
}
