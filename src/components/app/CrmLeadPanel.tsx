import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  MessageSquare,
  Phone,
  StickyNote,
  Users,
  Flag,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  completeLeadTask,
  getLeadDetail,
  logLeadActivity,
  snoozeLeadFollowUp,
} from "@/lib/lead-followup.functions";
import { useI18n } from "@/lib/i18n";

const TYPES = ["note", "call", "message", "meeting", "task"] as const;
const ICON: Record<string, typeof StickyNote> = {
  note: StickyNote,
  call: Phone,
  message: MessageSquare,
  meeting: Users,
  task: Flag,
};
const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
const when = (v: string) =>
  new Date(`${v.replace(" ", "T")}Z`).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const plusDays = (n: number) =>
  new Date(Date.now() + 7 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);

export function LeadPanel({
  workspaceId,
  leadId,
  onClose,
}: {
  workspaceId: string;
  leadId: string | null;
  onClose: () => void;
}) {
  const { pick } = useI18n();
  const qc = useQueryClient();
  const [type, setType] = useState<(typeof TYPES)[number]>("note");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const key = ["lead-detail", workspaceId, leadId];
  const q = useQuery({
    queryKey: key,
    enabled: Boolean(leadId),
    queryFn: () => getLeadDetail({ data: { workspaceId, leadId: leadId! } }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["lead-health", workspaceId] });
    qc.invalidateQueries({ queryKey: ["crm-leads", workspaceId] });
    qc.invalidateQueries({ queryKey: ["crm-activities", workspaceId] });
  };
  const add = useMutation({
    mutationFn: () =>
      logLeadActivity({
        data: {
          workspaceId,
          leadId: leadId!,
          type,
          subject: subject.trim(),
          body: body.trim() || null,
          dueAt: due || null,
        },
      }),
    onSuccess: () => {
      setSubject("");
      setBody("");
      setDue("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const done = useMutation({
    mutationFn: (activityId: string) => completeLeadTask({ data: { workspaceId, activityId } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const snooze = useMutation({
    mutationFn: (date: string | null) =>
      snoozeLeadFollowUp({ data: { workspaceId, leadId: leadId!, date } }),
    onSuccess: () => {
      toast.success(pick("Follow-up updated", "Follow-up diperbarui"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = q.data;
  return (
    <Sheet open={Boolean(leadId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{d?.lead.name ?? pick("Lead", "Prospek")}</SheetTitle>
        </SheetHeader>
        {q.isLoading && (
          <p className="mt-4 text-sm text-muted-foreground">{pick("Loading…", "Memuat…")}</p>
        )}
        {q.error && <p className="mt-4 text-sm text-destructive">{(q.error as Error).message}</p>}
        {d && (
          <div className="mt-4 space-y-5 text-sm">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{d.lead.stage}</Badge>
                <span className="font-semibold">{idr(d.lead.value)}</span>
                <span className="text-muted-foreground">{d.lead.code}</span>
              </div>
              <p className="text-muted-foreground">
                {[d.lead.company, d.lead.phone, d.lead.email].filter(Boolean).join(" · ") || "—"}
              </p>
              <p className="text-muted-foreground">
                {pick("Owner", "Penanggung jawab")}: {d.lead.owner ?? "—"}
              </p>
              {(d.lead.sourcePost || d.lead.sourceCampaign) && (
                <p className="text-muted-foreground">
                  {pick("Content source", "Konten sumber")}:{" "}
                  {d.lead.sourcePost ?? d.lead.sourceCampaign}
                </p>
              )}
              {d.lead.notes && <p className="rounded-md bg-secondary/50 p-2">{d.lead.notes}</p>}
            </div>

            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-2 font-medium">
                <CalendarClock className="h-4 w-4" />{" "}
                {pick("Next follow-up", "Follow-up berikutnya")}:{" "}
                {d.lead.nextFollowUp ?? pick("not set", "belum diatur")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[1, 3, 7].map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant="outline"
                    onClick={() => snooze.mutate(plusDays(n))}
                  >
                    {pick(`In ${n} days`, `${n} hari lagi`)}
                  </Button>
                ))}
                {d.lead.nextFollowUp && (
                  <Button size="sm" variant="ghost" onClick={() => snooze.mutate(null)}>
                    {pick("Clear", "Hapus")}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <p className="font-medium">
                {pick("Log activity or add task", "Catat aktivitas atau tambah tugas")}
              </p>
              <div className="flex flex-wrap gap-1">
                {TYPES.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={type === t ? "default" : "outline"}
                    onClick={() => setType(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={pick("Subject", "Judul")}
                maxLength={255}
              />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={pick("Details (optional)", "Detail (opsional)")}
                rows={2}
                maxLength={5000}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="w-auto"
                  aria-label={pick("Due", "Tenggat")}
                />
                <span className="text-xs text-muted-foreground">
                  {pick(
                    "Set a due time to make it a task.",
                    "Isi tenggat untuk menjadikannya tugas.",
                  )}
                </span>
              </div>
              <Button disabled={!subject.trim() || add.isPending} onClick={() => add.mutate()}>
                {pick("Save", "Simpan")}
              </Button>
            </div>

            <div>
              <p className="mb-2 font-medium">{pick("Timeline", "Linimasa")}</p>
              <ol className="space-y-3 border-l pl-4">
                {d.timeline.map((it, i) => {
                  const Icon =
                    it.kind === "activity"
                      ? (ICON[it.title.split(":")[0]] ?? StickyNote)
                      : it.kind === "message"
                        ? MessageSquare
                        : CheckCircle2;
                  return (
                    <li key={`${it.at}-${i}`} className="relative">
                      <Icon className="absolute -left-[26px] top-0.5 h-4 w-4 rounded-full bg-background text-muted-foreground" />
                      <p className={it.done ? "text-muted-foreground line-through" : "font-medium"}>
                        {it.title}
                      </p>
                      {it.body && <p className="text-muted-foreground">{it.body}</p>}
                      <p className="text-xs text-muted-foreground">
                        {when(it.at)}
                        {it.dueAt ? ` · ${pick("due", "tenggat")} ${when(it.dueAt)}` : ""}
                      </p>
                      {it.kind === "activity" && it.dueAt && !it.done && it.activityId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          onClick={() => done.mutate(it.activityId!)}
                        >
                          {pick("Mark done", "Tandai selesai")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
