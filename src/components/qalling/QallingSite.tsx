import { useDevtoolsDeterrent } from "@/lib/use-devtools-deterrent";
import { useEffect, useState, type ReactNode } from "react";
import { captureReferral } from "@/lib/referral-capture";
import { useQuery } from "@tanstack/react-query";
import { getWebsiteContacts } from "@/lib/xperd-contact.functions";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  Clock,
  Globe,
  MapPin,
  Phone,
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
import { QALLING_EN } from "@/lib/qalling-copy";
import { useI18n } from "@/lib/i18n";
import { useQallingCatalog } from "@/lib/qalling-catalog";
import { TierFeatures } from "./TierFeatures";
import { QallingPreferences } from "./QallingPreferences";
import { QallingLogo } from "./QallingLogo";

// Placeholder contact details — replace with the real ones.
export const QALLING_CONTACT = { whatsapp: "6281200000000", email: "halo@qalling.id" };

/** Kontak Qalling dikelola di Super Admin → Konten Website (section "qalling.kontak"): email, telepon, WhatsApp, alamat, jam layanan, website. */
export function useQallingContact() {
  const { data } = useQuery({
    queryKey: ["site-content", "qalling.kontak"],
    queryFn: () => getWebsiteContacts({ data: { site: "qalling" } }),
    staleTime: 60_000,
  });
  return {
    whatsapp: (data?.whatsapp ?? QALLING_CONTACT.whatsapp).replace(/\D/g, ""),
    email: data?.email ?? QALLING_CONTACT.email,
    phone: data?.phone ?? "",
    address: data?.address ?? "",
    hours: data?.hours ?? "",
    website: data?.website ?? "",
  };
}

const NAV = [
  { to: "/qalling/solusi", label: "Solusi" },
  { to: "/qalling/fitur", label: "Fitur" },
  { to: "/qalling/kelebihan", label: "Kelebihan" },
  { to: "/qalling/harga", label: "Harga" },
  { to: "/qalling/testimoni", label: "Testimoni" },
  { to: "/qalling/docs", label: "Dokumentasi" },
  { to: "/qalling/kontak", label: "Kontak" },
] as const;

export function QallingShell({ children }: { children: ReactNode }) {
  const QALLING_CONTACT = useQallingContact();
  useEffect(() => captureReferral(), []);
  useDevtoolsDeterrent();
  const { pick } = useI18n();
  const navLabel = (label: string) =>
    pick(
      (
        {
          Solusi: "Solutions",
          Fitur: "Features",
          Kelebihan: "Benefits",
          Harga: "Pricing",
          Testimoni: "Testimonials",
          Kontak: "Contact",
          Dokumentasi: "Docs",
        } as Record<string, string>
      )[label],
      label,
    );
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
                {navLabel(n.label)}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <QallingPreferences />
            <Button asChild variant="outline" size="sm">
              <Link to="/qalling/login">{pick("Sign in", "Masuk")}</Link>
            </Button>
            <Button asChild variant="gold" size="sm">
              <Link to="/qalling/daftar">{pick("Try free", "Coba Gratis")}</Link>
            </Button>
          </div>
          <div className="flex items-center md:hidden">
            <QallingPreferences />
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
                {navLabel(n.label)}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <Link to="/qalling/login" onClick={() => setMenuOpen(false)}>
                  {pick("Sign in", "Masuk")}
                </Link>
              </Button>
              <Button asChild variant="gold">
                <Link to="/qalling/daftar" onClick={() => setMenuOpen(false)}>
                  {pick("Try free", "Coba Gratis")}
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
              {pick(
                "Manage social media, conversations and leads in one dashboard.",
                "Kelola media sosial, percakapan, dan prospek dalam satu dashboard.",
              )}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="hover:text-foreground">
                {navLabel(n.label)}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-gold" />
              <a
                href={`mailto:${QALLING_CONTACT.email}`}
                className="min-w-0 break-words hover:text-foreground"
              >
                {QALLING_CONTACT.email}
              </a>
            </span>
            <span className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 shrink-0 text-gold" />
              <a
                href={`https://wa.me/${QALLING_CONTACT.whatsapp}`}
                className="min-w-0 break-words hover:text-foreground"
              >
                {QALLING_CONTACT.whatsapp}
              </a>
            </span>
            {QALLING_CONTACT.phone && (
              <span className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-gold" />
                <a
                  href={`tel:${QALLING_CONTACT.phone.replace(/[^\d+]/g, "")}`}
                  className="hover:text-foreground"
                >
                  {QALLING_CONTACT.phone}
                </a>
              </span>
            )}
            {QALLING_CONTACT.address && (
              <span className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                {QALLING_CONTACT.address}
              </span>
            )}
            {QALLING_CONTACT.hours && (
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-gold" />
                {QALLING_CONTACT.hours}
              </span>
            )}
            {QALLING_CONTACT.website && (
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4 shrink-0 text-gold" />
                <a
                  href={QALLING_CONTACT.website}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground"
                >
                  {QALLING_CONTACT.website}
                </a>
              </span>
            )}
            <span className="flex flex-wrap gap-x-3">
              <Link to="/qalling/syarat" className="hover:text-foreground">
                {pick("Terms", "Syarat")}
              </Link>
              <Link to="/qalling/privasi" className="hover:text-foreground">
                {pick("Privacy", "Privasi")}
              </Link>
              <Link to="/qalling/penggunaan" className="hover:text-foreground">
                {pick("Acceptable use", "Penggunaan")}
              </Link>
            </span>
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
  const { lang } = useI18n();
  const text = (v: string) => (lang === "en" ? (QALLING_EN[v] ?? v) : v);
  return (
    <section className="container-x py-14 text-center lg:py-20">
      <span className="inline-flex rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
        {text(eyebrow)}
      </span>
      <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-navy dark:text-foreground sm:text-5xl">
        {typeof title === "string" ? text(title) : title}
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
        {text(desc)}
      </p>
    </section>
  );
}

