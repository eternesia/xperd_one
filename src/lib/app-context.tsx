import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getInstanceInfo } from "@/lib/instances.functions";
import type { InstanceInfo } from "@/lib/instance.server";
import { useSession } from "@/hooks/use-session";
import { findModule } from "@/lib/modules";
import { getAppShellData } from "@/lib/app-shell.functions";
import { getWorkspaceAccess, type WorkspaceRole } from "@/lib/team.functions";
import { getWorkspaceEntitlements } from "@/lib/addon-catalog.functions";
import { hasCatalogFeature, type Entitlements } from "@/lib/entitlements";

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
  /** #53 (BS New 3): pengaturan kop surat tender (kolom JSON). */
  letterhead_config?: {
    show_address?: boolean;
    show_tax_id?: boolean;
    show_phone?: boolean;
    show_email?: boolean;
    show_divider?: boolean;
    background_url?: string;
  } | null;
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
  /** Nama peran kustom anggota (null = peran bawaan). */
  customRole: string | null;
  /** Boleh membuka Tim, Pengaturan, Tagihan & Paket, Backup: owner, atau admin tanpa peran kustom. */
  isWorkspaceManager: boolean;
  accessLoading: boolean;
  /** Entitlement add-on workspace aktif (tier + opsi + override); `{}` bila tidak ada add-on aktif. */
  entitlements: Entitlements;
  refreshEntitlements: () => Promise<void>;
  canViewModule: (moduleId: string) => boolean;
  canViewSubmodule: (moduleId: string, submoduleId: string) => boolean;
  canEditSubmodule: (moduleId: string, submoduleId: string) => boolean;
  setActiveWorkspaceId: (id: string) => void;
  refresh: () => Promise<void>;
  /** Instalasi klien (self-hosted): lisensi & modul yang diizinkan; null = memuat / SaaS biasa. */
  instance: InstanceInfo | null;
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
  const [customRole, setCustomRole] = useState<string | null>(null);
  const [roleAccess, setRoleAccess] = useState<Map<string, { canView: boolean; canEdit: boolean }>>(
    new Map(),
  );
  const [accessLoading, setAccessLoading] = useState(true);
  const [entitlements, setEntitlements] = useState<Entitlements>({});
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [instance, setInstance] = useState<InstanceInfo | null>(null);
  useEffect(() => {
    getInstanceInfo()
      .then(setInstance)
      .catch(() => setInstance(null));
  }, [userId]);

  const refreshEntitlements = useCallback(async () => {
    if (!userId || !activeId) {
      setEntitlements({});
      return;
    }
    try {
      setEntitlements(await getWorkspaceEntitlements({ data: { workspaceId: activeId } }));
    } catch {
      setEntitlements({});
    }
  }, [userId, activeId]);

  useEffect(() => {
    let cancelled = false;
    setEntitlementsLoading(true);
    void refreshEntitlements().finally(() => {
      if (!cancelled) setEntitlementsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshEntitlements]);

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
        setCustomRole(null);
        setRoleAccess(new Map());
        setAccessLoading(false);
        return;
      }
      setAccessLoading(true);
      try {
        const result = await getWorkspaceAccess({ data: { workspaceId: activeId } });
        if (cancelled) return;
        setWorkspaceRole(result?.role ?? null);
        setCustomRole(result?.custom_role ?? null);
        setRoleAccess(
          new Map(
            (result?.access ?? []).map((row) => [
              row.module_id,
              { canView: row.can_view, canEdit: row.can_edit },
            ]),
          ),
        );
      } catch {
        if (cancelled) return;
        // Gagal memuat izin → biarkan tampil (jangan mengunci seluruh aplikasi).
        setWorkspaceRole(null);
        setCustomRole(null);
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

  const value = useMemo<AppContextValue>(() => {
    const isOwner = workspaceRole === "owner";
    const isManager = workspaceRole === "owner" || workspaceRole === "admin";
    // BS New 11: submodul `managerOnly` (mis. XPro keuangan/beban kerja) tertutup bagi Staff/Viewer.
    const managerOnly = (moduleId: string, submoduleId: string) =>
      Boolean(findModule(moduleId)?.submodules.find((s) => s.id === submoduleId)?.managerOnly);
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
      customRole,
      isWorkspaceManager: isOwner || (workspaceRole === "admin" && !customRole),
      accessLoading: accessLoading || entitlementsLoading,
      entitlements,
      refreshEntitlements,
      canViewModule: (moduleId) =>
        // Instalasi klien: hanya modul yang ada di lisensi.
        (!instance?.selfHosted || instance.modules.includes(moduleId)) &&
        Boolean(workspaceRole) &&
        (isOwner || (modulePermission(moduleId)?.canView ?? true)),
      canViewSubmodule: (moduleId, submoduleId) =>
        (!instance?.selfHosted || instance.modules.includes(moduleId)) &&
        hasCatalogFeature(entitlements, moduleId, submoduleId) &&
        Boolean(workspaceRole) &&
        (isManager || !managerOnly(moduleId, submoduleId)) &&
        (isOwner ||
          ((modulePermission(moduleId)?.canView ?? true) &&
            (submodulePermission(moduleId, submoduleId)?.canView ?? true))),
      canEditSubmodule: (moduleId, submoduleId) =>
        (!instance?.selfHosted ||
          (instance.modules.includes(moduleId) && instance.status !== "expired")) &&
        hasCatalogFeature(entitlements, moduleId, submoduleId) &&
        Boolean(workspaceRole) &&
        (isManager || !managerOnly(moduleId, submoduleId)) &&
        (isOwner ||
          ((modulePermission(moduleId)?.canEdit ?? workspaceRole !== "viewer") &&
            (submodulePermission(moduleId, submoduleId)?.canEdit ?? workspaceRole !== "viewer"))),
      setActiveWorkspaceId,
      refresh: load,
      instance,
    };
  }, [
    instance,
    sessionLoading,
    loading,
    userId,
    session?.user.email,
    tenant,
    pkg,
    workspaces,
    activeId,
    workspaceRole,
    customRole,
    accessLoading,
    entitlements,
    entitlementsLoading,
    refreshEntitlements,
    roleAccess,
    setActiveWorkspaceId,
    load,
  ]);

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
