import { useEffect } from "react";

/**
 * Pencegah ringan: menonaktifkan klik kanan dan pintasan DevTools/view-source (F12, Ctrl/Cmd+Shift+I/J/C, Ctrl/Cmd+U).
 * Bukan pengaman sungguhan — kode yang berjalan di browser tetap bisa dibaca; keamanan nyata ada di server.
 * Klik kanan di kolom isian tetap diizinkan agar salin/tempel normal. Hanya aktif di build produksi.
 */
export function useDevtoolsDeterrent() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const editable = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      t.closest("input, textarea, select, [contenteditable='true']") !== null;
    const onMenu = (e: MouseEvent) => {
      if (!editable(e.target)) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (
        e.key === "F12" ||
        (mod && e.shiftKey && ["i", "j", "c"].includes(k)) ||
        (e.metaKey && e.altKey && ["i", "j", "c"].includes(k)) ||
        (mod && k === "u")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("contextmenu", onMenu);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("contextmenu", onMenu);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
}
