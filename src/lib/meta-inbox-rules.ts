export function replyWindowOpen(expiresAt: string | null, now = Date.now()) {
  return (
    expiresAt !== null && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > now
  );
}

export type MetaInbound = {
  accountExternalId: string;
  participant: string;
  mid: string;
  body: string;
  at: string;
  echo: boolean;
  attachments: unknown[];
};
export function normalizeMetaMessages(payload: unknown): MetaInbound[] {
  const p = payload as {
    object?: string;
    entry?: Array<{
      id?: string;
      messaging?: Array<{
        sender?: { id?: string };
        recipient?: { id?: string };
        timestamp?: number;
        message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] };
      }>;
    }>;
  };
  if (!p || !["page", "instagram"].includes(p.object ?? "") || !Array.isArray(p.entry)) return [];
  const result: MetaInbound[] = [];
  for (const entry of p.entry)
    for (const event of Array.isArray(entry.messaging) ? entry.messaging : []) {
      if (!event || typeof event !== "object") continue;
      const m = event.message;
      const echo = m?.is_echo === true;
      const participant = echo ? event.recipient?.id : event.sender?.id;
      if (
        typeof entry.id !== "string" ||
        typeof participant !== "string" ||
        typeof m?.mid !== "string" ||
        !event.timestamp ||
        !Number.isFinite(event.timestamp) ||
        (m.text !== undefined && typeof m.text !== "string")
      )
        continue;
      const at = new Date(event.timestamp);
      if (!Number.isFinite(at.getTime())) continue;
      result.push({
        accountExternalId: entry.id,
        participant,
        mid: m.mid,
        body: m.text ?? "",
        at: at.toISOString(),
        echo,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
      });
    }
  return result;
}
