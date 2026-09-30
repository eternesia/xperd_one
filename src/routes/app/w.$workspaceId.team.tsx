import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, KeyRound, LayoutDashboard, Loader2, Save, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  PaginationBar,
  SearchInput,
  TableSkeletonRows,
  usePagination,
  useSearchFilter,
} from "@/components/app/ui-states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/app-context";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow, upsertWorkspaceRows } from "@/lib/data.functions";
import { APP_MODULES } from "@/lib/modules";
import { listProfilesByIds } from "@/lib/platform.functions";
import {
  addExistingUserToWorkspace,
  createWorkspaceUser,
  listTenantUsers,
  updateWorkspaceUser,
} from "@/lib/team.functions";

export const Route = createFileRoute("/app/w/$workspaceId/team")({
  head: () => ({
    meta: [
      { title: "Team & Access — XPERD One" },
      { name: "description", content: "Manage workspace members, roles, and module access." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TeamPage,
});

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { full_name: string | null; email: string | null } | null;
}

/** #58 (BS New 3): user tenant + keanggotaan workspace-nya (untuk dialog Give access). */
interface TenantUser {
  userId: string;
  fullName: string | null;
  email: string | null;
  memberships: { workspaceId: string; workspaceName: string; role: string }[];
}

type AccessRole = "admin" | "staff" | "viewer";
const ACCESS_ROLES: AccessRole[] = ["admin", "staff", "viewer"];

interface AccessRow {
  role: AccessRole;
  module_id: string;
  can_view: boolean;
  can_edit: boolean;
}

function TeamPage() {
  const { activeWorkspace, pkg, tenant, refresh } = useApp();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "", role: "staff" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", password: "" });
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // #58 (BS New 3): dialog "Give access" — beri akses ke user tenant yang sudah ada.
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantUserId, setGrantUserId] = useState("");
  const [grantRole, setGrantRole] = useState<AccessRole>("staff");
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);

  // #47: pencarian + paginasi bersama (menggantikan daftar panjang tanpa filter).
  const shownMembers = useSearchFilter(members, search, (m) => [
    m.profile?.full_name,
    m.profile?.email,
    m.role,
    m.user_id,
  ]);
  const pager = usePagination(shownMembers, 10);

  const createUser = useServerFn(createWorkspaceUser);
  const updateUser = useServerFn(updateWorkspaceUser);
  const fetchTenantUsers = useServerFn(listTenantUsers);
  const addExisting = useServerFn(addExistingUserToWorkspace);

  async function load() {
    if (!activeWorkspace) return;
    setLoading(true);
    const data = await listWorkspaceRows({
      data: { table: "workspace_members", workspaceId: activeWorkspace.id, orderBy: "created_at", orderDir: "asc", limit: 500 },
    });
    const rows = (data?.rows ?? []) as MemberRow[];
    if (rows.length) {
      const profiles = await listProfilesByIds({
        data: { workspaceId: activeWorkspace.id, ids: rows.map((r) => r.user_id) },
      });
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      rows.forEach((r) => {
        const p = byId.get(r.user_id);
        r.profile = p ? { full_name: p.full_name, email: p.email } : null;
      });
    }
    setMembers(rows);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace) return;
    setBusy(true);
    try {
      await createUser({
        data: {
          workspaceId: activeWorkspace.id,
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || undefined,
          role: form.role as AccessRole,
        },
      });
      toast.success("User created and added to this workspace");
      setForm({ fullName: "", email: "", phone: "", password: "", role: "staff" });
      await load();
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create user");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace || !editing) return;
    setBusy(true);
    try {
      await updateUser({
        data: {
          workspaceId: activeWorkspace.id,
          targetUserId: editing.user_id,
          fullName: editForm.fullName,
          phone: editForm.phone,
          password: editForm.password || undefined,
        },
      });
      toast.success("User updated");
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update user");
    } finally {
      setBusy(false);
    }
  }

  /** #58: buka dialog Give access sekaligus muat user tenant. */
  async function openGrant() {
    if (!activeWorkspace) return;
    setGrantUserId("");
    setGrantRole("staff");
    setGrantOpen(true);
    try {
      const rows = await fetchTenantUsers({ data: { workspaceId: activeWorkspace.id } });
      setTenantUsers((rows ?? []) as TenantUser[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load organisation users");
    }
  }

  async function grantAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace || !grantUserId) return;
    setBusy(true);
    try {
      await addExisting({
        data: { workspaceId: activeWorkspace.id, targetUserId: grantUserId, role: grantRole },
      });
      toast.success("Access granted to this workspace");
      setGrantUserId("");
      setGrantOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not grant access");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(id: string, next: string) {    if (!activeWorkspace) return;
    try {
      await saveWorkspaceRow({
        data: {
          table: "workspace_members",
          workspaceId: activeWorkspace.id,
          id,
          data: { role: next as "owner" | "admin" | "staff" | "viewer" },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update role");
      return;
    }
    toast.success("Role updated");
    await load();
  }

  async function removeMember(id: string) {
    if (!activeWorkspace) return;
    try {
      await deleteWorkspaceRow({ data: { table: "workspace_members", workspaceId: activeWorkspace.id, id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove member");
      return;
    }
    toast.success("Member removed");
    await load();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-5 sm:py-10">
      <Link
        to="/app/w/$workspaceId"
        params={{ workspaceId: activeWorkspace?.id ?? "" }}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-gold"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Module launcher
      </Link>
      <div className="mt-3">
        <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">Team & Access</h1>
        <p className="text-sm text-muted-foreground">
          Members of {activeWorkspace?.name}. Package limit: {tenant?.user_count ?? 1} / {pkg?.max_users ?? "∞"} users.
        </p>
      </div>

      <Tabs defaultValue="users" className="mt-6">
        <TabsList className="grid w-full grid-cols-2 sm:w-fit">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="access">Role Access</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="pt-4">
          <Card>
            <CardHeader className="grid grid-cols-1 gap-4 border-b border-border sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <CardTitle>Workspace users</CardTitle>
                <CardDescription>Search members and set their role for this workspace.</CardDescription>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button className="min-w-0" variant="outline" onClick={openGrant}>
                  <ShieldCheck /> Give access
                </Button>
                <Button className="min-w-0" variant="navy" onClick={() => setCreateOpen(true)}>
                  <UserPlus /> Create user
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-b border-border p-4">
                <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, or role…" />
              </div>
              <div className="overflow-x-auto">
                <Table className="min-w-[680px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14 text-center">#</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-40">Role</TableHead>
                      <TableHead className="w-28 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && <TableSkeletonRows columns={5} rows={6} />}
                    {!loading && pager.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                          {members.length === 0 ? "No members yet." : `No member matches “${search}”.`}
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading &&
                      pager.items.map((m, index) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-center text-muted-foreground">{pager.start + index + 1}</TableCell>
                          <TableCell>
                            <p className="font-medium text-navy dark:text-foreground">
                              {m.profile?.full_name ?? m.profile?.email ?? m.user_id}
                            </p>
                            <p className="text-xs text-muted-foreground">{m.profile?.email ?? "—"}</p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell>
                            {m.role === "owner" ? (
                              <Badge variant="secondary">Owner</Badge>
                            ) : (
                              <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                                <SelectTrigger className="h-9 w-32" aria-label={`Role for ${m.profile?.email ?? m.user_id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="staff">Staff</SelectItem>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Edit user"
                                aria-label="Edit user"
                                onClick={() => {
                                  setEditing(m);
                                  setEditForm({ fullName: m.profile?.full_name ?? "", phone: "", password: "" });
                                }}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                              {m.role !== "owner" && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Remove access"
                                  aria-label="Remove access"
                                  onClick={() => removeMember(m.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
              {!loading && <PaginationBar p={pager} />}
            </CardContent>
          </Card>

          {/* #58 (BS New 3): dialog Create user / Give access / Edit user. */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create user</DialogTitle>
                <DialogDescription>Create an account and add it directly to this workspace.</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={addUser}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mname">Full name</Label>
                    <Input
                      id="mname"
                      value={form.fullName}
                      onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="memail">Email</Label>
                    <Input
                      id="memail"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mphone">Phone</Label>
                    <Input
                      id="mphone"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mpass">Password</Label>
                    <Input
                      id="mpass"
                      type="text"
                      minLength={8}
                      placeholder="Minimum 8 characters"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="navy" disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <UserPlus />} Create user
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Give workspace access</DialogTitle>
                <DialogDescription>
                  Select an existing organisation user and assign a role for this workspace.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={grantAccess}>
                <div className="space-y-2">
                  <Label>User</Label>
                  <Select value={grantUserId} onValueChange={setGrantUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenantUsers
                        .filter(
                          (user) =>
                            !user.memberships.some((membership) => membership.workspaceId === activeWorkspace?.id),
                        )
                        .map((user) => (
                          <SelectItem key={user.userId} value={user.userId}>
                            {user.fullName || user.email || user.userId}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={grantRole} onValueChange={(v) => setGrantRole(v as AccessRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCESS_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setGrantOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="navy" disabled={busy || !grantUserId}>
                    {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Grant access
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit user</DialogTitle>
                <DialogDescription>
                  Update {editing?.profile?.email ?? "this user"} or reset the password.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={saveEdit}>
                <div className="space-y-2">
                  <Label>Full name</Label>
                  <Input
                    value={editForm.fullName}
                    onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>New password</Label>
                  <Input
                    type="text"
                    minLength={8}
                    placeholder="Leave blank to keep current password"
                    value={editForm.password}
                    onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="navy" disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <Save />} Save
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="access" className="pt-4">
          <RoleAccessPanel workspaceId={activeWorkspace?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RoleAccessPanel({ workspaceId }: { workspaceId?: string }) {
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    const data = await listWorkspaceRows({
      data: {
        table: "workspace_role_access",
        workspaceId,
        orderBy: "created_at",
        orderDir: "asc",
        limit: 500,
      },
    });
    const existing = new Map((data?.rows ?? []).map((r) => [`${r.role}:${r.module_id}`, r as AccessRow]));
    const next: AccessRow[] = [];
    for (const role of ACCESS_ROLES) {
      for (const m of APP_MODULES.filter((mod) => !mod.disabled)) {
        // #58: kunci izin mencakup dashboard modul + setiap submodulnya.
        const keys = [m.id, ...m.submodules.map((sub) => `${m.id}/${sub.id}`)];
        for (const key of keys) {
          const found = existing.get(`${role}:${key}`);
          next.push(
            found ?? {
              role,
              module_id: key,
              can_view: true,
              can_edit: role !== "viewer",
            },
          );
        }
      }
    }
    setRows(next);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(role: AccessRole, moduleId: string, key: "can_view" | "can_edit", value: boolean) {
    setRows((prev) =>
      prev.map((r) =>
        r.role === role && r.module_id === moduleId
          ? { ...r, [key]: value, ...(key === "can_view" && !value ? { can_edit: false } : {}) }
          : r,
      ),
    );
  }

  async function save() {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await upsertWorkspaceRows({
        data: { table: "workspace_role_access", workspaceId, rows: rows.map((r) => ({ ...r })) },
      });
      toast.success("Role access saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save role access");
    } finally {
      setSaving(false);
    }
  }

  const modules = APP_MODULES.filter((m) => !m.disabled);

  return (
    <Card>
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 space-y-0 border-b border-border">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gold" /> Role access
          </CardTitle>
          <CardDescription>
            Set View and Edit access for every dashboard and submodule. Owners always have full access.
          </CardDescription>
        </div>
        <Button variant="navy" onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Accordion type="multiple" className="px-4 sm:px-6">
            {modules.map((module) => (
              <AccordionItem key={module.id} value={module.id} data-testid={`role-access-module-${module.id}`}>
                <AccordionTrigger className="gap-3 py-4 hover:no-underline">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-secondary">
                      <module.icon className="h-4 w-4 text-gold" />
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate font-semibold text-navy dark:text-primary-foreground">
                        {module.en}
                      </span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        Dashboard + {module.submodules.length} submodules
                      </span>
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    <PermissionLine
                      label="Dashboard & module access"
                      icon={<LayoutDashboard className="h-4 w-4" />}
                      accessKey={module.id}
                      rows={rows}
                      onToggle={toggle}
                    />
                    {module.submodules.map((submodule) => (
                      <PermissionLine
                        key={submodule.id}
                        label={submodule.en}
                        accessKey={`${module.id}/${submodule.id}`}
                        rows={rows}
                        onToggle={toggle}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

/** #58: satu baris izin (View/Edit) untuk dashboard modul atau sebuah submodul. */
function PermissionLine({
  label,
  icon,
  accessKey,
  rows,
  onToggle,
}: {
  label: string;
  icon?: React.ReactNode;
  accessKey: string;
  rows: AccessRow[];
  onToggle: (role: AccessRole, moduleId: string, key: "can_view" | "can_edit", value: boolean) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3" data-testid={`role-access-line-${accessKey}`}>
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        {icon}
        {label}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {ACCESS_ROLES.map((role) => {
          const row = rows.find((item) => item.role === role && item.module_id === accessKey);
          return (
            <div key={role} className="rounded-md bg-secondary/50 p-2.5">
              <p className="mb-2 text-xs font-semibold capitalize text-foreground">{role}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    aria-label={`${accessKey}:${role}:view`}
                    checked={row?.can_view ?? false}
                    onCheckedChange={(value) => onToggle(role, accessKey, "can_view", Boolean(value))}
                  />
                  View
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    aria-label={`${accessKey}:${role}:edit`}
                    checked={row?.can_edit ?? false}
                    disabled={!row?.can_view}
                    onCheckedChange={(value) => onToggle(role, accessKey, "can_edit", Boolean(value))}
                  />
                  Edit
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}