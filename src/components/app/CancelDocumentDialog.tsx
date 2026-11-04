import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { erpCancelDocument } from "@/lib/erp-document.functions";
import { useI18n } from "@/lib/i18n";

/** Pembatalan dokumen terposting (BS New 16): alasan wajib; stok & jurnal dibalik bernilai asli dalam satu transaksi. */
export function CancelDocumentDialog({
  workspaceId,
  side,
  document,
  onClose,
  onCancelled,
}: {
  workspaceId: string;
  side: "purchase" | "sales";
  document: { id: string; doc_number: string; doc_date: string } | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={!!document}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("Cancel", "Batalkan")} {document?.doc_number}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!document || busy) return;
            setBusy(true);
            try {
              await erpCancelDocument({
                data: { workspaceId, side, id: document.id, date, reason },
              });
              toast.success(
                t(
                  "Document cancelled; stock and journals reversed.",
                  "Dokumen dibatalkan; stok dan jurnal dibalik.",
                ),
              );
              setReason("");
              onCancelled();
              onClose();
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : t("Cancellation rejected", "Pembatalan ditolak"),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="cancel-date">{t("Reversal date", "Tanggal pembalik")}</Label>
            <Input
              id="cancel-date"
              type="date"
              required
              min={document?.doc_date}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">{t("Cancellation reason", "Alasan pembatalan")}</Label>
            <Textarea
              id="cancel-reason"
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {t("Back", "Kembali")}
            </Button>
            <Button variant="destructive" disabled={busy || reason.trim().length < 3}>
              {busy ? t("Processing…", "Memproses…") : t("Cancel document", "Batalkan dokumen")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
