import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Plus, ReceiptText, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow } from "@/lib/data.functions";
import { waLink } from "@/lib/crm";
import { useApp } from "@/lib/app-context";

export const DEFAULT_REPLIES = [
  {
    name: "Salam pembuka",
    body: "Halo kak, terima kasih sudah menghubungi kami 🙏 Ada yang bisa kami bantu?",
  },
  {
    name: "Format order",
    body: "Untuk order, mohon isi format berikut ya kak:\nNama:\nNo. HP:\nAlamat lengkap:\nProduk & jumlah:",
  },
  {
    name: "Info pricelist",
    body: "Berikut info harga terbaru kami kak. Kalau ada pertanyaan, langsung balas chat ini ya 😊",
  },
  {
    name: "Rekening pembayaran",
    body: "Pembayaran bisa ditransfer ke:\nBank: \nNo. rekening: \nAtas nama: \nMohon kirim bukti transfer setelah bayar ya kak 🙏",
  },
  { name: "Terima kasih", body: "Terima kasih sudah order kak! Pesanan segera kami proses 🙌" },
];

type Tpl = { id: string; name: string; body: string; channel: string };

function useTemplates(workspaceId: string, channel: string) {
  return useQuery({
    queryKey: ["crm-templates", workspaceId, channel],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: {
          table: "crm_templates",
          workspaceId,
          filters: { channel, is_active: 1 },
          orderBy: "name",
          orderDir: "asc",
          limit: 200,
        },
      });
      return (data.rows ?? []) as unknown as Tpl[];
    },
  });
}

