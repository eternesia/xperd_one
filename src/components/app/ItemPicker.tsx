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
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface PickedItem {
  code: string;
  name: string;
  uom_code: string | null;
  cost_price: number;
  sell_price: number;
}

export function ItemPicker({
  workspaceId,
  value,
  onPick,
  className,
}: {
  workspaceId: string;
  value?: string;
  onPick: (item: PickedItem) => void;
  className?: string;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["item-picker", workspaceId, term],
    enabled: open,
    queryFn: async () => {
      let q = supabase
        .from("md_items")
        .select("code,name,uom_code,cost_price,sell_price")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("code")
        .limit(30);
      if (term.trim()) {
        const s = `%${term.trim()}%`;
        q = q.or(`code.ilike.${s},name.ilike.${s},barcode.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PickedItem[];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn("h-9 w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{value || t("Search item…", "Cari item…")}</span>
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
              placeholder={t("Search code, name or barcode…", "Cari kode, nama, atau barcode…")}
              className="border-0"
            />
          </div>
          <CommandList>
            {isLoading ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("Loading…", "Memuat…")}</div>
            ) : (
              <CommandEmpty>{t("No item found.", "Item tidak ditemukan.")}</CommandEmpty>
            )}
            <CommandGroup>
              {items.map((it) => (
                <CommandItem
                  key={it.code}
                  value={it.code}
                  onSelect={() => {
                    onPick(it);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", value === it.code ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {it.code} · {it.uom_code ?? "—"}
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
