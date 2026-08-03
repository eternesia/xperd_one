import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

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

  const load = useCallback(async () => {
    if (!userId) {
      setTenant(null);
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: tenantRows } = await supabase
      .from("tenants")
      .select("id,name,subdomain,package_id,status,trial_ends_at,workspace_count,user_count")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);

    const t = (tenantRows?.[0] as TenantRecord | undefined) ?? null;
    setTenant(t);

    if (t?.package_id) {
      const { data: p } = await supabase
        .from("packages")
        .select("id,code,name,max_workspace,max_users,monthly_price")
        .eq("id", t.package_id)
        .maybeSingle();
      setPkg((p as PackageRecord | null) ?? null);
    } else {
      setPkg(null);
    }

    const { data: ws } = await supabase
      .from("workspaces")
      .select(
        "id,tenant_id,name,legal_name,slug,currency,timezone,fiscal_year_start_month,default_costing_method,status",
      )
      .order("created_at", { ascending: true });

    const list = (ws ?? []) as Workspace[];
    setWorkspaces(list);

    const stored = typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_KEY) : null;
    const next = list.find((w) => w.id === stored) ?? list[0] ?? null;
    setActiveId(next?.id ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (sessionLoading) return;
    void load();
  }, [sessionLoading, load]);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveId(id);
    window.localStorage.setItem(ACTIVE_KEY, id);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      loading: sessionLoading || loading,
      userId,
      email: session?.user.email ?? undefined,
      tenant,
      pkg,
      workspaces,
      activeWorkspace: workspaces.find((w) => w.id === activeId) ?? null,
      setActiveWorkspaceId,
      refresh: load,
    }),
    [sessionLoading, loading, userId, session?.user.email, tenant, pkg, workspaces, activeId, setActiveWorkspaceId, load],
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