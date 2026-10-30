import { createFileRoute } from "@tanstack/react-router";
import { WalletTopupAdmin } from "@/components/app/WalletTopupAdmin";
export const Route = createFileRoute("/app-admin/wallet")({
  head: () => ({
    meta: [
      { title: "Deposit & Top-up — XPERD Super Admin" },
      { name: "description", content: "Verifikasi deposit tenant dan riwayat top-up XPERD." },
      { property: "og:title", content: "Deposit & Top-up — XPERD" },
      { property: "og:description", content: "Verifikasi deposit tenant XPERD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: WalletTopupAdmin,
});
