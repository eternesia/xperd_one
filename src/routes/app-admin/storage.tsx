import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminField, AdminSelect } from "@/components/app/admin-ui";
import {
  getPlatformStorage,
  savePlatformStorage,
  testPlatformStorage,
} from "@/lib/platform-storage.functions";
import { seo } from "@/components/qalling/QallingSite";
import { MediaUploadSettings } from "@/components/app/MediaUploadSettings";
export const Route = createFileRoute("/app-admin/storage")({
  head: () =>
    seo(
      "Object Storage — XPERD Super Admin",
      "Pengaturan dan uji koneksi penyimpanan eksternal Qalling.",
    ),
  component: StoragePage,
});
function StoragePage() {
  const get = useServerFn(getPlatformStorage),
    save = useServerFn(savePlatformStorage),
    test = useServerFn(testPlatformStorage),
    qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-storage"], queryFn: () => get() });
  const [form, setForm] = useState({
    provider: "r2" as "r2" | "s3" | "wasabi" | "spaces" | "b2",
    endpoint: "",
    bucket: "",
    backup_bucket: "",
    region: "auto",
    cdn_url: "",
    access_key: "",
    secret_key: "",
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data)
      setForm({
        ...data,
        provider: data.provider as typeof form.provider,
        backup_bucket: data.backup_bucket ?? "",
        access_key: "",
        secret_key: "",
      });
  }, [data]);
  async function run(action: "save" | "test") {
    setBusy(true);
    try {
      if (action === "save") {
        await save({ data: form });
        setForm((v) => ({ ...v, access_key: "", secret_key: "" }));
        await qc.invalidateQueries({ queryKey: ["admin-storage"] });
        toast.success("Pengaturan tersimpan");
      } else {
        await test();
        toast.success("Bucket dapat diakses");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Koneksi gagal");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <MediaUploadSettings />
      <h1 className="text-2xl font-semibold">Object Storage</h1>
      <p className="text-sm text-muted-foreground">
        <b>Bucket backup</b>: backup otomatis (database harian, berkas mingguan) disalin ke sini —
        lihat Kesehatan Sistem. <b>Bucket berkas</b> disiapkan untuk memindahkan unggahan pengguna;
        saat ini unggahan masih disimpan di disk server.
      </p>
      {isLoading ? (
        <p>Memuat…</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run("save");
          }}
        >
          <AdminField label="Provider">
            <AdminSelect
              value={form.provider}
              onChange={(v) => setForm({ ...form, provider: v as typeof form.provider })}
            >
              <option value="r2">Cloudflare R2</option>
              <option value="s3">Amazon S3</option>
              <option value="wasabi">Wasabi</option>
              <option value="spaces">DigitalOcean Spaces</option>
              <option value="b2">Backblaze B2</option>
            </AdminSelect>
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                "endpoint",
                "bucket",
                "backup_bucket",
                "region",
                "cdn_url",
                "access_key",
                "secret_key",
              ] as const
            ).map((k) => (
              <AdminField
                key={k}
                label={
                  k === "bucket"
                    ? "bucket berkas (media)"
                    : k === "backup_bucket"
                      ? "bucket backup (opsional)"
                      : k.replaceAll("_", " ")
                }
              >
                <Input
                  value={form[k]}
                  type={k.includes("key") ? "password" : "text"}
                  autoComplete="off"
                  placeholder={
                    k.includes("key") && data?.has_secret_key
                      ? "Tersimpan — kosongkan untuk mempertahankan"
                      : ""
                  }
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </AdminField>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="gold" disabled={busy}>
              Simpan
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !data}
              onClick={() => run("test")}
            >
              Uji koneksi
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
