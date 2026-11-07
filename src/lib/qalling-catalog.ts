import { useQuery } from "@tanstack/react-query";
import { getPublicQallingCatalog } from "@/lib/qalling-site.functions";

export const QALLING_FEATURE_LABELS: Record<string, { id: string; en: string }> = {
  publishing: {
    id: "Posting, jadwal & pustaka media",
    en: "Publishing, scheduling & media library",
  },
  ideas_campaigns: { id: "Ide, Kanban & kampanye", en: "Ideas, Kanban & campaigns" },
  comments: { id: "Komentar & interaksi", en: "Comments & interactions" },
  insights: { id: "Insight & analitik", en: "Insights & analytics" },
  inbox_dm: { id: "Kotak masuk DM terpadu", en: "Unified DM inbox" },
  crm: { id: "Prospek, pipeline & kontak", en: "Leads, pipeline & contacts" },
  automations: { id: "Balasan otomatis", en: "Reply automations" },
  templates: { id: "Template pesan", en: "Message templates" },
  mcp_api: { id: "Integrasi AI (MCP/API)", en: "AI integration (MCP/API)" },
  tender: { id: "Tender & dokumen", en: "Tenders & documents" },
  client_approval: { id: "Persetujuan konten oleh klien", en: "Client content approval" },
  white_label_reports: { id: "Laporan klien white-label", en: "White-label client reports" },
  lead_invoice: {
    id: "Invoice dari prospek closing (link, PDF, WhatsApp)",
    en: "Invoices from closed leads (link, PDF, WhatsApp)",
  },
  activity_log: { id: "Log aktivitas tim", en: "Team activity log" },
  whatsapp: { id: "WhatsApp & broadcast", en: "WhatsApp & broadcasts" },
};
export function useQallingCatalog() {
  return useQuery({
    queryKey: ["addon-tiers", "qalling-public"],
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: () => getPublicQallingCatalog(),
  });
}
