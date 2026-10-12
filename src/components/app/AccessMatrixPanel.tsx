import { useCallback, useEffect, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  PaginationBar,
  SearchInput,
  TableSkeletonRows,
  usePagination,
  useSearchFilter,
} from "@/components/app/ui-states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAccessMatrix, setWorkspaceAccess } from "@/lib/team.functions";

/**
 * Ronde 31 (parity BS New 8/10 + live xperd-one.lovable.app): tab **Workspace
 * Access** — matriks siapa boleh membuka workspace mana. Pemilik tenant selalu
 * punya semua akses dan tidak bisa diubah; pemanggil hanya bisa mengubah
 * workspace tempat ia owner/admin.
 *
 * Catatan parity: label panel ini **sengaja hardcoded Bahasa Indonesia** karena
 * aplikasi live juga begitu walau UI lain sedang berbahasa Inggris
 * (dump live: header `No | Pengguna`, badge `Semua akses | Pemilik |
 * Tidak ada akses`).
 */
type Matrix = Awaited<ReturnType<typeof getAccessMatrix>>;

const ROLE_LABEL: Record<string, string> = {
  none: "Tidak ada akses",
  admin: "Admin",
  staff: "Staff",
  viewer: "Viewer",
  owner: "Owner",
};

export function AccessMatrixPanel({ workspaceId, onChanged }: { workspaceId?: string; onChanged?: () => void }) {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setMatrix(await getAccessMatrix({ data: { workspaceId } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat matriks akses");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const users = useSearchFilter(matrix?.users ?? [], search, (u) => [u.fullName, u.email]);
  const pagination = usePagination(users, 10);

  async function change(userId: string, wsId: string, role: string) {
    const key = `${userId}:${wsId}`;
    setSaving(key);
    try {
      await setWorkspaceAccess({
        data: { targetUserId: userId, targetWorkspaceId: wsId, role: role as "admin" | "staff" | "viewer" | "none" },
      });
      setMatrix(
        (m) =>
          m && {
            ...m,
            users: m.users.map((u) => {
              if (u.userId !== userId) return u;
              const roles = { ...u.roles };
              if (role === "none") delete roles[wsId];
              else roles[wsId] = role;
              return { ...u, roles };
            }),
          },
      );
      toast.success("Akses diperbarui");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card data-testid="workspace-access-matrix">
      <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle>Matriks Akses Workspace</CardTitle>
          <CardDescription>
            Atur siapa yang bisa membuka workspace mana. Pemilik perusahaan selalu dapat memantau semua workspace.
          </CardDescription>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Cari nama atau email…" />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No</TableHead>
                <TableHead className="min-w-48">Pengguna</TableHead>
                {(matrix?.workspaces ?? []).map((w) => (
                  <TableHead key={w.id} className="min-w-40">
                    {w.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeletonRows rows={4} columns={2 + (matrix?.workspaces.length ?? 2)} />
              ) : pagination.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2 + (matrix?.workspaces.length ?? 0)} className="py-8 text-center text-muted-foreground">
                    Tidak ada pengguna.
                  </TableCell>
                </TableRow>
              ) : (
                pagination.items.map((u, i) => {
                  const isOwner = u.userId === matrix?.ownerId;
                  return (
                    <TableRow key={u.userId}>
                      <TableCell className="text-muted-foreground">{pagination.start + i + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 font-medium">
                          {u.fullName || "—"}
                          {isOwner && (
                            <Badge variant="secondary" className="gap-1">
                              <Crown className="size-3" /> Pemilik
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </TableCell>
                      {(matrix?.workspaces ?? []).map((w) => {
                        const role = u.roles[w.id] ?? "none";
                        const locked = isOwner || role === "owner" || !matrix?.manageable.includes(w.id);
                        const key = `${u.userId}:${w.id}`;
                        if (isOwner) {
                          return (
                            <TableCell key={w.id}>
                              <Badge variant="outline">Semua akses</Badge>
                            </TableCell>
                          );
                        }
                        if (locked) {
                          return (
                            <TableCell key={w.id}>
                              <Badge variant={role === "none" ? "outline" : "secondary"}>
                                {ROLE_LABEL[role] ?? role}
                              </Badge>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={w.id}>
                            <div className="flex items-center gap-2">
                              <Select
                                value={role}
                                onValueChange={(v) => change(u.userId, w.id, v)}
                                disabled={saving === key}
                              >
                                <SelectTrigger
                                  className={`h-8 w-36 ${role === "none" ? "text-muted-foreground" : ""}`}
                                  data-testid={`access-cell-${u.userId}-${w.id}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {["none", "admin", "staff", "viewer"].map((r) => (
                                    <SelectItem key={r} value={r}>
                                      {ROLE_LABEL[r]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {saving === key && <Loader2 className="size-4 animate-spin" />}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <PaginationBar p={pagination} />
      </CardContent>
    </Card>
  );
}
