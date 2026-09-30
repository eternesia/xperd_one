import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { getAppShellData } from "@/lib/app-shell.functions";
import { getWorkspaceAccess, type WorkspaceRole } from "@/lib/team.functions";

export interface Workspace {
  id: string;
  tenant_id: string;
  name: string;
  legal_name: string | null;
  slug: string;
  currency: string;
  timezone: string;
  fiscal_year_start_month: number;
  default_costing_method: "FIFO" | "LIFO" | "AVERAGE";
  address: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  doc_template: string;
  bank_info: string | null;
  doc_footer_note: string | null;
  /** #4 (BS New): logo dokumen (data URL) milik workspace. */
  logo_url: string | null;
  status: "setup" | "active" | "suspended";
}

export interface TenantRecord {
  id: string;
  name: string;
  subdomain: string;
  package_id: string | null;
  status: string;
  trial_ends_at: string | null;
  workspace_count: number;
  user_count: number;
}

export interface PackageRecord {
  id: string;
  code: string;
  name: string;
  max_workspace: number | null;
  max_users: number | null;
  monthly_price: number | null;
}

const ACTIVE_KEY = "xperd-active-workspace";

interface AppContextValue {
  loading: boolean;
  userId?: string;
  email?: string;
  tenant: TenantRecord | null;
  pkg: PackageRecord | null;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  /** #58 (BS New 3): peran pada workspace aktif + izin per modul/submodul. */
  workspaceRole: WorkspaceRole | null;
  accessLoading: boolean;
  canViewModule: (moduleId: string) => boolean;
  canViewSubmodule: (moduleId: string, submoduleId: string) => boolean;
  canEditSubmodule: (moduleId: string, submoduleId: string) => boolean;
  setActiveWorkspaceId: (id: string) => void;
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: sessionLoading } = useSession();
  const userId = session?.user.id;

  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [pkg, setPkg] = useState<PackageRecord | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // #58: peran + izin per kunci akses (`module` atau `module/submodule`).
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole | null>(null);
  const [roleAccess, setRoleAccess] = useState<Map<string, { canView: boolean; canEdit: boolean }>>(new Map());
  const [accessLoading, setAccessLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setTenant(null);
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const shell = await getAppShellData();
      setTenant(shell?.tenant ?? null);
      setPkg(shell?.pkg ?? null);
      const list = shell?.workspaces ?? [];
      setWorkspaces(list);

      const stored = typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_KEY) : null;
      const next = list.find((w) => w.id === stored) ?? list[0] ?? null;
      setActiveId(next?.id ?? null);
    } catch {
      // Transient server-fn failure — don't leave the app stuck. Treat as
      // "no shell data yet" so the UI can render (e.g. onboarding step 1).
      setTenant(null);
      setPkg(null);
      setWorkspaces([]);
      setActiveId(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (sessionLoading) return;
    void load();
  }, [sessionLoading, load]);

  // #58: muat peran & izin setiap kali workspace aktif berubah.
  useEffect(() => {
    let cancelled = false;
    async function loadAccess() {
      if (!userId || !activeId) {
        setWorkspaceRole(null);
        setRoleAccess(new Map());
        setAccessLoading(false);
        return;
      }
      setAccessLoading(true);
      try {
        const result = await getWorkspaceAccess({ data: { workspaceId: activeId } });
        if (cancelled) return;
        setWorkspaceRole(result?.role ?? null);
        setRoleAccess(new Map((result?.access ?? []).map((row) => [row.module_id, { canView: row.can_view, canEdit: row.can_edit }])));
      } catch {
        if (cancelled) return;
        // Gagal memuat izin → biarkan tampil (jangan mengunci seluruh aplikasi).
        setWorkspaceRole(null);
        setRoleAccess(new Map());
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    }
    void loadAccess();
    return () => {
      cancelled = true;
    };
  }, [activeId, userId]);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveId(id);
    window.localStorage.setItem(ACTIVE_KEY, id);
  }, []);

  const value = useMemo<AppContextValue>(
    () => {
      const isOwner = workspaceRole === "owner";
      const modulePermission = (moduleId: string) => roleAccess.get(moduleId);
      const submodulePermission = (moduleId: string, submoduleId: string) =>
        roleAccess.get(`${moduleId}/${submoduleId}`);
      return {
        loading: sessionLoading || loading,
        userId,
        email: session?.user.email ?? undefined,
        tenant,
        pkg,
        workspaces,
        activeWorkspace: workspaces.find((w) => w.id === activeId) ?? null,
        workspaceRole,
        accessLoading,
        canViewModule: (moduleId) =>
          Boolean(workspaceRole) && (isOwner || (modulePermission(moduleId)?.canView ?? true)),
        canViewSubmodule: (moduleId, submoduleId) =>
          Boolean(workspaceRole) &&
          (isOwner ||
            ((modulePermission(moduleId)?.canView ?? true) &&
              (submodulePermission(moduleId, submoduleId)?.canView ?? true))),
        canEditSubmodule: (moduleId, submoduleId) =>
          Boolean(workspaceRole) &&
          (isOwner ||
            ((modulePermission(moduleId)?.canEdit ?? workspaceRole !== "viewer") &&
              (submodulePermission(moduleId, submoduleId)?.canEdit ?? workspaceRole !== "viewer"))),
        setActiveWorkspaceId,
        refresh: load,
      };
    },
    [
      sessionLoading,
      loading,
      userId,
      session?.user.email,
      tenant,
      pkg,
      workspaces,
      activeId,
      workspaceRole,
      accessLoading,
      roleAccess,
      setActiveWorkspaceId,
      load,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}