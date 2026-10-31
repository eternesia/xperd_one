import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow } from "@/lib/data.functions";
import { assignAccountClient } from "@/lib/clients.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { SocialIcon } from "@/components/qalling/SocialIcon";

export const Route = createFileRoute("/qalling/app/clients")({
  head: () => ({
    meta: [
      { title: "Klien & Brand — Qalling" },
      { name: "description", content: "Kelompokkan akun media sosial per klien atau brand." },
      { property: "og:title", content: "Klien & Brand — Qalling" },
      { property: "og:description", content: "Kelompokkan akun media sosial per klien atau brand." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const { activeWorkspace } = useApp();
  const { pick } = useI18n();
  const ws = activeWorkspace?.id;
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const groups = useQuery({
    queryKey: ["client-groups", ws],
    enabled: Boolean(ws),
    queryFn: async () => {
      const res = await listWorkspaceRows({ data: { table: "crm_client_groups", workspaceId: ws!, orderBy: "name", orderDir: "asc", limit: 500 } });
      return (res?.rows ?? []) as { id: string; name: string }[];
    },
  });
  const accounts = useQuery({
    queryKey: ["client-accounts", ws],
    enabled: Boolean(ws),
    queryFn: async () => {
      const res = await listWorkspaceRows({ data: { table: "crm_social_accounts", workspaceId: ws!, orderBy: "account_name", orderDir: "asc", limit: 500 } });
      return (res?.rows ?? []) as { id: string; platform: string; account_name: string; handle: string | null; client_group_id: string | null }[];
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["client-groups", ws] });
    qc.invalidateQueries({ queryKey: ["client-accounts", ws] });
  };
  const add = useMutation({
    mutationFn: async () => {
      await saveWorkspaceRow({ data: { table: "crm_client_groups", workspaceId: ws!, data: { name: name.trim() } } });
    },
    onSuccess: () => { setName(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "crm_client_groups", workspaceId: ws!, id } });
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const assign = useMutation({
    mutationFn: async ({ id, group }: { id: string; group: string | null }) => {
      await assignAccountClient({ data: { workspaceId: ws!, accountId: id, groupId: group } });
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const accs = accounts.data ?? [];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{pick("Clients & brands", "Klien & Brand")}</h1>
        <p className="text-sm text-muted-foreground">
          {pick("Group social accounts per client to filter the calendar and reports.", "Kelompokkan akun sosial per klien untuk memfilter kalender dan laporan.")}
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-6">
          <Input className="max-w-xs" placeholder={pick("Client name", "Nama klien")} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}><Plus />{pick("Add client", "Tambah klien")}</Button>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {(groups.data ?? []).map((g) => {
          const mine = accs.filter((a) => a.client_group_id === g.id);
          return (
            <Card key={g.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{g.name} <span className="text-sm font-normal text-muted-foreground">· {mine.length} {pick("accounts", "akun")}</span></CardTitle>
                <Button size="icon" variant="ghost" aria-label="Hapus" onClick={() => confirm(pick("Delete client?", "Hapus klien?")) && remove.mutate(g.id)}><Trash2 className="h-4 w-4" /></Button>
              </CardHeader>
              <CardContent className="space-y-1">
                {mine.length === 0 && <p className="text-sm text-muted-foreground">{pick("No accounts yet.", "Belum ada akun.")}</p>}
                {mine.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm"><SocialIcon platform={a.platform} className="h-4 w-4" />{a.account_name}</div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{pick("Assign accounts", "Atur akun ke klien")}</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border">
          {accs.length === 0 && <p className="py-2 text-sm text-muted-foreground">{pick("No social accounts connected.", "Belum ada akun sosial terhubung.")}</p>}
          {accs.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex items-center gap-2 text-sm"><SocialIcon platform={a.platform} className="h-4 w-4" />{a.account_name}{a.handle && <span className="text-muted-foreground">@{a.handle}</span>}</div>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={a.client_group_id ?? ""}
                onChange={(e) => assign.mutate({ id: a.id, group: e.target.value || null })}
              >
                <option value="">{pick("— No client —", "— Tanpa klien —")}</option>
                {(groups.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
