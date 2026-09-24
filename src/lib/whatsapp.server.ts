/**
 * ============================================================================
 * BOILERPLATE PENGIRIM WHATSAPP (#22) — OPSIONAL, TIDAK WAJIB.
 * ============================================================================
 * Adapter tipis tanpa dependensi npm. Selama env belum diisi, semua pengiriman
 * menjadi **no-op** (`{ sent: false, skipped: true }`) dan hanya dicatat di log,
 * sehingga aplikasi tetap berjalan tanpa layanan pihak ketiga.
 *
 * Cara mengaktifkan (pilih salah satu provider, sesuaikan `buildRequestBody`
 * dengan dokumentasi provider Anda — Meta Cloud API, Fonnte, Qontak, dsb):
 *
 *   WA_API_URL=https://api.provider-anda.example/send
 *   WA_API_TOKEN=<token>
 *   WA_SENDER=<nomor pengirim, mis. 6281xxxx>
 *   WA_ENABLED=true
 *
 * CATATAN:
 *   - Jangan commit token. Simpan sebagai secret di server.
 *   - Provider yang berbeda punya bentuk body berbeda; boilerplate ini memakai
 *     bentuk generik `{ to, message, sender }`. Sesuaikan bila perlu.
 *   - Tidak ada retry otomatis. Bila butuh, tambahkan retry/queue di sini.
 * ============================================================================
 */

export interface WhatsAppSendResult {
  sent: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
}

function readEnv(name: string) {
  const value = (process.env[name] ?? "").trim();
  return value || null;
}

function envFlag(name: string) {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function whatsappConfigured() {
  return envFlag("WA_ENABLED") && Boolean(readEnv("WA_API_URL")) && Boolean(readEnv("WA_API_TOKEN"));
}

/** Normalisasi nomor ke format internasional tanpa `+` (contoh: 0812… -> 6281…). */
export function normalizePhone(raw: string) {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  return digits;
}

function buildRequestBody(to: string, message: string) {
  // TODO(opsional): sesuaikan dengan provider pilihan Anda.
  return { to, message, sender: readEnv("WA_SENDER") ?? undefined };
}

export async function sendWhatsAppMessage(to: string, message: string): Promise<WhatsAppSendResult> {
  const phone = normalizePhone(to);
  if (!phone) return { sent: false, skipped: true, error: "invalid_phone" };

  if (!whatsappConfigured()) {
    // Sengaja hanya log: fitur ini opsional dan tidak boleh menggagalkan proses.
    console.info(`[whatsapp] disabled — pesan untuk ${phone} tidak dikirim (boilerplate #22).`);
    return { sent: false, skipped: true };
  }

  const url = readEnv("WA_API_URL");
  const token = readEnv("WA_API_TOKEN");
  if (!url || !token) return { sent: false, skipped: true };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(buildRequestBody(phone, message)),
    });
    if (!res.ok) {
      return { sent: false, status: res.status, error: await res.text().catch(() => res.statusText) };
    }
    return { sent: true, status: res.status };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "unknown_error" };
  }
}
