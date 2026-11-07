import { QallingShell, PageHero } from "@/components/qalling/QallingSite";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { LEGAL, LEGAL_PATH, LEGAL_UPDATED, type LegalKey } from "@/lib/qalling-legal";

const ORDER: LegalKey[] = ["terms", "privacy", "aup"];

export function LegalPage({ kind }: { kind: LegalKey }) {
  const { lang, pick } = useI18n();
  const doc = LEGAL[kind][lang === "en" ? "en" : "id"];
  return (
    <QallingShell>
      <PageHero
        eyebrow={pick("Legal", "Legal")}
        title={doc.title}
        desc={`${pick("Last updated", "Terakhir diperbarui")}: ${LEGAL_UPDATED}`}
      />
      <section className="container-x pb-16">
        <article className="mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-muted-foreground">
          <p>{doc.intro}</p>
          {doc.sections.map((s) => (
            <div key={s.h} className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">{s.h}</h2>
              {s.p.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </div>
          ))}
          <nav className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-4 text-xs">
            {ORDER.filter((k) => k !== kind).map((k) => (
              <Link key={k} to={LEGAL_PATH[k]} className="text-gold hover:underline">
                {LEGAL[k][lang === "en" ? "en" : "id"].title}
              </Link>
            ))}
          </nav>
        </article>
      </section>
    </QallingShell>
  );
}
