import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Factory, Save, Plus, Pencil, Lock, Loader2, Search } from "lucide-react";
import { PaginationBar, usePagination, searchRows } from "@/components/app/ui-states";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminField, AdminSelect } from "@/components/app/admin-ui";
import { ProductionCodeInit } from "@/components/app/ProductionCodeInit";
import { ProductionComplianceView } from "@/components/app/ProductionComplianceView";
import { ProductionBomView } from "@/components/app/ProductionBomView";
import { ProductionQualityView } from "@/components/app/ProductionQualityView";
import { ProductionOrdersView } from "@/components/app/ProductionOrdersView";
import { ProductionAccountingView } from "@/components/app/ProductionAccountingView";
import { ProductionLotsView } from "@/components/app/ProductionLotsView";
import { ProductionDashboard } from "@/components/app/ProductionDashboard";
import { ProductionTraceView } from "@/components/app/ProductionTraceView";
import { getProduction, saveProductionMaster } from "@/lib/production.functions";
import { defaultNumbering, productionRoles, productionSections, productionSettingsSchema } from "@/lib/production";
import type { z } from "zod";
import { Link } from "@tanstack/react-router";

type ProductionData = Awaited<ReturnType<typeof getProduction>>;
type Section = (typeof productionSections)[number];
type Settings = z.infer<typeof productionSettingsSchema>;
const sectionTitles: Record<Section, string> = { settings: "Pengaturan Production", roles: "Peran Produksi", "work-centers": "Pusat Kerja & Tarif", "formulation-codes": "Kode Formulasi", audit: "Audit Production" };
const blankCenter = { code: "", name: "", center_type: "mixing", capacity_per_hour: 0, uom_code: null as string | null, labor_rate_per_hour: 0, overhead_rate_per_hour: 0, is_active: true };
const blankCode = { code: "", name_en: "", name_id: "", physical_state: "liquid", is_active: true };

