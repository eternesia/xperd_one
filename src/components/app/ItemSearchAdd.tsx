import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SearchOption {
  id: string;
  code: string;
  name?: string | null;
  hint?: string | null;
}

/**
 * Cari lalu Enter: ketik kode/nama, panah atas-bawah memilih, Enter memasukkan baris ke tabel detail,
 * kolom cari dikosongkan dan fokus tetap di sana untuk item berikutnya. Menggantikan tombol "Tambah baris".
 * Bila `onFreeText` diberikan, Enter pada teks tanpa kecocokan menambah entri bebas.
 */
export function ItemSearchAdd({
  options,
  onAdd,
  onFreeText,
  placeholder = "Cari kode / nama lalu tekan Enter…",
  disabled,
  exclude,
  className,
}: {
  options: SearchOption[];
  onAdd: (o: SearchOption) => void;
  onFreeText?: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  exclude?: Set<string>;
  className?: string;
}) {
  const [term, setTerm] = useState("");
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return [];
    const rank = (o: SearchOption) => {
      const c = o.code.toLowerCase();
      if (c === t) return 0;
      if (c.startsWith(t)) return 1;
      if (c.includes(t)) return 2;
      return (o.name ?? "").toLowerCase().includes(t) ? 3 : 9;
    };
    return options
      .filter((o) => !exclude?.has(o.id))
      .map((o) => [rank(o), o] as const)
      .filter(([r]) => r < 9)
      .sort((a, b) => a[0] - b[0] || a[1].code.localeCompare(b[1].code))
      .slice(0, 8)
      .map(([, o]) => o);
  }, [term, options, exclude]);

  function pick(o: SearchOption) {
    onAdd(o);
    setTerm("");
    setCursor(0);
    ref.current?.focus();
  }

  return (
    <div className={cn("relative w-full md:w-5/12 md:min-w-[20rem]", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={ref}
        disabled={disabled}
        className="pl-9"
        placeholder={placeholder}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, Math.max(hits.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Escape") {
            setTerm("");
          } else if (e.key === "Enter") {
            e.preventDefault(); // jangan submit form induk
            const o = hits[cursor];
            if (o) pick(o);
            else if (onFreeText && term.trim()) {
              onFreeText(term.trim());
              setTerm("");
            }
          }
        }}
      />
      {open && term.trim() !== "" && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
          {hits.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {onFreeText ? "Tidak ada kecocokan — Enter untuk menambah sebagai teks bebas." : "Tidak ditemukan."}
            </li>
          )}
          {hits.map((o, i) => (
            <li
              key={o.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setCursor(i)}
              className={cn("flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-sm", i === cursor && "bg-accent")}
            >
              <span>
                <strong>{o.code}</strong>
                {o.name ? <span className="ml-2 text-muted-foreground">{o.name}</span> : null}
              </span>
              {o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
