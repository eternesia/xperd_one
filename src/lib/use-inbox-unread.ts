import { useQuery } from "@tanstack/react-query";
import { listConversations } from "@/lib/social-interactions.functions";
import { listWaChats } from "@/lib/kirimdev.functions";

/** Jumlah pesan belum dibaca (DM media sosial + WhatsApp) untuk badge menu Inbox. Diperbarui tiap menit. */
export function useInboxUnread(workspaceId: string | null, dm: boolean, wa: boolean) {
  const dmQ = useQuery({
    queryKey: ["inbox-unread-dm", workspaceId],
    enabled: !!workspaceId && dm,
    refetchInterval: 60_000,
    queryFn: async () => {
      const rows = (await listConversations({ data: { workspaceId: workspaceId! } })) as {
        unread_count?: number;
      }[];
      return rows.reduce((n, r) => n + Number(r.unread_count ?? 0), 0);
    },
  });
  const waQ = useQuery({
    queryKey: ["inbox-unread-wa", workspaceId],
    enabled: !!workspaceId && wa,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const rows = await listWaChats({ data: { workspaceId: workspaceId!, status: "open" } });
        return rows.reduce((n, r) => n + r.unread, 0);
      } catch {
        return 0; // nomor belum terhubung
      }
    },
  });
  return (dmQ.data ?? 0) + (waQ.data ?? 0);
}
