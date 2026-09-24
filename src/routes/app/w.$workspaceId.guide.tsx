import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, Lightbulb, Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { GUIDE_BASICS, GUIDE_MODULES, guideMatches, type GuideSection } from "@/lib/guide";

export const Route = createFileRoute("/app/w/$workspaceId/guide")({
  component: GuidePage,
});

function SectionList({ sections, lang }: { sections: GuideSection[]; lang: string }) {
  const isId = lang === "id";
  return (
    <Accordion type="multiple" className="space-y-3">
      {sections.map((section) => (
        <AccordionItem
          key={section.id}
          value={section.id}
          className="overflow-hidden rounded-2xl border border-border bg-card px-4"
        >
          <AccordionTrigger className="py-4 text-left hover:no-underline">
            <div>
              <div className="text-sm font-semibold text-navy dark:text-foreground">
                {isId ? section.titleId : section.titleEn}
              </div>
              <div className="mt-1 text-xs font-normal text-muted-foreground">
                {isId ? section.summaryId : section.summaryEn}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <ol className="space-y-3">
              {section.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground">{isId ? step.id : step.en}</span>
                </li>
              ))}
            </ol>
            {section.tips?.length ? (
              <div className="mt-4 rounded-xl bg-secondary/60 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-navy dark:text-foreground">
                  <Lightbulb className="h-3.5 w-3.5 text-gold" />
                  {isId ? "Tips" : "Tips"}
                </div>
                <ul className="mt-2 space-y-1.5">
                  {section.tips.map((tip, i) => (
                    <li key={i} className="text-xs leading-relaxed text-muted-foreground">
                      • {isId ? tip.id : tip.en}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function GuidePage() {
  const { workspaceId } = Route.useParams();
  const { lang } = useI18n();
  const isId = lang === "id";
  const [query, setQuery] = useState("");

  const basics = useMemo(() => GUIDE_BASICS.filter((s) => guideMatches(s, query)), [query]);
  const modules = useMemo(() => GUIDE_MODULES.filter((s) => guideMatches(s, query)), [query]);
  const empty = basics.length === 0 && modules.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <Link
        to="/app/w/$workspaceId"
        params={{ workspaceId }}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-navy dark:hover:text-primary-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {isId ? "Semua Modul" : "All Modules"}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-2 gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-gold" />
            {isId ? "Panduan Pengguna" : "User Manual"}
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight text-navy dark:text-foreground">
            {isId ? "Panduan Pemakaian XPERD One" : "XPERD One Usage Guide"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {isId
              ? "Panduan mandiri untuk setiap modul dan fitur, tersedia dalam Bahasa Indonesia dan Inggris. Ganti bahasa dari tombol bahasa di bilah atas."
              : "A self-service guide to every module and feature, available in English and Bahasa Indonesia. Switch language from the language toggle in the top bar."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" />
          {isId ? "Cetak" : "Print"}
        </Button>
      </div>

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isId ? "Cari fitur, modul, atau langkah…" : "Search a feature, module or step…"}
          className="pl-9"
        />
      </div>

      {empty ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          {isId ? "Tidak ada panduan yang cocok." : "No guide entry matches that search."}
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {basics.length ? (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {isId ? "Dasar" : "Basics"}
              </h2>
              <SectionList sections={basics} lang={lang} />
            </section>
          ) : null}
          {modules.length ? (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {isId ? "Panduan per Modul" : "Module by module"}
              </h2>
              <SectionList sections={modules} lang={lang} />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
