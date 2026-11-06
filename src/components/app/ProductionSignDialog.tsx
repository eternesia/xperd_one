import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdminField } from './admin-ui';
import { sendProductionSignCode, verifyProductionSignCode } from '@/lib/production-esign.functions';

type Target = { entityTable: 'mfg_lots' | 'mfg_orders' | 'mfg_batch_steps' | 'mfg_deviations'; entityId: string; action: string; title: string };

/** Collects a reason and an emailed code, then hands a verified signature id to onSigned. */
export function ProductionSignDialog({ workspaceId, target, onClose, onSigned }: { workspaceId: string; target: Target | null; onClose: () => void; onSigned: (signature: string, reason: string) => Promise<void> }) {
  const send = useServerFn(sendProductionSignCode), verify = useServerFn(verifyProductionSignCode);
  const [reason, setReason] = useState(''), [code, setCode] = useState(''), [challenge, setChallenge] = useState<string | null>(null), [busy, setBusy] = useState(false);
  function close() { setReason(''); setCode(''); setChallenge(null); onClose(); }
  async function run(fn: () => Promise<void>) { setBusy(true); try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Ditolak'); } finally { setBusy(false); } }
  return <Dialog open={!!target} onOpenChange={(o) => { if (!o) close(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{target?.title}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <AdminField label="Alasan"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></AdminField>
        {challenge && <AdminField label="Kode dari email"><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></AdminField>}
        <p className="text-sm text-muted-foreground">Tanda tangan elektronik memakai kode 6 digit yang dikirim ke email akun Anda.</p>
        <div className="flex justify-end gap-2">
          {!challenge
            ? <Button disabled={busy || !reason.trim() || !target} onClick={() => run(async () => { if (!target) return; const r = await send({ data: { workspaceId, entityTable: target.entityTable, entityId: target.entityId, action: target.action } }); setChallenge(r.id); if (r.demoCode) { setCode(r.demoCode); toast.success(`Mode uji: kode ${r.demoCode} terisi otomatis`); } else toast.success('Kode dikirim ke email Anda'); })}>Kirim kode</Button>
            : <Button disabled={busy || code.length !== 6} onClick={() => run(async () => { await verify({ data: { workspaceId, challengeId: challenge, code } }); await onSigned(challenge, reason); close(); })}>Tanda tangani</Button>}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
