import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assignTebarAccount, getTebarAdmin, saveTebarKey } from "@/lib/tebar.functions";
import { NativeMetaSettings } from "@/components/app/NativeMetaSettings";

export const Route = createFileRoute("/app-admin/tebar")({
  head: () => ({
    meta: [
      { title: "Integrasi Sosial | XPERD Admin" },
      {
        name: "description",
        content: "Kelola koneksi Tebar dan aktivasi Meta native per workspace.",
      },
      { property: "og:title", content: "Integrasi Sosial | XPERD Admin" },
      { property: "og:description", content: "Pengaturan integrasi sosial XPERD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TebarAdmin,
});

function TebarAdmin() {
  const qc = useQueryClient();
  const getFn = useServerFn(getTebarAdmin);
  const saveFn = useServerFn(saveTebarKey);
  const assignFn = useServerFn(assignTebarAccount);
  const [key, setKey] = useState("");
  const [q, setQ] = useState("");
  // Satu halaman upstream per permintaan: tumpukan kursor menyimpan awal tiap halaman yang sudah dibuka.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const cursor = cursors[page] ?? null;
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["tebar-admin", cursor, limit],
    queryFn: () => getFn({ data: { cursor, limit } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tebar-admin"] });

  const save = useMutation({
    mutationFn: () => saveFn({ data: { apiKey: key.trim() } }),
    onSuccess: (r) => {
      setKey("");
      refresh();
      setCursors([null]);
      setPage(0);
      if (r.status === "verified") toast.success("Terhubung ke Tebar");
      else toast.error(r.lastError ?? "API key tidak valid");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const assign = useMutation({
    mutationFn: (v: {
      tebarId: string;
      platform: string;
      name: string;
      handle: string | null;
      profileUrl: string | null;
      workspaceId: string | null;
    }) => assignFn({ data: v }),
    onSuccess: () => {
      refresh();
      toast.success("Penugasan akun disimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accounts = (data?.accounts ?? []).filter((a) =>
    `${a.name} ${a.handle ?? ""} ${a.platform}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <NativeMetaSettings />
      <header>
        <h1 className="text-2xl font-semibold">Tebar.app Connector</h1>
        <p className="text-sm text-muted-foreground">
          Hubungkan Qalling CRM ke Tebar untuk posting ke Instagram, Threads, TikTok, LinkedIn, X,
          Telegram, dan Discord.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">API Key Tebar</p>
            <Badge variant={data?.status === "verified" ? "default" : "secondary"}>
              {data?.status === "verified"
                ? "Terhubung"
                : data?.status === "invalid"
                  ? "Tidak valid"
                  : "Belum diatur"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Buat di dashboard Tebar → menu akun → API keys → pilih akses "read and write". Kunci
            disimpan di server dan tidak pernah dikirim ke browser.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={data?.hasKey ? "•••••••• (tersimpan)" : "tb_live_..."}
            />
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || key.trim().length < 10}
            >
              {save.isPending ? "Menguji..." : "Simpan & Tes Koneksi"}
            </Button>
          </div>
          {data?.lastError && <p className="text-xs text-destructive">{data.lastError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Akun media sosial di Tebar</p>
              <p className="text-xs text-muted-foreground">
                Tetapkan tiap akun ke workspace tenant. Satu akun hanya untuk satu workspace.
              </p>
            </div>
            <Input
              className="sm:w-56"
              placeholder="Cari di halaman ini…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              Daftar akun tidak dapat dimuat.{" "}
              <Button variant="outline" size="sm" onClick={() => refresh()}>
                Coba lagi
              </Button>
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {q
                ? "Tidak ada akun yang cocok di halaman ini."
                : data?.status === "verified"
                  ? "Belum ada akun di halaman ini."
                  : "Simpan API key untuk memuat akun."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Akun</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Workspace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-56">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.handle ? ` · @${a.handle}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="capitalize">{a.platform}</TableCell>
                      <TableCell>
                        <select
                          className="h-9 rounded-md border bg-background px-2 text-sm sm:w-64"
                          value={data?.assignments[a.id] ?? ""}
                          disabled={assign.isPending}
                          onChange={(e) =>
                            assign.mutate({
                              tebarId: a.id,
                              platform: a.platform,
                              name: a.name,
                              handle: a.handle,
                              profileUrl: a.profile_url,
                              workspaceId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">— Tidak ditetapkan —</option>
                          {data?.workspaces.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
            <div className="flex items-center gap-3">
              <span>
                Halaman {page + 1} · {accounts.length} akun
              </span>
              <select
                aria-label="Akun per halaman"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={limit}
                disabled={isFetching}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setCursors([null]);
                  setPage(0);
                  setQ("");
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Halaman sebelumnya"
                title="Halaman sebelumnya"
                disabled={page === 0 || isFetching}
                onClick={() => {
                  setPage((v) => v - 1);
                  setQ("");
                }}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Halaman berikutnya"
                title="Halaman berikutnya"
                disabled={!data?.nextCursor || isFetching}
                onClick={() => {
                  const next = data?.nextCursor ?? null;
                  if (!next) return;
                  setCursors((c) => [...c.slice(0, page + 1), next]);
                  setPage((v) => v + 1);
                  setQ("");
                }}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