export function ProductionView({ workspaceId, section = "settings" }: { workspaceId: string; section?: string }) {
  if (section === "dashboard") return <ProductionDashboard workspaceId={workspaceId} />;
  if (section === "boms") return <ProductionBomView workspaceId={workspaceId} />;
  if (section === "lots") return <ProductionLotsView workspaceId={workspaceId} />;
  if (section === "quality") return <ProductionQualityView workspaceId={workspaceId} />;
  if (section === "orders") return <ProductionOrdersView workspaceId={workspaceId} />;
  if (section === "accounting") return <ProductionAccountingView workspaceId={workspaceId} />;
  if (section === "traceability" || section === "reports" || section === "waste") return <ProductionTraceView workspaceId={workspaceId} section={section} />;
  if (section === "profiles" || section === "registrations") return <ProductionComplianceView workspaceId={workspaceId} section={section} />;
  return <ProductionFoundation workspaceId={workspaceId} section={section} />;
}
function ProductionFoundation({ workspaceId, section }: { workspaceId: string; section: string }) {
  const selected = productionSections.find((s) => s === section) ?? "settings";
  const get = useServerFn(getProduction);
  const q = useQuery({ queryKey: ["production", workspaceId, selected], queryFn: () => get({ data: { workspaceId, section: selected } }) });
  if (q.isPending) return <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (q.isError) return <div className="mx-auto max-w-lg py-16 text-center"><Lock className="mx-auto h-8 w-8 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">Akses Production dibatasi</h1><p className="mt-2 text-sm text-muted-foreground">{q.error.message}</p></div>;
  return <div className="space-y-6"><header className="flex items-center gap-3"><Factory className="h-7 w-7 text-primary" /><div><p className="text-xs text-muted-foreground">Production</p><h1 className="text-2xl font-semibold">{sectionTitles[selected]}</h1></div></header>{!q.data.canWrite && selected !== "audit" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" />Hanya lihat</p>}{selected === "formulation-codes" && q.data.canWrite && <ProductionCodeInit workspaceId={workspaceId} />}<ProductionContent key={`${workspaceId}:${selected}:${q.data.settings?.updated_at ?? "new"}`} workspaceId={workspaceId} section={selected} data={q.data} /></div>;
}
function ProductionContent({ workspaceId, section, data }: { workspaceId: string; section: Section; data: ProductionData }) {
  const qc = useQueryClient();
  const save = useServerFn(saveProductionMaster);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("Perubahan data");
  const [open, setOpen] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [center, setCenter] = useState(blankCenter);
  const [code, setCode] = useState(blankCode);
  const [role, setRole] = useState({ user_id: data.members[0]?.user_id ?? "", role: "operator", is_active: true });
  const [settings, setSettings] = useState<Settings>(() => ({ numbering: data.settings ? productionSettingsSchema.shape.numbering.parse(data.settings.numbering) : defaultNumbering, costing_method: data.settings?.costing_method === "standard" ? "standard" : "actual", fefo: data.settings?.fefo ?? true, min_remaining_shelf_life_days: data.settings?.min_remaining_shelf_life_days ?? 0, yield_tolerance_pct: data.settings?.yield_tolerance_pct ?? 0 }));
  async function submit(table: "mfg_settings" | "mfg_work_centers" | "mfg_formulation_codes" | "mfg_workspace_roles", values: Record<string, unknown>, rowId: string | null) {
    if (!data.canWrite) return;
    setBusy(true);
    try { await save({ data: { workspaceId, table, id: rowId, values, reason } }); toast.success("Perubahan tersimpan"); setOpen(false); setReason("Perubahan data"); await qc.invalidateQueries({ queryKey: ["production", workspaceId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Perubahan belum tersimpan"); }
    finally { setBusy(false); }
  }
  const reasonField = <AdminField label="Alasan perubahan"><Input required maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} /></AdminField>;
  const submitButton = <Button type="submit" disabled={busy || !reason.trim() || !data.canWrite}><Save className="h-4 w-4" />Simpan</Button>;
  if (section === "settings") return <form className="max-w-3xl space-y-6" onSubmit={(e) => { e.preventDefault(); void submit("mfg_settings", settings, data.settings?.id ?? null); }}><fieldset disabled={!data.canWrite || busy} className="space-y-6"><section className="space-y-3"><h2 className="text-lg font-medium">Penomoran</h2><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Dokumen</TableHead><TableHead>Awalan</TableHead><TableHead>Reset</TableHead><TableHead>Digit</TableHead></TableRow></TableHeader><TableBody>{Object.entries(settings.numbering).map(([key, rule]) => <TableRow key={key}><TableCell>{({ order: "Order", lot: "Lot", inspection: "Inspeksi", deviation: "Deviasi" } as Record<string, string>)[key]}</TableCell><TableCell><Input className="min-w-24" aria-label={`Awalan ${key}`} value={rule.prefix} onChange={(e) => setSettings({ ...settings, numbering: { ...settings.numbering, [key]: { ...rule, prefix: e.target.value.toUpperCase() } } })} /></TableCell><TableCell><AdminSelect value={rule.reset} onChange={(v) => setSettings({ ...settings, numbering: { ...settings.numbering, [key]: { ...rule, reset: v } } })}><option value="yearly">Tahunan</option><option value="monthly">Bulanan</option><option value="daily">Harian</option><option value="never">Tidak reset</option></AdminSelect></TableCell><TableCell><Input className="w-20" aria-label={`Digit ${key}`} type="number" min={1} max={9} value={rule.digits} onChange={(e) => setSettings({ ...settings, numbering: { ...settings.numbering, [key]: { ...rule, digits: Number(e.target.value) } } })} /></TableCell></TableRow>)}</TableBody></Table></div></section><section className="grid gap-4 sm:grid-cols-2"><AdminField label="Metode biaya FG"><AdminSelect value={settings.costing_method} onChange={(v) => setSettings({ ...settings, costing_method: v === "standard" ? "standard" : "actual" })}><option value="actual">Aktual</option><option value="standard">Standar</option></AdminSelect></AdminField><AdminField label="Sisa umur simpan minimum (hari)"><Input type="number" min={0} step={1} value={settings.min_remaining_shelf_life_days} onChange={(e) => setSettings({ ...settings, min_remaining_shelf_life_days: Number(e.target.value) })} /></AdminField><AdminField label="Toleransi yield (%)"><Input type="number" min={0} max={100} step="0.000001" value={settings.yield_tolerance_pct} onChange={(e) => setSettings({ ...settings, yield_tolerance_pct: Number(e.target.value) })} /></AdminField><label className="flex items-center gap-3 text-sm"><Switch checked={settings.fefo} onCheckedChange={(v) => setSettings({ ...settings, fefo: v })} />FEFO</label></section>{submitButton}</fieldset></form>;
  if (section === "audit") return <AuditTable rows={data.audit} />;
  if ((section as string) === "work-centers") return <WorkCenterList workspaceId={workspaceId} rows={data.centers} canWrite={data.canWrite} />;
  const rows = section === "work-centers" ? data.centers : section === "formulation-codes" ? data.codes : data.roles;
  return <div className="space-y-4"><div className="flex justify-end"><Button disabled={!data.canWrite} onClick={() => { setId(null); setReason("Perubahan data"); setCenter(blankCenter); setCode(blankCode); setRole({ user_id: data.members[0]?.user_id ?? "", role: "operator", is_active: true }); setOpen(true); }}><Plus className="h-4 w-4" />Tambah</Button></div><MasterTable rows={rows} section={section} canWrite={data.canWrite} onEdit={(r) => { setId(r.id); setReason("Perubahan data"); if ("center_type" in r) setCenter({ code: r.code, name: r.name, center_type: r.center_type, capacity_per_hour: r.capacity_per_hour, uom_code: r.uom_code, labor_rate_per_hour: r.labor_rate_per_hour, overhead_rate_per_hour: r.overhead_rate_per_hour, is_active: r.is_active }); else if ("name_en" in r) setCode({ code: r.code, name_en: r.name_en, name_id: r.name_id, physical_state: r.physical_state, is_active: r.is_active }); else setRole({ user_id: r.user_id, role: r.role, is_active: r.is_active }); setOpen(true); }} memberLabel={(uid) => data.members.find((m) => m.user_id === uid)?.label ?? uid} /><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{id ? "Edit" : "Tambah"} {sectionTitles[section]}</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(section === "work-centers" ? "mfg_work_centers" : section === "roles" ? "mfg_workspace_roles" : "mfg_formulation_codes", section === "work-centers" ? center : section === "roles" ? role : code, id); }}>{section === "work-centers" ? <><AdminField label="Kode"><Input required value={center.code} onChange={(e) => setCenter({ ...center, code: e.target.value })} /></AdminField><AdminField label="Nama"><Input required value={center.name} onChange={(e) => setCenter({ ...center, name: e.target.value })} /></AdminField><AdminField label="Tipe"><AdminSelect value={center.center_type} onChange={(v) => setCenter({ ...center, center_type: v })}>{["mixing", "milling", "blending", "granulation", "filling", "packing", "qc_lab"].map((v) => <option key={v}>{v}</option>)}</AdminSelect></AdminField><div className="grid gap-4 sm:grid-cols-2"><AdminField label="Kapasitas / jam"><Input type="number" min={0} step="0.0001" value={center.capacity_per_hour} onChange={(e) => setCenter({ ...center, capacity_per_hour: Number(e.target.value) })} /></AdminField><AdminField label="Satuan"><AdminSelect value={center.uom_code ?? ""} onChange={(v) => setCenter({ ...center, uom_code: v || null })}><option value="">—</option>{data.units.map((u) => <option key={u.code} value={u.code}>{u.code} · {u.name}</option>)}</AdminSelect></AdminField>{(["labor_rate_per_hour", "overhead_rate_per_hour"] as const).map((k) => <AdminField key={k} label={k === "labor_rate_per_hour" ? "Upah / jam (Rp)" : "Overhead / jam (Rp)"}><Input type="number" min={0} step={1} value={center[k]} onChange={(e) => setCenter({ ...center, [k]: Number(e.target.value) })} /></AdminField>)}</div><label className="flex items-center gap-2 text-sm"><Switch checked={center.is_active} onCheckedChange={(v) => setCenter({ ...center, is_active: v })} />Aktif</label></> : section === "formulation-codes" ? <><AdminField label="Kode"><Input required maxLength={2} value={code.code} onChange={(e) => setCode({ ...code, code: e.target.value.toUpperCase() })} /></AdminField><AdminField label="Nama Indonesia"><Input required value={code.name_id} onChange={(e) => setCode({ ...code, name_id: e.target.value })} /></AdminField><AdminField label="Nama Inggris"><Input required value={code.name_en} onChange={(e) => setCode({ ...code, name_en: e.target.value })} /></AdminField><AdminField label="Wujud"><AdminSelect value={code.physical_state} onChange={(v) => setCode({ ...code, physical_state: v })}><option value="liquid">Cair</option><option value="solid">Padat</option><option value="other">Lainnya</option></AdminSelect></AdminField><label className="flex items-center gap-2 text-sm"><Switch checked={code.is_active} onCheckedChange={(v) => setCode({ ...code, is_active: v })} />Aktif</label></> : <><AdminField label="Anggota workspace"><AdminSelect value={role.user_id} onChange={(v) => setRole({ ...role, user_id: v })}>{data.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.label} · {m.role}</option>)}</AdminSelect></AdminField><AdminField label="Peran produksi"><AdminSelect value={role.role} onChange={(v) => setRole({ ...role, role: v })}>{productionRoles.map((v) => <option key={v}>{v}</option>)}</AdminSelect></AdminField><label className="flex items-center gap-2 text-sm"><Switch checked={role.is_active} onCheckedChange={(v) => setRole({ ...role, is_active: v })} />Aktif</label></>}{reasonField}<div className="flex justify-end">{submitButton}</div></form></DialogContent></Dialog></div>;
}
type Row = ProductionData["centers"][number] | ProductionData["codes"][number] | ProductionData["roles"][number];
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div className="relative w-full max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Cari..." value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}
function MasterTable({ rows, section, canWrite, onEdit, memberLabel }: { rows: Row[]; section: Section; canWrite: boolean; onEdit: (r: Row) => void; memberLabel: (id: string) => string }) {
  const [q, setQ] = useState("");
  const p = usePagination(searchRows(rows, q), 25);
  const isRole = section === "roles", isCenter = section === "work-centers";
  return <div className="space-y-3"><SearchBox value={q} onChange={setQ} /><div className="overflow-hidden rounded-2xl border border-border bg-card"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-14 text-center">#</TableHead><TableHead>{isRole ? "Anggota" : "Kode"}</TableHead><TableHead>{isRole ? "Peran" : "Nama"}</TableHead>{isCenter && <><TableHead>Tipe</TableHead><TableHead>Kapasitas / jam</TableHead></>}<TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader><TableBody>{p.items.map((r, i) => <TableRow key={r.id}><TableCell className="text-center text-xs text-muted-foreground">{p.start + i + 1}</TableCell><TableCell>{"user_id" in r ? memberLabel(r.user_id) : r.code}</TableCell><TableCell>{"role" in r ? r.role : "name" in r ? r.name : r.name_id}</TableCell>{isCenter && "center_type" in r && <><TableCell>{r.center_type}</TableCell><TableCell>{r.capacity_per_hour}</TableCell></>}<TableCell>{r.is_active ? "Aktif" : "Arsip"}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" aria-label="Edit" disabled={!canWrite} onClick={() => onEdit(r)}><Pencil className="h-4 w-4" /></Button></TableCell></TableRow>)}{!p.items.length && <TableRow><TableCell colSpan={isCenter ? 7 : 5} className="py-12 text-center text-muted-foreground">Belum ada data.</TableCell></TableRow>}</TableBody></Table></div><PaginationBar p={p as never} /></div></div>;
}
function AuditTable({ rows }: { rows: ProductionData["audit"] }) {
  const [q, setQ] = useState("");
  const p = usePagination(searchRows(rows, q), 25);
  return <div className="space-y-3"><SearchBox value={q} onChange={setQ} /><div className="overflow-hidden rounded-2xl border border-border bg-card"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-14 text-center">#</TableHead><TableHead>Waktu</TableHead><TableHead>Entitas</TableHead><TableHead>Tindakan</TableHead><TableHead>Alasan</TableHead></TableRow></TableHeader><TableBody>{p.items.map((a, i) => <TableRow key={a.id}><TableCell className="text-center text-xs text-muted-foreground">{p.start + i + 1}</TableCell><TableCell className="whitespace-nowrap">{new Date(a.created_at).toLocaleString("id-ID")}</TableCell><TableCell>{a.entity_table.replace("mfg_", "")}</TableCell><TableCell>{a.action}</TableCell><TableCell>{a.reason}</TableCell></TableRow>)}{!p.items.length && <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">Belum ada perubahan tercatat.</TableCell></TableRow>}</TableBody></Table></div><PaginationBar p={p as never} /></div></div>;
}

