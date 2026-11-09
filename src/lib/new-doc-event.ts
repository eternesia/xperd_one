import { useEffect, useRef } from "react";

/** Dikirim tombol "+" di navigasi bawah HP saat halaman dokumen sudah terbuka. */
export const NEW_DOC_EVENT = "xperd:new-doc";

/**
 * Buka form dokumen baru ketika (a) halaman dibuka dengan `?new=1` dari tombol "+" navigasi
 * bawah, atau (b) event NEW_DOC_EVENT dikirim saat halaman sudah terbuka.
 */
export function useNewDocTrigger(onNew: () => void) {
  const cb = useRef(onNew);
  cb.current = onNew;
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("new")) {
      url.searchParams.delete("new");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      cb.current();
    }
    const handler = () => cb.current();
    window.addEventListener(NEW_DOC_EVENT, handler);
    return () => window.removeEventListener(NEW_DOC_EVENT, handler);
  }, []);
}
