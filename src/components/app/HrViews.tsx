import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Pencil, Plus, Printer, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect, fmtIDR } from "@/components/app/admin-ui";
import { CashBankPicker } from "@/components/app/Pickers";
import { useApp } from "@/lib/app-context";
import { DEFAULT_WORKSPACE_LOGO } from "@/lib/brand";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow, upsertWorkspaceRows } from "@/lib/data.functions";
import { postJournalEntry, deleteJournalEntry } from "@/lib/ledger.functions";
import { useI18n } from "@/lib/i18n";
import {
  computePayslip,
  HR_ACCOUNTS,
  periodLabel,
  PTKP_INFO,
  PTKP_STATUSES,
  terBrackets,
  terCategory,
  terRate,
  type Employee,
  type PayComponent,
  type SlipLine,
  type TerCategory,
} from "@/lib/hr";

/**
 * Slipp HR — layar modul (Batch 2), diporting dari ekspor `Business Suite New 2`
 * (`src/components/app/HrViews.tsx`). Semua akses data memakai server fn MySQL
 * (`listWorkspaceRows` / `upsertWorkspaceRows` / `deleteWorkspaceRow`) alih-alih
 * Supabase, dan nilai TINYINT dari MySQL dinormalkan ke boolean.
 *
 * Tahap ini memuat: master PTKP/TER dan master departemen/jabatan.
 * Menyusul: employees, komponen gaji, payroll & slip, rekap BPJS/PPh 21.
 */

type OrgKind = "department" | "position";

function useT() {
  const { lang } = useI18n();
  return { lang, t: (en: string, id: string) => (lang === "id" ? id : en) };
}

const bool = (v: unknown) => v === 1 || v === true || v === "1";
const toNum = (v: unknown) => Number(v) || 0;

/* ------------------------------ shared hooks ------------------------------ */

function useEmployees(workspaceId: string) {
  return useQuery({
    queryKey: ["hr-employees", workspaceId],
    queryFn: async () => {
      const res = await listWorkspaceRows({ data: { table: "hr_employees", workspaceId, orderBy: "code", limit: 1000 } });
      return ((res?.rows ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        ...r,
        base_salary: toNum(r.base_salary),
        bpjs_kes: bool(r.bpjs_kes),
        bpjs_tk: bool(r.bpjs_tk),
        // Kolom JSON bisa kembali sebagai string (tergantung driver) — normalkan.
        components: typeof r.components === "string" ? JSON.parse(r.components || "[]") : (r.components ?? []),
      })) as unknown as Employee[];
    },
  });
}

function useComponents(workspaceId: string) {
  return useQuery({
    queryKey: ["hr-components", workspaceId],
    queryFn: async () => {
      const res = await listWorkspaceRows({ data: { table: "hr_pay_components", workspaceId, orderBy: "code", limit: 200 } });
      return ((res?.rows ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        ...r,
        default_amount: toNum(r.default_amount),
        is_fixed: bool(r.is_fixed),
        taxable: bool(r.taxable),
        is_active: bool(r.is_active),
      })) as unknown as PayComponent[];
    },
  });
}

interface OrgUnit {
  id: string;
  kind: OrgKind;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

function useOrgUnits(workspaceId: string, kind: OrgKind) {
  return useQuery({
    queryKey: ["hr-org", workspaceId, kind],
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: { table: "hr_org_units", workspaceId, filters: { kind }, orderBy: "code", limit: 200 },
      });
      return ((res?.rows ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        ...r,
        is_active: bool(r.is_active),
      })) as unknown as OrgUnit[];
    },
  });
}

/* --------------------------------- helpers -------------------------------- */