const CENTER_TYPE: Record<string, string> = { mixing: "Mixing", milling: "Milling", blending: "Blending", granulation: "Granulasi", filling: "Filling", packing: "Packing", qc_lab: "Lab QC" };
function WorkCenterList({ workspaceId, rows, canWrite }: { workspaceId: string; rows: ProductionData["centers"]; canWrite: boolean }) {
  const [q, setQ] = useState("");
  const p = usePagination(searchRows(rows, q), 25);
  const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
  const link = (docId: string) => ({ to: "/app/w/$workspaceId/$moduleId/$submoduleId/$docId" as const, params: { workspaceId, moduleId: "manufacturing", submoduleId: "work-centers", docId }, search: { print: undefined } });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox value={q} onChange={setQ} />
        {canWrite ? <Button asChild><Link {...link("new")}><Plus className="h-4 w-4" />Pusat kerja baru</Link></Button> : null}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>{["Kode", "Nama", "Tipe", "Kapasitas / jam", "Upah / jam", "Overhead / jam", "Status", ""].map((h, i) => <TableHead key={i} className={h.includes("/ jam") && h !== "Kapasitas / jam" ? "text-right" : undefined}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {p.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{CENTER_TYPE[c.center_type] ?? c.center_type}</TableCell>
                  <TableCell>{Number(c.capacity_per_hour).toLocaleString("id-ID")} {c.uom_code ?? ""}</TableCell>
                  <TableCell className="text-right">{rp(Number(c.labor_rate_per_hour))}</TableCell>
                  <TableCell className="text-right">{rp(Number(c.overhead_rate_per_hour))}</TableCell>
                  <TableCell>{c.is_active ? "Aktif" : "Nonaktif"}</TableCell>
                  <TableCell className="text-right"><Button asChild variant="ghost" size="icon" aria-label="Buka pusat kerja"><Link {...link(c.id)}><Pencil className="h-4 w-4" /></Link></Button></TableCell>
                </TableRow>
              ))}
              {!rows.length && <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">Belum ada pusat kerja. Pusat kerja dipakai untuk menghitung tenaga kerja dan overhead produksi.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <PaginationBar p={p as never} />
      </div>
    </div>
  );
}
