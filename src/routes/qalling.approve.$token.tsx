import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageSquareWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { decideApprovalPublic, getApprovalPublic } from "@/lib/agency.functions";

export const Route = createFileRoute("/qalling/approve/$token")({
  head: () => ({
    meta: [{ title: "Persetujuan konten" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ApprovePage,
});

function ApprovePage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["approval-public", token],
    queryFn: () => getApprovalPublic({ data: { token } }),
  });
  const decide = useMutation({
    mutationFn: (decision: "approved" | "changes_requested") =>
      decideApprovalPublic({ data: { token, decision, name, comment } }),
    onSuccess: () => {
      setError("");
      qc.invalidateQueries({ queryKey: ["approval-public", token] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const a = q.data;
  return (
    <main className="min-h-screen bg-secondary/30 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        {q.isLoading && <p className="text-center text-sm text-muted-foreground">Memuat…</p>}
        {!q.isLoading && !a && (
          <div className="rounded-xl border bg-background p-8 text-center">
            <h1 className="text-lg font-semibold">Link tidak ditemukan</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Link persetujuan ini tidak valid. Minta tim Anda mengirim ulang.
            </p>
          </div>
        )}
        {a && (
          <>
            <header>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {a.brand}
                {a.clientLabel ? ` · ${a.clientLabel}` : ""}
              </p>
              <h1 className="text-2xl font-bold">Mohon tinjau postingan ini</h1>
              {a.message && (
                <p className="mt-2 rounded-lg bg-background p-3 text-sm">{a.message}</p>
              )}
            </header>

            <article className="space-y-3 rounded-xl border bg-background p-4">
              <h2 className="font-semibold">{a.title}</h2>
              {a.mediaUrls.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {a.mediaUrls.map((u) => (
                    <img
                      key={u}
                      src={u}
                      alt=""
                      className="w-full rounded-lg border object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
              {a.mediaCount > a.mediaUrls.length && (
                <p className="text-xs text-muted-foreground">
                  + {a.mediaCount - a.mediaUrls.length} lampiran lain
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm">{a.caption}</p>
              {a.accounts.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Tayang di: {a.accounts.map((x) => `${x.account_name} (${x.platform})`).join(", ")}
                </p>
              )}
            </article>

            {a.status === "pending" && !a.expired && (
              <section className="space-y-3 rounded-xl border bg-background p-4">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama Anda"
                  maxLength={120}
                  aria-label="Nama Anda"
                />
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Catatan atau revisi (wajib jika meminta revisi)"
                  rows={3}
                  maxLength={2000}
                  aria-label="Catatan"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={decide.isPending || !name.trim()}
                    onClick={() => decide.mutate("approved")}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Setujui
                  </Button>
                  <Button
                    variant="outline"
                    disabled={decide.isPending || !name.trim()}
                    onClick={() => decide.mutate("changes_requested")}
                  >
                    <MessageSquareWarning className="h-4 w-4" /> Minta revisi
                  </Button>
                </div>
              </section>
            )}
            {a.status === "approved" && (
              <p className="rounded-xl border border-green-600/30 bg-green-50 p-4 text-sm text-green-900 dark:bg-green-950/30 dark:text-green-200">
                ✅ Disetujui{a.decidedBy ? ` oleh ${a.decidedBy}` : ""}. Terima kasih!
              </p>
            )}
            {a.status === "changes_requested" && (
              <p className="rounded-xl border p-4 text-sm">
                Revisi diminta{a.decidedBy ? ` oleh ${a.decidedBy}` : ""}
                {a.decidedComment ? `: ${a.decidedComment}` : "."} Tim akan memperbarui postingan.
              </p>
            )}
            {a.status === "cancelled" && (
              <p className="rounded-xl border p-4 text-sm">Permintaan ini dibatalkan oleh tim.</p>
            )}
            {a.expired && (
              <p className="rounded-xl border p-4 text-sm">
                Link ini sudah kedaluwarsa. Minta tim mengirim ulang.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
