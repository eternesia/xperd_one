import { useEffect, useState } from "react";

import { currentAppUser, getIsAdmin } from "@/lib/auth.functions";

export type SessionUser = { id: string; email: string; fullName: string | null };
// Shape mirrors the old supabase Session (session.user.id / session.user.email)
// so consumers keep working.
export type AppSession = { user: SessionUser } | null;

const AUTH_EVENT = "xperd:auth-change";

// Call after login/logout so open tabs re-read the cookie session.
export function emitAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
}

export function useSession() {
  const [session, setSession] = useState<AppSession>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const user = await currentAppUser();
        if (!active) return;
        setSession(user ? { user } : null);
      } catch {
        // A rejected server-fn call must not leave loading=true forever.
        if (!active) return;
        setSession(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    window.addEventListener(AUTH_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(AUTH_EVENT, load);
    };
  }, []);

  return { session, loading };
}

export function useIsAdmin(userId?: string) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setIsAdmin(null);
      return;
    }
    getIsAdmin({ data: userId }).then((value) => {
      if (active) setIsAdmin(Boolean(value));
    });
    return () => {
      active = false;
    };
  }, [userId]);

  return isAdmin;
}