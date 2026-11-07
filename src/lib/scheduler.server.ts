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
  };

  setInterval(publishTick, PUBLISH_EVERY_MS).unref?.();
  setInterval(notifyTick, NOTIFY_EVERY_MS).unref?.();
  setTimeout(publishTick, 5_000).unref?.();
  setTimeout(notifyTick, 60_000).unref?.();
}
