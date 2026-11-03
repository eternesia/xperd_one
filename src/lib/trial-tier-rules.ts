export const TRIAL_TIER_CODES = ["qalling_lite", "qalling_pro", "qalling_agency"] as const;

export function isValidTrial(
  addon: { status: string; starts_at: string; ends_at: string | null } | null,
  today: string,
) {
  return Boolean(
    addon &&
    addon.status === "trial" &&
    addon.starts_at <= today &&
    addon.ends_at &&
    addon.ends_at >= today,
  );
}
