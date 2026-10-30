import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { publicWebsite } from "@/lib/visitor-rules";

/**
 * Mencatat kunjungan anonim ke website publik XPERD/Qalling (BS New 11). Hormati Do-Not-Track,
 * satu catatan per halaman per sesi tab, dan tidak pernah mengganggu halaman (semua galat ditelan).
 */
export function VisitorTracker() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const site = publicWebsite(path);
    if (!site || navigator.doNotTrack === "1") return;
    try {
      const session = sessionStorage.getItem("website-visit-session") ?? crypto.randomUUID();
      sessionStorage.setItem("website-visit-session", session);
      const key = `website-visit:${path}`;
      if (sessionStorage.getItem(key)) return;
      let referrer = "";
      try {
        referrer = document.referrer ? new URL(document.referrer).hostname : "";
      } catch {
        /* No referrer */
      }
      void fetch("/api/public/visit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          id: crypto.randomUUID(),
          site,
          path: path.slice(0, 200),
          session,
          referrer: referrer.slice(0, 200),
          device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
        }),
      })
        .then((r) => {
          if (r.ok) sessionStorage.setItem(key, "1");
        })
        .catch(() => undefined);
    } catch {
      /* Storage restrictions must never interrupt the website. */
    }
  }, [path]);
  return null;
}
