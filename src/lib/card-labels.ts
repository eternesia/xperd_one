import * as React from "react";

/**
 * Beri setiap sel `data-label` dari judul kolomnya. Dipakai CSS `.q-cards` (styles.css) untuk
 * menampilkan baris tabel sebagai kartu berlabel di layar HP. Tidak mengubah tampilan desktop.
 */
function labelCells(table: HTMLTableElement) {
  const heads = Array.from(table.tHead?.rows[0]?.cells ?? []).flatMap((th) =>
    Array(th.colSpan || 1).fill((th.textContent ?? "").trim()),
  );
  for (const body of Array.from(table.tBodies))
    for (const row of Array.from(body.rows)) {
      let i = 0;
      for (const cell of Array.from(row.cells)) {
        const label = cell.colSpan > 1 ? "" : (heads[i] ?? "");
        if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
        i += cell.colSpan || 1;
      }
    }
}

/**
 * Untuk `<table>` mentah (di luar komponen Table): pasang `ref={useCardLabels()}` agar sel
 * tetap berlabel saat `.q-cards` menampilkannya sebagai kartu di HP. Aman untuk tabel yang
 * baru dirender belakangan (mis. form yang dibuka lewat tombol).
 */
export function useCardLabels() {
  const [el, setEl] = React.useState<HTMLTableElement | null>(null);
  React.useEffect(() => {
    if (!el || !el.closest(".q-cards")) return;
    labelCells(el);
    const mo = new MutationObserver(() => labelCells(el));
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [el]);
  return setEl;
}
