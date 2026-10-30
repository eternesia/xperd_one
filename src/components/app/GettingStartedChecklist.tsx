import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Rocket, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useApp } from "@/lib/app-context";
import { countWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Step = {
  key: string;
  done: boolean;
  en: string;
  id: string;
  hintEn: string;
  hintId: string;
  link: { kind: "settings" } | { kind: "sub"; moduleId: string; submoduleId: string };
};

async function countRows(
  table: "cb_accounts" | "md_items" | "md_customers" | "sls_documents",
  workspaceId: string,
) {
  const r = await countWorkspaceRows({ data: { table, workspaceId } });
  return r.count;
}

export function GettingStartedChecklist({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const { activeWorkspace } = useApp();
  const isId = lang === "id";
  const storageKey = `xperd-setup-hidden-${workspaceId}`;
  const [hidden, setHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setHidden(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  const { data } = useQuery({
    queryKey: [
      "setup-checklist",
      workspaceId,
      activeWorkspace?.logo_url,
      activeWorkspace?.address,
      activeWorkspace?.phone,
      activeWorkspace?.email,
    ],
    queryFn: async () => {
      const ws = activeWorkspace;
      const [bank, items, customers, sales] = await Promise.all([
        countRows("cb_accounts", workspaceId),
        countRows("md_items", workspaceId),
        countRows("md_customers", workspaceId),
        countRows("sls_documents", workspaceId),
      ]);
      return {
        profile: Boolean(ws?.logo_url && ws?.address && (ws?.phone || ws?.email)),
        bank: bank > 0,
        items: items > 0,
        customers: customers > 0,
        sales: sales > 0,
      };
    },
  });

  if (!data || hidden) return null;

  const steps: Step[] = [
    {
      key: "profile",
      done: data.profile,
      en: "Company profile & logo",
      id: "Profil & logo perusahaan",
      hintEn: "Logo, address and contact appear on every printed document.",
      hintId: "Logo, alamat, dan kontak tampil di setiap dokumen cetak.",
      link: { kind: "settings" },
    },
    {
      key: "bank",
      done: data.bank,
      en: "Main cash & bank account",
      id: "Rekening kas & bank utama",
      hintEn: "Where customer payments are received.",
      hintId: "Tempat menerima pembayaran pelanggan.",
      link: { kind: "sub", moduleId: "cash-bank", submoduleId: "accounts" },
    },
    {
      key: "items",
      done: data.items,
      en: "First product or service",
      id: "Produk/jasa pertama",
      hintEn: "Add one item or import from Excel.",
      hintId: "Tambah satu item atau impor dari Excel.",
      link: { kind: "sub", moduleId: "master-data", submoduleId: "items" },
    },
    {
      key: "customers",
      done: data.customers,
      en: "First customer",
      id: "Pelanggan pertama",
      hintEn: "Name and WhatsApp contact are enough.",
      hintId: "Cukup nama dan kontak WhatsApp.",
      link: { kind: "sub", moduleId: "master-data", submoduleId: "customers" },
    },
    {
      key: "sales",
      done: data.sales,
      en: "First sales transaction",
      id: "Transaksi penjualan pertama",
      hintEn: "Create a quotation and preview its PDF.",
      hintId: "Buat penawaran lalu lihat hasil PDF-nya.",
      link: { kind: "sub", moduleId: "sales", submoduleId: "quotations" },
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const complete = doneCount === steps.length;

  const dismiss = () => {
    localStorage.setItem(storageKey, "1");
    setHidden(true);
  };

  return (
    <div className="rounded-2xl border border-gold/40 bg-card/95 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
          <Rocket className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy dark:text-foreground">
            {complete
              ? isId
                ? "Setup selesai! Bisnis Anda siap berjalan."
                : "Setup complete! Your business is ready."
              : isId
                ? "Mulai dengan XPERD One"
                : "Get started with XPERD One"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isId
              ? `${doneCount} dari ${steps.length} langkah selesai`
              : `${doneCount} of ${steps.length} steps done`}{" "}
            · {pct}%
          </p>
          <Progress value={pct} className="mt-2 h-2" />
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Toggle"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={dismiss}
            aria-label={isId ? "Sembunyikan" : "Hide"}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!collapsed && (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s, i) => {
            const body = (
              <>
                <span className="flex items-center gap-2 text-xs font-semibold text-navy dark:text-foreground">
                  {s.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  {i + 1}. {isId ? s.id : s.en}
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {isId ? s.hintId : s.hintEn}
                </span>
              </>
            );
            const cls = cn(
              "block rounded-xl border p-3 transition-colors",
              s.done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border hover:border-gold",
            );
            return (
              <li key={s.key}>
                {s.link.kind === "settings" ? (
                  <Link to="/app/w/$workspaceId/settings" params={{ workspaceId }} className={cls}>
                    {body}
                  </Link>
                ) : (
                  <Link
                    to="/app/w/$workspaceId/$moduleId/$submoduleId"
                    params={{
                      workspaceId,
                      moduleId: s.link.moduleId,
                      submoduleId: s.link.submoduleId,
                    }}
                    className={cls}
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
