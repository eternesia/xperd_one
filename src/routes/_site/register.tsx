import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Section, SectionHeading } from "@/components/site/Section";
import { getPublicSignupPackages, submitRegistration } from "@/lib/setup.functions";
import { formatIDR, INDUSTRIES } from "@/lib/xperd";
import { useI18n } from "@/lib/i18n";

const searchSchema = z.object({
  paket: z.enum(["one-starter", "one-professional"]).optional(),
});

export const Route = createFileRoute("/_site/register")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Registrasi Online XPERD One — Aktif Hari Ini" },
      {
        name: "description",
        content:
          "Daftar XPERD One Starter atau Professional secara online. Isi data perusahaan Anda dan workspace ERP disiapkan pada hari kerja yang sama.",
      },
      { property: "og:title", content: "Registrasi Online XPERD One" },
      {
        property: "og:description",
        content: "Formulir pendaftaran mandiri untuk paket Starter dan Professional.",
      },
    ],
  }),
  component: RegisterPage,
});

const COPY = {
  en: {
    eyebrow: "Online Registration",
    heroTitle: "Activate XPERD One today.",
    heroDescription:
      "Self-service registration is available for the Starter and Professional packages. For XPERD Business and Enterprise, our sales team will put together a custom offer.",
    choosePackage: "Choose a package",
    needMoreScale: "Need more scale?",
    needMoreScaleDescription:
      "XPERD Business and Enterprise require a discovery session with our team.",
    contactSales: "Contact Sales",
    companyData: "Company data",
    companyDataDescription: "All data is used only for workspace setup and billing.",
    companyName: "Company name",
    contactFullName: "PIC full name",
    workEmail: "Work email",
    phoneWhatsapp: "Phone / WhatsApp number",
    subdomainLabel: "Workspace subdomain",
    subdomainPlaceholder: "yourcompany",
    city: "City",
    industry: "Industry",
    selectIndustry: "Select an industry",
    billingCycle: "Billing cycle",
    monthly: "Monthly",
    yearly: "Yearly",
    additionalNotes: "Additional notes",
    notesPlaceholder: "Briefly describe your business process or special requirements.",
    submitButton: "Submit registration",
    dataProtected: "Your data is protected and not shared with third parties.",
    backToHome: "Back to home",
    readImplementationGuide: "Read implementation guide",
    successTitle: "Your registration has been received",
    successDescription:
      "The XPERD activation team will verify your data and send workspace access details along with your first invoice to your email on the same business day.",
    validation: {
      companyNameMin: "Company name must be at least 2 characters",
      contactNameMin: "Full name must be at least 2 characters",
      invalidEmail: "Invalid email format",
      invalidPhone: "Invalid phone number",
      subdomainMin: "Subdomain must be at least 3 characters",
      subdomainRegex: "Use lowercase letters, numbers, and hyphens only",
    },
    toastCheckData: "Please check the data you have entered.",
    toastSubdomainTaken: "That subdomain is already taken. Please choose another one.",
    toastSubmitFailed: "Registration submission failed. Please try again.",
    toastSuccess: "Registration submitted successfully.",
  },
  id: {
    eyebrow: "Registrasi Online",
    heroTitle: "Aktifkan XPERD One hari ini.",
    heroDescription:
      "Registrasi mandiri tersedia untuk paket Starter dan Professional. Untuk XPERD Business dan Enterprise, tim sales kami akan menyusun penawaran khusus.",
    choosePackage: "Pilih paket",
    needMoreScale: "Butuh skala lebih besar?",
    needMoreScaleDescription:
      "XPERD Business dan Enterprise memerlukan sesi discovery bersama tim kami.",
    contactSales: "Hubungi Sales",
    companyData: "Data perusahaan",
    companyDataDescription: "Semua data digunakan hanya untuk penyiapan workspace dan penagihan.",
    companyName: "Nama perusahaan",
    contactFullName: "Nama lengkap PIC",
    workEmail: "Email kerja",
    phoneWhatsapp: "Nomor telepon / WhatsApp",
    subdomainLabel: "Subdomain workspace",
    subdomainPlaceholder: "perusahaananda",
    city: "Kota",
    industry: "Industri",
    selectIndustry: "Pilih industri",
    billingCycle: "Siklus penagihan",
    monthly: "Bulanan",
    yearly: "Tahunan",
    additionalNotes: "Catatan tambahan",
    notesPlaceholder: "Ceritakan singkat proses bisnis atau kebutuhan khusus Anda.",
    submitButton: "Kirim pendaftaran",
    dataProtected: "Data Anda dilindungi dan tidak dibagikan ke pihak ketiga.",
    backToHome: "Kembali ke beranda",
    readImplementationGuide: "Baca panduan implementasi",
    successTitle: "Pendaftaran Anda kami terima",
    successDescription:
      "Tim aktivasi XPERD akan memverifikasi data dan mengirimkan detail akses workspace beserta invoice pertama ke email Anda pada hari kerja yang sama.",
    validation: {
      companyNameMin: "Nama perusahaan minimal 2 karakter",
      contactNameMin: "Nama lengkap minimal 2 karakter",
      invalidEmail: "Format email tidak valid",
      invalidPhone: "Nomor telepon tidak valid",
      subdomainMin: "Subdomain minimal 3 karakter",
      subdomainRegex: "Gunakan huruf kecil, angka, dan tanda hubung saja",
    },
    toastCheckData: "Periksa kembali data yang Anda isi.",
    toastSubdomainTaken: "Subdomain tersebut sudah digunakan. Silakan pilih nama lain.",
    toastSubmitFailed: "Pendaftaran gagal dikirim. Silakan coba lagi.",
    toastSuccess: "Pendaftaran berhasil dikirim.",
  },
} as const;

