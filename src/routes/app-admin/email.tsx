import { createFileRoute } from "@tanstack/react-router";
import { EmailGatewayPanel } from "@/components/app/EmailGatewayPanel";

export const Route = createFileRoute("/app-admin/email")({
  component: () => (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Email Gateway & Notifikasi</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Dipakai untuk OTP pendaftaran mandiri, email selamat datang, dan penagihan.
      </p>
      <EmailGatewayPanel workspaceId={null} />
    </div>
  ),
});
