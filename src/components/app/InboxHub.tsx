import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, MessagesSquare, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CrmInboxView } from "@/components/app/CrmInbox";
import { WaChat } from "@/components/app/WaChat";
import { getCrmWaSettings } from "@/lib/crm.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Tab = "dm" | "wa";

/** Inbox satu halaman: tab DM media sosial (Tebar) dan WhatsApp (Kirimdev). */
export function InboxHub({ workspaceId }: { workspaceId: string }) {
  const { pick } = useI18n();
  const { entitlements } = useApp();
  const f = entitlements.qalling?.features ?? {};
  const hasDm = f.inbox_dm === true || f.legacy === true;
  const hasWa = f.whatsapp === true || f.legacy === true;
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("tab");
      if (q === "wa" && hasWa) return "wa";
    } catch {
      /* SSR */
    }
    return hasDm ? "dm" : "wa";
  });
  const wa = useQuery({
    queryKey: ["crm-wa-settings", workspaceId],
    enabled: hasWa,
    queryFn: () => getCrmWaSettings({ data: { workspaceId } }),
  });
  const waConnected = !!wa.data?.managed && !!wa.data?.phone_number_id;
  const tabs = [
    hasDm && {
      id: "dm" as const,
      label: pick("Social DM", "DM Media Sosial"),
      icon: MessagesSquare,
    },
    hasWa && { id: "wa" as const, label: "WhatsApp", icon: MessageCircle },
  ].filter(Boolean) as { id: Tab; label: string; icon: typeof MessageCircle }[];

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-medium">Inbox</h1>
        {tabs.length > 1 && (
          <div className="grid w-full grid-cols-2 gap-1 rounded-full bg-muted p-1 sm:w-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium",
                  tab === t.id ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                <t.icon className="size-4" />
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {tab === "dm" ? (
        <CrmInboxView workspaceId={workspaceId} embedded />
      ) : wa.isLoading ? null : waConnected ? (
        <WaChat workspaceId={workspaceId} />
      ) : (
        <section className="mx-auto max-w-xl rounded-3xl border bg-card p-6 text-center shadow-sm sm:rounded-2xl">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600">
            <MessageCircle className="size-7" />
          </span>
          <p className="mt-3 font-semibold">
            {pick("Connect your WhatsApp number", "Hubungkan nomor WhatsApp Anda")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pick(
              "Customer chats on WhatsApp will appear here, next to your social media DMs.",
              "Chat pelanggan dari WhatsApp akan muncul di sini, bersama DM media sosial.",
            )}
          </p>
          <Button
            asChild
            className="mt-4 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Link to="/qalling/app/$submoduleId" params={{ submoduleId: "wa-gateway" }}>
              <Smartphone /> {pick("Connect number", "Hubungkan nomor")}
            </Link>
          </Button>
        </section>
      )}
    </div>
  );
}
