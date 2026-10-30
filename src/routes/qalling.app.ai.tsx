import { createFileRoute } from "@tanstack/react-router";
import { Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/qalling/app/ai")({
  head: () => ({
    meta: [
      { title: "Integrasi AI — Qalling" },
      { name: "description", content: "Hubungkan ChatGPT dan Claude ke Qalling." },
      { property: "og:title", content: "Integrasi AI — Qalling" },
      { property: "og:description", content: "Hubungkan ChatGPT dan Claude ke Qalling." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiPage,
});

const TOOLS = [
  ["Daftar akun sosial", "Melihat akun media sosial yang terhubung."],
  ["Daftar postingan", "Melihat postingan terjadwal dan terbit."],
  ["Buat draft postingan", "Menyimpan draft. Tidak langsung terbit — Anda yang menjadwalkan."],
  [
    "Buat ide konten",
    "Menambah kartu ke Ideas (Todo), bisa sekaligus menyimpan gambar/video dari AI.",
  ],
  ["Cari & buat lead", "Mencari dan menambah prospek (paket Pro/Agency)."],
];

function AiPage() {
  const url = typeof window !== "undefined" ? `${window.location.origin}/mcp` : "/mcp";
  const copy = () => navigator.clipboard.writeText(url).then(() => toast.success("Alamat disalin"));
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
          <Button variant="outline" size="sm" onClick={copy}>
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