/** Popover of saved + built-in reply templates; selecting one fills the reply box. */
export function QuickReplies({
  workspaceId,
  onPick,
}: {
  workspaceId: string;
  onPick: (text: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", body: "" });
  const saved = useTemplates(workspaceId, "quick_reply");
  const add = useMutation({
    mutationFn: async () => {
      await saveWorkspaceRow({
        data: {
          table: "crm_templates",
          workspaceId,
          data: {
            channel: "quick_reply",
            name: draft.name.trim(),
            body: draft.body.trim(),
            is_active: 1,
          },
        },
      });
    },
    onSuccess: () => {
      setDraft({ name: "", body: "" });
      qc.invalidateQueries({ queryKey: ["crm-templates", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "crm_templates", workspaceId, id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-templates", workspaceId] }),
  });
  const pick = (t: string) => {
    onPick(t);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <MessageSquareText className="size-4" />
          Template
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[90vw] p-2" align="start">
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {[
            ...(saved.data ?? []),
            ...DEFAULT_REPLIES.map((d, i) => ({ id: `d${i}`, ...d, channel: "" })),
          ].map((t) => (
            <div key={t.id} className="group flex items-start gap-1 rounded-md hover:bg-muted">
              <button
                type="button"
                className="min-w-0 flex-1 p-2 text-left"
                onClick={() => pick(t.body)}
              >
                <p className="text-sm font-medium">{t.name}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{t.body}</p>
              </button>
              {!t.id.startsWith("d") && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Hapus ${t.name}`}
                  onClick={() => del.mutate(t.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-2 border-t pt-2">
          <Input
            placeholder="Nama template baru"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <Textarea
            rows={2}
            placeholder="Isi pesan"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={!draft.name.trim() || !draft.body.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            <Plus className="size-4" />
            Simpan template
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const idr = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
type Line = { name: string; qty: number; price: number };

export function buildQuickInvoice(
  customer: string,
  lines: Line[],
  note: string,
  bank?: string | null,
) {
  const valid = lines.filter((l) => l.name.trim() && l.qty > 0);
  const total = valid.reduce((s, l) => s + l.qty * l.price, 0);
  const rows = valid.map(
    (l, i) => `${i + 1}. ${l.name} x${l.qty} @ ${idr(l.price)} = ${idr(l.qty * l.price)}`,
  );
  return {
    total,
    text: [
      `*INVOICE*`,
      `Kepada: ${customer}`,
      "",
      ...rows,
      "",
      `*Total: ${idr(total)}*`,
      bank ? `\nTransfer ke:\n${bank}` : "",
      note ? `\n${note}` : "",
    ]
      .join("\n")
      .trim(),
  };
}

/** Quick invoice with a mini catalog (saved products) and a WhatsApp-ready summary. */
export function QuickInvoice({
  workspaceId,
  customer,
  phone,
  onUse,
}: {
  workspaceId: string;
  customer: string;
  phone?: string | null;
  onUse?: (text: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ name: "", qty: 1, price: 0 }]);
  const { activeWorkspace: ws } = useApp();
  const [note, setNote] = useState(ws?.doc_footer_note || "Mohon kirim bukti bayar ya 🙏");
  const catalog = useTemplates(workspaceId, "catalog");
  const inv = buildQuickInvoice(customer, lines, note, ws?.bank_info);
  const downloadPdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF({ format: "a4" });
    const no = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;
    let y = 18;
    if (ws?.logo_url) {
      try {
        doc.addImage(ws.logo_url, "PNG", 14, 10, 40, 16, undefined, "FAST");
        y = 32;
      } catch {
        /* skip bad logo */
      }
    }
    doc.setFontSize(12);
    doc.text(ws?.name ?? "", 14, y);
    doc.setFontSize(9);
    doc.text([ws?.address, ws?.phone, ws?.email].filter(Boolean).join(" · "), 14, y + 5, {
      maxWidth: 110,
    });
    doc.setFontSize(18);
    doc.text("INVOICE", 196, 18, { align: "right" });
    doc.setFontSize(9);
    doc.text([no, new Date().toLocaleDateString("id-ID")], 196, 24, { align: "right" });
    doc.setFontSize(10);
    doc.text(`Kepada: ${customer}`, 14, y + 16);
    const valid = lines.filter((l) => l.name.trim() && l.qty > 0);
    autoTable(doc, {
      startY: y + 20,
      head: [["#", "Produk / Jasa", "Qty", "Harga", "Subtotal"]],
      body: valid.map((l, i) => [i + 1, l.name, l.qty, idr(l.price), idr(l.qty * l.price)]),
      foot: [["", "", "", "Total", idr(inv.total)]],
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235] },
      footStyles: { fillColor: [241, 245, 249], textColor: 20 },
    });
    let fy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    if (ws?.bank_info) {
      doc.setDrawColor(200);
      doc.rect(14, fy - 5, 100, 8 + ws.bank_info.split("\n").length * 5);
      doc.setFontSize(10);
      doc.text("Transfer ke:", 17, fy);
      doc.setFontSize(9);
      doc.text(ws.bank_info.split("\n"), 17, fy + 5);
      fy += 14 + ws.bank_info.split("\n").length * 5;
    }
    if (note) {
      doc.setFontSize(9);
      doc.text(note, 14, fy, { maxWidth: 180 });
    }
    doc.save(`${no}.pdf`);
  };
  const set = (i: number, p: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const saveItem = useMutation({
    mutationFn: async (l: Line) => {
      await saveWorkspaceRow({
        data: {
          table: "crm_templates",
          workspaceId,
          data: { channel: "catalog", name: l.name.trim(), body: String(l.price), is_active: 1 },
        },
      });
    },
    onSuccess: () => {
      toast.success("Disimpan ke katalog");
      qc.invalidateQueries({ queryKey: ["crm-templates", workspaceId, "catalog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ReceiptText className="size-4" />
        Invoice cepat
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice cepat · {customer}</DialogTitle>
          </DialogHeader>
          {!!catalog.data?.length && (
            <div className="flex flex-wrap gap-1">
              {catalog.data.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setLines([
                      ...lines.filter((l) => l.name.trim()),
                      { name: c.name, qty: 1, price: Number(c.body) || 0 },
                    ])
                  }
                >
                  + {c.name}
                </Button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_56px_100px_auto] gap-1">
                <Input
                  aria-label="Produk"
                  placeholder="Produk / jasa"
                  value={l.name}
                  onChange={(e) => set(i, { name: e.target.value })}
                />
                <Input
                  aria-label="Jumlah"
                  type="number"
                  min={1}
                  value={l.qty}
                  onChange={(e) => set(i, { qty: Number(e.target.value) })}
                />
                <Input
                  aria-label="Harga"
                  type="number"
                  min={0}
                  value={l.price}
                  onChange={(e) => set(i, { price: Number(e.target.value) })}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  title="Simpan ke katalog"
                  disabled={!l.name.trim()}
                  onClick={() => saveItem.mutate(l)}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLines([...lines, { name: "", qty: 1, price: 0 }])}
            >
              <Plus className="size-4" />
              Tambah baris
            </Button>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
            {inv.text}
          </pre>
          <DialogFooter className="gap-2">
            {!ws?.bank_info && (
              <p className="mr-auto self-center text-xs text-muted-foreground">
                Isi rekening di Profil & Rekening.
              </p>
            )}
            <Button variant="outline" onClick={() => void downloadPdf()}>
              Unduh PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(inv.text);
                toast.success("Disalin");
              }}
            >
              Salin
            </Button>
            {onUse && (
              <Button
                variant="outline"
                onClick={() => {
                  onUse(inv.text);
                  setOpen(false);
                }}
              >
                Masukkan ke balasan
              </Button>
            )}
            {phone && (
              <Button asChild>
                <a href={waLink(phone, inv.text)} target="_blank" rel="noopener noreferrer">
                  Kirim via WhatsApp
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
