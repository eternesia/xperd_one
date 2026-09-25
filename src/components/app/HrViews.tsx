import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
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
  computePayslip,
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
