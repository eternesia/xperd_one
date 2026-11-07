import {
  BarChart3,
  Bot,
  Building2,
  FileText,
  MessageCircle,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";

type Step = { icon: LucideIcon; time: string; id: [string, string]; en: [string, string] };

const STEPS: Step[] = [
  {
    icon: Bot,
    time: "07.00",
    id: [
      "Posting cukup lewat chat AI",
      "Sambil ngopi, ketik di ChatGPT atau Claude: “Buatkan 3 postingan promo akhir pekan untuk IG dan TikTok.” Konten langsung terjadwal di Qalling, tanpa buka banyak aplikasi.",
    ],
    en: [
      "Post with a simple AI chat",
      "Over coffee, ask ChatGPT or Claude: “Make 3 weekend promo posts for IG and TikTok.” They land scheduled in Qalling — no app hopping.",
    ],
  },
  {
    icon: Users,
    time: "11.30",
    id: [
      "Leads tiba-tiba berdatangan",
      "Komentar “harga berapa kak?” dan DM mulai masuk dari berbagai akun. Semuanya terkumpul di satu kotak masuk dan otomatis tercatat sebagai prospek.",
    ],
    en: [
      "Leads start pouring in",
      "“How much?” comments and DMs arrive from every account. They gather in one inbox and become leads automatically.",
    ],
  },
  {
    icon: Sparkles,
    time: "12.00",
    id: [
      "Automasi bekerja saat Anda sibuk",
      "Balasan otomatis menjawab komentar dan DM berdasarkan kata kunci, lalu mengarahkan prospek hangat langsung ke WhatsApp tim Anda.",
    ],
    en: [
      "Automation works while you're busy",
      "Keyword replies answer comments and DMs, then send warm prospects straight to your team's WhatsApp.",
    ],
  },
  {
    icon: MessageCircle,
    time: "15.00",
    id: [
      "Pipeline & follow up tertata",
      "Geser prospek di pipeline, jadwalkan follow up, dan lihat riwayat setiap kontak. Tidak ada lagi calon pembeli yang terlupa.",
    ],
    en: [
      "Pipeline and follow-ups in order",
      "Move leads through the pipeline, schedule follow-ups and see every contact's history. No buyer slips through.",
    ],
  },
  {
    icon: BarChart3,
    time: "17.00",
    id: [
      "Tinggal tarik laporan",
      "Insight jangkauan, interaksi, dan postingan terbaik siap dibagikan ke atasan atau klien — tanpa lembur menyusun slide.",
    ],
    en: [
      "Just pull the report",
      "Reach, engagement and top posts are ready to share with your boss or clients — no late-night slide decks.",
    ],
  },
  {
    icon: FileText,
    time: "Bonus",
    id: [
      "Terbiasa ikut tender? Sudah tersedia",
      "Kelola peluang tender, template dokumen, dan surat berkop perusahaan di tempat yang sama dengan prospek Anda.",
    ],
    en: [
      "Bid on tenders? It's built in",
      "Manage tender opportunities, document templates and letterheads alongside your leads.",
    ],
  },
  {
    icon: Building2,
    time: "Next",
    id: [
      "Siap tumbuh bersama ERP XPERD",
      "Saat bisnis membesar, hubungkan ke XPERD: akuntansi, penjualan, stok, hingga HR — tanpa pindah sistem atau migrasi data.",
    ],
    en: [
      "Ready to grow with XPERD ERP",
      "As you scale, connect XPERD for accounting, sales, inventory and HR — no system switch or data migration.",
    ],
  },
];

export function QallingStory() {
  const { pick, lang } = useI18n();
  return (
    <section className="container-x py-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-gold">
          {pick("A day with Qalling", "Sehari bersama Qalling")}
        </span>
        <h2 className="mt-2 text-2xl font-medium text-foreground sm:text-3xl">
          {pick("From one AI chat to closed deals", "Dari satu chat AI sampai pelanggan closing")}
        </h2>
        <p className="mt-3 text-muted-foreground">
          {pick(
            "Still juggling apps, scattered DMs and spreadsheet leads? Here's what your day looks like instead.",
            "Masih bolak-balik aplikasi, DM tercecer, dan prospek dicatat manual? Begini hari Anda jika memakai Qalling.",
          )}
        </p>
      </div>
      <ol className="relative mx-auto mt-10 max-w-3xl border-l border-border pl-6 sm:pl-8">
        {STEPS.map((s) => {
          const [title, desc] = lang === "en" ? s.en : s.id;
          return (
            <li key={s.time + s.id[0]} className="relative pb-8 last:pb-0">
              <span className="absolute -left-[2.15rem] grid h-8 w-8 place-items-center rounded-full border border-gold/40 bg-background sm:-left-[2.65rem]">
                <s.icon className="h-4 w-4 text-gold" />
              </span>
              <span className="text-xs font-semibold text-gold">{s.time}</span>
              <h3 className="mt-1 font-medium text-foreground">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
