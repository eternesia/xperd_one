import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AuditTrailView } from "@/components/app/AuditTrailView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelPostApproval,
  createReportLink,
  listPostApprovals,
  listReportLinks,
  requestPostApproval,
  revokeReportLink,
} from "@/lib/agency.functions";
import { listWorkspaceRows } from "@/lib/data.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { qallingPublicUrl } from "@/lib/qalling-urls";

const publicLink = (kind: "approve" | "report", token: string) =>
  qallingPublicUrl(new URL(`${window.location.origin}/qalling/${kind}/${token}`)).toString();

const copy = (text: string, ok: string) =>
  navigator.clipboard?.writeText(text).then(() => toast.success(ok));

const STATUS: Record<
  string,
  [string, string, "default" | "secondary" | "destructive" | "outline"]
> = {
  pending: ["Waiting for client", "Menunggu klien", "outline"],
  approved: ["Approved", "Disetujui", "default"],
  changes_requested: ["Changes requested", "Perlu revisi", "destructive"],
  cancelled: ["Cancelled", "Dibatalkan", "secondary"],
};

function ApprovalsTab({ ws }: { ws: string }) {
  const { pick } = useI18n();
  const qc = useQueryClient();
  const [postId, setPostId] = useState("");
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const list = useQuery({
    queryKey: ["post-approvals", ws],
    queryFn: () => listPostApprovals({ data: { workspaceId: ws } }),
  });
  const posts = useQuery({
    queryKey: ["approval-candidates", ws],
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: {
          table: "crm_scheduled_posts",
          workspaceId: ws,
          orderBy: "scheduled_at",
          orderDir: "desc",
          limit: 100,
        },
      });
      return ((res?.rows ?? []) as { id: string; title: string; status: string }[]).filter((p) =>
        ["draft", "scheduled"].includes(p.status),
      );
    },
  });
  const create = useMutation({
    mutationFn: () =>
      requestPostApproval({
        data: {
          workspaceId: ws,
          postId,
          clientLabel: label || undefined,
          message: message || undefined,
        },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["post-approvals", ws] });
      qc.invalidateQueries({ queryKey: ["approval-candidates", ws] });
      copy(
        publicLink("approve", r.token),
        pick("Link copied — send it to your client", "Link disalin — kirim ke klien Anda"),
      );
      setPostId("");
      setMessage("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: (approvalId: string) =>
      cancelPostApproval({ data: { workspaceId: ws, approvalId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["post-approvals", ws] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {pick("Request client approval", "Minta persetujuan klien")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {pick(
              "Pick a draft or scheduled post. It is held as a draft and a private link is created; your client can approve it or request changes without logging in. Approved posts return to their schedule automatically.",
              "Pilih draft atau postingan terjadwal. Postingan ditahan sebagai draft dan dibuat link privat; klien bisa menyetujui atau meminta revisi tanpa login. Postingan yang disetujui kembali ke jadwalnya secara otomatis.",
            )}
          </p>
          <select
            value={postId}
            onChange={(e) => setPostId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            aria-label={pick("Post", "Postingan")}
          >
            <option value="">{pick("Choose a post…", "Pilih postingan…")}</option>
            {(posts.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.status})
              </option>
            ))}
          </select>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={pick("Client name (optional)", "Nama klien (opsional)")}
            maxLength={120}
          />
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={pick("Message to the client (optional)", "Pesan untuk klien (opsional)")}
            maxLength={2000}
            rows={2}
          />
          <Button disabled={!postId || create.isPending} onClick={() => create.mutate()}>
            <Plus className="h-4 w-4" /> {pick("Create approval link", "Buat link persetujuan")}
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {(list.data ?? []).map((a) => {
          const st = STATUS[a.status] ?? STATUS.pending;
          return (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.post_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.client_label ? `${a.client_label} · ` : ""}
                    {a.client_name ? `${a.client_name}: ` : ""}
                    {a.client_comment ?? ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={st[2]}>{pick(st[0], st[1])}</Badge>
                  {a.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copy(publicLink("approve", a.token), pick("Link copied", "Link disalin"))
                        }
                      >
                        <Copy className="h-4 w-4" /> {pick("Copy link", "Salin link")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => cancel.mutate(a.id)}>
                        {pick("Cancel", "Batalkan")}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {list.data?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {pick("No approval requests yet.", "Belum ada permintaan persetujuan.")}
          </p>
        )}
      </div>
    </div>
  );
}

function ReportsTab({ ws }: { ws: string }) {
  const { pick } = useI18n();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [logo, setLogo] = useState("");
  const [days, setDays] = useState(30);
  const [group, setGroup] = useState("");
  const links = useQuery({
    queryKey: ["report-links", ws],
    queryFn: () => listReportLinks({ data: { workspaceId: ws } }),
  });
  const groups = useQuery({
    queryKey: ["client-groups", ws],
    queryFn: async () =>
      ((
        await listWorkspaceRows({
          data: {
            table: "crm_client_groups",
            workspaceId: ws,
            orderBy: "name",
            orderDir: "asc",
            limit: 500,
          },
        })
      )?.rows ?? []) as { id: string; name: string }[],
  });
  const create = useMutation({
    mutationFn: () =>
      createReportLink({
        data: {
          workspaceId: ws,
          title,
          brandName: brand,
          brandColor: color,
          logoUrl: logo || null,
          clientGroupId: group || null,
          periodDays: days,
        },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["report-links", ws] });
      copy(
        publicLink("report", r.token),
        pick("Link copied — share it with your client", "Link disalin — bagikan ke klien Anda"),
      );
      setTitle("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeReportLink({ data: { workspaceId: ws, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-links", ws] }),
  });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {pick("White-label client report", "Laporan klien white-label")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {pick(
              "Creates a live link that always shows the latest numbers under your agency's name, logo and colour — no Qalling branding. Revoke it any time.",
              "Membuat link langsung yang selalu menampilkan angka terbaru dengan nama, logo, dan warna agensi Anda — tanpa merek Qalling. Bisa dicabut kapan saja.",
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={pick(
                "Report title, e.g. November report",
                "Judul laporan, mis. Laporan November",
              )}
              maxLength={150}
            />
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder={pick("Agency / brand name", "Nama agensi / brand")}
              maxLength={120}
            />
            <Input
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              placeholder={pick("Logo URL (https, optional)", "URL logo (https, opsional)")}
              maxLength={500}
            />
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 rounded border"
                aria-label={pick("Brand colour", "Warna brand")}
              />
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
                aria-label={pick("Period", "Periode")}
              >
                {[7, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {pick(`Last ${d} days`, `${d} hari terakhir`)}
                  </option>
                ))}
              </select>
            </div>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm sm:col-span-2"
              aria-label={pick("Client", "Klien")}
            >
              <option value="">
                {pick("All accounts (includes leads)", "Semua akun (termasuk prospek)")}
              </option>
              {(groups.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            disabled={!title.trim() || !brand.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            <Plus className="h-4 w-4" /> {pick("Create report link", "Buat link laporan")}
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {(links.data ?? []).map((l) => (
          <Card key={l.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.title}</p>
                <p className="text-xs text-muted-foreground">
                  {l.brand_name} · {pick(`${l.period_days} days`, `${l.period_days} hari`)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {l.revoked_at ? (
                  <Badge variant="secondary">{pick("Revoked", "Dicabut")}</Badge>
                ) : (
                  <>
                    <Button size="sm" variant="outline" asChild>
                      <a href={publicLink("report", l.token)} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" /> {pick("Open", "Buka")}
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copy(publicLink("report", l.token), pick("Link copied", "Link disalin"))
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={pick("Revoke", "Cabut")}
                      onClick={() => revoke.mutate(l.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AgencyPage() {
  const { activeWorkspace, entitlements } = useApp();
  const { pick } = useI18n();
  const ws = activeWorkspace?.id;
  if (!ws) return null;
  const feats =
    (entitlements as Record<string, { features?: Record<string, boolean> }>).qalling?.features ??
    {};
  const locked = (k: string) => feats[k] !== true && feats.legacy !== true;
  const Locked = (
    <p className="rounded-lg border bg-secondary/40 p-6 text-sm text-muted-foreground">
      {pick(
        "This feature is part of the Agency plan. Upgrade from Billing to unlock it.",
        "Fitur ini bagian dari paket Agency. Upgrade dari menu Tagihan untuk membukanya.",
      )}
    </p>
  );
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-navy dark:text-foreground">
          {pick("Agency Studio", "Studio Agency")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {pick(
            "Client approvals, white-label reports and an activity log for your team.",
            "Persetujuan klien, laporan white-label, dan log aktivitas untuk tim Anda.",
          )}
        </p>
      </div>
      <Tabs defaultValue="approvals">
        <TabsList>
          <TabsTrigger value="approvals">{pick("Approvals", "Persetujuan")}</TabsTrigger>
          <TabsTrigger value="reports">{pick("Client reports", "Laporan klien")}</TabsTrigger>
          <TabsTrigger value="log">{pick("Activity log", "Log aktivitas")}</TabsTrigger>
        </TabsList>
        <TabsContent value="approvals">
          {locked("client_approval") ? Locked : <ApprovalsTab ws={ws} />}
        </TabsContent>
        <TabsContent value="reports">
          {locked("white_label_reports") ? Locked : <ReportsTab ws={ws} />}
        </TabsContent>
        <TabsContent value="log">
          {locked("activity_log") ? Locked : <AuditTrailView workspaceId={ws} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
