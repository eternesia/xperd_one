import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteCustomRole,
  listCustomRoles,
  saveCustomRole,
  type CustomRole,
  type Perms,
} from "@/lib/custom-roles.functions";
import { APP_MODULES } from "@/lib/modules";

export type { CustomRole, Perms };

export async function fetchCustomRoles(workspaceId: string): Promise<CustomRole[]> {
  return listCustomRoles({ data: { workspaceId } });
}

export function CustomRolesPanel({
  workspaceId,
  onlyModule,
  onChanged,
}: {
  workspaceId?: string;
  onlyModule?: string;
  onChanged?: () => void;
}) {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    base_role: CustomRole["base_role"];
    permissions: Perms;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const modules = APP_MODULES.filter((m) => !m.disabled && (!onlyModule || m.id === onlyModule));

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setRoles(await fetchCustomRoles(workspaceId));
    setLoading(false);
  }, [workspaceId]);
  useEffect(() => {
    void load();
  }, [load]);

  function setPerm(key: string, field: "view" | "edit", value: boolean) {
    setEditing((e) => {
      if (!e) return e;
      const cur = e.permissions[key] ?? { view: false, edit: false };
      const next =
        field === "view"
          ? { view: value, edit: value ? cur.edit : false }
          : { view: cur.view || value, edit: value };
      return { ...e, permissions: { ...e.permissions, [key]: next } };
    });
  }

  async function save() {
    if (!editing || !workspaceId) return;
    if (editing.name.trim().length < 2) return toast.error("Nama role minimal 2 karakter");
    setSaving(true);
    // Explicitly deny every module/submodule not checked so the custom role is restrictive by default.
    const permissions: Perms = {};
    for (const m of modules)
      for (const k of [m.id, ...m.submodules.map((s) => `${m.id}/${s.id}`)])
        permissions[k] = editing.permissions[k] ?? { view: false, edit: false };
    try {
      await saveCustomRole({
        data: {
          workspaceId,
          id: editing.id,
          name: editing.name.trim(),
          base_role: editing.base_role,
          permissions,
        },
      });
    } catch (e) {
      setSaving(false);
      return toast.error((e as Error).message);
    }
    setSaving(false);
    toast.success("Role tersimpan");
    setEditing(null);
    await load();
    onChanged?.();
  }

  async function remove(role: CustomRole) {
    if (
      !window.confirm(
        `Hapus role "${role.name}"? Anggota dengan role ini kembali ke role dasar ${role.base_role}.`,
      )
    )
      return;
    try {
      if (workspaceId) await deleteCustomRole({ data: { workspaceId, id: role.id } });
    } catch (e) {
      return toast.error((e as Error).message);
    }
    toast.success("Role dihapus");
    await load();
    onChanged?.();
  }

  return (
    <Card>
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 space-y-0 border-b border-border">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gold" /> Custom roles
          </CardTitle>
          <CardDescription>
            Buat role baru (mis. Admin Konten) dengan menu tertentu saja.
          </CardDescription>
        </div>
        <Button
          variant="navy"
          onClick={() => setEditing({ name: "", base_role: "admin", permissions: {} })}
        >
          <Plus /> Role baru
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 text-center">#</TableHead>
                <TableHead>Nama role</TableHead>
                <TableHead>Level dasar</TableHead>
                <TableHead>Menu aktif</TableHead>
                <TableHead className="w-28 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    Memuat…
                  </TableCell>
                </TableRow>
              )}
              {!loading && roles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    Belum ada custom role.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                roles.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="capitalize">{r.base_role}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {
                        Object.entries(r.permissions ?? {}).filter(
                          ([k, p]) => !k.includes("/") && p.view,
                        ).length
                      }{" "}
                      modul
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit"
                          onClick={() =>
                            setEditing({
                              id: r.id,
                              name: r.name,
                              base_role: r.base_role,
                              permissions: r.permissions ?? {},
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Hapus" onClick={() => remove(r)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && !saving && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit role" : "Role baru"}</DialogTitle>
            <DialogDescription>
              Centang menu yang boleh dilihat (View) dan diubah (Edit).
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nama role</Label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Admin Konten"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Level dasar</Label>
                  <Select
                    value={editing.base_role}
                    onValueChange={(v) =>
                      setEditing({ ...editing, base_role: v as CustomRole["base_role"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin (bisa kelola tim)</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="viewer">Viewer (hanya lihat)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                {modules.map((m) => (
                  <div key={m.id} className="rounded-md border border-border p-3">
                    <PermRow
                      label={m.en}
                      bold
                      perm={editing.permissions[m.id]}
                      onChange={(f, v) => setPerm(m.id, f, v)}
                    />
                    <div className="mt-2 space-y-1 pl-4">
                      {m.submodules.map((s) => {
                        const k = `${m.id}/${s.id}`;
                        return (
                          <PermRow
                            key={k}
                            label={s.en}
                            perm={editing.permissions[k]}
                            onChange={(f, v) => setPerm(k, f, v)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button variant="navy" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PermRow({
  label,
  bold,
  perm,
  onChange,
}: {
  label: string;
  bold?: boolean;
  perm?: { view: boolean; edit: boolean };
  onChange: (f: "view" | "edit", v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={bold ? "font-medium text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span className="flex gap-4 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <Checkbox
            checked={perm?.view ?? false}
            onCheckedChange={(v) => onChange("view", Boolean(v))}
          />{" "}
          View
        </label>
        <label className="flex items-center gap-1.5">
          <Checkbox
            checked={perm?.edit ?? false}
            onCheckedChange={(v) => onChange("edit", Boolean(v))}
          />{" "}
          Edit
        </label>
      </span>
    </div>
  );
}
