import { ContactItems } from "@/components/site/ContactItems";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Section, SectionHeading } from "@/components/site/Section";
import { getContactFormGuard, submitLead } from "@/lib/setup.functions";
import { BRAND, INDUSTRIES } from "@/lib/xperd";
import { useI18n } from "@/lib/i18n";

const searchSchema = z.object({
  paket: z.string().optional(),
});

export const Route = createFileRoute("/_site/contact")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Hubungi Sales XPERD — Demo & Konsultasi ERP" },
      {
        name: "description",
        content:
          "Jadwalkan demo XPERD Business atau konsultasi XPERD Enterprise. Tim solusi kami membantu memetakan kebutuhan ERP perusahaan Anda.",
      },
      { property: "og:title", content: "Hubungi Sales XPERD" },
      {
        property: "og:description",
        content: "Request demo dan konsultasi untuk XPERD Business dan Enterprise.",
      },
    ],
  }),
  component: ContactPage,
});

const EMPLOYEE_RANGES = ["1-25", "26-100", "101-500", "501-1000", "> 1000"];

const COPY = {
  en: {
    eyebrow: "Contact Sales",
    heroTitle: "Let's talk about your company's ERP needs.",
    heroDescription:
      "XPERD Business and Enterprise are designed together with you. Tell us about your organizational structure and operational challenges, and we'll prepare a relevant proposal.",
    headOffice: "Head Office",
    whatHappensNext: "What happens next?",
    steps: [
      "1. Our team will contact you within 1 business day.",
      "2. A short discovery session to understand your business process.",
      "3. A targeted demo tailored to your industry.",
      "4. Proposal, scope, and implementation plan.",
    ],
    interestedProduct: "Product of interest",
    business: "XPERD Business",
    enterprise: "XPERD Enterprise",
    companyName: "Company name",
    fullName: "Full name",
    jobTitle: "Job title",
    workEmail: "Work email",
    phoneNumber: "Phone number",
    numberOfEmployees: "Number of employees",
    selectRange: "Select a range",
    industry: "Industry",
    selectIndustry: "Select an industry",
    yourNeeds: "Your needs",
    messagePlaceholder:
      "Tell us about your entity structure, current systems, and implementation timeline.",
    submitButton: "Send request",
    thankYouTitle: "Thank you",
    thankYouDescription:
      "Your request has been received by the XPERD solutions team. We will contact you within 1 business day.",
    validation: {
      companyNameMin: "Company name must be at least 2 characters",
      contactNameMin: "Full name must be at least 2 characters",
      invalidEmail: "Invalid email format",
    },
    toastCheckData: "Please check the data you have entered.",
    toastSubmitFailed: "Message failed to send. Please try again.",
    toastSuccess: "Your request has been sent.",
    verifying: "Preparing a secure form…",
    turnstileNeeded: "Please complete the security check above the button.",
  },
  id: {
    eyebrow: "Contact Sales",
    heroTitle: "Bicarakan kebutuhan ERP perusahaan Anda.",
    heroDescription:
      "XPERD Business dan Enterprise dirancang bersama Anda. Ceritakan struktur organisasi dan tantangan operasional Anda, kami siapkan proposal yang relevan.",
    headOffice: "Kantor Pusat",
    whatHappensNext: "Apa yang terjadi setelah ini?",
    steps: [
      "1. Tim kami menghubungi Anda dalam 1x24 jam kerja.",
      "2. Sesi discovery singkat untuk memahami proses bisnis.",
      "3. Demo terarah sesuai industri Anda.",
      "4. Proposal, ruang lingkup, dan rencana implementasi.",
    ],
    interestedProduct: "Produk yang diminati",
    business: "XPERD Business",
    enterprise: "XPERD Enterprise",
    companyName: "Nama perusahaan",
    fullName: "Nama lengkap",
    jobTitle: "Jabatan",
    workEmail: "Email kerja",
    phoneNumber: "Nomor telepon",
    numberOfEmployees: "Jumlah karyawan",
    selectRange: "Pilih rentang",
    industry: "Industri",
    selectIndustry: "Pilih industri",
    yourNeeds: "Kebutuhan Anda",
    messagePlaceholder:
      "Ceritakan struktur entitas, sistem yang dipakai saat ini, dan target implementasi.",
    submitButton: "Kirim permintaan",
    thankYouTitle: "Terima kasih",
    thankYouDescription:
      "Permintaan Anda sudah masuk ke tim solusi XPERD. Kami akan menghubungi Anda dalam 1x24 jam kerja.",
    validation: {
      companyNameMin: "Nama perusahaan minimal 2 karakter",
      contactNameMin: "Nama lengkap minimal 2 karakter",
      invalidEmail: "Format email tidak valid",
    },
    toastCheckData: "Periksa kembali data yang Anda isi.",
    toastSubmitFailed: "Pesan gagal dikirim. Silakan coba lagi.",
    toastSuccess: "Permintaan Anda telah dikirim.",
    verifying: "Menyiapkan form aman…",
    turnstileNeeded: "Selesaikan verifikasi keamanan di atas tombol.",
  },
} as const;

