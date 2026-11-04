import { Bot, Clock, Gift, Quote } from "lucide-react";
import {
  SiClaude,
  SiCursor,
  SiGooglegemini,
  SiModelcontextprotocol,
  SiPerplexity,
} from "@icons-pack/react-simple-icons";

import { useI18n } from "@/lib/i18n";
import { SocialIcon } from "./SocialIcon";

/** ChatGPT (OpenAI) tidak tersedia di pustaka ikon; path SVG disalin dari landing live. */
function ChatGptIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

const PLATFORMS: [string, string][] = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
  ["linkedin", "LinkedIn"],
  ["x", "X (Twitter)"],
  ["threads", "Threads"],
  ["pinterest", "Pinterest"],
  ["bluesky", "Bluesky"],
  ["google_business", "Google Business"],
];

const AI_CLIENTS = [
  { name: "ChatGPT", Icon: ChatGptIcon },
  { name: "Claude", Icon: SiClaude },
  { name: "Gemini", Icon: SiGooglegemini },
  { name: "Cursor", Icon: SiCursor },
  { name: "Perplexity", Icon: SiPerplexity },
  { name: "MCP Client", Icon: SiModelcontextprotocol },
];

const CHIP =
  "inline-flex min-h-12 items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm font-medium text-foreground";

/** Platform sosial yang didukung + klien AI yang bisa tersambung (MCP). */
export function Integrations() {
  const { pick } = useI18n();
  return (
    <section className="container-x py-12 text-center">
      <h2 className="text-2xl font-semibold text-navy dark:text-foreground sm:text-3xl">
        {pick("Connected social platforms", "Media sosial yang terhubung")}
      </h2>
      <p className="mt-2 text-muted-foreground">
        {pick(
          "Post and reply on every platform from one place.",
          "Posting dan balas di semua platform dari satu tempat.",
        )}
      </p>
      <div className="mx-auto mt-6 flex max-w-6xl flex-wrap justify-center gap-3">
        {PLATFORMS.map(([id, name]) => (
          <span key={id} className={CHIP}>
            <SocialIcon platform={id} className="size-6" />
            {name}
          </span>
        ))}
      </div>
      <h3 className="mt-10 flex items-center justify-center gap-2 text-lg font-semibold text-navy dark:text-foreground">
        <Bot className="h-5 w-5 text-gold" />
        {pick("Works with your favorite AI", "Terhubung dengan AI favorit Anda")}
      </h3>
      <div className="mx-auto mt-5 flex max-w-6xl flex-wrap justify-center gap-3">
        {AI_CLIENTS.map(({ name, Icon }) => (
          <span key={name} className={CHIP}>
            <Icon className="size-6 shrink-0" aria-hidden="true" />
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Tiga keunggulan tambahan: jam emas, komisi referral, posting lewat chat AI. */
export function BenefitCards() {
  const { pick } = useI18n();
  const items = [
    {
      Icon: Clock,
      title: pick("Posting time suggestions", "Rekomendasi jam posting"),
      desc: pick(
        "Golden Hour (WIB) suggestions when scheduling so posts reach more audience.",
        "Saran Jam Emas (WIB) saat menjadwalkan agar postingan menjangkau lebih banyak audiens.",
      ),
    },
    {
      Icon: Gift,
      title: pick("Referral commission", "Komisi referral"),
      desc: pick(
        "Share your link and earn 10–20% commission after the user you invite makes their first top-up.",
        "Bagikan link Anda dan dapatkan komisi 10–20% setelah pengguna yang Anda ajak melakukan top-up pertama.",
      ),
    },
    {
      Icon: Bot,
      title: pick("Post via AI chat", "Posting lewat chat AI"),
      desc: pick(
        "Create and schedule posts straight from ChatGPT or Claude.",
        "Buat dan jadwalkan postingan langsung dari ChatGPT atau Claude.",
      ),
    },
  ];
  return (
    <section className="container-x py-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ Icon, title, desc }) => (
          <article key={title} className="rounded-lg border bg-card p-5">
            <Icon className="h-5 w-5 text-gold" />
            <h3 className="mt-3 font-medium text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const TESTIMONIALS = [
  {
    id: "Jadwal posting seminggu selesai dalam satu jam. Leads dari DM langsung masuk pipeline.",
    en: "A week of posts scheduled in one hour. Leads from DMs go straight into the pipeline.",
    name: "Rina",
    role: { id: "Pemilik UMKM Fashion", en: "Fashion SME owner" },
  },
  {
    id: "Kelola banyak klien dalam satu dashboard, laporan bulanan tinggal unduh.",
    en: "Manage many clients in one dashboard; monthly reports are one download away.",
    name: "Dimas",
    role: { id: "Social Media Agency", en: "Social Media Agency" },
  },
  {
    id: "Rekomendasi jam emas bikin engagement saya naik. Posting cukup lewat chat AI.",
    en: "Golden-hour suggestions boosted my engagement. I just post via AI chat.",
    name: "Sari",
    role: { id: "Content Creator", en: "Content Creator" },
  },
];

export function TestimonialGrid() {
  const { pick, lang } = useI18n();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TESTIMONIALS.map((t) => (
        <article key={t.name} className="rounded-lg border bg-card p-5">
          <Quote className="h-5 w-5 text-gold" />
          <p className="mt-3 text-sm text-foreground">{pick(t.en, t.id)}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            <b className="font-semibold text-foreground">{t.name}</b> ·{" "}
            {t.role[lang === "en" ? "en" : "id"]}
          </p>
        </article>
      ))}
    </div>
  );
}
