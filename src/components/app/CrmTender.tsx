/**
 * #50 (BS New 3): Checklist Dokumen Tender — daftar dokumen wajib
 * (administratif/teknis/penawaran), HPS, batas waktu, PIC, status, dan
 * kelayakan submit.
 *
 * Catatan porting ke Old:
 * - Lapisan data memakai `listWorkspaceRows`/`upsertWorkspaceRows`/`deleteWorkspaceRow`
 *   (bukan Supabase), tanggal dibulatkan lewat `sqlDateTime()`.
 * - Fitur yang **belum** diporting karena menunggu keputusan penyimpanan berkas:
 *   unduh paket ZIP (#52). Nama berkas & tautan pustaka yang sudah ada tetap ditampilkan.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileArchive,
  ListChecks,
  Loader2,
  Plus,
  Printer,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect, fmtIDR } from "@/components/app/admin-ui";
import { PageSkeleton, PaginationBar, usePagination } from "@/components/app/ui-states";
// #51 (BS New 3): pustaka dokumen untuk autofill & lampiran checklist.
import { matchLibrary, openWsFile, uploadWsFile, useDocLibrary, type LibDoc } from "@/components/app/CrmDocLibrary";
// #52 (BS New 3): template isian panitia (DOCX + kop).
import { generateTenderDocx, TenderTemplates, useTenderTemplates } from "@/components/app/CrmTenderTemplates";
import { useApp } from "@/lib/app-context";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow, upsertWorkspaceRows } from "@/lib/data.functions";
import { uploadWorkspaceFile } from "@/lib/files.functions";
import { sqlDateTimeOrNull } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";

type Cat = "administrative" | "technical" | "commercial";
const CATS: { id: Cat; en: string; id_: string }[] = [
  { id: "administrative", en: "1. Administrative", id_: "1. Dokumen Administrasi" },
  { id: "technical", en: "2. Technical", id_: "2. Dokumen Teknis" },
  { id: "commercial", en: "3. Price Offer", id_: "3. Dokumen Penawaran" },
];
const DOC_STATUS = [
  { id: "missing", en: "Missing", id_: "Belum ada" },
  { id: "in_progress", en: "In progress", id_: "Diproses" },
  { id: "ready", en: "Ready", id_: "Siap" },
  { id: "verified", en: "Verified", id_: "Terverifikasi" },
];
const TENDER_STATUS = [
  { id: "preparing", en: "Preparing", id_: "Persiapan" },
  { id: "submitted", en: "Submitted", id_: "Sudah submit" },
  { id: "won", en: "Won", id_: "Menang" },
  { id: "lost", en: "Lost", id_: "Kalah" },
];

/** Template checklist standar panitia (26 dokumen). */
const TEMPLATE: Record<Cat, string[]> = {
  administrative: [
    "Akta Pendirian & Perubahan", "SK Kemenkumham", "NIB / OSS", "NPWP Perusahaan", "PKP / SPPKP",
    "SPT Tahunan terakhir", "KTP Direksi", "Surat Kuasa (jika dikuasakan)", "Pakta Integritas",
    "Surat Pernyataan Bukan Daftar Hitam", "Laporan Keuangan / Neraca", "Jaminan Penawaran",
  ],
  technical: [
    "Metodologi & Rencana Kerja", "Jadwal Pelaksanaan", "Struktur Organisasi Proyek", "CV Tenaga Ahli",
    "Sertifikat Keahlian (SKA/SKK)", "Daftar Peralatan", "Pengalaman Kerja Sejenis (Kontrak/BAST)",
    "Spesifikasi Teknis / Brosur", "Sertifikat ISO / K3",
  ],
  commercial: [
    "Surat Penawaran Harga", "Rincian Anggaran Biaya (RAB)", "Analisa Harga Satuan", "Daftar Kuantitas & Harga",
    "TKDN (jika dipersyaratkan)",
  ],
};

