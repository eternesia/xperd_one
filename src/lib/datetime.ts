/**
 * MySQL DATETIME helpers.
 *
 * `new Date().toISOString()` produces `2026-09-24T06:54:02.961Z`, which MySQL
 * REJECTS for a DATETIME column ("Incorrect datetime value ... at row 1") —
 * CAST() tolerates it, INSERT/UPDATE does not. Always format timestamps written
 * to the database through this helper.
 */

/** MySQL DATETIME literal in UTC (`YYYY-MM-DD HH:MM:SS`). */
export function sqlDateTime(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** MySQL DATETIME literal for a `datetime-local` value, or null when empty. */
export function sqlDateTimeOrNull(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : sqlDateTime(parsed);
}
