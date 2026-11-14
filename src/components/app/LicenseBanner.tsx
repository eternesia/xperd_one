import { AlertTriangle } from "lucide-react";

import { useApp } from "@/lib/app-context";

/**
 * Peringatan lisensi untuk instalasi mandiri (self-hosted). Tidak tampil di
 * instalasi pusat, atau saat lisensi masih berlaku lebih dari 14 hari.
 */
export function LicenseBanner() {
  const { instance } = useApp();
  if (!instance?.selfHosted) return null;
  const { status, daysLeft, expiresAt } = instance;
  if (status === "valid") return null;

  const tgl = expiresAt
    ? new Date(`${expiresAt}T00:00:00Z`).toLocaleDateString("id-ID", { dateStyle: "long" })
    : "";
  const pesan: Record<string, string> = {
    expiring: `Lisensi berakhir ${tgl}${daysLeft != null ? ` (${daysLeft} hari lagi)` : ""}. Hubungi penyedia untuk perpanjangan.`,
    grace: `Lisensi sudah berakhir ${tgl}. Masa tenggang aktif — segera perpanjang agar aplikasi tetap bisa dipakai.`,
    expired:
      "Lisensi tidak berlaku lagi. Data tetap aman, tetapi modul hanya bisa dibuka setelah lisensi diperpanjang.",
    missing:
      "Lisensi belum diterima dari server pusat. Pastikan server ini bisa mengakses internet.",
    invalid:
      "Lisensi tidak valid. Periksa pengaturan XPERD_LICENSE_PUBLIC_KEY dan XPERD_INSTANCE_TOKEN.",
  };
  const berat = status === "expired" || status === "invalid" || status === "missing";

  return (
    <div
      role="status"
      className={
        berat
          ? "flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          : "flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200"
      }
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{pesan[status] ?? pesan.invalid}</span>
    </div>
  );
}
