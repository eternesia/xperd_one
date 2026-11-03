/** Recommended Indonesian audience posting windows (WIB, UTC+7). */
export const GOLDEN_HOURS = [
  { id: "pagi", label: "Pagi", en: "Morning", start: "07:00", end: "08:30" },
  { id: "siang", label: "Siang", en: "Lunch", start: "12:00", end: "13:00" },
  { id: "sore", label: "Sore", en: "Evening", start: "16:30", end: "18:00" },
  { id: "malam", label: "Malam", en: "Night", start: "19:30", end: "21:00" },
] as const;

const WIB_MS = 7 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Next start of a golden window (as WIB clock time) at or after `from`. Returns a Date. */
export function nextGoldenSlot(from: Date, slotId?: string): Date {
  const wib = new Date(from.getTime() + WIB_MS);
  const slots = slotId ? GOLDEN_HOURS.filter((s) => s.id === slotId) : GOLDEN_HOURS;
  for (let day = 0; day < 2; day++) {
    for (const s of slots) {
      const [h, m] = s.start.split(":").map(Number);
      const t =
        Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() + day, h, m) - WIB_MS;
      if (t >= from.getTime()) return new Date(t);
    }
  }
  return from;
}

/** Format a Date for a datetime-local input in the browser's local zone. */
export function toLocalInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
