import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AdminField, AdminSelect } from "@/components/app/admin-ui";
import { configureNativeMeta, getNativeMetaAdmin } from "@/lib/meta-inbox.functions";

export function NativeMetaSettings() {
  const qc = useQueryClient();
  const getFn = useServerFn(getNativeMetaAdmin);
  const saveFn = useServerFn(configureNativeMeta);
  const { data, error } = useQuery({ queryKey: ["native-meta-admin"], queryFn: () => getFn() });
  const [workspace, setWorkspace] = useState("");
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          workspaceId: workspace,
          appId,
          enabled,
          appSecret: secret || undefined,
          verifyToken: token || undefined,
        },
      }),
    onSuccess: () => {
      setSecret("");
      setToken("");
      qc.invalidateQueries({ queryKey: ["native-meta-admin"] });
      toast.success("Pengaturan Meta tersimpan.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="space-y-4 border-t pt-6">
      <h2 className="text-lg font-semibold">Meta Native · Beta</h2>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Workspace">
          <AdminSelect
            value={workspace}
            onChange={(v) => {
              setWorkspace(v);
              const s = data?.settings.find((s) => s.workspace_id === v);
              setAppId(s?.app_id ?? "");
              setEnabled(s?.native_social_enabled ?? false);
              setSecret("");
              setToken("");
            }}
          >
            <option value="">Pilih workspace</option>
            {data?.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </AdminSelect>
        </AdminField>
        <AdminField label="Meta App ID">
          <Input value={appId} onChange={(e) => setAppId(e.target.value)} />
        </AdminField>
        <AdminField label="App Secret">
          <Input
            type="password"
            autoComplete="new-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Kosongkan untuk mempertahankan"
          />
        </AdminField>
        <AdminField label="Webhook Verify Token">
          <Input
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Minimal 16 karakter"
          />
        </AdminField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          Aktifkan Meta native untuk workspace ini
        </label>
        <Button disabled={!workspace || !appId || save.isPending} onClick={() => save.mutate()}>
          Simpan & verifikasi
        </Button>
      </div>
    </section>
  );
}
