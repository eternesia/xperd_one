import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect } from "@/components/app/admin-ui";
import {
  adminAssignWorkspace,
  adminCreateUser,
  adminDeleteUser,
  adminListUsers,
  adminListWorkspaces,
  adminRemoveWorkspaceAccess,
  adminSetPlatformAdmin,
  adminUpdateUser,
  type AdminUserRow,
} from "@/lib/admin-users.functions";

import { TablePager, usePaged } from "@/components/app/admin-table";

export const Route = createFileRoute("/app-admin/users")({
  component: AdminUsersPage,
});

const EMPTY = { email: "", password: "", fullName: "", phone: "", makeAdmin: false };

function AdminUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [access, setAccess] = useState<{ user: AdminUserRow; workspaceId: string; role: string } | null>(null);
  const [pwUser, setPwUser] = useState<{ user: AdminUserRow; password: string } | null>(null);

  const usersQ = useQuery({ queryKey: ["admin-users"], queryFn: () => adminListUsers() });
  const wsQ = useQuery({ queryKey: ["admin-all-workspaces"], queryFn: () => adminListWorkspaces() });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["admin-users"] });

  const createM = useMutation({
    mutationFn: () =>
      adminCreateUser({
        data: { email: form.email, password: form.password, fullName: form.fullName, phone: form.phone, makeAdmin: form.makeAdmin },
      }),
    onSuccess: () => {
      toast.success("User created");
      setCreateOpen(false);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pwM = useMutation({
    mutationFn: () => adminUpdateUser({ data: { targetUserId: pwUser!.user.userId, password: pwUser!.password } }),
    onSuccess: () => {
      toast.success("Password updated");
      setPwUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleM = useMutation({
    mutationFn: (v: { targetUserId: string; makeAdmin: boolean }) => adminSetPlatformAdmin({ data: v }),
    onSuccess: () => {
      toast.success("Platform role updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignM = useMutation({
    mutationFn: () =>
      adminAssignWorkspace({
        data: {
          targetUserId: access!.user.userId,
          workspaceId: access!.workspaceId,
          role: access!.role as "owner" | "admin" | "staff" | "viewer",
        },
      }),
    onSuccess: () => {
      toast.success("Workspace access granted");
      setAccess(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeM = useMutation({
    mutationFn: (v: { targetUserId: string; workspaceId: string }) => adminRemoveWorkspaceAccess({ data: v }),
    onSuccess: () => {
      toast.success("Access removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = usersQ.data ?? [];
    if (!q) return list;
    return list.filter((u) =>
      [u.email, u.fullName, u.companyName, ...u.memberships.map((m) => m.workspaceName)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [usersQ.data, search]);

  const groups = useMemo(() => {
    type Group = { key: string; title: string; users: { u: AdminUserRow; role: string | null }[] };
    const map = new Map<string, Group>();
    for (const u of rows) {
      if (!u.memberships.length) {
        const g: Group = map.get("__none") ?? { key: "__none", title: "Tanpa workspace", users: [] };
        g.users.push({ u, role: null });
        map.set("__none", g);
      }
      for (const m of u.memberships) {
        const g: Group = map.get(m.workspaceId) ?? { key: m.workspaceId, title: `${m.tenantName} / ${m.workspaceName}`, users: [] };
        g.users.push({ u, role: m.role });
        map.set(m.workspaceId, g);
      }
    }
    return [...map.values()].sort((a, b) => (a.key === "__none" ? 1 : b.key === "__none" ? -1 : a.title.localeCompare(b.title)));
  }, [rows]);
  const pg = usePaged(groups, (g) => g.title, 5);

  const deleteM = useMutation({
    mutationFn: (targetUserId: string) => adminDeleteUser({ data: { targetUserId } }),
    onSuccess: () => {
      toast.success("User dihapus");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-navy dark:text-primary-foreground">
            <Users className="h-5 w-5 text-gold" /> Users
          </h1>
          <p className="text-sm text-muted-foreground">Akun dikelompokkan per workspace.</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Cari nama, email, workspace…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <Button variant="gold" onClick={() => setCreateOpen(true)}>
            <Plus /> New user
          </Button>
        </div>
      </div>

      {usersQ.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No users found.</p>
      ) : (
        pg.rows.map((g) => (
          <Card key={g.key}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-medium">{g.title}</h2>
              <Badge variant="secondary">{g.users.length} user</Badge>
            </div>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Platform role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.users.map(({ u, role }) => {
                    const isAdmin = u.platformRoles.includes("admin");
                    return (
                      <TableRow key={u.userId}>
                        <TableCell>
                          <div className="font-medium">{u.fullName ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
                        </TableCell>
                        <TableCell>
                          {role ? (
                            <Badge variant="outline" className="gap-1">
                              {role}
                              <button type="button" aria-label="Cabut akses" className="ml-1 text-muted-foreground hover:text-destructive" onClick={() => revokeM.mutate({ targetUserId: u.userId, workspaceId: g.key })}>
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch checked={isAdmin} onCheckedChange={(v) => roleM.mutate({ targetUserId: u.userId, makeAdmin: v })} />
                            <span className="text-xs text-muted-foreground">{isAdmin ? "Super admin" : "Customer"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setAccess({ user: u, workspaceId: wsQ.data?.[0]?.id ?? "", role: "staff" })}>
                              <UserPlus /> Access
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setPwUser({ user: u, password: "" })}>
                              <KeyRound /> Password
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive" disabled={deleteM.isPending} onClick={() => { if (window.confirm(`Hapus akun ${u.email ?? ""} secara permanen?`)) deleteM.mutate(u.userId); }}>
                              <Trash2 /> Hapus
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
      <TablePager {...pg} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New user</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <AdminField label="Full name">
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </AdminField>
            <AdminField label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </AdminField>
            <AdminField label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </AdminField>
            <AdminField label="Temporary password (min 8 characters)">
              <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </AdminField>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={form.makeAdmin} onCheckedChange={(v) => setForm({ ...form, makeAdmin: v })} />
              <span className="flex items-center gap-1 text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-gold" /> Grant super admin access
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" disabled={createM.isPending} onClick={() => createM.mutate()}>
              {createM.isPending ? "Saving…" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!access} onOpenChange={(o) => !o && setAccess(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Workspace access — {access?.user.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <AdminField label="Workspace">
              <AdminSelect value={access?.workspaceId ?? ""} onChange={(v) => access && setAccess({ ...access, workspaceId: v })}>
                <option value="">Select workspace…</option>
                {(wsQ.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.tenantName} / {w.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Role in that workspace">
              <AdminSelect value={access?.role ?? "staff"} onChange={(v) => access && setAccess({ ...access, role: v })}>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
                <option value="viewer">Viewer</option>
              </AdminSelect>
            </AdminField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccess(null)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              disabled={!access?.workspaceId || assignM.isPending}
              onClick={() => assignM.mutate()}
            >
              {assignM.isPending ? "Saving…" : "Grant access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwUser} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password — {pwUser?.user.email}</DialogTitle>
          </DialogHeader>
          <AdminField label="New password (min 8 characters)">
            <Input
              value={pwUser?.password ?? ""}
              onChange={(e) => pwUser && setPwUser({ ...pwUser, password: e.target.value })}
            />
          </AdminField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwUser(null)}>
              Cancel
            </Button>
            <Button variant="gold" disabled={(pwUser?.password.length ?? 0) < 8 || pwM.isPending} onClick={() => pwM.mutate()}>
              {pwM.isPending ? "Saving…" : "Update password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