function Header({ eyebrow, title, desc, children }: { eyebrow: string; title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">{eyebrow}</p>
        <h1 className="text-2xl font-semibold text-navy dark:text-foreground">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function OrgSelect({ options, value, onChange, empty }: { options: OrgUnit[]; value: string; onChange: (v: string) => void; empty: string }) {
  const names = options.filter((o) => o.is_active).map((o) => o.name);
  if (value && !names.includes(value)) names.unshift(value);
  return (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{names.length ? "—" : empty}</option>
      {names.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

/* --------------------------------- dispatcher ------------------------------ */

export function HrView({ submoduleId, workspaceId }: { submoduleId: string; workspaceId: string }) {
  if (submoduleId === "ptkp") return <PtkpMasterView workspaceId={workspaceId} />;
  if (submoduleId === "departments") return <OrgMasterView key="d" workspaceId={workspaceId} kind="department" />;
  if (submoduleId === "positions") return <OrgMasterView key="p" workspaceId={workspaceId} kind="position" />;
  if (submoduleId === "employees") return <EmployeesView workspaceId={workspaceId} />;
  if (submoduleId === "components") return <ComponentsView workspaceId={workspaceId} />;
  if (submoduleId === "payroll") return <PayrollView workspaceId={workspaceId} />;
  if (submoduleId === "tax-bpjs") return <TaxBpjsView workspaceId={workspaceId} />;
  return null;
}

/** Penanda layar yang belum diporting pada Batch 2 (fase 4 berikutnya). */
function ComingSoon({ what }: { what: string; workspaceId: string }) {
  const { t } = useT();
  return (
    <div className="space-y-5">
      <Header eyebrow="SLIPP HR" title={what} />
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {t(
            "This screen is part of the Slipp HR port and is not available yet.",
            "Layar ini bagian dari porting Slipp HR dan belum tersedia.",
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------ PTKP & TER master -------------------------- */

function PtkpMasterView({ workspaceId }: { workspaceId: string }) {
  const { t, lang } = useT();
  const { data: emps = [] } = useEmployees(workspaceId);
  const [cat, setCat] = useState<TerCategory>("A");
  const [salary, setSalary] = useState("");
  const sal = Number(salary.replace(/\D/g, "")) || 0;
  const brackets = terBrackets(cat);
  return (
    <div className="space-y-5">
      <Header
        eyebrow="SLIPP HR"
        title={t("PTKP & TER Master", "Master PTKP & TER")}
        desc={t(
          "Reference for non-taxable income (PTKP) per marital/dependent status and the monthly PPh 21 TER rate by salary range (PP 58/2023). Used automatically when you pick PTKP on an employee.",
          "Referensi Penghasilan Tidak Kena Pajak (PTKP) per status kawin/tanggungan dan tarif PPh 21 TER bulanan per rentang gaji (PP 58/2023). Otomatis dipakai saat memilih PTKP di data karyawan.",
        )}
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Status", "Status")}</TableHead>
                <TableHead>{t("Description", "Keterangan")}</TableHead>
                <TableHead className="text-right">{t("PTKP / year", "PTKP / tahun")}</TableHead>
                <TableHead className="text-right">{t("PTKP / month", "PTKP / bulan")}</TableHead>
                <TableHead>{t("TER category", "Kategori TER")}</TableHead>
                <TableHead>{t("0% up to", "0% sampai gaji")}</TableHead>
                <TableHead className="text-right">{t("Employees", "Karyawan")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PTKP_STATUSES.map((p) => {
                const info = PTKP_INFO[p];
                const c = terCategory(p);
                return (
                  <TableRow key={p} className="cursor-pointer" onClick={() => setCat(c)}>
                    <TableCell className="font-semibold">{p}</TableCell>
                    <TableCell>{lang === "id" ? info.id : info.en}</TableCell>
                    <TableCell className="text-right">{fmtIDR(info.annual)}</TableCell>
                    <TableCell className="text-right">{fmtIDR(info.annual / 12)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">TER {c}</Badge>
                    </TableCell>
                    <TableCell>{fmtIDR(terBrackets(c)[0].to)}</TableCell>
                    <TableCell className="text-right">{emps.filter((e) => e.ptkp_status === p).length}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-1">
              {(["A", "B", "C"] as TerCategory[]).map((c) => (
                <Button key={c} size="sm" variant={cat === c ? "default" : "outline"} onClick={() => setCat(c)}>
                  TER {c}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {cat === "A" ? "TK/0, TK/1, K/0" : cat === "B" ? "TK/2, TK/3, K/1, K/2" : "K/3"}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Input
                className="w-48"
                placeholder={t("Test monthly gross", "Uji gaji bruto/bulan")}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />
              {sal > 0 && (
                <Badge>
                  {terRate(cat, sal)}% = {fmtIDR(Math.round((sal * terRate(cat, sal)) / 100))}
                </Badge>
              )}
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Monthly gross from", "Bruto bulanan dari")}</TableHead>
                  <TableHead>{t("to", "sampai")}</TableHead>
                  <TableHead className="text-right">{t("TER rate", "Tarif TER")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brackets.map((b) => {
                  const hit = sal > 0 && sal >= b.from && sal <= b.to;
                  return (
                    <TableRow key={b.from} className={hit ? "bg-gold/15 font-semibold" : ""}>
                      <TableCell>{fmtIDR(b.from)}</TableCell>
                      <TableCell>{b.to === Infinity ? t("and above", "ke atas") : fmtIDR(b.to)}</TableCell>
                      <TableCell className="text-right">{b.rate}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------- Master departemen/jabatan --------------------- */

function OrgMasterView({ workspaceId, kind }: { workspaceId: string; kind: OrgKind }) {
  const { t } = useT();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useOrgUnits(workspaceId, kind);
  const { data: emps = [] } = useEmployees(workspaceId);
  const [form, setForm] = useState<Partial<OrgUnit> | null>(null);
  const [q, setQ] = useState("");
  const isDept = kind === "department";
  const label = isDept ? t("Department", "Departemen") : t("Position", "Jabatan");
  const usage = (name: string) => emps.filter((e) => (isDept ? e.department : e.position) === name).length;

  const save = useMutation({
    mutationFn: async (f: Partial<OrgUnit>) => {
      if (!f.code?.trim() || !f.name?.trim()) throw new Error(t("Code and name are required", "Kode dan nama wajib diisi"));
      const name = f.name.trim();
      const old = f.id ? rows.find((r) => r.id === f.id) : null;
      await upsertWorkspaceRows({
        data: {
          table: "hr_org_units",
          workspaceId,
          rows: [
            {
              ...(f.id ? { id: f.id } : {}),
              kind,
              code: f.code.trim(),
              name,
              description: f.description?.trim() || null,
              is_active: f.is_active ?? true,
            },
          ],
        },
      });
      // Rename master harus menyapu data karyawan, kalau tidak jadi yatim.
      if (old && old.name !== name) {
        const affected = emps.filter((e) => (isDept ? e.department : e.position) === old.name);
        if (affected.length) {
          await upsertWorkspaceRows({
            data: {
              table: "hr_employees",
              workspaceId,
              rows: affected.map((e) => ({ id: e.id, [isDept ? "department" : "position"]: name })),
            },
          });
        }
      }
    },
    onSuccess: () => {
      toast.success(t("Saved", "Tersimpan"));
      setForm(null);
      qc.invalidateQueries({ queryKey: ["hr-org", workspaceId, kind] });
      qc.invalidateQueries({ queryKey: ["hr-employees", workspaceId] });
    },
    onError: (e: Error) =>
      toast.error(e.message.toLowerCase().includes("duplicate") ? t("Code already exists", "Kode sudah dipakai") : e.message),
  });

  const remove = useMutation({
    mutationFn: async (r: OrgUnit) => {
      if (usage(r.name) > 0) {
        throw new Error(t("Still used by employees — deactivate instead", "Masih dipakai karyawan — nonaktifkan saja"));
      }
      await deleteWorkspaceRow({ data: { table: "hr_org_units", workspaceId, id: r.id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-org", workspaceId, kind] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = rows.filter((r) => `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <Header
        eyebrow="SLIPP HR"
        title={isDept ? t("Master Departments", "Master Departemen") : t("Master Positions", "Master Jabatan")}
        desc={t(`${label} list used on the employee form.`, `Daftar ${label.toLowerCase()} yang dipakai di form karyawan.`)}
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="w-56 pl-8" placeholder={t("Search…", "Cari…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => setForm({ code: "", name: "", is_active: true })}>
          <Plus className="mr-1 h-4 w-4" />
          {t("Add", "Tambah")} {label}
        </Button>
      </Header>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t("Code", "Kode")}</TableHead>
                <TableHead>{t("Name", "Nama")}</TableHead>
                <TableHead>{t("Description", "Keterangan")}</TableHead>
                <TableHead className="text-right">{t("Employees", "Karyawan")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    {t("No data yet", "Belum ada data")}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-sm">{r.code}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.description || "—"}</TableCell>
                    <TableCell className="text-right">{usage(r.name)}</TableCell>
                    <TableCell>
                      <Badge variant={r.is_active ? "default" : "secondary"}>
                        {r.is_active ? t("Active", "Aktif") : t("Inactive", "Nonaktif")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" aria-label={t("Edit", "Ubah")} onClick={() => setForm(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t("Delete", "Hapus")}
                        onClick={() => confirm(t("Delete?", "Hapus?")) && remove.mutate(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form?.id ? t("Edit", "Ubah") : t("Add", "Tambah")} {label}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-3">
              <AdminField label={t("Code", "Kode")}>
                <Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </AdminField>
              <AdminField label={t("Name", "Nama")}>
                <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </AdminField>
              <AdminField label={t("Description", "Keterangan")}>
                <Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </AdminField>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active ?? true}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                {t("Active", "Aktif")}
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button disabled={save.isPending} onClick={() => form && save.mutate(form)}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------ Komponen gaji ----------------------------- */

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-0.5 ${bold ? "font-semibold text-navy dark:text-foreground" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{fmtIDR(value)}</span>
    </div>
  );
}

/** Default komponen gaji standar Indonesia (dipakai tombol "Muat komponen default"). */
const DEFAULT_COMPONENTS: { code: string; name: string; kind: PayComponent["kind"]; is_fixed: boolean; taxable: boolean }[] = [
  { code: "TJ-JAB", name: "Tunjangan Jabatan", kind: "allowance", is_fixed: true, taxable: true },
  { code: "TJ-TRN", name: "Tunjangan Transport", kind: "allowance", is_fixed: true, taxable: true },
  { code: "TJ-MKN", name: "Tunjangan Makan", kind: "allowance", is_fixed: false, taxable: true },
  { code: "LEMBUR", name: "Uang Lembur", kind: "allowance", is_fixed: false, taxable: true },
  { code: "POT-KAS", name: "Potongan Kasbon", kind: "deduction", is_fixed: false, taxable: false },
  { code: "POT-ABS", name: "Potongan Absensi", kind: "deduction", is_fixed: false, taxable: false },
];

function ComponentsView({ workspaceId }: { workspaceId: string }) {
  const { t } = useT();
  const qc = useQueryClient();
  const { data: rows = [] } = useComponents(workspaceId);
  const [form, setForm] = useState<Partial<PayComponent> | null>(null);
  const [seeding, setSeeding] = useState(false);

  const save = useMutation({
    mutationFn: async (f: Partial<PayComponent>) => {
      if (!f.code?.trim() || !f.name?.trim()) {
        throw new Error(t("Code and name are required.", "Kode dan nama wajib diisi."));
      }
      await upsertWorkspaceRows({
        data: {
          table: "hr_pay_components",
          workspaceId,
          rows: [
            {
              ...(f.id ? { id: f.id } : {}),
              code: f.code.trim(),
              name: f.name.trim(),
              kind: f.kind ?? "allowance",
              default_amount: Number(f.default_amount) || 0,
              is_fixed: Boolean(f.is_fixed),
              taxable: Boolean(f.taxable),
              is_active: f.is_active ?? true,
            },
          ],
        },
      });
    },
    onSuccess: () => {
      toast.success(t("Saved", "Tersimpan"));
      setForm(null);
      qc.invalidateQueries({ queryKey: ["hr-components", workspaceId] });
    },
    onError: (e: Error) =>
      toast.error(e.message.toLowerCase().includes("duplicate") ? t("Code already exists", "Kode sudah dipakai") : e.message),
  });

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      const existing = new Set(rows.map((r) => r.code));
      const missing = DEFAULT_COMPONENTS.filter((d) => !existing.has(d.code)).map((d) => ({
        ...d,
        default_amount: 0,
        is_active: true,
      }));
      if (!missing.length) {
        toast.info(t("All default components already exist.", "Semua komponen default sudah ada."));
        return;
      }
      await upsertWorkspaceRows({ data: { table: "hr_pay_components", workspaceId, rows: missing } });
      toast.success(t("Default components loaded", "Komponen default dimuat"));
      qc.invalidateQueries({ queryKey: ["hr-components", workspaceId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSeeding(false);
    }
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "hr_pay_components", workspaceId, id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-components", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Header
        eyebrow="SLIPP HR"
        title={t("Salary Components", "Komponen Gaji")}
        desc={t(
          "Fixed and variable allowances or deductions applied per employee.",
          "Tunjangan dan potongan tetap/tidak tetap yang diterapkan per karyawan.",
        )}
      >
        {rows.length === 0 && (
          <Button variant="outline" disabled={seeding} onClick={() => void seedDefaults()}>
            {seeding && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t("Load defaults", "Muat komponen default")}
          </Button>
        )}
        <Button
          variant="navy"
          onClick={() => setForm({ kind: "allowance", is_fixed: true, taxable: true, is_active: true, default_amount: 0 })}
        >
          <Plus /> {t("New component", "Komponen baru")}
        </Button>
      </Header>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Code", "Kode")}</TableHead>
                <TableHead>{t("Name", "Nama")}</TableHead>
                <TableHead>{t("Type", "Jenis")}</TableHead>
                <TableHead>{t("Nature", "Sifat")}</TableHead>
                <TableHead>{t("Taxable", "Kena pajak")}</TableHead>
                <TableHead className="text-right">{t("Default", "Default")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    {t("No components yet.", "Belum ada komponen.")}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="font-medium">
                    {r.name}
                    {!r.is_active && (
                      <Badge variant="outline" className="ml-2">
                        {t("Off", "Nonaktif")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{r.kind === "allowance" ? t("Allowance", "Tunjangan") : t("Deduction", "Potongan")}</TableCell>
                  <TableCell>{r.is_fixed ? t("Fixed", "Tetap") : t("Variable", "Tidak tetap")}</TableCell>
                  <TableCell>{r.taxable ? t("Yes", "Ya") : t("No", "Tidak")}</TableCell>
                  <TableCell className="text-right">{fmtIDR(Number(r.default_amount))}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" aria-label={t("Edit", "Ubah")} onClick={() => setForm({ ...r })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("Delete", "Hapus")}
                      onClick={() => confirm(t("Delete this component?", "Hapus komponen ini?")) && remove.mutate(r.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Salary component", "Komponen gaji")}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <AdminField label={t("Code", "Kode")}>
                <Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </AdminField>
              <AdminField label={t("Name", "Nama")}>
                <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </AdminField>
              <AdminField label={t("Type", "Jenis")}>
                <AdminSelect value={form.kind ?? "allowance"} onChange={(v) => setForm({ ...form, kind: v as PayComponent["kind"] })}>
                  <option value="allowance">{t("Allowance", "Tunjangan")}</option>
                  <option value="deduction">{t("Deduction", "Potongan")}</option>
                </AdminSelect>
              </AdminField>
              <AdminField label={t("Default amount", "Nominal default")}>
                <Input
                  type="number"
                  value={form.default_amount ?? 0}
                  onChange={(e) => setForm({ ...form, default_amount: Number(e.target.value) })}
                />
              </AdminField>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.is_fixed}
                  onChange={(e) => setForm({ ...form, is_fixed: e.target.checked })}
                />
                {t("Fixed (every month)", "Tetap (setiap bulan)")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.taxable}
                  onChange={(e) => setForm({ ...form, taxable: e.target.checked })}
                />
                {t("Taxable (PPh 21)", "Kena PPh 21")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                {t("Active", "Aktif")}
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button variant="navy" disabled={save.isPending} onClick={() => form && save.mutate(form)}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------ Data karyawan ---------------------------- */

const emptyEmp = (): Partial<Employee> => ({
  code: "",
  name: "",
  status: "active",
  ptkp_status: "TK/0",
  base_salary: 0,
  bpjs_kes: true,
  bpjs_tk: true,
  components: [],
});

/** Kolom teks dasar untuk template/impor Excel. */
const EMP_COLS = [
  "code", "name", "nik", "npwp", "email", "phone", "department", "position", "join_date",
  "status", "ptkp_status", "base_salary", "bank_name", "bank_account", "bpjs_kes", "bpjs_tk", "notes",
];

function EmployeesView({ workspaceId }: { workspaceId: string }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useEmployees(workspaceId);
  const { data: comps = [] } = useComponents(workspaceId);
  const { data: depts = [] } = useOrgUnits(workspaceId, "department");
  const { data: positions = [] } = useOrgUnits(workspaceId, "position");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Partial<Employee> | null>(null);

  const filtered = rows.filter((r) =>
    [r.code, r.name, r.department, r.position].join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  const save = useMutation({
    mutationFn: async (f: Partial<Employee>) => {
      if (!f.code?.trim() || !f.name?.trim()) {
        throw new Error(t("Code and name are required.", "Kode dan nama wajib diisi."));
      }
      const list = (f.components ?? []).filter((c) => toNum(c.amount) > 0);
      await upsertWorkspaceRows({
        data: {
          table: "hr_employees",
          workspaceId,
          rows: [
            {
              ...(f.id ? { id: f.id } : {}),
              code: f.code.trim(),
              name: f.name.trim(),
              nik: f.nik?.trim() || null,
              npwp: f.npwp?.trim() || null,
              email: f.email?.trim() || null,
              phone: f.phone?.trim() || null,
              department: f.department || null,
              position: f.position || null,
              join_date: f.join_date || null,
              status: f.status ?? "active",
              ptkp_status: f.ptkp_status ?? "TK/0",
              base_salary: toNum(f.base_salary),
              bank_name: f.bank_name?.trim() || null,
              bank_account: f.bank_account?.trim() || null,
              bpjs_kes: Boolean(f.bpjs_kes),
              bpjs_tk: Boolean(f.bpjs_tk),
              components: JSON.stringify(list),
              notes: f.notes?.trim() || null,
            },
          ],
        },
      });
    },
    onSuccess: () => {
      toast.success(t("Employee saved", "Karyawan disimpan"));
      setForm(null);
      qc.invalidateQueries({ queryKey: ["hr-employees", workspaceId] });
    },
    onError: (e: Error) =>
      toast.error(e.message.toLowerCase().includes("duplicate") ? t("Code already exists", "Kode sudah dipakai") : e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "hr_employees", workspaceId, id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-employees", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    const next = `EMP-${String(rows.length + 1).padStart(4, "0")}`;
    setForm({
      ...emptyEmp(),
      code: next,
      components: comps
        .filter((c) => c.is_fixed && c.is_active && Number(c.default_amount) > 0)
        .map((c) => ({ component_id: c.id, amount: Number(c.default_amount) })),
    });
  };

  const setCompAmount = (id: string, amount: number) => {
    if (!form) return;
    const list = [...(form.components ?? [])].filter((c) => c.component_id !== id);
    if (amount) list.push({ component_id: id, amount });
    setForm({ ...form, components: list });
  };

  const preview = form ? computePayslip({ ...(emptyEmp() as Employee), ...(form as Employee) }, comps) : null;
  const activeComps = comps.filter((c) => c.is_active);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const sample: Record<string, unknown> = {
      code: "EMP-0001",
      name: "Budi Santoso",
      nik: "3171xxxxxxxxxxxx",
      npwp: "",
      email: "budi@contoh.com",
      phone: "0812xxxx",
      department: depts[0]?.name ?? "",
      position: positions[0]?.name ?? "",
      join_date: "2026-01-15",
      status: "active",
      ptkp_status: "TK/0",
      base_salary: 5000000,
      bank_name: "BCA",
      bank_account: "1234567890",
      bpjs_kes: "TRUE",
      bpjs_tk: "TRUE",
      notes: "",
    };
    activeComps.forEach((c) => (sample[c.code] = Number(c.default_amount) || 0));
    const ws = XLSX.utils.json_to_sheet([sample], { header: [...EMP_COLS, ...activeComps.map((c) => c.code)] });
    const info = XLSX.utils.aoa_to_sheet([
      ["Kolom", "Keterangan"],
      ["code, name", "Wajib. Kode yang sudah ada akan diperbarui."],
      ["ptkp_status", PTKP_STATUSES.join(", ")],
      ["status", "active / inactive"],
      ["join_date", "YYYY-MM-DD"],
      ["bpjs_kes, bpjs_tk", "TRUE / FALSE"],
      ["department, position", "Harus sama dengan nama di Master Departemen / Jabatan"],
      ...activeComps.map((c) => [c.code, `Nominal komponen: ${c.name}`]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Karyawan");
    XLSX.utils.book_append_sheet(wb, info, "Petunjuk");
    XLSX.writeFile(wb, "template-karyawan.xlsx");
  }

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!raw.length) throw new Error(t("The file has no rows.", "Berkas tidak berisi baris data."));
      const deptNames = new Set(depts.map((d) => d.name));
      const posNames = new Set(positions.map((d) => d.name));
      const existing = new Map(rows.map((r) => [r.code, r.id]));
      const bool = (v: unknown) => (v === "" || v === undefined ? true : ["true", "1", "yes", "ya", "y"].includes(String(v).toLowerCase()));
      const str = (v: unknown) => (v === "" || v === undefined || v === null ? null : String(v).trim());
      const warnings: string[] = [];
      const payloads: Record<string, unknown>[] = [];
      raw.forEach((r, i) => {
        const lower: Record<string, unknown> = {};
        Object.entries(r).forEach(([k, v]) => (lower[String(k).trim().toLowerCase().replace(/\s+/g, "_")] = v));
        const code = str(lower.code);
        const name = str(lower.name);
        if (!code || !name) {
          warnings.push(`Baris ${i + 2}: code/name kosong`);
          return;
        }
        let jd: string | null = null;
        const j = lower.join_date;
        if (j instanceof Date) jd = new Date(j.getTime() - j.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        else if (str(j)) jd = str(j);
        const ptkp = str(lower.ptkp_status)?.toUpperCase() ?? "TK/0";
        const dept = str(lower.department);
        const pos = str(lower.position);
        if (dept && !deptNames.has(dept)) warnings.push(`Baris ${i + 2}: departemen "${dept}" belum ada di master`);
        if (pos && !posNames.has(pos)) warnings.push(`Baris ${i + 2}: jabatan "${pos}" belum ada di master`);
        const components = activeComps
          .map((c) => ({ component_id: c.id, amount: Number(lower[c.code.toLowerCase()]) || 0 }))
          .filter((c) => c.amount > 0);
        const id = existing.get(code);
        payloads.push({
          ...(id ? { id } : {}),
          code,
          name,
          nik: str(lower.nik),
          npwp: str(lower.npwp),
          email: str(lower.email),
          phone: str(lower.phone),
          department: dept,
          position: pos,
          join_date: jd,
          status: str(lower.status)?.toLowerCase() === "inactive" ? "inactive" : "active",
          ptkp_status: (PTKP_STATUSES as readonly string[]).includes(ptkp) ? ptkp : "TK/0",
          base_salary: Number(lower.base_salary) || 0,
          bank_name: str(lower.bank_name),
          bank_account: str(lower.bank_account),
          bpjs_kes: bool(lower.bpjs_kes),
          bpjs_tk: bool(lower.bpjs_tk),
          components: JSON.stringify(components),
          notes: str(lower.notes),
        });
      });
      if (!payloads.length) {
        throw new Error(t("No valid rows: code and name are required.", "Tidak ada baris valid: kolom code dan name wajib diisi."));
      }
      await upsertWorkspaceRows({ data: { table: "hr_employees", workspaceId, rows: payloads } });
      toast.success(t(`${payloads.length} row(s) saved`, `${payloads.length} baris tersimpan`));
      if (warnings.length) {
        toast.warning(warnings.slice(0, 5).join("\n") + (warnings.length > 5 ? `\n+${warnings.length - 5} lainnya` : ""));
      }
      qc.invalidateQueries({ queryKey: ["hr-employees", workspaceId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Import failed", "Impor gagal"));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <Header
        eyebrow="SLIPP HR"
        title={t("Employees", "Data Karyawan")}
        desc={t(
          "Profile, tax status, salary and bank account per employee.",
          "Profil, status pajak, gaji, dan rekening per karyawan.",
        )}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="w-56 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search…", "Cari…")} />
        </div>
        <Button variant="outline" onClick={() => void downloadTemplate()}>
          <Download /> Template
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImport(f);
          }}
        />
        <Button variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
          {importing ? <Loader2 className="animate-spin" /> : <Upload />} {t("Import Excel", "Impor Excel")}
        </Button>
        <Button variant="navy" onClick={openNew}>
          <Plus /> {t("New employee", "Karyawan baru")}
        </Button>
      </Header>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t("Code", "Kode")}</TableHead>
                <TableHead>{t("Name", "Nama")}</TableHead>
                <TableHead>{t("Department / Position", "Departemen / Jabatan")}</TableHead>
                <TableHead>PTKP</TableHead>
                <TableHead className="text-right">{t("Base salary", "Gaji pokok")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    {t("No employees yet.", "Belum ada karyawan.")}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[r.department, r.position].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>{r.ptkp_status}</TableCell>
                  <TableCell className="text-right">{fmtIDR(toNum(r.base_salary))}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "active" ? "secondary" : "outline"}>
                      {r.status === "active" ? t("Active", "Aktif") : t("Inactive", "Nonaktif")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" aria-label={t("Edit", "Ubah")} onClick={() => setForm({ ...r })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("Delete", "Hapus")}
                      onClick={() => confirm(t("Delete this employee?", "Hapus karyawan ini?")) && remove.mutate(r.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[94vh] w-[96vw] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? t("Edit employee", "Ubah karyawan") : t("New employee", "Karyawan baru")}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <AdminField label={t("Code", "Kode")}>
                    <Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                  </AdminField>
                  <AdminField label={t("Full name", "Nama lengkap")}>
                    <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </AdminField>
                  <AdminField label="Status">
                    <AdminSelect value={form.status ?? "active"} onChange={(v) => setForm({ ...form, status: v })}>
                      <option value="active">{t("Active", "Aktif")}</option>
                      <option value="inactive">{t("Inactive", "Nonaktif")}</option>
                    </AdminSelect>
                  </AdminField>
                  <AdminField label="NIK">
                    <Input value={form.nik ?? ""} onChange={(e) => setForm({ ...form, nik: e.target.value })} />
                  </AdminField>
                  <AdminField label="NPWP">
                    <Input value={form.npwp ?? ""} onChange={(e) => setForm({ ...form, npwp: e.target.value })} />
                  </AdminField>
                  <AdminField label={t("PTKP status", "Status PTKP")}>
                    <AdminSelect value={form.ptkp_status ?? "TK/0"} onChange={(v) => setForm({ ...form, ptkp_status: v })}>
                      {PTKP_STATUSES.map((p) => (
                        <option key={p} value={p}>
                          {p} — {PTKP_INFO[p][lang === "id" ? "id" : "en"]}
                        </option>
                      ))}
                    </AdminSelect>
                    {(() => {
                      const p = form.ptkp_status ?? "TK/0";
                      const cat = terCategory(p);
                      const sal = toNum(form.base_salary);
                      return (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          PTKP {fmtIDR(PTKP_INFO[p]?.annual ?? 0)}/{t("yr", "thn")} · TER {cat}
                          {sal > 0 && (
                            <>
                              {" "}
                              · {t("base salary rate", "tarif gaji pokok")} {terRate(cat, sal)}%
                            </>
                          )}
                        </p>
                      );
                    })()}
                  </AdminField>
                  <AdminField label={t("Department", "Departemen")}>
                    <OrgSelect
                      options={depts}
                      value={form.department ?? ""}
                      onChange={(v) => setForm({ ...form, department: v })}
                      empty={t("Add in Master Departments", "Tambah di Master Departemen")}
                    />
                  </AdminField>
                  <AdminField label={t("Position", "Jabatan")}>
                    <OrgSelect
                      options={positions}
                      value={form.position ?? ""}
                      onChange={(v) => setForm({ ...form, position: v })}
                      empty={t("Add in Master Positions", "Tambah di Master Jabatan")}
                    />
                  </AdminField>
                  <AdminField label={t("Join date", "Tanggal masuk")}>
                    <Input
                      type="date"
                      value={form.join_date ?? ""}
                      onChange={(e) => setForm({ ...form, join_date: e.target.value || null })}
                    />
                  </AdminField>
                  <AdminField label="Email">
                    <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </AdminField>
                  <AdminField label={t("Phone", "Telepon")}>
                    <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </AdminField>
                  <AdminField label={t("Base salary", "Gaji pokok")}>
                    <Input
                      type="number"
                      value={form.base_salary ?? 0}
                      onChange={(e) => setForm({ ...form, base_salary: Number(e.target.value) })}
                    />
                  </AdminField>
                  <AdminField label="Bank">
                    <Input value={form.bank_name ?? ""} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
                  </AdminField>
                  <AdminField label={t("Account no.", "No. rekening")}>
                    <Input value={form.bank_account ?? ""} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
                  </AdminField>
                  <div className="flex flex-col justify-end gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!form.bpjs_kes}
                        onChange={(e) => setForm({ ...form, bpjs_kes: e.target.checked })}
                      />{" "}
                      BPJS Kesehatan
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!form.bpjs_tk}
                        onChange={(e) => setForm({ ...form, bpjs_tk: e.target.checked })}
                      />{" "}
                      BPJS Ketenagakerjaan
                    </label>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-navy dark:text-foreground">
                    {t("Allowances & deductions", "Tunjangan & potongan")}
                  </p>
                  {activeComps.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("Create pay components first in Salary Components.", "Buat komponen gaji dahulu di menu Komponen Gaji.")}
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {activeComps.map((c) => {
                        const val = form.components?.find((x) => x.component_id === c.id)?.amount ?? 0;
                        return (
                          <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">{c.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {c.kind === "allowance" ? t("Allowance", "Tunjangan") : t("Deduction", "Potongan")}
                              </p>
                            </div>
                            <Input
                              className="w-36"
                              type="number"
                              value={val}
                              onChange={(e) => setCompAmount(c.id, Number(e.target.value))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <AdminField label={t("Notes", "Catatan")}>
                  <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </AdminField>
              </div>

              {preview && (
                <div className="h-fit rounded-xl border border-border bg-secondary/40 p-4 text-sm">
                  <p className="mb-3 text-xs font-semibold tracking-widest text-gold">
                    {t("MONTHLY ESTIMATE", "ESTIMASI BULANAN")}
                  </p>
                  <Row label={t("Gross pay", "Gaji bruto")} value={preview.gross} />
                  <Row label="BPJS (karyawan)" value={-preview.bpjs_employee} />
                  <Row label={`PPh 21 TER ${preview.ter_category} (${preview.ter_rate}%)`} value={-preview.pph21} />
                  <Row label={t("Other deductions", "Potongan lain")} value={-preview.other_deductions} />
                  <div className="my-2 border-t border-border" />
                  <Row label={t("Take-home pay", "Gaji bersih")} value={preview.net_pay} bold />
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    BPJS {t("company", "perusahaan")}: {fmtIDR(preview.bpjs_company)}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button variant="navy" disabled={save.isPending} onClick={() => form && save.mutate(form)}>
              {save.isPending && <Loader2 className="animate-spin" />} {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------- Payroll --------------------------------- */

interface RunRow {
  id: string;
  run_no: string;
  period: string;
  pay_date: string;
  status: string;
  bank_account_code: string | null;
  employee_count: number;
  total_gross: number;
  total_deductions: number;
  total_bpjs_company: number;
  total_pph21: number;
  total_net: number;
  notes: string | null;
  journal_entry_id: string | null;
}

interface SlipRow {
  id: string;
  run_id: string;
  employee_code: string | null;
  employee_name: string;
  department: string | null;
  position: string | null;
  ptkp_status: string | null;
  npwp: string | null;
  bank_name: string | null;
  bank_account: string | null;
  base_salary: number;
  allowances: SlipLine[] | null;
  deductions: SlipLine[] | null;
  gross: number;
  taxable_gross: number;
  ter_category: string | null;
  ter_rate: number;
  pph21: number;
  bpjs_employee: number;
  bpjs_company: number;
  other_deductions: number;
  net_pay: number;
}

const parseJson = <T,>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v || "null") ?? fallback;
    } catch {
      return fallback;
    }
  }
  return v as T;
};

function useRuns(workspaceId: string) {
  return useQuery({
    queryKey: ["hr-runs", workspaceId],
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: { table: "hr_payroll_runs", workspaceId, orderBy: "period", orderDir: "desc", limit: 120 },
      });
      return ((res?.rows ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        ...r,
        employee_count: toNum(r.employee_count),
        total_gross: toNum(r.total_gross),
        total_deductions: toNum(r.total_deductions),
        total_bpjs_company: toNum(r.total_bpjs_company),
        total_pph21: toNum(r.total_pph21),
        total_net: toNum(r.total_net),
      })) as unknown as RunRow[];
    },
  });
}

const SLIP_NUM_KEYS = [
  "base_salary", "gross", "taxable_gross", "ter_rate", "pph21", "bpjs_employee", "bpjs_company", "other_deductions", "net_pay",
];

function normalizeSlip(r: Record<string, unknown>): SlipRow {
  const out: Record<string, unknown> = { ...r };
  for (const k of SLIP_NUM_KEYS) out[k] = toNum(r[k]);
  out.allowances = parseJson<SlipLine[]>(r.allowances, []);
  out.deductions = parseJson<SlipLine[]>(r.deductions, []);
  return out as unknown as SlipRow;
}

function useSlips(workspaceId: string, runId?: string) {
  return useQuery({
    queryKey: ["hr-slips", runId],
    enabled: !!runId,
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: { table: "hr_payslips", workspaceId, filters: { run_id: runId }, orderBy: "employee_code", limit: 500 },
      });
      return ((res?.rows ?? []) as unknown as Record<string, unknown>[]).map(normalizeSlip);
    },
  });
}

function PayrollView({ workspaceId }: { workspaceId: string }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const { activeWorkspace } = useApp();
  const { data: runs = [], isLoading } = useRuns(workspaceId);
  const { data: emps = [] } = useEmployees(workspaceId);
  const { data: comps = [] } = useComponents(workspaceId);
  const [newOpen, setNewOpen] = useState(false);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [bank, setBank] = useState<{ code: string; name: string } | null>(null);
  const [openRun, setOpenRun] = useState<RunRow | null>(null);
  const { data: slips = [], isLoading: slipsLoading } = useSlips(workspaceId, openRun?.id);

  const active = emps.filter((e) => e.status === "active");

  /** Buat draft payroll: hitung slip semua karyawan aktif lalu simpan run + slip. */
  const createRun = useMutation({
    mutationFn: async () => {
      if (!active.length) throw new Error(t("No active employees.", "Belum ada karyawan aktif."));
      const computed = active.map((e) => ({ e, s: computePayslip(e, comps) }));
      const sum = (k: keyof (typeof computed)[number]["s"]) => computed.reduce((a, c) => a + toNum(c.s[k]), 0);
      const runId = crypto.randomUUID();
      const totals = {
        gross: sum("gross"),
        pph: computed.reduce((a, c) => a + c.s.pph21, 0),
        bpjsCo: computed.reduce((a, c) => a + c.s.bpjs_company, 0),
        bpjsEmp: computed.reduce((a, c) => a + c.s.bpjs_employee, 0),
        other: computed.reduce((a, c) => a + c.s.other_deductions, 0),
        net: computed.reduce((a, c) => a + c.s.net_pay, 0),
      };
      try {
        await upsertWorkspaceRows({
          data: {
            table: "hr_payroll_runs",
            workspaceId,
            rows: [
              {
                id: runId,
                run_no: `PAY/${period.replace("-", "")}`,
                period,
                pay_date: payDate,
                bank_account_code: bank?.code ?? "1010",
                employee_count: active.length,
                total_gross: totals.gross,
                total_pph21: totals.pph,
                total_bpjs_company: totals.bpjsCo,
                total_deductions: totals.bpjsEmp + totals.pph + totals.other,
                total_net: totals.net,
                status: "draft",
                notes: bank?.name ?? "Kas/Bank",
              },
            ],
          },
        });
        await upsertWorkspaceRows({
          data: {
            table: "hr_payslips",
            workspaceId,
            rows: computed.map(({ e, s }) => ({
              run_id: runId,
              employee_id: e.id,
              employee_code: e.code,
              employee_name: e.name,
              department: e.department,
              position: e.position,
              ptkp_status: e.ptkp_status,
              npwp: e.npwp,
              bank_name: e.bank_name,
              bank_account: e.bank_account,
              base_salary: toNum(e.base_salary),
              allowances: JSON.stringify(s.allowances),
              deductions: JSON.stringify(s.deductions),
              bpjs: JSON.stringify(s.bpjs),
              gross: s.gross,
              taxable_gross: s.taxable_gross,
              ter_category: s.ter_category,
              ter_rate: s.ter_rate,
              pph21: s.pph21,
              bpjs_employee: s.bpjs_employee,
              bpjs_company: s.bpjs_company,
              other_deductions: s.other_deductions,
              net_pay: s.net_pay,
            })),
          },
        });
      } catch (err) {
        // Idempotent: gagal di tengah = bersihkan run + slip yang terlanjur masuk.
        await deleteWorkspaceRow({ data: { table: "hr_payroll_runs", workspaceId, id: runId } }).catch(() => undefined);
        throw err;
      }
      // Kembalikan run lengkap (total asli) supaya dialog rincian langsung benar.
      return {
        id: runId,
        run_no: `PAY/${period.replace("-", "")}`,
        period,
        pay_date: payDate,
        status: "draft",
        bank_account_code: bank?.code ?? "1010",
        employee_count: active.length,
        total_gross: totals.gross,
        total_deductions: totals.bpjsEmp + totals.pph + totals.other,
        total_bpjs_company: totals.bpjsCo,
        total_pph21: totals.pph,
        total_net: totals.net,
        notes: bank?.name ?? "Kas/Bank",
        journal_entry_id: null,
      } as RunRow;
    },
    onSuccess: (run) => {
      toast.success(t("Payroll draft created", "Draft payroll dibuat"));
      setNewOpen(false);
      setBank(null);
      qc.invalidateQueries({ queryKey: ["hr-runs", workspaceId] });
      setOpenRun(run);
    },
    onError: (e: Error) =>
      toast.error(e.message.toLowerCase().includes("duplicate") ? t("Payroll for this period already exists", "Payroll periode ini sudah ada") : e.message),
  });

  /**
   * Setujui & posting jurnal payroll.
   *  Debit : 6200 beban gaji (bruto), 6210 beban BPJS perusahaan
   *  Kredit: 2300 hutang BPJS (karyawan + perusahaan), 2210 hutang PPh 21,
   *          1250 piutang karyawan (potongan lain), bank pembayar (gaji bersih)
   */
  const approve = useMutation({
    mutationFn: async (run: RunRow) => {
      const res = await listWorkspaceRows({
        data: { table: "hr_payslips", workspaceId, filters: { run_id: run.id }, orderBy: "employee_code", limit: 500 },
      });
      const rows = ((res?.rows ?? []) as unknown as Record<string, unknown>[]).map(normalizeSlip);
      if (!rows.length) throw new Error(t("No payslips to post.", "Belum ada slip untuk diposting."));
      const gross = rows.reduce((a, s) => a + s.gross, 0);
      const bpjsCo = rows.reduce((a, s) => a + s.bpjs_company, 0);
      const bpjsEmp = rows.reduce((a, s) => a + s.bpjs_employee, 0);
      const pph = rows.reduce((a, s) => a + s.pph21, 0);
      const other = rows.reduce((a, s) => a + s.other_deductions, 0);
      const net = rows.reduce((a, s) => a + s.net_pay, 0);
      const memo = `Payroll ${run.period}`;
      const lines = [
        { ...HR_ACCOUNTS.salaryExpense, description: memo, debit: gross, credit: 0 },
        { ...HR_ACCOUNTS.bpjsExpense, description: memo, debit: bpjsCo, credit: 0 },
        { ...HR_ACCOUNTS.bpjsPayable, description: memo, debit: 0, credit: bpjsCo + bpjsEmp },
        { ...HR_ACCOUNTS.pph21Payable, description: memo, debit: 0, credit: pph },
        { ...HR_ACCOUNTS.employeeReceivable, description: memo, debit: 0, credit: other },
        { account_code: run.bank_account_code ?? "1010", account_name: run.notes, description: memo, debit: 0, credit: net },
      ].filter((l) => l.account_code && (l.debit > 0.0001 || l.credit > 0.0001));

      // Jurnal lama untuk run ini (mis. dari percobaan sebelumnya) dihapus dulu
      // supaya tidak menumpuk entri ganda untuk periode yang sama.
      if (run.journal_entry_id) {
        await deleteJournalEntry({ data: { workspaceId, entryId: run.journal_entry_id } }).catch(() => undefined);
      }

      const posted = await postJournalEntry({
        data: {
          workspaceId,
          entry: {
            entry_no: `JRN/${run.period.replace("-", "")}/PAY`,
            entry_date: run.pay_date,
            source_type: "payroll",
            source_id: run.id,
            source_doc_number: run.run_no,
            memo,
            total_debit: lines.reduce((a, l) => a + l.debit, 0),
            total_credit: lines.reduce((a, l) => a + l.credit, 0),
            is_auto: true,
          },
          lines,
        },
      });
      const entryId = (posted as { entryId?: string } | null)?.entryId ?? null;
      // UPDATE parsial (bukan upsert): hr_payroll_runs punya kolom NOT NULL
      // (run_no/period/pay_date) sehingga upsert parsial akan ditolak MySQL.
      await saveWorkspaceRow({
        data: {
          table: "hr_payroll_runs",
          workspaceId,
          id: run.id,
          data: {
            status: "approved",
            journal_entry_id: entryId,
            approved_at: new Date().toISOString().slice(0, 19).replace("T", " "),
          },
        },
      });
    },
    onSuccess: (_res, run) => {
      toast.success(t("Payroll approved and posted to journal", "Payroll disetujui dan diposting ke jurnal"));
      // Dialog rincian ikut menandai status baru (state lokal, tanpa menunggu refetch).
      setOpenRun((prev) => (prev && prev.id === run.id ? { ...prev, status: "approved" } : prev));
      qc.invalidateQueries({ queryKey: ["hr-runs", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (run: RunRow) => {
      // Jurnal ikut dihapus supaya tidak ada jurnal yatim (tanpa run) di buku besar.
      if (run.journal_entry_id) {
        await deleteJournalEntry({ data: { workspaceId, entryId: run.journal_entry_id } }).catch(() => undefined);
      }
      await deleteWorkspaceRow({ data: { table: "hr_payroll_runs", workspaceId, id: run.id } });
    },
    onSuccess: () => {
      toast.success(t("Payroll deleted", "Payroll dihapus"));
      setOpenRun(null);
      qc.invalidateQueries({ queryKey: ["hr-runs", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Header
        eyebrow="SLIPP HR"
        title={t("Payroll & Payslips", "Payroll & Slip Gaji")}
        desc={t(
          "Monthly payroll: generate payslips from active employees, then approve to post the journal.",
          "Payroll bulanan: buat slip dari karyawan aktif, lalu setujui untuk posting jurnal.",
        )}
      >
        <Button variant="navy" onClick={() => setNewOpen(true)}>
          <Plus /> {t("Process payroll", "Proses payroll")}
        </Button>
      </Header>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Run", "Nomor")}</TableHead>
                <TableHead>{t("Period", "Periode")}</TableHead>
                <TableHead>{t("Pay date", "Tanggal bayar")}</TableHead>
                <TableHead className="text-right">{t("Employees", "Karyawan")}</TableHead>
                <TableHead className="text-right">{t("Gross", "Bruto")}</TableHead>
                <TableHead className="text-right">PPh 21</TableHead>
                <TableHead className="text-right">{t("Net", "Bersih")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    {t("No payroll runs yet.", "Belum ada payroll.")}
                  </TableCell>
                </TableRow>
              )}
              {runs.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenRun(r)}>
                  <TableCell className="font-mono text-xs">{r.run_no}</TableCell>
                  <TableCell>{periodLabel(r.period, lang)}</TableCell>
                  <TableCell>{r.pay_date}</TableCell>
                  <TableCell className="text-right">{r.employee_count}</TableCell>
                  <TableCell className="text-right">{fmtIDR(r.total_gross)}</TableCell>
                  <TableCell className="text-right">{fmtIDR(r.total_pph21)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtIDR(r.total_net)}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                      {r.status === "approved" ? t("Posted", "Terposting") : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("Delete", "Hapus")}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (confirm(t("Delete this payroll run?", "Hapus payroll ini?"))) remove.mutate(r);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog proses payroll baru */}
      <Dialog open={newOpen} onOpenChange={(o) => !o && setNewOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Process payroll", "Proses payroll")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <AdminField label={t("Period", "Periode")}>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </AdminField>
            <AdminField label={t("Pay date", "Tanggal bayar")}>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </AdminField>
            <AdminField label={t("Paying bank account (optional)", "Akun bank pembayar (opsional)")}>
              <CashBankPicker
                workspaceId={workspaceId}
                value={bank?.name}
                onPick={(a) => setBank({ code: a.gl_account_code ?? a.code, name: a.name })}
              />
            </AdminField>
            <p className="text-xs text-muted-foreground">
              {bank
                ? t("Salary will be paid from this account.", "Gaji dibayar dari akun ini.")
                : t("If left empty, the payment posts to account 1010.", "Bila dikosongkan, pembayaran masuk ke akun 1010.")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                `${active.length} active employee(s) will be processed.`,
                `${active.length} karyawan aktif akan diproses.`,
              )}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button variant="navy" disabled={createRun.isPending} onClick={() => createRun.mutate()}>
              {createRun.isPending && <Loader2 className="animate-spin" />} {t("Generate", "Proses")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog rincian run + slip */}
      <Dialog open={!!openRun} onOpenChange={(o) => !o && setOpenRun(null)}>
        <DialogContent className="max-h-[94vh] w-[96vw] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {openRun?.run_no} · {openRun ? periodLabel(openRun.period, lang) : ""}
            </DialogTitle>
          </DialogHeader>
          {openRun && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={openRun.status === "approved" ? "default" : "secondary"}>
                  {openRun.status === "approved" ? t("Posted to journal", "Terposting ke jurnal") : "Draft"}
                </Badge>
                <span className="text-muted-foreground">
                  {openRun.employee_count} {t("employees", "karyawan")} · {t("pay date", "bayar")} {openRun.pay_date}
                </span>
              </div>
              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <Row label={t("Gross", "Bruto")} value={openRun.total_gross} />
                <Row label={t("Deductions", "Potongan")} value={-openRun.total_deductions} />
                <Row label={t("Company BPJS", "BPJS perusahaan")} value={openRun.total_bpjs_company} />
                <div className="my-2 border-t border-border" />
                <Row label={t("Net pay", "Gaji bersih")} value={openRun.total_net} bold />
              </div>

              <div className="max-h-[45vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Employee", "Karyawan")}</TableHead>
                      <TableHead>PTKP</TableHead>
                      <TableHead className="text-right">{t("Base salary", "Gaji pokok")}</TableHead>
                      <TableHead className="text-right">{t("Gross", "Bruto")}</TableHead>
                      <TableHead className="text-right">BPJS</TableHead>
                      <TableHead className="text-right">PPh 21</TableHead>
                      <TableHead className="text-right">{t("Net", "Bersih")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slipsLoading && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center">
                          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                        </TableCell>
                      </TableRow>
                    )}
                    {slips.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <span className="font-mono text-xs">{s.employee_code}</span> · {s.employee_name}
                        </TableCell>
                        <TableCell>
                          {s.ptkp_status} <span className="text-muted-foreground">({s.ter_category} {s.ter_rate}%)</span>
                        </TableCell>
                        <TableCell className="text-right">{fmtIDR(s.base_salary)}</TableCell>
                        <TableCell className="text-right">{fmtIDR(s.gross)}</TableCell>
                        <TableCell className="text-right">{fmtIDR(s.bpjs_employee)}</TableCell>
                        <TableCell className="text-right">{fmtIDR(s.pph21)}</TableCell>
                        <TableCell className="text-right font-medium">{fmtIDR(s.net_pay)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRun(null)}>
              {t("Close", "Tutup")}
            </Button>
            {openRun && slips.length > 0 && (
              <Button
                variant="outline"
                onClick={() =>
                  printSlips(slips, openRun, activeWorkspace?.name ?? "XPERD", activeWorkspace?.logo_url || DEFAULT_WORKSPACE_LOGO)
                }
              >
                <Printer /> {t("Print payslips", "Cetak slip")}
              </Button>
            )}
            {openRun && openRun.status !== "approved" && (
              <Button variant="navy" disabled={approve.isPending} onClick={() => approve.mutate(openRun)}>
                {approve.isPending && <Loader2 className="animate-spin" />} {t("Approve & post journal", "Setujui & posting jurnal")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------- Rekap BPJS & PPh 21 + cetak slip ------------------- */

const escHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function slipHtml(s: SlipRow, run: RunRow, company: string, logo: string | null) {
  const line = (l: SlipLine) =>
    `<tr><td>${escHtml(l.name)}</td><td style="text-align:right">${fmtIDR(Number(l.amount) || 0)}</td></tr>`;
  return `<section class="slip">
    <header>
      ${logo ? `<img src="${escHtml(logo)}" alt="" style="max-height:44px;max-width:150px;object-fit:contain" />` : ""}
      <div>
        <strong>${escHtml(company)}</strong>
        <div class="muted">Slip Gaji — ${escHtml(run.run_no)} · ${escHtml(run.period)} · bayar ${escHtml(run.pay_date)}</div>
      </div>
    </header>
    <div class="who">
      <span>${escHtml(s.employee_code)} · ${escHtml(s.employee_name)}</span>
      <span class="muted">${escHtml(s.department ?? "-")}${s.position ? " · " + escHtml(s.position) : ""} · PTKP ${escHtml(s.ptkp_status)} (TER ${escHtml(s.ter_category)} ${s.ter_rate}%)</span>
    </div>
    <table>
      <tr><th>Penghasilan</th><th style="text-align:right">Nilai</th></tr>
      <tr><td>Gaji pokok</td><td style="text-align:right">${fmtIDR(s.base_salary)}</td></tr>
      ${(s.allowances ?? []).map(line).join("")}
      <tr class="total"><td>Bruto</td><td style="text-align:right">${fmtIDR(s.gross)}</td></tr>
      <tr><th>Potongan</th><th style="text-align:right">Nilai</th></tr>
      ${(s.deductions ?? []).map(line).join("")}
      <tr><td>BPJS karyawan</td><td style="text-align:right">${fmtIDR(s.bpjs_employee)}</td></tr>
      <tr><td>PPh 21 TER ${escHtml(s.ter_category)} (${s.ter_rate}%)</td><td style="text-align:right">${fmtIDR(s.pph21)}</td></tr>
      <tr class="total"><td>Gaji bersih</td><td style="text-align:right">${fmtIDR(s.net_pay)}</td></tr>
    </table>
    <footer class="muted">
      BPJS perusahaan ${fmtIDR(s.bpjs_company)} · bank ${escHtml(s.bank_name ?? "-")} ${escHtml(s.bank_account ?? "")}
    </footer>
  </section>`;
}

/** Cetak slip di jendela baru (Chrome: user memilih "Save as PDF" bila perlu). */
function printSlips(slips: SlipRow[], run: RunRow, company: string, logo: string | null) {
  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Popup diblokir browser — izinkan popup untuk mencetak slip.");
    return;
  }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
    <title>Slip Gaji ${escHtml(run.run_no)}</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;margin:24px;color:#0f172a}
      .slip{page-break-after:always;border:1px solid #cbd5e1;border-radius:10px;padding:16px;margin-bottom:18px}
      .slip:last-child{page-break-after:auto}
      header{display:flex;gap:12px;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:8px}
      .who{display:flex;justify-content:space-between;gap:12px;margin:10px 0;font-size:12px}
      .muted{color:#64748b;font-size:11px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{padding:4px 6px;border-bottom:1px solid #eef2f7;text-align:left}
      tr.total td{font-weight:700;border-top:1px solid #cbd5e1}
      footer{margin-top:8px}
      @media print{ .slip{border:none;padding:0} }
    </style></head><body>
    ${slips.map((s) => slipHtml(s, run, company, logo)).join("")}
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function TaxBpjsView({ workspaceId }: { workspaceId: string }) {
  const { t, lang } = useT();
  const { activeWorkspace } = useApp();
  const { data: runs = [] } = useRuns(workspaceId);
  const [runId, setRunId] = useState<string>("");
  const selected = runs.find((r) => r.id === runId) ?? runs[0];
  const { data: slips = [], isLoading } = useSlips(workspaceId, selected?.id);

  const sum = (k: keyof SlipRow) => slips.reduce((a, s) => a + toNum(s[k]), 0);
  const bpjsEmp = sum("bpjs_employee");
  const bpjsCo = sum("bpjs_company");
  const pph = sum("pph21");
  const gross = sum("gross");
  const net = sum("net_pay");

  return (
    <div className="space-y-5">
      <Header
        eyebrow="SLIPP HR"
        title={t("BPJS & PPh 21", "BPJS & PPh 21")}
        desc={t(
          "Monthly recap per employee for depositing BPJS contributions and PPh 21.",
          "Rekap bulanan per karyawan untuk menyetor iuran BPJS dan PPh 21.",
        )}
      >
        <AdminSelect value={selected?.id ?? ""} onChange={setRunId} className="w-64">
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.run_no} · {periodLabel(r.period, lang)}
            </option>
          ))}
        </AdminSelect>
        <Button
          variant="outline"
          disabled={!slips.length}
          onClick={() =>
            printSlips(slips, selected, activeWorkspace?.name ?? "XPERD", activeWorkspace?.logo_url || DEFAULT_WORKSPACE_LOGO)
          }
        >
          <Printer /> {t("Print payslips", "Cetak slip")}
        </Button>
      </Header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t("Gross", "Bruto"), value: gross },
          { label: t("BPJS to deposit", "BPJS disetor"), value: bpjsEmp + bpjsCo },
          { label: "PPh 21", value: pph },
          { label: t("Net pay", "Gaji bersih"), value: net },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-xl font-semibold">{fmtIDR(k.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Employee", "Karyawan")}</TableHead>
                <TableHead>PTKP</TableHead>
                <TableHead className="text-right">{t("Gross", "Bruto")}</TableHead>
                <TableHead className="text-right">BPJS {t("employee", "karyawan")}</TableHead>
                <TableHead className="text-right">BPJS {t("company", "perusahaan")}</TableHead>
                <TableHead className="text-right">PPh 21</TableHead>
                <TableHead className="text-right">{t("Net", "Bersih")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !slips.length && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    {t("No payroll yet.", "Belum ada payroll.")}
                  </TableCell>
                </TableRow>
              )}
              {slips.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="font-mono text-xs">{s.employee_code}</span> · {s.employee_name}
                  </TableCell>
                  <TableCell>
                    {s.ptkp_status} <span className="text-muted-foreground">({s.ter_category} {s.ter_rate}%)</span>
                  </TableCell>
                  <TableCell className="text-right">{fmtIDR(s.gross)}</TableCell>
                  <TableCell className="text-right">{fmtIDR(s.bpjs_employee)}</TableCell>
                  <TableCell className="text-right">{fmtIDR(s.bpjs_company)}</TableCell>
                  <TableCell className="text-right">{fmtIDR(s.pph21)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtIDR(s.net_pay)}</TableCell>
                </TableRow>
              ))}
              {slips.length > 0 && (
                <TableRow className="font-semibold">
                  <TableCell colSpan={2}>{t("Total", "Jumlah")}</TableCell>
                  <TableCell className="text-right">{fmtIDR(gross)}</TableCell>
                  <TableCell className="text-right">{fmtIDR(bpjsEmp)}</TableCell>
                  <TableCell className="text-right">{fmtIDR(bpjsCo)}</TableCell>
                  <TableCell className="text-right">{fmtIDR(pph)}</TableCell>
                  <TableCell className="text-right">{fmtIDR(net)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
