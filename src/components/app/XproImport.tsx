/**
 * XPro — impor tugas dari Excel (Backlog & papan tim). Template berisi lembar Tugas + Referensi
 * (kode proyek, tahapan, sprint, email anggota) agar pengisian cepat dan cocok saat diimpor.
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { useT, useXproPeople } from "@/components/app/XproTasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listWorkspaceRows } from "@/lib/data.functions";
import { cn } from "@/lib/utils";
import { type XproImportRow, importXproTasks } from "@/lib/xpro-tasks.functions";

type Field = keyof XproImportRow;

/** Judul kolom template → field. Header dinormalkan (huruf kecil, tanpa simbol). */
const HEADERS: { field: Field; title: string; aliases: string[]; backlogOnly?: boolean }[] = [
  {
    field: "name",
    title: "Nama Tugas*",
    aliases: ["namatugas", "nama", "tugas", "task", "taskname", "name"],
  },
  { field: "description", title: "Deskripsi", aliases: ["deskripsi", "description", "keterangan"] },
  {
    field: "project_code",
    title: "Kode Proyek",
    aliases: ["kodeproyek", "proyek", "project", "projectcode"],
  },
  { field: "milestone", title: "Tahapan", aliases: ["tahapan", "milestone"] },
  {
    field: "assignees",
    title: "PIC (email/nama, pisah koma)",
    aliases: ["pic", "picemailnamapisahkoma", "assignee", "assignees", "penanggungjawab"],
  },
  {
    field: "priority",
    title: "Prioritas (rendah/sedang/tinggi/mendesak)",
    aliases: ["prioritas", "prioritasrendahsedangtinggimendesak", "priority"],
  },
  {
    field: "estimate_hours",
    title: "Estimasi Jam",
    aliases: ["estimasijam", "estimasi", "jam", "estimate", "estimatehours", "hours"],
  },
  {
    field: "start_date",
    title: "Mulai (YYYY-MM-DD)",
    aliases: ["mulai", "mulaiyyyymmdd", "tanggalmulai", "start", "startdate"],
  },
  {
    field: "due_date",
    title: "Tenggat (YYYY-MM-DD)",
    aliases: ["tenggat", "tenggatyyyymmdd", "deadline", "due", "duedate", "jatuhtempo"],
  },
  { field: "sprint", title: "Sprint", aliases: ["sprint"], backlogOnly: true },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // xlsx cellDates memberi Date lokal; ambil tanggal kalendernya.
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // 31/12/2026
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return s; // dibiarkan; server memberi peringatan
}

