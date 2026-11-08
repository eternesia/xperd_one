/** Pengiriman WhatsApp per workspace: provider "kirimdev" (WhatsApp Cloud API resmi) dan gateway HTTP kustom. */
import { execute, executeOne } from "@/integrations/mysql/pool";
import { normalizeWaNumber } from "@/lib/crm";

export const KIRIMDEV_BASE = "https://api.kirimdev.com/v1";

export type WaSettings = {
  provider: string;
  endpoint_url: string | null;
  api_token: string | null;
  sender_number: string | null;
  is_active: number;
  phone_number_id: string | null;
  invoice_template: string | null;
  template_lang: string;
  managed: number;
  kirimdev_customer_id: string | null;
  number_display: string | null;
};

/** API key induk Kirimdev yang diatur Super Admin (null bila belum terverifikasi). */
export async function platformKirimdevKey() {
  const r = await executeOne<{ api_key: string | null; status: string }>(
    "SELECT api_key, status FROM kirimdev_settings WHERE id = 'platform'",
  );
  return r?.api_key && r.status === "verified" ? r.api_key : null;
}

export async function loadWaSettings(ws: string) {
  const row = await executeOne<WaSettings>(
    `SELECT provider, endpoint_url, api_token, sender_number, is_active, phone_number_id, invoice_template, template_lang,
            managed, kirimdev_customer_id, number_display
       FROM crm_wa_settings WHERE workspace_id = ? LIMIT 1`,
    [ws],
  );
  if (!row) return row;
  // Mode dikelola: selalu pakai kunci induk dan alamat resmi; nilai dari pengguna diabaikan.
  if (row.provider === "kirimdev" && row.managed) {
    return { ...row, api_token: await platformKirimdevKey(), endpoint_url: null } as WaSettings;
  }
  return row;
}

export const kirimdevBase = (s: Pick<WaSettings, "endpoint_url">) =>
  (s.endpoint_url?.trim() || KIRIMDEV_BASE).replace(/\/+$/, "");
const intl = (raw: string) => {
  const n = normalizeWaNumber(raw);
  return n ? `+${n}` : "";
};

export async function kirimdev(
  s: Pick<WaSettings, "api_token" | "endpoint_url">,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
) {
  if (!s.api_token) throw new Error("API key Kirimdev belum diisi.");
  const res = await fetch(`${kirimdevBase(s)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${s.api_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* bukan JSON */
  }
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string | number } } | null)?.error;
    throw new Error(`Kirimdev ${res.status}: ${err?.message ?? text.slice(0, 200)}`);
  }
  return json as { data?: Record<string, unknown> };
}

/** Uji kunci API dan nomor tanpa mengirim pesan apa pun. */
export async function testKirimdev(s: WaSettings) {
  const r = await kirimdev(s, "GET", "/accounts");
  const list = ((r as { data?: unknown }).data ?? []) as Array<{
    phone_number_id?: string;
    display_phone_number?: string;
    name?: string;
  }>;
  const arr = Array.isArray(list) ? list : [];
  if (
    s.phone_number_id &&
    arr.length &&
    !arr.some((a) => String(a.phone_number_id) === s.phone_number_id)
  )
    throw new Error(
      `Kunci API valid, tetapi Phone Number ID ${s.phone_number_id} tidak ada di akun. Pilihan: ${arr.map((a) => a.phone_number_id).join(", ")}`,
    );
  return `${arr.length} nomor WhatsApp terhubung`;
}

/** Kirim teks bebas. Pada Kirimdev hanya berhasil dalam jendela 24 jam setelah pelanggan menulis. */
export async function sendWaText(s: WaSettings, to: string, text: string) {
  if (s.provider === "kirimdev") {
    if (!s.phone_number_id) throw new Error("Phone Number ID belum diisi.");
    const r = await kirimdev(s, "POST", `/${encodeURIComponent(s.phone_number_id)}/messages`, {
      messaging_product: "whatsapp",
      to: intl(to),
      type: "text",
      text: { body: text },
    });
    return String(r.data?.id ?? "");
  }
  if (!s.endpoint_url) throw new Error("URL endpoint gateway belum diisi.");
  const res = await fetch(s.endpoint_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(s.api_token ? { Authorization: `Bearer ${s.api_token}` } : {}),
    },
    body: JSON.stringify({
      sender: s.sender_number ?? undefined,
      to: normalizeWaNumber(to),
      message: text,
    }),
  });
  if (!res.ok) throw new Error(`Gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return "";
}

/** Kirim pesan template (boleh di luar jendela 24 jam). Parameter body posisional {{1}}, {{2}}, ... */
export async function sendWaTemplate(
  s: WaSettings,
  to: string,
  name: string,
  lang: string,
  params: string[],
) {
  if (s.provider !== "kirimdev") throw new Error("Pesan template memerlukan provider Kirimdev.");
  if (!s.phone_number_id) throw new Error("Phone Number ID belum diisi.");
  const clean = params.map(
    (p) =>
      p
        .replace(/[\r\n\t]+/g, " ")
        .replace(/ {5,}/g, "    ")
        .trim() || "-",
  );
  const r = await kirimdev(s, "POST", `/${encodeURIComponent(s.phone_number_id)}/messages`, {
    messaging_product: "whatsapp",
    to: intl(to),
    type: "template",
    template: {
      name,
      language: lang || "id",
      components: [{ type: "body", parameters: clean.map((text) => ({ type: "text", text })) }],
    },
  });
  return String(r.data?.id ?? "");
}

export async function recordWaStatus(ws: string, status: string) {
  await execute(
    "UPDATE crm_wa_settings SET last_checked_at = NOW(), last_status = ? WHERE workspace_id = ?",
    [status.slice(0, 500), ws],
  );
}
