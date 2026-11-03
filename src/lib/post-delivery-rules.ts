export type DeliveryResult = {
  account_id: string;
  ok: boolean;
  pending?: boolean;
  id?: string;
  permalink?: string;
  error?: string | null;
};
export function deliveryStatus(results: DeliveryResult[]) {
  if (results.some((r) => r.pending)) return "publishing";
  return results.some((r) => r.ok) ? "published" : "failed";
}
export function reconcileDelivery(
  previous: DeliveryResult[],
  incoming: DeliveryResult[],
  providerStatus: string,
) {
  const incomingIds = new Set(incoming.map((r) => r.account_id));
  const results = [
    ...previous.filter((r) => !incomingIds.has(r.account_id)),
    ...incoming.map((r) => ({
      ...r,
      pending: providerStatus === "scheduled" || providerStatus === "publishing",
    })),
  ];
  return { results, status: deliveryStatus(results) };
}
export function canEditSchedule(post: {
  status: string;
  source?: string;
  external_id?: string | null;
}) {
  return (
    ["draft", "scheduled"].includes(post.status) && post.source !== "tebar" && !post.external_id
  );
}
export function validateScheduleTime(value: string, now: number) {
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at <= now) throw new Error("Pilih waktu jadwal di masa depan");
  return new Date(at).toISOString();
}
