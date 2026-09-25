import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect, fmtIDR } from "@/components/app/admin-ui";
import { deleteWorkspaceRow, listWorkspaceRows, upsertWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import {
  PTKP_INFO,
  PTKP_STATUSES,
  terBrackets,
  terCategory,
  terRate,
  type Employee,
  type PayComponent,
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
  if (submoduleId === "employees") return <ComingSoon workspaceId={workspaceId} what="Employees" />;
  if (submoduleId === "components") return <ComponentsView workspaceId={workspaceId} />;
  if (submoduleId === "payroll") return <ComingSoon workspaceId={workspaceId} what="Payroll & Payslips" />;
  if (submoduleId === "tax-bpjs") return <ComingSoon workspaceId={workspaceId} what="BPJS & PPh 21" />;
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
