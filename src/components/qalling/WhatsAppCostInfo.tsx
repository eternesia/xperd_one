import { useI18n } from "@/lib/i18n";

/** Penjelasan biaya WhatsApp resmi: langganan Qalling vs tarif pesan Meta. Tarif Meta Indonesia per Okt 2026. */
const META_RATES = {
  marketing: 586.33,
  utility: 356.65,
  freeService: 1000,
  asOf: "Oktober 2026",
};

export function WhatsAppCostInfo({
  compact = false,
  heading = false,
}: {
  compact?: boolean;
  heading?: boolean;
}) {
  const { pick } = useI18n();
  const rp = (n: number) => `Rp${n.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
  const box = (
    <div className="space-y-2 rounded-lg border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
      <p className="font-semibold text-foreground">
        {pick("WhatsApp costs: two separate bills", "Biaya WhatsApp: dua tagihan terpisah")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="font-medium text-foreground">
            1. {pick("Qalling subscription", "Langganan Qalling")}
          </p>
          <p>
            {pick(
              "The WhatsApp channel add-on, paid to Qalling every month. It covers the connection, sending invoices and reminders from Qalling, and the inbox. No setup fee.",
              "Add-on WhatsApp channel, dibayar ke Qalling setiap bulan. Mencakup koneksi nomor, kirim invoice dan pengingat dari Qalling, serta inbox. Tanpa biaya setup.",
            )}
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">
            2. {pick("Meta message fees", "Tarif pesan Meta")}
          </p>
          <p>
            {pick(
              "Billed by Meta directly to the card on your own WhatsApp Business account. Qalling adds no markup.",
              "Ditagih Meta langsung ke kartu di akun WhatsApp Business Anda sendiri. Qalling tidak menambah markup.",
            )}
          </p>
        </div>
      </div>
      {!compact && (
        <>
          <table className="w-full max-w-md">
            <tbody>
              <tr>
                <td>{pick("Utility (invoices, reminders)", "Utility (invoice, pengingat)")}</td>
                <td className="text-right font-medium text-foreground">
                  {rp(META_RATES.utility)}/{pick("message", "pesan")}
                </td>
              </tr>
              <tr>
                <td>{pick("Marketing (promos, broadcasts)", "Marketing (promo, broadcast)")}</td>
                <td className="text-right font-medium text-foreground">
                  {rp(META_RATES.marketing)}/{pick("message", "pesan")}
                </td>
              </tr>
              <tr>
                <td>
                  {pick(
                    "Replies within 24 h after the customer writes",
                    "Balasan dalam 24 jam setelah pelanggan chat",
                  )}
                </td>
                <td className="text-right font-medium text-foreground">
                  {pick(
                    `first ${META_RATES.freeService.toLocaleString("en")} free/month`,
                    `${META_RATES.freeService.toLocaleString("id-ID")} pertama gratis/bulan`,
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            {pick(
              `Indicative Meta rates for Indonesia as of ${META_RATES.asOf}, excluding VAT; Meta may change them. Example: 100 invoices a month ≈ Rp35,665 to Meta. Before paid templates can be sent, add a payment method (card and NPWP) in Meta Business Suite.`,
              `Perkiraan tarif Meta untuk Indonesia per ${META_RATES.asOf}, belum termasuk PPN; Meta dapat mengubahnya. Contoh: 100 invoice per bulan ≈ Rp35.665 ke Meta. Sebelum template berbayar bisa terkirim, pasang metode pembayaran (kartu dan NPWP) di Meta Business Suite.`,
            )}
          </p>
        </>
      )}
    </div>
  );
  return heading ? (
    <section>
      <h2 className="mb-3 text-lg font-semibold">
        {pick("Official WhatsApp add-on", "Add-on WhatsApp resmi")}
      </h2>
      {box}
    </section>
  ) : (
    box
  );
}