function CtaBand() {
  const { pick } = useI18n();
  return (
    <section className="bg-secondary py-12">
      <div className="container-x flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <div>
          <h2 className="text-2xl font-medium text-foreground">
            {pick("Start your free trial", "Mulai uji coba gratis")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {pick(
              "No credit card. Upgrade whenever you need.",
              "Tanpa kartu kredit. Upgrade kapan saja.",
            )}
          </p>
        </div>
        <Button asChild variant="gold" size="lg">
          <Link to="/qalling/daftar">
            {pick("Sign up now", "Daftar Sekarang")} <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}

type Item = { icon: typeof Users; title: string; desc: string };
export function ItemGrid({ items, cols = 3 }: { items: Item[]; cols?: 2 | 3 }) {
  const { lang } = useI18n();
  const text = (v: string) => (lang === "en" ? (QALLING_EN[v] ?? v) : v);
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${cols === 3 ? "lg:grid-cols-3" : ""}`}>
      {items.map((f) => (
        <div key={f.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/10">
            <f.icon className="h-5 w-5 text-gold" />
          </span>
          <h3 className="mt-4 font-semibold text-navy dark:text-foreground">{text(f.title)}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text(f.desc)}</p>
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

const LEGACY_UNUSED_PLANS = [
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
  const { data: plans = [], isLoading, error } = useQallingCatalog();
  const { pick, lang } = useI18n();
  if (isLoading)
    return <p className="py-6 text-muted-foreground">{pick("Loading plans…", "Memuat paket…")}</p>;
  if (error)
    return (
      <p className="py-6 text-destructive">
        {pick("Plans are temporarily unavailable.", "Paket belum dapat dimuat.")}
      </p>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((p) => {
        const limits = p.limits as Record<string, number | null>;
        return (
          <article
            key={p.id}
            className="flex flex-col rounded-lg border border-border bg-card p-6 shadow-sm"
          >
            <h3 className="text-lg font-medium">{p.name}</h3>
            <p className="mt-3 text-3xl font-medium">
              {new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", {
                style: "currency",
                currency: "IDR",
                maximumFractionDigits: 0,
              }).format(Number(p.monthly_price))}
              <span className="text-sm text-muted-foreground"> {pick("/month", "/bulan")}</span>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {limits.max_accounts ?? "∞"} {pick("social accounts", "akun sosial")} ·{" "}
              {limits.max_users ?? "∞"} {pick("users", "pengguna")}
            </p>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              {limits.storage_gb ?? "∞"} GB · {limits.monthly_post_limit ?? "∞"}{" "}
              {pick("posts/month", "postingan/bulan")}
            </p>
            <div className="flex-1">
              <TierFeatures features={p.features as Record<string, boolean>} compare />
            </div>
            <Button asChild className="mt-6" variant="outline">
              <Link to="/qalling/daftar" search={{ paket: p.code.replace("qalling_", "") }}>
                {pick("Try free", "Coba gratis")}
              </Link>
            </Button>
          </article>
        );
      })}
    </div>
  );
}

export function ContactCards() {
  const QALLING_CONTACT = useQallingContact();
  return (
    <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-64 gap-y-4 text-base text-foreground">
      <span className="flex items-center gap-3">
        <Mail className="h-5 w-5 shrink-0 text-gold" />
        <a href={`mailto:${QALLING_CONTACT.email}`} className="min-w-0 break-words hover:underline">
          {QALLING_CONTACT.email}
        </a>
      </span>
      <span className="flex items-center gap-3">
        <MessageCircle className="h-5 w-5 shrink-0 text-gold" />
        <a
          href={`https://wa.me/${QALLING_CONTACT.whatsapp}`}
          className="min-w-0 break-words hover:underline"
        >
          {QALLING_CONTACT.whatsapp}
        </a>
      </span>
    </div>
  );
}

export const QALLING_KEYWORDS =
  "Qalling, CRM media sosial, AI social media CRM, jadwal posting lewat ChatGPT, posting lewat Claude, auto balas komentar Instagram, auto DM Instagram TikTok, inbox terpadu, lead management, sales pipeline, follow up pelanggan, manajemen kontak, integrasi WhatsApp sales, laporan media sosial PDF Excel, software tender, ERP XPERD, CRM UMKM Indonesia, tools agensi digital";

export function seo(title: string, description: string, keywords = QALLING_KEYWORDS) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "keywords", content: keywords },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
