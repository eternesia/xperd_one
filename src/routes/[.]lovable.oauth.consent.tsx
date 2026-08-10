import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthClient = {
  name?: string;
  client_id?: string;
};

type OAuthAuthorizationDetails = {
  client?: OAuthClient;
  redirect_url?: string;
  redirect_to?: string;
};

type OAuthRedirect = {
  redirect_url?: string;
  redirect_to?: string;
};

async function getAuthorizationDetails(authorizationId: string): Promise<{ data: OAuthAuthorizationDetails; error: null } | { data: null; error: Error }> {
  const result = (await (supabase.auth.oauth as unknown as { getAuthorizationDetails: (id: string) => Promise<{ data: OAuthAuthorizationDetails | OAuthRedirect; error: Error | null }> }).getAuthorizationDetails(authorizationId));
  return result as { data: OAuthAuthorizationDetails; error: null } | { data: null; error: Error };
}

async function approveAuthorization(authorizationId: string): Promise<{ data: OAuthRedirect; error: null } | { data: null; error: Error }> {
  const result = (await (supabase.auth.oauth as unknown as { approveAuthorization: (id: string) => Promise<{ data: OAuthRedirect; error: Error | null }> }).approveAuthorization(authorizationId));
  return result as { data: OAuthRedirect; error: null } | { data: null; error: Error };
}

async function denyAuthorization(authorizationId: string): Promise<{ data: OAuthRedirect; error: null } | { data: null; error: Error }> {
  const result = (await (supabase.auth.oauth as unknown as { denyAuthorization: (id: string) => Promise<{ data: OAuthRedirect; error: Error | null }> }).denyAuthorization(authorizationId));
  return result as { data: OAuthRedirect; error: null } | { data: null; error: Error };
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !(data as OAuthAuthorizationDetails).client) throw redirect({ href: immediate });
    return data as OAuthAuthorizationDetails;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="grid min-h-screen place-items-center px-4">
      <p className="text-center text-sm text-muted-foreground">
        Could not load this authorization request: {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await approveAuthorization(authorization_id)
      : await denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold">
          Connect {details?.client?.name ?? "an app"} to your XPERD account
        </h1>
        <p className="text-sm text-muted-foreground">
          This lets {details?.client?.name ?? "the client"} use this app as you. Only approved clients can access your
          workspace data.
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
          >
            Deny
          </button>
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-navy/90"
          >
            Approve
          </button>
        </div>
      </div>
    </main>
  );
}
