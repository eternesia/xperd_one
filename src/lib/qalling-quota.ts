/** Storage allowance in bytes (decimal GB, matching the server quota check); null = unlimited. */
export function storageQuota(limits: Record<string, number | null> | undefined, usedBytes: number) {
  const gb = limits?.storage_gb;
  if (gb == null) return { capBytes: null, usedBytes, remainingBytes: null, percent: 0 };
  const capBytes = gb * 1_000_000_000;
  return {
    capBytes,
    usedBytes,
    remainingBytes: Math.max(0, capBytes - usedBytes),
    percent: Math.min(100, Math.round((usedBytes / capBytes) * 100)),
  };
}
/** True when another social account would exceed the plan; null limit = unlimited. */
export function accountsFull(
  limits: Record<string, number | null> | undefined,
  activeCount: number,
) {
  const cap = limits?.max_accounts;
  return cap != null && activeCount >= cap;
}

export const fmtBytes = (b: number) =>
  b >= 1e9
    ? `${(b / 1e9).toFixed(2)} GB`
    : b >= 1e6
      ? `${(b / 1e6).toFixed(1)} MB`
      : `${Math.max(1, Math.round(b / 1e3))} KB`;
