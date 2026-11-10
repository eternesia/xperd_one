/**
 * Template email notifikasi billing & laporan (murni, tanpa akses DB — mudah diuji).
 * Semua teks Bahasa Indonesia; nilai dari pengguna di-escape sebelum masuk HTML.
 */
export interface Mail {
  subject: string;
  text: string;
  html: string;
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "2026-11-06" → "6 Nov 2026" (tanpa zona waktu, aman untuk DATE). */
export function dateId(d: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : d;
}

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<div style="font-family:Arial,sans-serif;background:#ffffff;padding:24px;color:#0f1f3d;max-width:560px">
  <h2 style="margin:0 0 12px">${esc(title)}</h2>
  ${bodyHtml}
  ${
    cta
      ? `<p style="margin:20px 0"><a href="${esc(cta.url)}" style="background:#0f1f3d;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(cta.label)}</a></p>`
      : ""
  }
  <p style="color:#888;font-size:12px;margin-top:24px">Email otomatis dari XPERD One / Qalling. Balas email ini bila Anda butuh bantuan.</p>
</div>`;
}

const row = (k: string, v: string) =>
  `<tr><td style="padding:4px 16px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`;

/* ------------------------------ trial ------------------------------ */

export function trialEndingEmail(p: {
  name: string;
  tenantName: string;
  daysLeft: number;
  endsOn: string;
  url: string;
}): Mail {
  const when =
    p.daysLeft <= 0
      ? "berakhir hari ini"
      : `berakhir dalam ${p.daysLeft} hari (${dateId(p.endsOn)})`;
  const subject =
    p.daysLeft <= 0
      ? `Trial ${p.tenantName} berakhir hari ini`
      : `Trial ${p.tenantName} berakhir ${p.daysLeft} hari lagi`;
  const text = `Halo ${p.name},\n\nMasa trial ${p.tenantName} ${when}.\nAktifkan paket agar akses dan data Anda tetap berjalan tanpa jeda: ${p.url}\n\nXPERD One`;
  const html = layout(
    "Masa trial Anda segera berakhir",
    `<p>Halo ${esc(p.name)},</p>
  <p>Masa trial <b>${esc(p.tenantName)}</b> ${esc(when)}.</p>
  <p>Aktifkan paket agar akses dan data Anda tetap berjalan tanpa jeda. Data Anda tidak dihapus.</p>`,
    { label: "Aktifkan paket", url: p.url },
  );
  return { subject, text, html };
}

/* ------------------------------ saldo ------------------------------ */

export function lowBalanceEmail(p: {
  name: string;
  tenantName: string;
  balance: number;
  needed: number;
  dueOn: string;
  daysLeft: number;
  items: { label: string; amount: number }[];
  url: string;
}): Mail {
  const shortfall = Math.max(0, p.needed - p.balance);
  const due = p.daysLeft <= 0 ? "hari ini" : `${dateId(p.dueOn)} (${p.daysLeft} hari lagi)`;
  const subject = `Saldo tidak cukup untuk perpanjangan ${p.tenantName}`;
  const lines = p.items.map((i) => `- ${i.label}: ${rupiah(i.amount)}`).join("\n");
  const text = `Halo ${p.name},\n\nPerpanjangan otomatis ${p.tenantName} jatuh tempo ${due}, tetapi saldo belum cukup.\n\nSaldo saat ini: ${rupiah(p.balance)}\nPerkiraan tagihan: ${rupiah(p.needed)}\n${lines}\nKekurangan: ${rupiah(shortfall)}\n\nTop up saldo di: ${p.url}\n\nXPERD One`;
  const html = layout(
    "Saldo belum cukup untuk perpanjangan",
    `<p>Halo ${esc(p.name)},</p>
  <p>Perpanjangan otomatis <b>${esc(p.tenantName)}</b> jatuh tempo <b>${esc(due)}</b>, tetapi saldo belum cukup.</p>
  <table style="border-collapse:collapse">${row("Saldo saat ini", rupiah(p.balance))}${row("Perkiraan tagihan", rupiah(p.needed))}${row("Kekurangan", rupiah(shortfall))}</table>
  <ul style="color:#444">${p.items.map((i) => `<li>${esc(i.label)}: ${esc(rupiah(i.amount))}</li>`).join("")}</ul>
  <p style="color:#666;font-size:13px">Jumlah tagihan adalah perkiraan; nilai akhir mengikuti harga paket saat jatuh tempo.</p>`,
    { label: "Top up saldo", url: p.url },
  );
  return { subject, text, html };
}

export function renewalFailedEmail(p: {
  name: string;
  tenantName: string;
  balance: number;
  needed: number;
  url: string;
}): Mail {
  const shortfall = Math.max(0, p.needed - p.balance);
  const subject = `Perpanjangan ${p.tenantName} gagal: saldo tidak cukup`;
  const text = `Halo ${p.name},\n\nPerpanjangan otomatis ${p.tenantName} gagal karena saldo tidak cukup. Layanan masuk masa tenggang dan dapat ditangguhkan.\n\nSaldo saat ini: ${rupiah(p.balance)}\nPerkiraan kekurangan: ${rupiah(shortfall)}\n\nTop up saldo agar perpanjangan diproses pada siklus berikutnya: ${p.url}\n\nXPERD One`;
  const html = layout(
    "Perpanjangan gagal: saldo tidak cukup",
    `<p>Halo ${esc(p.name)},</p>
  <p>Perpanjangan otomatis <b>${esc(p.tenantName)}</b> gagal karena saldo tidak cukup. Layanan masuk masa tenggang dan dapat ditangguhkan bila saldo tidak segera diisi.</p>
  <table style="border-collapse:collapse">${row("Saldo saat ini", rupiah(p.balance))}${row("Perkiraan kekurangan", rupiah(shortfall))}</table>
  <p>Setelah top up, perpanjangan diproses otomatis pada siklus berikutnya (dicek tiap jam).</p>`,
    { label: "Top up saldo", url: p.url },
  );
  return { subject, text, html };
}

/* ------------------------------ invoice ------------------------------ */

export function invoiceReceiptEmail(p: {
  name: string;
  tenantName: string;
  invoiceNumber: string;
  paidOn: string;
  description: string;
  method: string;
  amount: number;
  balance: number | null;
  url: string;
}): Mail {
  const subject = `Bukti pembayaran ${p.invoiceNumber} · ${rupiah(p.amount)}`;
  const text = `Halo ${p.name},\n\nPembayaran untuk ${p.tenantName} telah kami terima.\n\nNo. invoice: ${p.invoiceNumber}\nTanggal: ${dateId(p.paidOn)}\nKeterangan: ${p.description}\nMetode: ${p.method}\nJumlah: ${rupiah(p.amount)}${p.balance === null ? "" : `\nSaldo saat ini: ${rupiah(p.balance)}`}\n\nLihat dan unduh invoice (PDF): ${p.url}\n\nXPERD One`;
  const html = layout(
    "Pembayaran diterima",
    `<p>Halo ${esc(p.name)},</p>
  <p>Pembayaran untuk <b>${esc(p.tenantName)}</b> telah kami terima. Terima kasih.</p>
  <table style="border-collapse:collapse">${row("No. invoice", p.invoiceNumber)}${row("Tanggal", dateId(p.paidOn))}${row("Keterangan", p.description)}${row("Metode", p.method)}${row("Jumlah", rupiah(p.amount))}${p.balance === null ? "" : row("Saldo saat ini", rupiah(p.balance))}</table>`,
    { label: "Lihat & unduh invoice", url: p.url },
  );
  return { subject, text, html };
}

/* ------------------------------ ringkasan posting ------------------------------ */

export interface PostSummaryData {
  workspaceName: string;
  periodLabel: string;
  totals: { published: number; failed: number; scheduled: number; draft: number };
  upcoming: number;
  byAccount: { name: string; platform: string; published: number }[];
  failed: { title: string; error: string }[];
  metrics: { account: string; key: string; total: number | null; changePct: number | null }[];
  topPosts: {
    account: string;
    text: string;
    url: string | null;
    interactions: number | null;
    views: number | null;
  }[];
}

const num = (n: number | null) => (n === null ? "—" : new Intl.NumberFormat("id-ID").format(n));

export function postSummaryEmail(p: { name: string; data: PostSummaryData; url: string }): Mail {
  const d = p.data;
  const subject = `Ringkasan posting ${d.workspaceName} · ${d.periodLabel}`;
  const t = d.totals;
  const textParts = [
    `Halo ${p.name},`,
    "",
    `Ringkasan posting ${d.workspaceName} (${d.periodLabel}):`,
    `- Terbit: ${t.published}`,
    `- Gagal: ${t.failed}`,
    `- Terjadwal: ${t.scheduled}`,
    `- Draft: ${t.draft}`,
    `- Terjadwal 7 hari ke depan: ${d.upcoming}`,
  ];
  if (d.byAccount.length)
    textParts.push(
      "",
      "Per akun:",
      ...d.byAccount.map((a) => `- ${a.name} (${a.platform}): ${a.published} terbit`),
    );
  if (d.metrics.length)
    textParts.push(
      "",
      "Performa akun:",
      ...d.metrics.map(
        (m) =>
          `- ${m.account} · ${m.key}: ${num(m.total)}${m.changePct === null ? "" : ` (${m.changePct > 0 ? "+" : ""}${m.changePct}%)`}`,
      ),
    );
  if (d.topPosts.length)
    textParts.push(
      "",
      "Postingan terbaik:",
      ...d.topPosts.map(
        (x) =>
          `- ${x.account}: ${x.text.slice(0, 80)} — ${num(x.interactions)} interaksi, ${num(x.views)} tayangan`,
      ),
    );
  if (d.failed.length)
    textParts.push(
      "",
      "Perlu perhatian (gagal):",
      ...d.failed.map((f) => `- ${f.title}: ${f.error}`),
    );
  textParts.push("", `Buka laporan lengkap: ${p.url}`, "", "XPERD One");

  const card = (label: string, v: number, color = "#0f1f3d") =>
    `<td style="padding:10px 14px;border:1px solid #e5e7eb;border-radius:6px;text-align:center"><div style="font-size:22px;font-weight:bold;color:${color}">${v}</div><div style="font-size:12px;color:#666">${esc(label)}</div></td>`;
  const html = layout(
    `Ringkasan posting · ${d.periodLabel}`,
    `<p>Halo ${esc(p.name)}, berikut ringkasan <b>${esc(d.workspaceName)}</b>.</p>
  <table style="border-collapse:separate;border-spacing:6px"><tr>${card("Terbit", t.published)}${card("Gagal", t.failed, t.failed ? "#b91c1c" : "#0f1f3d")}${card("Terjadwal", t.scheduled)}${card("Draft", t.draft)}</tr></table>
  <p style="color:#666;font-size:13px">Terjadwal 7 hari ke depan: <b>${d.upcoming}</b></p>
  ${
    d.byAccount.length
      ? `<h3 style="margin:18px 0 6px;font-size:15px">Per akun</h3><ul style="color:#444">${d.byAccount.map((a) => `<li>${esc(a.name)} (${esc(a.platform)}): ${a.published} terbit</li>`).join("")}</ul>`
      : ""
  }
  ${
    d.metrics.length
      ? `<h3 style="margin:18px 0 6px;font-size:15px">Performa akun</h3><ul style="color:#444">${d.metrics.map((m) => `<li>${esc(m.account)} · ${esc(m.key)}: <b>${esc(num(m.total))}</b>${m.changePct === null ? "" : ` <span style="color:${m.changePct >= 0 ? "#15803d" : "#b91c1c"}">(${m.changePct > 0 ? "+" : ""}${m.changePct}%)</span>`}</li>`).join("")}</ul>`
      : ""
  }
  ${
    d.topPosts.length
      ? `<h3 style="margin:18px 0 6px;font-size:15px">Postingan terbaik</h3><ul style="color:#444">${d.topPosts.map((x) => `<li>${x.url ? `<a href="${esc(x.url)}">${esc(x.text.slice(0, 80) || "(tanpa teks)")}</a>` : esc(x.text.slice(0, 80) || "(tanpa teks)")}<br/><span style="color:#666;font-size:12px">${esc(x.account)} · ${esc(num(x.interactions))} interaksi · ${esc(num(x.views))} tayangan</span></li>`).join("")}</ul>`
      : ""
  }
  ${
    d.failed.length
      ? `<h3 style="margin:18px 0 6px;font-size:15px;color:#b91c1c">Perlu perhatian</h3><ul style="color:#444">${d.failed.map((f) => `<li>${esc(f.title)}: <span style="color:#b91c1c">${esc(f.error)}</span></li>`).join("")}</ul>`
      : ""
  }`,
    { label: "Buka laporan lengkap", url: p.url },
  );
  return { subject, text: textParts.join("\n"), html };
}

/* ------------------------------ pengingat follow-up ------------------------------ */

export interface FollowUpDigestData {
  workspaceName: string;
  overdueFollowUps: { name: string; detail: string }[];
  overdueTasks: { name: string; detail: string }[];
  dueToday: { name: string; detail: string }[];
  stale: { name: string; detail: string }[];
}

export function followUpDigestEmail(p: {
  name: string;
  data: FollowUpDigestData;
  url: string;
}): Mail {
  const d = p.data;
  const sections: [string, { name: string; detail: string }[]][] = [
    ["Follow-up terlambat", d.overdueFollowUps],
    ["Tugas terlambat", d.overdueTasks],
    ["Jatuh tempo hari ini", d.dueToday],
    ["Prospek diam", d.stale],
  ];
  const total = sections.reduce((n, [, l]) => n + l.length, 0);
  const subject = `${total} prospek perlu tindak lanjut · ${d.workspaceName}`;
  const cap = (l: { name: string; detail: string }[]) => l.slice(0, 8);
  const text = [
    `Halo ${p.name},`,
    "",
    `Berikut prospek di ${d.workspaceName} yang perlu tindak lanjut hari ini:`,
    ...sections.flatMap(([title, l]) =>
      l.length
        ? [
            "",
            `${title} (${l.length}):`,
            ...cap(l).map((x) => `- ${x.name} — ${x.detail}`),
            ...(l.length > 8 ? [`- dan ${l.length - 8} lainnya`] : []),
          ]
        : [],
    ),
    "",
    `Buka pipeline: ${p.url}`,
    "",
    "Qalling",
  ].join("\n");
  const html = layout(
    "Prospek perlu tindak lanjut",
    `<p>Halo ${esc(p.name)}, berikut prospek di <b>${esc(d.workspaceName)}</b> yang perlu ditindaklanjuti.</p>${sections
      .map(([title, l]) =>
        l.length
          ? `<h3 style="margin:16px 0 6px;font-size:15px">${esc(title)} (${l.length})</h3><ul style="color:#444">${cap(
              l,
            )
              .map((x) => `<li><b>${esc(x.name)}</b> — ${esc(x.detail)}</li>`)
              .join("")}${l.length > 8 ? `<li>dan ${l.length - 8} lainnya</li>` : ""}</ul>`
          : "",
      )
      .join("")}`,
    { label: "Buka pipeline", url: p.url },
  );
  return { subject, text, html };
}

/* ------------------------------ XPro: pengingat tugas harian ------------------------------ */

export interface XproDigestItem {
  name: string;
  detail: string;
}

export function xproTaskDigestEmail(p: {
  name: string;
  workspaceName: string;
  overdue: XproDigestItem[];
  dueToday: XproDigestItem[];
  dueTomorrow: XproDigestItem[];
  url: string;
}): Mail {
  const sections: [string, XproDigestItem[]][] = [
    ["Terlambat", p.overdue],
    ["Tenggat hari ini", p.dueToday],
    ["Tenggat besok", p.dueTomorrow],
  ];
  const total = sections.reduce((n, [, l]) => n + l.length, 0);
  const subject = `${total} tugas perlu perhatian · ${p.workspaceName}`;
  const cap = (l: XproDigestItem[]) => l.slice(0, 10);
  const text = [
    `Halo ${p.name},`,
    "",
    `Berikut tugas Anda di ${p.workspaceName} yang perlu perhatian:`,
    ...sections.flatMap(([title, l]) =>
      l.length
        ? [
            "",
            `${title} (${l.length}):`,
            ...cap(l).map((x) => `- ${x.name} — ${x.detail}`),
            ...(l.length > 10 ? [`- dan ${l.length - 10} lainnya`] : []),
          ]
        : [],
    ),
    "",
    `Buka Tugas Saya: ${p.url}`,
    "",
    "XPERD One",
  ].join("\n");
  const html = layout(
    "Tugas perlu perhatian",
    `<p>Halo ${esc(p.name)}, berikut tugas Anda di <b>${esc(p.workspaceName)}</b> yang perlu perhatian.</p>${sections
      .map(([title, l]) =>
        l.length
          ? `<h3 style="margin:16px 0 6px;font-size:15px">${esc(title)} (${l.length})</h3><ul style="color:#444">${cap(
              l,
            )
              .map((x) => `<li><b>${esc(x.name)}</b> — ${esc(x.detail)}</li>`)
              .join("")}${l.length > 10 ? `<li>dan ${l.length - 10} lainnya</li>` : ""}</ul>`
          : "",
      )
      .join("")}`,
    { label: "Buka Tugas Saya", url: p.url },
  );
  return { subject, text, html };
}