interface Tender {
  id: string;
  code: string;
  title: string;
  agency: string | null;
  hps_value: number;
  deadline_at: string | null;
  status: string;
  pic_name: string | null;
  notes: string | null;
}
interface Doc {
  id: string;
  tender_id: string;
  category: string;
  name: string;
  is_mandatory: boolean;
  status: string;
  pic_name: string | null;
  expiry_date: string | null;
  file_ref: string | null;
  notes: string | null;
  sort_order: number;
  library_doc_id: string | null;
  file_path: string | null;
  file_name: string | null;
}

const lbl = (list: { id: string; en: string; id_: string }[], id: string, lang: string) => {
  const x = list.find((l) => l.id === id);
  return x ? (lang === "id" ? x.id_ : x.en) : id;
};

/** Dokumen yang tertaut pustaka selalu memakai berkas & masa berlaku terbaru. */
function mergeLib(docs: Doc[], lib: LibDoc[]): Doc[] {
  return docs.map((d) => {
    const linked = d.library_doc_id ? lib.find((x) => x.id === d.library_doc_id) : undefined;
    return linked
      ? { ...d, expiry_date: linked.expiry_date, file_path: linked.file_path, file_name: linked.file_name }
      : d;
  });
}

const isDone = (d: Doc) => d.status === "ready" || d.status === "verified";
const isExpired = (d: Doc, deadline: string | null) =>
  !!d.expiry_date && new Date(d.expiry_date) < new Date(deadline ?? Date.now());

function score(docs: Doc[], deadline: string | null) {
  const mand = docs.filter((d) => d.is_mandatory);
  const okMand = mand.filter((d) => isDone(d) && !isExpired(d, deadline)).length;
  const done = docs.filter(isDone).length;
  const expired = docs.filter((d) => isExpired(d, deadline)).length;
  return {
    total: docs.length,
    done,
    mand: mand.length,
    okMand,
    expired,
    pct: docs.length ? Math.round((done / docs.length) * 100) : 0,
    eligible: mand.length > 0 && okMand === mand.length,
  };
}

function daysLeft(deadline: string | null) {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
}

