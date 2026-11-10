/** Chat WhatsApp (Kirimdev): percakapan & pesan dibaca langsung dari Kirimdev, balasan teks dikirim lewat Kirimdev. */
import { kirimdev, loadWaSettings, type WaSettings } from "./wa-send.server";

const CNV = /^cnv_[0-9A-HJKMNP-TV-Z]{26}$/;

async function ready(ws: string): Promise<WaSettings & { phone_number_id: string }> {
  const s = await loadWaSettings(ws);
  if (!s || s.provider !== "kirimdev" || !s.phone_number_id)
    throw new Error("Hubungkan nomor WhatsApp terlebih dahulu.");
  return s as WaSettings & { phone_number_id: string };
}

type Raw = Record<string, unknown>;
const list = (r: unknown) => ((r as { data?: unknown }).data ?? []) as Raw[];
const str = (v: unknown) => (typeof v === "string" ? v : null);

export type WaConversation = {
  id: string;
  status: string;
  name: string | null;
  phone: string | null;
  unread: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
};

export async function listWaConversations(ws: string, status?: string) {
  const s = await ready(ws);
  const q = new URLSearchParams({ limit: "100" });
  if (status && ["open", "resolved", "pending"].includes(status)) q.set("status", status);
  const r = await kirimdev(
    s,
    "GET",
    `/${encodeURIComponent(s.phone_number_id)}/conversations?${q}`,
  );
  return list(r)
    .map((c): WaConversation => {
      const contact = (c.contact ?? {}) as Raw;
      return {
        id: String(c.id),
        status: String(c.status ?? "open"),
        name: str(contact.name),
        phone: str(contact.phone_number),
        unread: Number(c.unread_count ?? 0),
        lastMessageAt: str(c.last_message_at),
        lastInboundAt: str(c.last_inbound_at),
      };
    })
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

export type WaMessage = {
  id: string;
  direction: "inbound" | "outbound";
  type: string;
  text: string | null;
  mediaUrl: string | null;
  status: string;
  error: string | null;
  createdAt: string;
};

export async function listWaMessages(ws: string, conversationId: string) {
  if (!CNV.test(conversationId)) throw new Error("Percakapan tidak valid.");
  const s = await ready(ws);
  const q = new URLSearchParams({ conversation_id: conversationId, limit: "100" });
  const r = await kirimdev(s, "GET", `/${encodeURIComponent(s.phone_number_id)}/messages?${q}`);
  return list(r)
    .map((m): WaMessage => {
      const err = m.error as { code?: string; message?: string } | undefined;
      return {
        id: String(m.id),
        direction: m.direction === "outbound" ? "outbound" : "inbound",
        type: String(m.type ?? "text"),
        text: str(m.content),
        mediaUrl: str(m.media_url),
        status: String(m.status ?? ""),
        error: err
          ? err.code === "outside_24h_window"
            ? "outside_24h_window"
            : (err.message ?? err.code ?? "error")
          : null,
        createdAt: String(m.created_at ?? ""),
      };
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function sendWaChat(ws: string, to: string, text: string) {
  const s = await ready(ws);
  const phone = to.replace(/[^\d+]/g, "");
  if (!/^\+?\d{8,16}$/.test(phone)) throw new Error("Nomor tujuan tidak valid.");
  try {
    await kirimdev(s, "POST", `/${encodeURIComponent(s.phone_number_id)}/messages`, {
      messaging_product: "whatsapp",
      to: phone.startsWith("+") ? phone : `+${phone}`,
      type: "text",
      text: { body: text },
    });
  } catch (e) {
    const m = (e as Error).message;
    if (/131047|24.?h|re-engagement/i.test(m))
      throw new Error(
        "Lewat 24 jam sejak pesan terakhir pelanggan. WhatsApp hanya mengizinkan pesan bebas setelah pelanggan membalas lagi.",
      );
    throw e;
  }
  return { ok: true };
}
