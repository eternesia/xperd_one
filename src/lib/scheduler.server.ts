/**
 * Scheduler internal: menjalankan auto-publish postingan terjadwal tanpa bergantung pada cron eksternal.
 * Aman dipakai bersama cron lama dan banyak replika: klaim baris di `publishDuePosts` bersifat atomik dan
 * email notifikasi memakai tabel dedupe. Matikan dengan SCHEDULER_DISABLED=1.
 */
const PUBLISH_EVERY_MS = 60_000;
const NOTIFY_EVERY_MS = 60 * 60_000;

type G = typeof globalThis & { __qallingScheduler?: { origin: string } };

export function ensureScheduler(requestUrl: string, headers?: Headers) {
  const g = globalThis as G;
  if (g.__qallingScheduler || process.env.SCHEDULER_DISABLED === "1") return;

  let origin = process.env.APP_PUBLIC_URL?.replace(/\/$/, "");
  if (!origin) {
    // Hanya terima host publik (bukan localhost/IP/host internal container), agar URL media bisa dibaca penyedia.
    const host = (headers?.get("x-forwarded-host") ?? new URL(requestUrl).host)
      .split(",")[0]
      .trim();
    const bare = host.replace(/:\d+$/, "");
    const isPublic = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(bare) && !/^\d+(\.\d+){3}$/.test(bare);
    if (!isPublic) return;
    const proto = headers?.get("x-forwarded-proto")?.split(",")[0].trim() || "https";
    origin = `${proto}://${host}`;
  }
  g.__qallingScheduler = { origin };

  let publishing = false;
  const publishTick = async () => {
    if (publishing) return;
    publishing = true;
    try {
      const { publishDuePosts } = await import("./meta-publish.server");
      const r = await publishDuePosts(origin, 25);
      if (r.processed) console.log("[scheduler] publish", r);
    } catch (e) {
      console.error("[scheduler] publish failed", e);
    } finally {
      publishing = false;
    }
  };
  const notifyTick = async () => {
    try {
      const { runBillingNotifications } = await import("./billing-notifications.server");
      await runBillingNotifications();
    } catch (e) {
      console.error("[scheduler] notifications failed", e);
    }
    try {
      // Backup otomatis: database harian (≥ 02.00 WIB), berkas mingguan. Aman diulang tiap jam.
      const { runScheduledBackups } = await import("./backup.server");
      const b = await runScheduledBackups();
      if (b.db || b.files) console.log("[scheduler] backup", b);
    } catch (e) {
      console.error("[scheduler] backup failed", e);
    }
    try {
      // Pengingat tugas XPro (in-app selalu; email bila gateway aktif). Aman diulang (dedupe).
      const { runXproTaskReminders } = await import("./xpro-reminders.server");
      const r = await runXproTaskReminders();
      if (r.inApp || r.emails) console.log("[scheduler] xpro reminders", r);
    } catch (e) {
      console.error("[scheduler] xpro reminders failed", e);
    }
  };

  let renewing = false;
  const renewTick = async () => {
    if (renewing) return;
    renewing = true;
    try {
      const { renewDueTenants } = await import("./billing-wallet.server");
      const r = await renewDueTenants(25);
      if (r.processed) console.log("[scheduler] renewal", r);
    } catch (e) {
      console.error("[scheduler] renewal failed", e);
    } finally {
      renewing = false;
    }
  };

  // Studio AI: periksa pekerjaan video di penyedia, simpan hasil, refund yang gagal. Ringan bila tidak ada pekerjaan.
  let aiChecking = false;
  const aiTick = async () => {
    if (aiChecking) return;
    aiChecking = true;
    try {
      const { processPendingJobs } = await import("./ai-studio.server");
      const r = await processPendingJobs(undefined, 25);
      if (r.checked) console.log("[scheduler] ai-studio", r);
    } catch (e) {
      console.error("[scheduler] ai-studio failed", e);
    } finally {
      aiChecking = false;
    }
  };
  setInterval(aiTick, PUBLISH_EVERY_MS).unref?.();

  setInterval(publishTick, PUBLISH_EVERY_MS).unref?.();
  setInterval(notifyTick, NOTIFY_EVERY_MS).unref?.();
  setInterval(renewTick, NOTIFY_EVERY_MS).unref?.();
  setTimeout(renewTick, 90_000).unref?.();
  setTimeout(publishTick, 5_000).unref?.();
  setTimeout(notifyTick, 60_000).unref?.();
}
