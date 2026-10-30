import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQallingContactRows } from "@/lib/qalling-site.functions";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  Clock,
  Image,
  Inbox,
  Layers,
  Lightbulb,
  Mail,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Wallet,
  Building2,
  Megaphone,
  Menu,
  X,
  Contact,
  Target,
  FileText,
  ListTodo,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { QallingLogo } from "./QallingLogo";

// Placeholder contact details — replace with the real ones.
export const QALLING_CONTACT = { whatsapp: "6281200000000", email: "halo@qalling.id" };

/** Contact details managed in Super Admin → Website Content (section "qalling.kontak", keys whatsapp/email, value in Judul ID). */
export function useQallingContact() {
  const { data } = useQuery({
    queryKey: ["site-content", "qalling.kontak"],
    queryFn: () => getQallingContactRows(),
    staleTime: 60_000,
  });
  const get = (k: string) =>
    data?.find((r) => r.key === k)?.title_id?.trim() ||
    data?.find((r) => r.key === k)?.title_en?.trim();
  return {
    whatsapp: (get("whatsapp") ?? QALLING_CONTACT.whatsapp).replace(/\D/g, ""),
    email: get("email") ?? QALLING_CONTACT.email,
  };
}

const NAV = [
  { to: "/qalling/solusi", label: "Solusi" },
  { to: "/qalling/fitur", label: "Fitur" },
  { to: "/qalling/kelebihan", label: "Kelebihan" },
  { to: "/qalling/harga", label: "Harga" },
  { to: "/qalling/kontak", label: "Kontak" },
] as const;

