import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/app-context";
import {
  createMcpToken,
  listMcpConnections,
  revokeMcpConnection,
} from "@/lib/mcp-tokens.functions";

const TOOLS = [
  ["Daftar akun sosial", "Melihat akun media sosial yang terhubung."],
  ["Daftar postingan", "Melihat postingan terjadwal dan terbit."],
  ["Buat draft postingan", "Menyimpan draft. Tidak langsung terbit — Anda yang menjadwalkan."],
  [
    "Buat ide konten",
    "Menambah kartu ke Ideas (Todo), bisa sekaligus menyimpan gambar/video dari AI.",
  ],
  ["Cari & buat lead", "Mencari dan menambah prospek (paket Pro/Agency)."],
  ["Komentar", "Melihat komentar terbaru dan menyukai komentar (Facebook Page & TikTok)."],
  [
    "Data ERP",
    "Ringkasan workspace, item, dokumen penjualan/pembelian, dan ringkasan keuangan (hanya baca).",
  ],
];

const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleString("id-ID") : "Belum pernah dipakai";

export function AiPage() {
  const { canViewSubmodule, accessLoading } = useApp();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const url = typeof window !== "undefined" ? `${window.location.origin}/mcp` : "/mcp";
  const conns = useQuery({ queryKey: ["mcp-connections"], queryFn: () => listMcpConnections() });
  const create = useMutation({
    mutationFn: () => createMcpToken({ data: { name } }),
    onSuccess: (r) => {
      setFresh(r.token);
      setName("");
      void qc.invalidateQueries({ queryKey: ["mcp-connections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (v: { kind: "pat" | "oauth"; id: string }) => revokeMcpConnection({ data: v }),
    onSuccess: () => {
      toast.success("Akses dicabut");
      void qc.invalidateQueries({ queryKey: ["mcp-connections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const copy = (text: string, msg: string) =>
    navigator.clipboard.writeText(text).then(() => toast.success(msg));
  if (accessLoading) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  if (!canViewSubmodule("crm", "ai"))
    return (
      <p className="text-sm text-muted-foreground">
        Integrasi AI tidak tersedia pada paket atau izin workspace Anda.
      </p>
    );
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          Integrasi AI
        </h1>
        <p className="text-sm text-muted-foreground">
          Kelola Qalling langsung dari ChatGPT atau Claude dengan bahasa sehari-hari.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alamat koneksi</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-sm">{url}</code>
          <Button variant="outline" size="sm" onClick={() => copy(url, "Alamat disalin")}>
            <Copy />
            Salin
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ChatGPT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>1. Buka Settings → Apps & Connectors → Create.</p>
            <p>2. Tempel alamat koneksi di atas, pilih autentikasi OAuth.</p>
            <p>3. Login dengan akun Qalling Anda dan setujui akses.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Claude</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>1. Buka Settings → Connectors → Add custom connector.</p>
            <p>2. Tempel alamat koneksi di atas lalu klik Connect.</p>
            <p>3. Login dengan akun Qalling Anda dan setujui akses.</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Token pribadi & akses aktif
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Untuk aplikasi yang tidak mendukung OAuth (Claude Code, Cursor, skrip): kirim token di
            header <code>Authorization: Bearer …</code>. Token hanya ditampilkan sekali.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Nama token"
              placeholder="Nama token (mis. Claude Code)"
              className="max-w-xs"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button disabled={create.isPending || !name.trim()} onClick={() => create.mutate()}>
              Buat token
            </Button>
          </div>
          {fresh && (
            <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
              <p className="text-sm font-medium">
                Salin token ini sekarang — tidak akan ditampilkan lagi.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code
                  data-testid="mcp-new-token"
                  className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs"
                >
                  {fresh}
                </code>
                <Button variant="outline" size="sm" onClick={() => copy(fresh, "Token disalin")}>
                  <Copy />
                  Salin
                </Button>
              </div>
            </div>
          )}
          <div className="divide-y divide-border">
            {(conns.data ?? []).length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">
                Belum ada token atau aplikasi AI yang terhubung.
              </p>
            )}
            {(conns.data ?? []).map((c) => (
              <div
                key={`${c.kind}-${c.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {c.name}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {c.kind === "pat" ? `Token ${c.prefix}…` : "Aplikasi (OAuth)"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Terakhir dipakai: {fmt(c.last_used_at)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Cabut ${c.name}`}
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ kind: c.kind, id: c.id })}
                >
                  <Trash2 />
                  Cabut
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Yang bisa dilakukan AI</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {TOOLS.map(([t, d]) => (
            <div key={t} className="py-2">
              <p className="text-sm font-medium">{t}</p>
              <p className="text-xs text-muted-foreground">{d}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contoh perintah</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>"Buatkan gambar promo kopi, lalu simpan sebagai ide di Qalling."</p>
          <p>"Buat draft postingan Instagram untuk Jumat jam 9 pagi."</p>
          <p>"Tampilkan postingan yang terjadwal minggu ini."</p>
          <p className="pt-2 text-xs">
            AI hanya bisa mengakses data sesuai izin akun Anda, dan tidak pernah menerbitkan
            postingan tanpa Anda.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