export function XproImportButton({
  workspaceId,
  backlog,
  defaultProjectId,
  className,
}: {
  workspaceId: string;
  /** true = impor ke Backlog (khusus pengelola); false = langsung ke papan tim. */
  backlog: boolean;
  defaultProjectId?: string | null;
  className?: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<XproImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{
    created: number;
    warnings: { row: number; message: string }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const people = useXproPeople(workspaceId).data?.people ?? [];
  const refs = useQuery({
    queryKey: ["xpro", "import-refs", workspaceId],
    enabled: open,
    queryFn: async () => {
      const get = async (table: string) =>
        (
          (await listWorkspaceRows({
            data: { table, workspaceId, orderBy: "created_at", orderDir: "asc", limit: 1000 },
          })) as unknown as { rows?: Record<string, unknown>[] }
        ).rows ?? [];
      const [projects, milestones] = await Promise.all([
        get("prj_projects"),
        get("prj_milestones"),
      ]);
      return { projects, milestones };
    },
  });
  const headers = HEADERS.filter((h) => backlog || !h.backlogOnly);

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const p0 = refs.data?.projects[0];
    const example = (name: string, extra: Partial<Record<Field, string | number>>) =>
      Object.fromEntries(
        headers.map((h) => [h.title, (h.field === "name" ? name : extra[h.field]) ?? ""]),
      );
    const ws = XLSX.utils.json_to_sheet([
      example("Siapkan dokumen penawaran", {
        description: "Lengkapi RAB & jadwal",
        project_code: String(p0?.code ?? ""),
        assignees: people[0]?.email ?? "",
        priority: "tinggi",
        estimate_hours: 6,
        start_date: "2026-11-16",
        due_date: "2026-11-20",
      }),
      example("Rapat koordinasi mingguan", { priority: "sedang", estimate_hours: 1 }),
    ]);
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.title.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, "Tugas");
    const ref: Record<string, string>[] = [];
    const projects = refs.data?.projects ?? [];
    const max = Math.max(projects.length, people.length, 1);
    for (let i = 0; i < max; i++) {
      const p = projects[i];
      const ms = p
        ? (refs.data?.milestones ?? [])
            .filter((m) => m.project_id === p.id)
            .map((m) => String(m.name))
        : [];
      ref.push({
        "Kode Proyek": p ? String(p.code) : "",
        "Nama Proyek": p ? String(p.name) : "",
        "Tahapan di proyek ini": ms.join(" | "),
        "PIC — email": people[i]?.email ?? "",
        "PIC — nama": people[i]?.name ?? "",
      });
    }
    const wr = XLSX.utils.json_to_sheet(ref);
    wr["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 40 }, { wch: 28 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wr, "Referensi");
    XLSX.writeFile(wb, backlog ? "template-backlog-xpro.xlsx" : "template-tugas-xpro.xlsx");
  };

  const readFile = async (file: File) => {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheet = wb.Sheets["Tugas"] ?? wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
    const map = new Map<string, Field>();
    for (const h of headers) for (const a of [norm(h.title), ...h.aliases]) map.set(a, h.field);
    const out: XproImportRow[] = [];
    for (const r of raw) {
      const row: Partial<Record<Field, unknown>> = {};
      for (const [k, v] of Object.entries(r)) {
        const f = map.get(norm(k));
        if (f) row[f] = v;
      }
      if (!Object.values(row).some((v) => String(v ?? "").trim())) continue; // baris kosong
      out.push({
        name: String(row.name ?? "").trim(),
        description: String(row.description ?? "").trim() || null,
        project_code: String(row.project_code ?? "").trim() || null,
        milestone: String(row.milestone ?? "").trim() || null,
        assignees: String(row.assignees ?? "").trim() || null,
        priority: String(row.priority ?? "").trim() || null,
        estimate_hours:
          row.estimate_hours === "" || row.estimate_hours === undefined
            ? null
            : (row.estimate_hours as number | string),
        start_date: toIsoDate(row.start_date),
        due_date: toIsoDate(row.due_date),
        sprint: String(row.sprint ?? "").trim() || null,
      });
    }
    if (!out.length) {
      toast.error(t("No rows found. Use the template.", "Tidak ada baris. Gunakan template."));
      return;
    }
    setFileName(file.name);
    setRows(out);
    setResult(null);
  };

  const run = useMutation({
    mutationFn: () =>
      importXproTasks({
        data: { workspaceId, backlog, defaultProjectId: defaultProjectId ?? null, rows },
      }),
    onSuccess: (r) => {
      setResult(r);
      setRows([]);
      qc.invalidateQueries({ queryKey: ["xpro"] });
      toast.success(t(`${r.created} tasks imported`, `${r.created} tugas diimpor`));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const missingName = rows.filter((r) => !r.name).length;
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setRows([]);
      setResult(null);
      setFileName("");
    }
  };

  return (
    <>
      <Button variant="outline" className={className} onClick={() => setOpen(true)}>
        <FileSpreadsheet /> {t("Import Excel", "Impor Excel")}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {backlog
                ? t("Import tasks to Backlog", "Impor tugas ke Backlog")
                : t("Import tasks", "Impor tugas")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "1) Download the template, 2) fill the Tasks sheet (see the Reference sheet for project codes, milestones and PIC emails), 3) upload it here.",
                "1) Unduh template, 2) isi lembar Tugas (lihat lembar Referensi untuk kode proyek, tahapan, dan email PIC), 3) unggah di sini.",
              )}
              {defaultProjectId &&
                " " +
                  t(
                    "Rows without a project code go to the selected project.",
                    "Baris tanpa kode proyek masuk ke proyek yang sedang dipilih.",
                  )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadTemplate} disabled={refs.isLoading}>
              <Download /> {t("Download template", "Unduh template")}
            </Button>
            <Button variant="navy" onClick={() => fileRef.current?.click()}>
              <Upload /> {t("Choose Excel file", "Pilih file Excel")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readFile(f).catch((err) => toast.error(String(err)));
                e.target.value = "";
              }}
            />
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm">
                <b>{fileName}</b> · {rows.length} {t("rows", "baris")}
                {missingName > 0 && (
                  <span className="ml-2 text-destructive">
                    {missingName}{" "}
                    {t("without a task name (skipped)", "tanpa nama tugas (dilewati)")}
                  </span>
                )}
              </p>
              <div className="max-h-72 overflow-auto rounded-xl border border-border">
                <table className="q-keep w-full min-w-[640px] text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left">#</th>
                      {headers.map((h) => (
                        <th
                          key={h.field}
                          className="whitespace-nowrap px-2 py-1.5 text-left font-medium"
                        >
                          {h.title.replace(/ \(.*\)/, "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((r, i) => (
                      <tr
                        key={i}
                        className={cn("border-t border-border", !r.name && "bg-destructive/10")}
                      >
                        <td className="px-2 py-1 text-muted-foreground">{i + 2}</td>
                        {headers.map((h) => (
                          <td key={h.field} className="max-w-[12rem] truncate px-2 py-1">
                            {String(r[h.field] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 100 && (
                <p className="text-xs text-muted-foreground">
                  {t("Showing the first 100 rows.", "Menampilkan 100 baris pertama.")}
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                {t(`${result.created} tasks created.`, `${result.created} tugas dibuat.`)}
              </p>
              {result.warnings.length > 0 && (
                <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-amber-700 dark:text-amber-300">
                  {result.warnings.map((w, i) => (
                    <li key={i}>
                      {t("Row", "Baris")} {w.row}: {w.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {t("Close", "Tutup")}
            </Button>
            <Button
              variant="navy"
              disabled={!rows.length || rows.length === missingName || run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending && <Loader2 className="animate-spin" />}
              {t(
                `Import ${rows.length - missingName} tasks`,
                `Impor ${rows.length - missingName} tugas`,
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