function buildFormSchema(c: (typeof COPY)["en"] | (typeof COPY)["id"]) {
  return z.object({
    company_name: z.string().trim().min(2, c.validation.companyNameMin).max(120),
    contact_name: z.string().trim().min(2, c.validation.contactNameMin).max(120),
    email: z.string().trim().email(c.validation.invalidEmail).max(255),
    phone: z.string().trim().min(8, c.validation.invalidPhone).max(30),
    subdomain: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, c.validation.subdomainMin)
      .max(30)
      .regex(/^[a-z0-9-]+$/, c.validation.subdomainRegex),
    city: z.string().trim().max(80).optional().or(z.literal("")),
    industry: z.string().trim().max(80).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
  });
}

function RegisterPage() {
  const { lang } = useI18n();
  const c = COPY[lang];
  const formSchema = buildFormSchema(c);

  const { paket } = Route.useSearch();
  const navigate = useNavigate();
  const [packageCode, setPackageCode] = useState<string>(paket ?? "one-starter");
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: packages } = useQuery({
    queryKey: ["signup-packages"],
    queryFn: () => getPublicSignupPackages(),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = Object.fromEntries(form.entries());
    const parsed = formSchema.safeParse(raw);

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      toast.error(c.toastCheckData);
      return;
    }

    setErrors({});
    setSubmitting(true);
    const values = parsed.data;
    try {
      await submitRegistration({
        data: {
          company_name: values.company_name,
          contact_name: values.contact_name,
          email: values.email,
          phone: values.phone,
          subdomain: values.subdomain,
          city: values.city || undefined,
          industry: values.industry || undefined,
          notes: values.notes || undefined,
          package_code: packageCode,
          billing_cycle: billing,
        },
      });
      setSubmitting(false);
    } catch (err) {
      setSubmitting(false);
      toast.error(
        err instanceof Error && err.message.includes("duplicate") ? c.toastSubdomainTaken : c.toastSubmitFailed,
      );
      return;
    }

    setDone(true);
    toast.success(c.toastSuccess);
  }

  if (done) {
    return (
      <Section className="py-24">
        <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-10 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-gold" />
          <h1 className="mt-6 text-2xl text-navy">{c.successTitle}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.successDescription}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="navy" onClick={() => navigate({ to: "/" })}>
              {c.backToHome}
            </Button>
            <Button asChild variant="outline">
              <Link to="/resources">{c.readImplementationGuide}</Link>
            </Button>
          </div>
        </div>
      </Section>
    );
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
        <div className="grid gap-10 lg:grid-cols-[1fr_1.35fr]">
          {/* PACKAGE PICKER */}
          <aside className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {c.choosePackage}
            </h2>
            {(packages ?? []).map((pkg) => {
              const active = packageCode === pkg.code;
              return (
                <button
                  key={pkg.code}
                  type="button"
                  onClick={() => setPackageCode(pkg.code)}
                  className={`w-full rounded-2xl border p-6 text-left transition-all ${
                    active
                      ? "border-gold bg-secondary shadow-[var(--shadow-elevate)]"
                      : "border-border bg-card hover:border-navy/30"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-navy">{pkg.name}</span>
                    <span className="text-sm font-semibold text-gold-foreground">
                      {formatIDR(Number(pkg.monthly_price))}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{pkg.tagline}</p>
                  <ul className="mt-4 space-y-1.5">
                    {(Array.isArray(pkg.features) ? (pkg.features as string[]) : [])
                      .slice(0, 5)
                      .map((f) => (
                        <li key={f} className="flex gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                          {f}
                        </li>
                      ))}
                  </ul>
                </button>
              );
            })}

            <div className="rounded-2xl border border-border bg-secondary/60 p-6">
              <p className="text-sm font-semibold text-navy">{c.needMoreScale}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {c.needMoreScaleDescription}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link to="/contact">{c.contactSales}</Link>
              </Button>
            </div>
          </aside>

          {/* FORM */}
          <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-8 md:p-10">
            <h2 className="text-xl text-navy">{c.companyData}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{c.companyDataDescription}</p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <Field label={c.companyName} name="company_name" error={errors.company_name} required />
              <Field label={c.contactFullName} name="contact_name" error={errors.contact_name} required />
              <Field label={c.workEmail} name="email" type="email" error={errors.email} required />
              <Field label={c.phoneWhatsapp} name="phone" error={errors.phone} required />
              <div className="sm:col-span-2">
                <Label htmlFor="subdomain">
                  {c.subdomainLabel} <span className="text-destructive">*</span>
                </Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input id="subdomain" name="subdomain" placeholder={c.subdomainPlaceholder} required />
                  <span className="shrink-0 text-sm text-muted-foreground">.xperd.id</span>
                </div>
                {errors.subdomain && (
                  <p className="mt-1.5 text-xs text-destructive">{errors.subdomain}</p>
                )}
              </div>
              <Field label={c.city} name="city" error={errors.city} />
              <div>
                <Label htmlFor="industry">{c.industry}</Label>
                <select
                  id="industry"
                  name="industry"
                  className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  defaultValue=""
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

            <div className="mt-6">
              <Label>{c.billingCycle}</Label>
              <div className="mt-2 flex gap-3">
                {(["monthly", "yearly"] as const).map((cycle) => (
                  <button
                    key={cycle}
                    type="button"
                    onClick={() => setBilling(cycle)}
                    className={`rounded-full border px-5 py-2 text-sm font-medium transition-colors ${
                      billing === cycle
                        ? "border-navy bg-navy text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-navy/40"
                    }`}
                  >
                    {cycle === "monthly" ? c.monthly : c.yearly}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <Label htmlFor="notes">{c.additionalNotes}</Label>
              <Textarea
                id="notes"
                name="notes"
                rows={4}
                className="mt-1.5"
                placeholder={c.notesPlaceholder}
              />
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button type="submit" variant="gold" size="xl" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                {c.submitButton}
              </Button>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-gold" />
                {c.dataProtected}
              </p>
            </div>
          </form>
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
