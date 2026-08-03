import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { AdminSelect } from "@/components/app/admin-ui";

export const Route = createFileRoute("/app-admin/tickets")({
  component: TicketsPage,
});

const STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"];

function TicketsPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["admin-ticket-messages", activeId],
    enabled: Boolean(activeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", activeId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status, resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tickets"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!activeId || !reply.trim()) throw new Error("Write a reply first");
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: activeId,
        author_id: userRes.user!.id,
        body: reply.trim(),
        is_internal: internal,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReply("");
      toast.success("Reply sent");
      qc.invalidateQueries({ queryKey: ["admin-ticket-messages", activeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const active = tickets.find((t) => t.id === activeId) ?? null;
  const openCount = tickets.filter((t) => t.status === "open").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-navy">
          <LifeBuoy className="h-5 w-5 text-gold" /> Help Desk
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Support tickets raised by tenants, with threaded replies and internal notes.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Total tickets" value={tickets.length} />
        <Metric label="Open" value={openCount} />
        <Metric label="Resolved" value={tickets.filter((t) => t.status === "resolved" || t.status === "closed").length} />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && tickets.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No tickets yet.</TableCell></TableRow>
              )}
              {tickets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <p className="font-medium text-navy">{t.ticket_no}</p>
                    <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                  </TableCell>
                  <TableCell className="max-w-[280px] text-sm">
                    <p className="truncate font-medium">{t.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.category}</p>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{t.priority}</Badge></TableCell>
                  <TableCell className="w-44">
                    <AdminSelect value={t.status} onChange={(v: string) => setStatus.mutate({ id: t.id, status: v })}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </AdminSelect>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setActiveId(t.id)}>
                      <MessageSquare className="h-3.5 w-3.5" /> Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(activeId)} onOpenChange={(o) => !o && setActiveId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{active ? `${active.ticket_no} — ${active.subject}` : "Ticket"}</DialogTitle>
          </DialogHeader>
          {active?.description && (
            <p className="rounded-lg bg-secondary/60 p-3 text-sm text-muted-foreground">{active.description}</p>
          )}
          <div className="space-y-3">
            {messages.length === 0 && <p className="text-sm text-muted-foreground">No replies yet.</p>}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg border p-3 text-sm ${m.is_internal ? "border-gold/40 bg-gold/10" : "border-border bg-card"}`}
              >
                <p className="mb-1 text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleString()} {m.is_internal ? "· internal note" : ""}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Internal note (hidden from tenant)
              </label>
              <Button variant="gold" onClick={() => send.mutate()} disabled={send.isPending}>
                <Send className="h-4 w-4" /> Send reply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-bold text-navy">{value}</CardContent>
    </Card>
  );
}