import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, Save, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { createWorkspaceUser, updateWorkspaceUser } from "@/lib/team.functions";

export const Route = createFileRoute("/app/w/$workspaceId/team")({
  component: TeamPage,
});

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { full_name: string | null; email: string | null } | null;
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

  const createUser = useServerFn(createWorkspaceUser);
  const updateUser = useServerFn(updateWorkspaceUser);

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

  async function changeRole(id: string, next: string) {
    if (!activeWorkspace) return;
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">Team & Access</h1>
        <p className="text-sm text-muted-foreground">
          Members of {activeWorkspace?.name}. Package limit: {tenant?.user_count ?? 1} / {pkg?.max_users ?? "∞"} users.
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="access">Role Access</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Create user</CardTitle>
              <CardDescription>
                Accounts are created directly here — no separate sign-up needed. Share the password with the user.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={addUser}>
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
                    placeholder="min. 8 characters"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    required
                  />
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
                <div className="flex items-end">
                  <Button type="submit" variant="navy" disabled={busy} className="w-full">
                    {busy ? <Loader2 className="animate-spin" /> : <UserPlus />} Create user
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {editing && (
            <Card>
              <CardHeader>
                <CardTitle>Edit {editing.profile?.email ?? "user"}</CardTitle>
                <CardDescription>Update the profile or reset the password.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={saveEdit}>
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
                      placeholder="leave blank to keep"
                      value={editForm.password}
                      onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button type="submit" variant="navy" disabled={busy}>
                      {busy ? <Loader2 className="animate-spin" /> : <Save />} Save
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!loading && members.length === 0 && <p className="text-sm text-muted-foreground">No members yet.</p>}
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy dark:text-primary-foreground">
                      {m.profile?.full_name ?? m.profile?.email ?? m.user_id}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.profile?.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.role === "owner" ? (
                      <Badge variant="secondary" className="uppercase">
                        owner
                      </Badge>
                    ) : (
                      <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                        <SelectTrigger className="h-9 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(m);
                        setEditForm({ fullName: m.profile?.full_name ?? "", phone: "", password: "" });
                      }}
                    >
                      <KeyRound /> Edit
                    </Button>
                    {m.role !== "owner" && (
                      <Button size="sm" variant="outline" onClick={() => removeMember(m.id)}>
                        <Trash2 /> Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
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
      data: { table: "workspace_role_access", workspaceId, limit: 500 },
    });
    const existing = new Map((data?.rows ?? []).map((r) => [`${r.role}:${r.module_id}`, r as AccessRow]));
    const next: AccessRow[] = [];
    for (const role of ACCESS_ROLES) {
      for (const m of APP_MODULES.filter((mod) => !mod.disabled)) {
        const found = existing.get(`${role}:${m.id}`);
        next.push(
          found ?? {
            role,
            module_id: m.id,
            can_view: true,
            can_edit: role !== "viewer",
          },
        );
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
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gold" /> Role access
          </CardTitle>
          <CardDescription>Choose which modules each role can open and edit in this workspace.</CardDescription>
        </div>
        <Button variant="navy" onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-left">Module</th>
                {ACCESS_ROLES.map((r) => (
                  <th key={r} className="py-2 text-center capitalize">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id} className="border-b border-border/60">
                  <td className="py-2 font-medium text-navy dark:text-primary-foreground">{m.en}</td>
                  {ACCESS_ROLES.map((role) => {
                    const row = rows.find((r) => r.role === role && r.module_id === m.id);
                    return (
                      <td key={role} className="py-2">
                        <div className="flex items-center justify-center gap-4">
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Checkbox
                              checked={row?.can_view ?? false}
                              onCheckedChange={(v) => toggle(role, m.id, "can_view", Boolean(v))}
                            />
                            view
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Checkbox
                              checked={row?.can_edit ?? false}
                              disabled={!row?.can_view}
                              onCheckedChange={(v) => toggle(role, m.id, "can_edit", Boolean(v))}
                            />
                            edit
                          </label>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}