function buildFormSchema(c: (typeof COPY)["en"] | (typeof COPY)["id"]) {
  return z.object({
    company_name: z.string().trim().min(2, c.validation.companyNameMin).max(120),
    contact_name: z.string().trim().min(2, c.validation.contactNameMin).max(120),
    job_title: z.string().trim().max(120).optional().or(z.literal("")),
    email: z.string().trim().email(c.validation.invalidEmail).max(255),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    industry: z.string().trim().max(80).optional().or(z.literal("")),
    employee_range: z.string().trim().max(40).optional().or(z.literal("")),
    message: z.string().trim().max(1000).optional().or(z.literal("")),
  });
}

function ContactPage() {
  const { lang } = useI18n();
  const c = COPY[lang];
  const formSchema = buildFormSchema(c);

  const { paket } = Route.useSearch();
  const [product, setProduct] = useState<"business" | "enterprise">(
    paket === "enterprise" ? "enterprise" : "business",
  );
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [guard, setGuard] = useState<{ token: string; turnstileSiteKey: string | null } | null>(
    null,
  );
  const [turnstile, setTurnstile] = useState("");
  const refreshGuard = () =>
    getContactFormGuard()
      .then((g) => setGuard(g))
      .catch(() => setGuard(null));
  useEffect(() => {
    void refreshGuard();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
    const parsed = formSchema.safeParse(raw);

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      toast.error(c.toastCheckData);
      return;
    }

    setErrors({});
    if (guard?.turnstileSiteKey && !turnstile) {
      toast.error(c.turnstileNeeded);
      return;
    }
    setSubmitting(true);
    const v = parsed.data;
    let result: { ok: true } | { ok: false; error: string };
    try {
      result = await submitLead({
        data: {
          company_name: v.company_name,
          contact_name: v.contact_name,
          job_title: v.job_title || undefined,
          email: v.email,
          phone: v.phone || undefined,
          industry: v.industry || undefined,
          employee_range: v.employee_range || undefined,
          message: v.message || undefined,
          interested_product: product,
          guard: {
            token: guard?.token,
            website: String(raw.website ?? ""),
            turnstile: turnstile || undefined,
          },
        },
      });
      setSubmitting(false);
    } catch {
      setSubmitting(false);
      toast.error(c.toastSubmitFailed);
      return;
    }
    if (!result.ok) {
      toast.error(result.error);
      // Token sekali pakai: siapkan yang baru supaya pengguna bisa mencoba lagi tanpa memuat ulang.
      setTurnstile("");
      void refreshGuard();
      return;
    }
    setDone(true);
    toast.success(c.toastSuccess);
  }

  return (
    <>
      <Section dark className="py-16">
        <SectionHeading
          onDark
          eyebrow={c.eyebrow}
          title={c.heroTitle}
          description={c.heroDescription}
        />
      </Section>

      <Section className="py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.45fr]">
          <aside className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-7">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {c.headOffice}
              </h2>
              <ContactItems className="mt-5 space-y-4 text-sm text-muted-foreground" />
            </div>
            <div className="surface-navy relative overflow-hidden rounded-2xl p-7">
              <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
              <div className="relative">
                <p className="text-sm font-semibold text-primary-foreground">{c.whatHappensNext}</p>
                <ol className="mt-4 space-y-3 text-sm text-primary-foreground/70">
                  {c.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          </aside>

          {done ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-gold" />
              <h2 className="mt-6 text-2xl text-navy">{c.thankYouTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {c.thankYouDescription}
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="relative rounded-2xl border border-border bg-card p-8 md:p-10"
            >
              <Label>{c.interestedProduct}</Label>
              <div className="mt-2 flex flex-wrap gap-3">
                {(["business", "enterprise"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProduct(p)}
                    className={`rounded-full border px-5 py-2 text-sm font-medium transition-colors ${
                      product === p
                        ? "border-navy bg-navy text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-navy/40"
                    }`}
                  >
                    {p === "business" ? c.business : c.enterprise}
                  </button>
                ))}
              </div>

              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <Field
                  label={c.companyName}
                  name="company_name"
                  error={errors.company_name}
                  required
                />
                <Field
                  label={c.fullName}
                  name="contact_name"
                  error={errors.contact_name}
                  required
                />
                <Field label={c.jobTitle} name="job_title" error={errors.job_title} />
                <Field
                  label={c.workEmail}
                  name="email"
                  type="email"
                  error={errors.email}
                  required
                />
                <Field label={c.phoneNumber} name="phone" error={errors.phone} />
                <div>
                  <Label htmlFor="employee_range">{c.numberOfEmployees}</Label>
                  <select
                    id="employee_range"
                    name="employee_range"
                    defaultValue=""
                    className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="">{c.selectRange}</option>
                    {EMPLOYEE_RANGES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="industry">{c.industry}</Label>
                  <select
                    id="industry"
                    name="industry"
                    defaultValue=""
                    className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="">{c.selectIndustry}</option>
                    {INDUSTRIES.map((i) => (
                      <option key={i.slug} value={i.name}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Honeypot: tidak terlihat & tidak bisa difokus pengguna; bot yang mengisinya dibuang. */}
              <div
                aria-hidden="true"
                className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
              >
                <label htmlFor="website">Website</label>
                <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
              </div>

              <div className="mt-6">
                <Label htmlFor="message">{c.yourNeeds}</Label>
                <Textarea
                  id="message"
                  name="message"
                  rows={5}
                  className="mt-1.5"
                  placeholder={c.messagePlaceholder}
                />
              </div>

              {guard?.turnstileSiteKey && (
                <Turnstile siteKey={guard.turnstileSiteKey} lang={lang} onToken={setTurnstile} />
              )}

              <Button
                type="submit"
                variant="navy"
                size="xl"
                className="mt-8"
                disabled={submitting || !guard}
              >
                {(submitting || !guard) && <Loader2 className="animate-spin" />}
                {guard ? c.submitButton : c.verifying}
              </Button>
            </form>
          )}
        </div>
      </Section>
    </>
  );
}

function Field({
  label,
  name,
  type = "text",
  error,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={name}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input id={name} name={name} type={type} required={required} className="mt-1.5" />
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

/** Widget Cloudflare Turnstile (hanya dimuat bila site key diatur di server). */
function Turnstile({
  siteKey,
  lang,
  onToken,
}: {
  siteKey: string;
  lang: string;
  onToken: (t: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !ref.current || !window.turnstile) return;
      id = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        language: lang === "id" ? "id" : "en",
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    if (window.turnstile) mount();
    else {
      const src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      let tag = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (!tag) {
        tag = document.createElement("script");
        tag.src = src;
        tag.async = true;
        document.head.appendChild(tag);
      }
      tag.addEventListener("load", mount, { once: true });
    }
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, lang, onToken]);
  return <div ref={ref} className="mt-6" />;
}
