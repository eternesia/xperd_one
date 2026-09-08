import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Option {
  code: string;
  name: string;
  hint?: string | null;
}

function LookupPicker({
  options,
  isLoading,
  value,
  onPick,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  term,
  setTerm,
  open,
  setOpen,
  className,
}: {
  options: Option[];
  isLoading: boolean;
  value?: string;
  onPick: (o: Option) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  term: string;
  setTerm: (v: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  className?: string;
}) {
  const { lang } = useI18n();
  const selected = options.find((o) => o.code === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn("h-9 w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected ? `${selected.code} · ${selected.name}` : value || placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CommandInput
              value={term}
              onValueChange={setTerm}
              placeholder={searchPlaceholder}
              className="border-0"
            />
          </div>
          <CommandList>
            {isLoading ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {lang === "id" ? "Memuat…" : "Loading…"}
              </div>
            ) : (
              <CommandEmpty>{emptyLabel}</CommandEmpty>
            )}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.code}
                  value={o.code}
                  onSelect={() => {
                    onPick(o);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", value === o.code ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.code}
                      {o.hint ? ` · ${o.hint}` : ""}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Supplier or customer picker fed from master data. */
export function PartyPicker({
  workspaceId,
  kind,
  value,
  onPick,
  className,
}: {
  workspaceId: string;
  kind: "supplier" | "customer";
  value?: string;
  onPick: (party: { code: string; name: string }) => void;
  className?: string;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const table = kind === "supplier" ? "md_suppliers" : "md_customers";

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["party-picker", table, workspaceId, term],
    enabled: open,
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: {
          table,
          workspaceId,
          search: term.trim() || undefined,
          orderBy: "name",
          orderDir: "asc",
          limit: 30,
          filters: { is_active: 1 },
        },
      });
      return (data?.rows ?? []).map((r) => {
        const row = r as { code: string; name: string; city: string | null; phone: string | null };
        return { code: row.code, name: row.name, hint: row.city || row.phone } satisfies Option;
      });
    },
  });

  return (
    <LookupPicker
      options={options}
      isLoading={isLoading}
      value={value}
      onPick={(o) => onPick({ code: o.code, name: o.name })}
      placeholder={
        kind === "supplier" ? t("Select supplier…", "Pilih pemasok…") : t("Select customer…", "Pilih pelanggan…")
      }
      searchPlaceholder={t("Search code or name…", "Cari kode atau nama…")}
      emptyLabel={t("Nothing found in master data.", "Tidak ditemukan di master data.")}
      term={term}
      setTerm={setTerm}
      open={open}
      setOpen={setOpen}
      className={className}
    />
  );
}

/** Warehouse picker fed from master data. */
export function WarehousePicker({
  workspaceId,
  value,
  onPick,
  className,
}: {
  workspaceId: string;
  value?: string;
  onPick: (wh: { code: string; name: string }) => void;
  className?: string;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["warehouse-picker", workspaceId, term],
    enabled: open,
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: {
          table: "md_warehouses",
          workspaceId,
          search: term.trim() || undefined,
          filters: { is_active: 1 },
          orderBy: "code",
          orderDir: "asc",
          limit: 30,
        },
      });
      return (data?.rows ?? []).map((r) => {
        const row = r as { code: string; name: string; city: string | null };
        return { code: row.code, name: row.name, hint: row.city } satisfies Option;
      });
    },
  });

  return (
    <LookupPicker
      options={options}
      isLoading={isLoading}
      value={value}
      onPick={(o) => onPick({ code: o.code, name: o.name })}
      placeholder={t("Select warehouse…", "Pilih gudang…")}
      searchPlaceholder={t("Search warehouse…", "Cari gudang…")}
      emptyLabel={t("No warehouse in master data.", "Belum ada gudang di master data.")}
      term={term}
      setTerm={setTerm}
      open={open}
      setOpen={setOpen}
      className={className}
    />
  );
}

export interface PickedCashAccount {
  code: string;
  name: string;
  gl_account_code: string | null;
  account_kind: "cash" | "bank";
  bank_name: string | null;
  account_number: string | null;
}

/** Cash / bank account picker fed from the Cash & Bank register. */
export function CashBankPicker({
  workspaceId,
  value,
  onPick,
  className,
}: {
  workspaceId: string;
  value?: string;
  onPick: (account: PickedCashAccount) => void;
  className?: string;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["cashbank-picker", workspaceId, term],
    enabled: open,
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: {
          table: "cb_accounts",
          workspaceId,
          search: term.trim() || undefined,
          filters: { is_active: 1 },
          orderBy: "code",
          orderDir: "asc",
          limit: 30,
        },
      });
      return (data?.rows ?? []) as unknown as PickedCashAccount[];
    },
  });

  const options: Option[] = accounts.map((a) => ({
    code: a.code,
    name: a.name,
    hint: [a.bank_name, a.account_number].filter(Boolean).join(" · ") || a.account_kind,
  }));

  return (
    <LookupPicker
      options={options}
      isLoading={isLoading}
      value={value}
      onPick={(o) => {
        const acc = accounts.find((a) => a.code === o.code);
        if (acc) onPick(acc);
      }}
      placeholder={t("Select cash / bank account…", "Pilih rekening kas / bank…")}
      searchPlaceholder={t("Search account or bank…", "Cari rekening atau bank…")}
      emptyLabel={t("No cash or bank account yet.", "Belum ada akun kas atau bank.")}
      term={term}
      setTerm={setTerm}
      open={open}
      setOpen={setOpen}
      className={className}
    />
  );
}