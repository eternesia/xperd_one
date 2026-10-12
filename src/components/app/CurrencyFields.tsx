import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchCurrencies, getExchangeRate, type CurrencyRow } from "@/lib/currency";

/**
 * Ronde 29 (BS New 8): pasangan mata uang dokumen + kurs.
 *
 * Kurs diambil ulang dari Master Kurs setiap kali mata uang atau tanggal
 * dokumen berubah; pengguna boleh menimpanya manual (kurs transaksi hari itu
 * sering berbeda dengan kurs master terakhir).
 */
export function CurrencyFields({
  workspaceId,
  currency,
  rate,
  date,
  lang,
  onChange,
}: {
  workspaceId: string;
  currency: string;
  rate: number;
  date: string;
  lang: string;
  onChange: (next: { currency: string; exchange_rate: number }) => void;
}) {
  const [rows, setRows] = useState<CurrencyRow[]>([]);
  const [missing, setMissing] = useState(false);
  const t = (en: string, id: string) => (lang === "id" ? id : en);

  useEffect(() => {
    fetchCurrencies(workspaceId)
      .then(setRows)
      .catch(() => setRows([]));
  }, [workspaceId]);

  const base = rows.find((r) => Number(r.is_base) === 1)?.code ?? "IDR";
  const isBase = !currency || currency === base;

  useEffect(() => {
    if (!rows.length) return;
    let alive = true;
    if (!currency) {
      onChange({ currency: base, exchange_rate: 1 });
      return;
    }
    if (currency === base) {
      setMissing(false);
      if (rate !== 1) onChange({ currency, exchange_rate: 1 });
      return;
    }
    getExchangeRate(workspaceId, currency, date || undefined).then((r) => {
      if (!alive) return;
      setMissing(!(r > 0));
      if (r > 0) onChange({ currency, exchange_rate: r });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, date, rows.length]);

  return (
    <>
      <div className="space-y-1.5">
        <Label>{t("Currency", "Mata uang")}</Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={currency || base}
          data-testid="doc-currency"
          onChange={(e) =>
            onChange({ currency: e.target.value, exchange_rate: e.target.value === base ? 1 : rate })
          }
        >
          {(rows.length ? rows : [{ code: base, name: base } as CurrencyRow]).map((r) => (
            <option key={r.code} value={r.code}>
              {r.code} — {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>
          {t("Exchange rate", "Kurs")}{" "}
          {!isBase && (
            <span className="text-muted-foreground">
              ({base} / 1 {currency})
            </span>
          )}
        </Label>
        <Input
          type="number"
          step="0.0001"
          min="0"
          disabled={isBase}
          value={isBase ? 1 : rate}
          data-testid="doc-exchange-rate"
          onChange={(e) => onChange({ currency, exchange_rate: Number(e.target.value) || 0 })}
        />
        {missing && !isBase && (
          <p className="text-xs text-destructive">
            {t(
              "No rate found in Master Exchange Rates — enter it manually.",
              "Kurs belum ada di Master Kurs — isi manual.",
            )}
          </p>
        )}
      </div>
    </>
  );
}