export function TenderView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [dlg, setDlg] = useState(false);
  const [form, setForm] = useState({ title: "", agency: "", hps_value: 0, deadline_at: "", pic_name: "", useTemplate: true });

  const { data: tenders = [], isLoading } = useQuery({
    queryKey: ["crm-tenders", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "crm_tenders", workspaceId, orderBy: "created_at", orderDir: "desc", limit: 500 },
      });
      return (data?.rows ?? []) as unknown as Tender[];
    },
  });

  const { data: allDocs = [] } = useQuery({
    queryKey: ["crm-tender-docs", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "crm_tender_docs", workspaceId, orderBy: "sort_order", orderDir: "asc", limit: 5000 },
      });
      return (data?.rows ?? []) as unknown as Doc[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const code = `TND-${String(tenders.length + 1).padStart(4, "0")}`;
      const tenderId = crypto.randomUUID();
      await upsertWorkspaceRows({
        data: {
          table: "crm_tenders",
          workspaceId,
          rows: [
            {
              id: tenderId,
              code,
              title: form.title,
              agency: form.agency || null,
              hps_value: Number(form.hps_value) || 0,
              deadline_at: sqlDateTimeOrNull(form.deadline_at),
              pic_name: form.pic_name || null,
              status: "preparing",
            },
          ],
        },
      });
      if (form.useTemplate) {
        let i = 0;
        const rows = (Object.keys(TEMPLATE) as Cat[]).flatMap((c) =>
          TEMPLATE[c].map((name) => ({
            id: crypto.randomUUID(),
            tender_id: tenderId,
            category: c,
            name,
            is_mandatory: true,
            status: "missing",
            sort_order: i++,
          })),
        );
        await upsertWorkspaceRows({ data: { table: "crm_tender_docs", workspaceId, rows } });
      }
      return tenderId;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["crm-tenders", workspaceId] });
      void qc.invalidateQueries({ queryKey: ["crm-tender-docs", workspaceId] });
      setDlg(false);
      setOpenId(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pager = usePagination(tenders, 12);
  const current = tenders.find((x) => x.id === openId);
  if (current) {
    return (
      <TenderDetail
        tender={current}
        docs={allDocs.filter((d) => d.tender_id === current.id)}
        workspaceId={workspaceId}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">QALLING CRM</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">
            {t("Tender Document Checklist", "Checklist Dokumen Tender")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Make sure administrative, technical and price documents are complete before the deadline.",
              "Pastikan dokumen administrasi, teknis, dan penawaran lengkap sebelum batas waktu.",
            )}
          </p>
        </div>
        <Button
          variant="navy"
          onClick={() => {
            setForm({ title: "", agency: "", hps_value: 0, deadline_at: "", pic_name: "", useTemplate: true });
            setDlg(true);
          }}
        >
          <Plus /> {t("New tender", "Tender baru")}
        </Button>
      </div>

      {isLoading ? (
        <PageSkeleton stats={3} columns={5} />
      ) : tenders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            <ListChecks className="mx-auto mb-3 h-8 w-8 text-gold" />
            {t("No tenders yet. Create one to start a checklist.", "Belum ada tender. Buat tender baru untuk mulai checklist.")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pager.items.map((tender) => {
            const s = score(
              allDocs.filter((d) => d.tender_id === tender.id),
              tender.deadline_at,
            );
            const dl = daysLeft(tender.deadline_at);
            return (
              <Card
                key={tender.id}
                className="cursor-pointer transition hover:border-gold"
                onClick={() => setOpenId(tender.id)}
              >
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">{tender.code}</p>
                      <p className="font-semibold text-navy dark:text-primary-foreground">{tender.title}</p>
                      <p className="text-xs text-muted-foreground">{tender.agency || "—"}</p>
                    </div>
                    <Badge variant="outline">{lbl(TENDER_STATUS, tender.status, lang)}</Badge>
                  </div>
                  <Progress value={s.pct} />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span>
                      {s.done}/{s.total} {t("docs ready", "dokumen siap")}
                    </span>
                    {s.eligible ? (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("Ready to submit", "Layak submit")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {s.mand - s.okMand} {t("mandatory missing", "wajib belum lengkap")}
                      </span>
                    )}
                  </div>
                  {dl !== null && (
                    <p className={`text-xs ${dl <= 3 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                      {dl < 0 ? t("Deadline passed", "Batas waktu lewat") : `${dl} ${t("days left", "hari lagi")}`} · HPS{" "}
                      {fmtIDR(tender.hps_value)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {!isLoading && tenders.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <PaginationBar p={pager} />
          </CardContent>
        </Card>
      )}

      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("New tender", "Tender baru")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <AdminField label={t("Tender title", "Nama paket tender")}>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </AdminField>
            <AdminField label={t("Agency / buyer", "Instansi / pemberi kerja")}>
              <Input value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} />
            </AdminField>
            <div className="grid grid-cols-2 gap-3">
              <AdminField label="HPS / Pagu">
                <Input
                  type="number"
                  value={form.hps_value}
                  onChange={(e) => setForm({ ...form, hps_value: Number(e.target.value) })}
                />
              </AdminField>
              <AdminField label={t("Submission deadline", "Batas upload")}>
                <Input
                  type="datetime-local"
                  value={form.deadline_at}
                  onChange={(e) => setForm({ ...form, deadline_at: e.target.value })}
                />
              </AdminField>
            </div>
            <AdminField label="PIC">
              <Input value={form.pic_name} onChange={(e) => setForm({ ...form, pic_name: e.target.value })} />
            </AdminField>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.useTemplate}
                onChange={(e) => setForm({ ...form, useTemplate: e.target.checked })}
              />
              {t(
                "Prefill with standard checklist template (26 docs)",
                "Isi otomatis dengan template checklist standar (26 dokumen)",
              )}
            </label>
          </div>
          <DialogFooter>
            <Button variant="navy" disabled={!form.title || create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="animate-spin" />} {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TenderDetail({
  tender,
  docs,
  workspaceId,
  onBack,
}: {
  tender: Tender;
  docs: Doc[];
  workspaceId: string;
  onBack: () => void;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const qc = useQueryClient();
  const { activeWorkspace } = useApp();
  const { data: lib = [] } = useDocLibrary(workspaceId);
  const { data: fillTemplates = [] } = useTenderTemplates(workspaceId, tender.id);
  const uploadFn = useServerFn(uploadWorkspaceFile);
  const merged = useMemo(() => mergeLib(docs, lib), [docs, lib]);
  const s = useMemo(() => score(merged, tender.deadline_at), [merged, tender.deadline_at]);
  const [newDoc, setNewDoc] = useState<Record<Cat, string>>({ administrative: "", technical: "", commercial: "" });
  const [uploading, setUploading] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["crm-tender-docs", workspaceId] });

  async function linkLib(d: Doc, libId: string) {
    const linked = lib.find((x) => x.id === libId);
    await patchDoc(
      d.id,
      linked
        ? {
            library_doc_id: linked.id,
            status: linked.file_path ? "ready" : d.status,
            expiry_date: linked.expiry_date,
          }
        : { library_doc_id: null },
    );
  }

  async function uploadRow(d: Doc, file: File) {
    setUploading(d.id);
    try {
      const path = await uploadWsFile(workspaceId, `crm/tenders/${tender.id}`, file, uploadFn);
      await patchDoc(d.id, { file_path: path, file_name: file.name, library_doc_id: null, status: "ready" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Upload failed", "Unggah gagal"));
    } finally {
      setUploading(null);
    }
  }

  async function saveToLib(d: Doc) {
    if (!d.file_path) return;
    try {
      const created = crypto.randomUUID();
      await upsertWorkspaceRows({
        data: {
          table: "crm_doc_library",
          workspaceId,
          rows: [
            {
              id: created,
              category: d.category,
              name: d.name,
              file_path: d.file_path,
              file_name: d.file_name,
              expiry_date: d.expiry_date,
              version: 1,
            },
          ],
        },
      });
      await patchDoc(d.id, { library_doc_id: created });
      await qc.invalidateQueries({ queryKey: ["crm-doc-library", workspaceId] });
      toast.success(t("Saved to library", "Disimpan ke pustaka"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Could not save", "Gagal menyimpan"));
    }
  }

  /** Menautkan dokumen checklist ke pustaka berdasarkan kemiripan nama. */
  async function autoFill() {
    const withFile = lib.filter((x) => x.file_path);
    let filled = 0;
    for (const d of docs) {
      if (d.library_doc_id || d.file_path) continue;
      const hit = matchLibrary(d.name, withFile);
      if (!hit) continue;
      await patchDoc(d.id, { library_doc_id: hit.id, status: "ready", expiry_date: hit.expiry_date });
      filled += 1;
    }
    await refresh();
    toast.success(
      filled
        ? t(`${filled} documents filled from library`, `${filled} dokumen terisi dari pustaka`)
        : t("No library match found", "Tidak ada dokumen pustaka yang cocok"),
    );
  }

  /** #52: mengunduh seluruh berkas checklist + template sebagai satu ZIP. */
  async function downloadZip() {
    const withFile = merged.filter((d) => d.file_path);
    if (!withFile.length && !fillTemplates.length) {
      toast.error(t("No files or templates attached", "Belum ada berkas atau template terlampir"));
      return;
    }
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const folders: Record<string, string> = {
        administrative: "1-Administrasi",
        technical: "2-Teknis",
        commercial: "3-Penawaran",
      };

      for (const category of CATS) {
        const list = merged.filter((d) => d.category === category.id);
        for (let i = 0; i < list.length; i += 1) {
          const doc = list[i];
          if (!doc.file_path) continue;
          const response = await fetch(`/api/workspace-files?path=${encodeURIComponent(doc.file_path)}`);
          if (!response.ok) continue;
          const blob = await response.blob();
          const fileName = doc.file_name ?? "";
          const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
          const name = `${String(i + 1).padStart(2, "0")}-${doc.name.replace(/[\\/:*?"<>|]+/g, "-")}${ext}`;
          zip.folder(folders[category.id])?.file(name, blob);
        }

        const categoryTemplates = fillTemplates.filter((template) => template.category === category.id);
        for (let i = 0; i < categoryTemplates.length; i += 1) {
          const template = categoryTemplates[i];
          const generated = await generateTenderDocx(template, activeWorkspace);
          const name = `${String(list.length + i + 1).padStart(2, "0")}-${template.name.replace(/[\\/:*?"<>|]+/g, "-")}-dengan-kop.docx`;
          zip.folder(folders[category.id])?.file(name, generated);
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `${tender.code}-${tender.title.replace(/[^\w]+/g, "_").slice(0, 40)}.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(anchor.href), 5000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Export failed", "Ekspor gagal"));
    } finally {
      setZipping(false);
    }
  }

  async function patchDoc(id: string, patch: Partial<Doc>) {
    try {
      await saveWorkspaceRow({ data: { table: "crm_tender_docs", workspaceId, id, data: patch } });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save document");
    }
  }

  async function addDoc(cat: Cat) {
    const name = newDoc[cat].trim();
    if (!name) return;
    try {
      await upsertWorkspaceRows({
        data: {
          table: "crm_tender_docs",
          workspaceId,
          rows: [
            {
              id: crypto.randomUUID(),
              tender_id: tender.id,
              category: cat,
              name,
              is_mandatory: true,
              status: "missing",
              sort_order: docs.length + 1,
            },
          ],
        },
      });
      setNewDoc({ ...newDoc, [cat]: "" });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add document");
    }
  }

  async function delDoc(id: string) {
    try {
      await deleteWorkspaceRow({ data: { table: "crm_tender_docs", workspaceId, id } });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete document");
    }
  }

  async function setStatus(status: string) {
    try {
      await saveWorkspaceRow({ data: { table: "crm_tenders", workspaceId, id: tender.id, data: { status } } });
      await qc.invalidateQueries({ queryKey: ["crm-tenders", workspaceId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
    }
  }

  async function delTender() {
    if (!confirm(t("Delete this tender and its checklist?", "Hapus tender ini beserta checklist-nya?"))) return;
    try {
      const rows = docs.filter((d) => d.tender_id === tender.id);
      for (const d of rows) {
        await deleteWorkspaceRow({ data: { table: "crm_tender_docs", workspaceId, id: d.id } });
      }
      await deleteWorkspaceRow({ data: { table: "crm_tenders", workspaceId, id: tender.id } });
      await qc.invalidateQueries({ queryKey: ["crm-tenders", workspaceId] });
      await refresh();
      onBack();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete tender");
    }
  }

  /** Lembar evaluasi kelengkapan dokumen — siap cetak/PDF dari browser. */
  function printSheet() {
    const esc = (v: string | null) => (v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
    const sections = CATS.map((c) => {
      const rows = merged
        .filter((d) => d.category === c.id)
        .map(
          (d, i) =>
            `<tr><td>${i + 1}</td><td>${esc(d.name)}${d.is_mandatory ? " *" : ""}</td><td>${lbl(DOC_STATUS, d.status, lang)}${isExpired(d, tender.deadline_at) ? " (EXPIRED)" : ""}</td><td>${esc(d.pic_name)}</td><td>${d.expiry_date ?? ""}</td><td>${esc(d.file_name)}${d.notes ? ` — ${esc(d.notes)}` : ""}</td></tr>`,
        )
        .join("");
      return `<h3>${lang === "id" ? c.id_ : c.en}</h3><table><tr><th>#</th><th>Dokumen</th><th>Status</th><th>PIC</th><th>Berlaku s/d</th><th>Catatan</th></tr>${rows}</table>`;
    }).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${esc(tender.code)}</title><style>body{font-family:Arial;font-size:11px;padding:24px}table{width:100%;border-collapse:collapse;margin-bottom:12px}td,th{border:1px solid #999;padding:4px;text-align:left}h3{margin:14px 0 4px}.sig{display:flex;justify-content:space-between;margin-top:40px}</style></head><body>
      <h2>Lembar Evaluasi Kelengkapan Dokumen Tender</h2>
      <p><b>${esc(tender.code)} — ${esc(tender.title)}</b><br/>Instansi: ${esc(tender.agency)}<br/>Batas waktu: ${tender.deadline_at ? new Date(tender.deadline_at).toLocaleString("id-ID") : "-"}<br/>Kelengkapan: ${s.done}/${s.total} (${s.pct}%) · Wajib lengkap: ${s.okMand}/${s.mand} · Status: ${s.eligible ? "LAYAK SUBMIT" : "BELUM LAYAK"}</p>
      ${sections}<p>* = wajib</p>
      <div class="sig"><div>Disiapkan oleh,<br/><br/><br/><br/>( ${esc(tender.pic_name) || "................"} )</div><div>Disetujui oleh,<br/><br/><br/><br/>( ................ )</div></div>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  const dl = daysLeft(tender.deadline_at);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft /> {t("Back", "Kembali")}
          </Button>
          <div>
            <p className="text-xs text-muted-foreground">
              {tender.code} · {tender.agency || "—"}
            </p>
            <h1 className="text-xl font-semibold text-navy dark:text-primary-foreground">{tender.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AdminSelect value={tender.status} onChange={(v) => void setStatus(v)}>
            {TENDER_STATUS.map((x) => (
              <option key={x.id} value={x.id}>
                {lang === "id" ? x.id_ : x.en}
              </option>
            ))}
          </AdminSelect>
          <Button variant="outline" onClick={() => void autoFill()}>
            <Wand2 /> {t("Autofill from library", "Isi otomatis dari pustaka")}
          </Button>
          <Button variant="outline" disabled={zipping} onClick={() => void downloadZip()}>
            {zipping ? <Loader2 className="animate-spin" /> : <FileArchive />}
            {t("Download package (ZIP)", "Unduh paket (ZIP)")}
          </Button>
          <Button variant="outline" onClick={printSheet}>
            <Printer /> {t("Print evaluation", "Cetak lembar evaluasi")}
          </Button>
          <Button variant="ghost" size="icon" onClick={delTender}>
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("Completion", "Kelengkapan")}</p>
            <p className="text-2xl font-semibold">{s.pct}%</p>
            <Progress value={s.pct} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("Mandatory docs", "Dokumen wajib")}</p>
            <p className="text-2xl font-semibold">
              {s.okMand}/{s.mand}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("Expired", "Kedaluwarsa")}</p>
            <p className={`text-2xl font-semibold ${s.expired ? "text-destructive" : ""}`}>{s.expired}</p>
          </CardContent>
        </Card>
        <Card className={s.eligible ? "border-emerald-500" : "border-destructive"}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              {t("Eligibility", "Kelayakan")}
              {dl !== null && ` · ${dl < 0 ? t("passed", "lewat") : `${dl} ${t("days", "hari")}`}`}
            </p>
            <p className={`text-lg font-semibold ${s.eligible ? "text-emerald-600" : "text-destructive"}`}>
              {s.eligible ? t("Ready to submit", "Layak submit") : t("Not ready", "Belum layak")}
            </p>
          </CardContent>
        </Card>
      </div>

      <TenderTemplates workspaceId={workspaceId} tenderId={tender.id} docs={merged} />

      {CATS.map((c) => {
        const list = merged.filter((d) => d.category === c.id);
        const done = list.filter(isDone).length;
        return (
          <Card key={c.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-navy dark:text-primary-foreground">{lang === "id" ? c.id_ : c.en}</h2>
                <Badge variant="outline">
                  {done}/{list.length}
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">✓</TableHead>
                      <TableHead>{t("Document", "Dokumen")}</TableHead>
                      <TableHead className="w-20">{t("Required", "Wajib")}</TableHead>
                      <TableHead className="w-36">Status</TableHead>
                      <TableHead className="w-32">PIC</TableHead>
                      <TableHead className="w-40">{t("Valid until", "Berlaku s/d")}</TableHead>
                      <TableHead>{t("File & notes", "File & catatan")}</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((d) => {
                      const exp = isExpired(d, tender.deadline_at);
                      return (
                        <TableRow key={d.id} className={exp ? "bg-destructive/5" : ""}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={isDone(d)}
                              onChange={(e) => void patchDoc(d.id, { status: e.target.checked ? "ready" : "missing" })}
                            />
                          </TableCell>
                          <TableCell className={isDone(d) ? "text-muted-foreground line-through" : ""}>
                            {d.name}
                            {exp && (
                              <Badge variant="destructive" className="ml-2">
                                Expired
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={Boolean(d.is_mandatory)}
                              onChange={(e) => void patchDoc(d.id, { is_mandatory: e.target.checked })}
                            />
                          </TableCell>
                          <TableCell>
                            <AdminSelect value={d.status} onChange={(v) => void patchDoc(d.id, { status: v })}>
                              {DOC_STATUS.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {lang === "id" ? x.id_ : x.en}
                                </option>
                              ))}
                            </AdminSelect>
                          </TableCell>
                          <TableCell>
                            <Input
                              defaultValue={d.pic_name ?? ""}
                              onBlur={(e) =>
                                e.target.value !== (d.pic_name ?? "") &&
                                void patchDoc(d.id, { pic_name: e.target.value || null })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              defaultValue={d.expiry_date ?? ""}
                              onBlur={(e) =>
                                e.target.value !== (d.expiry_date ?? "") &&
                                void patchDoc(d.id, { expiry_date: e.target.value || null })
                              }
                            />
                          </TableCell>
                          <TableCell className="min-w-56 space-y-1">
                            <div className="flex items-center gap-1">
                              <AdminSelect
                                className="h-8 text-xs"
                                value={d.library_doc_id ?? ""}
                                onChange={(v) => void linkLib(d, v)}
                              >
                                <option value="">
                                  {t("— Pick from library —", "— Ambil dari pustaka —")}
                                </option>
                                {lib.map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {l.name}
                                  </option>
                                ))}
                              </AdminSelect>
                              <label
                                className="cursor-pointer rounded p-1 hover:bg-muted"
                                title={t("Upload tender-specific file", "Unggah berkas khusus tender ini")}
                              >
                                {uploading === d.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Upload className="h-4 w-4" />
                                )}
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) void uploadRow(d, file);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>
                            {d.file_path ? (
                              <div className="flex items-center gap-2 text-xs">
                                <button
                                  className="truncate text-primary underline"
                                  onClick={() => d.file_path && openWsFile(d.file_path)}
                                >
                                  {d.file_name}
                                </button>
                                {!d.library_doc_id && (
                                  <button
                                    className="whitespace-nowrap text-gold underline"
                                    onClick={() => void saveToLib(d)}
                                  >
                                    {t("Save to library", "Simpan ke pustaka")}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">{t("No file yet", "Belum ada berkas")}</p>
                            )}
                            <Input
                              className="h-8 text-xs"
                              placeholder={t("Notes", "Catatan")}
                              defaultValue={d.notes ?? ""}
                              onBlur={(e) =>
                                e.target.value !== (d.notes ?? "") && void patchDoc(d.id, { notes: e.target.value || null })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => void delDoc(d.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder={t("Add required document…", "Tambah dokumen persyaratan…")}
                  value={newDoc[c.id]}
                  onChange={(e) => setNewDoc({ ...newDoc, [c.id]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && void addDoc(c.id)}
                />
                <Button variant="outline" onClick={() => void addDoc(c.id)}>
                  <Plus />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
