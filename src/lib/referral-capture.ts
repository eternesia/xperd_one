/**
 * Kode referral dari link `?ref=KODE` di halaman publik Qalling mana pun (beranda, harga, dokumentasi, dst.).
 * Disimpan di perangkat selama 30 hari dan dipakai saat pendaftaran/masuk pertama, sehingga calon pengguna
 * boleh membaca-baca dulu sebelum mendaftar tanpa kehilangan kode referral temannya.
 */
const KEY = "qalling_ref";
const TTL_MS = 30 * 86_400_000;

type Stored = { code: string; at: number };

export function captureReferral(
  search = typeof window !== "undefined" ? window.location.search : "",
) {
  try {
    const raw = new URLSearchParams(search).get("ref")?.trim();
    if (!raw || !/^[\w-]{3,20}$/.test(raw)) return;
    localStorage.setItem(KEY, JSON.stringify({ code: raw, at: Date.now() } satisfies Stored));
  } catch {
    /* penyimpanan tidak tersedia: abaikan */
  }
}

export function getStoredReferral(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    // Format lama: kode saja tanpa waktu.
    if (!raw.startsWith("{")) return raw.slice(0, 20);
    const v = JSON.parse(raw) as Stored;
    if (!v?.code || Date.now() - Number(v.at) > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return String(v.code).slice(0, 20);
  } catch {
    return null;
  }
}

export function clearStoredReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* abaikan */
  }
}