export function QallingShell({ children }: { children: ReactNode }) {
  const QALLING_CONTACT = useQallingContact();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="container-x grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:flex md:justify-between">
          <Link
            to="/qalling"
            className="flex min-w-0 items-center gap-2"
            onClick={() => setMenuOpen(false)}
          >
            <QallingLogo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button asChild variant="outline" size="sm">
              <Link to="/qalling/login">Masuk</Link>
            </Button>
            <Button asChild variant="gold" size="sm">
              <Link to="/qalling/daftar">Coba Gratis</Link>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
            aria-expanded={menuOpen}
            aria-controls="qalling-mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
        {menuOpen && (
          <nav
            id="qalling-mobile-menu"
            className="container-x grid max-h-[calc(100dvh-4rem)] gap-1 overflow-y-auto border-t pb-4 pt-2 text-sm text-muted-foreground md:hidden"
          >
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-3 hover:bg-muted"
                activeProps={{ className: "bg-muted text-foreground font-medium" }}
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <Link to="/qalling/login" onClick={() => setMenuOpen(false)}>
                  Masuk
                </Link>
              </Button>
              <Button asChild variant="gold">
                <Link to="/qalling/daftar" onClick={() => setMenuOpen(false)}>
                  Coba Gratis
                </Link>
              </Button>
            </div>
          </nav>
        )}
      </header>
      <main>{children}</main>
      <CtaBand />
      <footer className="border-t border-border py-10">
        <div className="container-x grid gap-6 text-sm text-muted-foreground sm:grid-cols-3">
          <div>
            <QallingLogo className="w-40" />
            <p className="mt-2">
              Kelola media sosial, percakapan, dan prospek dalam satu dashboard.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <a href={`mailto:${QALLING_CONTACT.email}`} className="hover:text-foreground">
              {QALLING_CONTACT.email}
            </a>
            <span>© {new Date().getFullYear()} Qalling — by XPERD</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: ReactNode;
  desc: string;
}) {
  return (
    <section className="container-x py-14 text-center lg:py-20">
      <span className="inline-flex rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
        {eyebrow}
      </span>
      <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-navy dark:text-foreground sm:text-5xl">
        {title}
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">{desc}</p>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="bg-secondary py-12">
      <div className="container-x flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <div>
          <h2 className="text-2xl font-medium text-foreground">Mulai gratis 14 hari</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tanpa kartu kredit. Upgrade kapan saja dari saldo.
          </p>
        </div>
        <Button asChild variant="gold" size="lg">
          <Link to="/qalling/daftar">
            Daftar Sekarang <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}

type Item = { icon: typeof Users; title: string; desc: string };
export function ItemGrid({ items, cols = 3 }: { items: Item[]; cols?: 2 | 3 }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${cols === 3 ? "lg:grid-cols-3" : ""}`}>
      {items.map((f) => (
        <div key={f.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/10">
            <f.icon className="h-5 w-5 text-gold" />
          </span>
          <h3 className="mt-4 font-semibold text-navy dark:text-foreground">{f.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
        </div>
      ))}
    </div>
  );
}

export const SOLUTIONS: Item[] = [
  {
    icon: Store,
    title: "UMKM & Toko Online",
    desc: "Jadwalkan konten Instagram, Facebook, dan TikTok sekaligus, lalu balas DM pembeli dari satu tempat.",
  },
  {
    icon: Megaphone,
    title: "Tim Marketing Brand",
    desc: "Kalender konten, bank ide, dan pustaka media bersama agar tim selalu satu suara.",
  },
  {
    icon: Building2,
    title: "Agensi Digital",
    desc: "Kelola puluhan akun klien, pisahkan per workspace, dan kirim laporan performa.",
  },
  {
    icon: Users,
    title: "Tim Sales",
    desc: "Ubah percakapan menjadi prospek, pantau pipeline, dan follow-up tepat waktu.",
  },
];

export const FEATURES: Item[] = [
  {
    icon: CalendarClock,
    title: "Publishing & Jadwal",
    desc: "Buat sekali, terbitkan ke banyak akun. Tampilan daftar, minggu, dan bulan.",
  },
  {
    icon: Lightbulb,
    title: "Ideas & Kanban",
    desc: "Rencanakan konten di kolom Todo, Progress, dan Done; tambah kolom sesuai alur tim. Lite, Pro & Agency.",
  },
  {
    icon: Image,
    title: "Pustaka Media",
    desc: "Unggah gambar dan video sekali, pakai ulang di semua postingan.",
  },
  {
    icon: MessageCircle,
    title: "Komentar & Interaksi",
    desc: "Lihat postingan yang mendapat komentar dan tanggapi melalui koneksi Meta native. Lite, Pro & Agency.",
  },
  { icon: BarChart3, title: "Insight", desc: "Lihat jangkauan, interaksi, dan postingan terbaik." },
  {
    icon: Inbox,
    title: "Inbox Terpadu",
    desc: "DM Instagram & Facebook dalam satu kotak masuk (Pro & Agency).",
  },
  {
    icon: Users,
    title: "Lead Management",
    desc: "Simpan prospek, sumber, estimasi nilai, dan penanggung jawab penjualan. Pro & Agency.",
  },
  {
    icon: Layers,
    title: "Sales Pipeline",
    desc: "Pantau peluang dari prospek baru, negosiasi, sampai transaksi berhasil atau hilang. Pro & Agency.",
  },
  {
    icon: Contact,
    title: "Contacts",
    desc: "Kelola kontak pelanggan dan riwayat hubungan dalam satu tempat. Pro & Agency.",
  },
  {
    icon: ListTodo,
    title: "Follow Up",
    desc: "Catat aktivitas, jadwal tindak lanjut, serta tugas yang sudah diselesaikan. Pro & Agency.",
  },
  {
    icon: Target,
    title: "Sales Target",
    desc: "Tetapkan target penjualan dan pantau pencapaiannya bersama tim. Pro & Agency.",
  },
  {
    icon: Sparkles,
    title: "Automation",
    desc: "Atur balasan otomatis DM dan komentar berdasarkan kata kunci melalui Meta native. Pro & Agency; membutuhkan izin Meta.",
  },
  {
    icon: FileText,
    title: "Tender & Dokumen",
    desc: "Kelola peluang tender, template dokumen, dan surat berkop perusahaan. Khusus Agency.",
  },
  {
    icon: Megaphone,
    title: "Broadcast WhatsApp",
    desc: "Kirim pesan kampanye ke daftar penerima melalui gateway WhatsApp yang dikonfigurasi. Add-on WhatsApp opsional, terpisah dari paket.",
  },
  {
    icon: CalendarClock,
    title: "Campaigns & Templates",
    desc: "Susun aktivitas kampanye dan gunakan template untuk menjaga konsistensi komunikasi tim. Pro & Agency.",
  },
  {
    icon: Wallet,
    title: "Saldo & Langganan",
    desc: "Top up saldo, lihat mutasi, dan upgrade paket dengan ringkasan potongan sebelum konfirmasi.",
  },
];

export const ADVANTAGES: Item[] = [
  {
    icon: Wallet,
    title: "Harga Rupiah, bayar dari saldo",
    desc: "Top-up via transfer, upgrade paket instan tanpa kartu kredit.",
  },
  {
    icon: Clock,
    title: "Hemat waktu",
    desc: "Satu dashboard menggantikan bolak-balik banyak aplikasi.",
  },
  {
    icon: ShieldCheck,
    title: "Aman & terpisah",
    desc: "Data tiap workspace terisolasi, akses tim diatur per peran.",
  },
  {
    icon: Users,
    title: "Dibuat untuk Indonesia",
    desc: "Bahasa Indonesia, dukungan lokal, dan alur kerja tim lokal.",
  },
];

export const PLANS = [
  {
    tier: "lite",
    name: "Lite",
    price: "Rp49.000",
    note: "/bulan",
    accounts: "5 akun",
    users: "1 pengguna",
    features: ["Publishing & jadwal", "Bank ide & media", "Interaksi", "Insight"],
  },
  {
    tier: "pro",
    name: "Pro",
    price: "Rp149.000",
    note: "/bulan",
    accounts: "15 akun",
    users: "3 pengguna",
    features: ["Semua fitur Lite", "Inbox terpadu", "CRM & pipeline", "Automasi"],
    highlight: true,
  },
  {
    tier: "agency",
    name: "Agency",
    price: "Rp349.000",
    note: "/bulan",
    accounts: "40 akun",
    users: "10 pengguna",
    features: ["Semua fitur Pro", "Multi-klien", "Penyimpanan besar", "Kolaborasi tim"],
  },
];

export function PricingGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {PLANS.map((p) => (
        <div
          key={p.name}
          className={`flex flex-col rounded-2xl border bg-card p-6 shadow-sm ${p.highlight ? "border-gold ring-2 ring-gold/30" : "border-border"}`}
        >
          {p.highlight && (
            <span className="mb-2 self-start rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-navy">
              Terpopuler
            </span>
          )}
          <h3 className="text-lg font-bold text-navy dark:text-foreground">{p.name}</h3>
          <div className="mt-2">
            <span className="text-3xl font-extrabold">{p.price}</span>
            <span className="text-sm text-muted-foreground"> {p.note}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {p.accounts} · {p.users}
          </p>
          <ul className="mt-4 flex-1 space-y-2 text-sm">
            {p.features.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-gold" />
                {f}
              </li>
            ))}
          </ul>
          <Button asChild className="mt-6" variant={p.highlight ? "gold" : "outline"}>
            <Link to="/qalling/daftar" search={{ paket: p.tier }}>
              Coba gratis 14 hari
            </Link>
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Tanpa kartu kredit · pilih paket {p.name}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ContactCards() {
  const QALLING_CONTACT = useQallingContact();
  return (
    <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
      <a
        href={`https://wa.me/${QALLING_CONTACT.whatsapp}`}
        target="_blank"
        rel="noreferrer"
        className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:border-gold"
      >
        <MessageCircle className="h-6 w-6 text-gold" />
        <h3 className="mt-3 font-semibold">WhatsApp Sales</h3>
        <p className="mt-1 text-sm text-muted-foreground">Konsultasi paket & demo langsung.</p>
      </a>
      <a
        href={`mailto:${QALLING_CONTACT.email}`}
        className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:border-gold"
      >
        <Mail className="h-6 w-6 text-gold" />
        <h3 className="mt-3 font-semibold">Email</h3>
        <p className="mt-1 text-sm text-muted-foreground">{QALLING_CONTACT.email}</p>
      </a>
    </div>
  );
}

export function seo(title: string, description: string) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
