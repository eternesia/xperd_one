import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Link2, Menu, Search } from "lucide-react";
import { toast } from "sonner";

import { QallingShell } from "@/components/qalling/QallingSite";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { AREA_GROUPS, QALLING_DOCS, type DocArea, type DocSection } from "@/lib/qalling-docs";
import { GROUP_EN, QALLING_DOCS_EN } from "@/lib/qalling-docs.en";

type Lang = "id" | "en";
const areaOf = (d: DocSection): DocArea => d.area ?? "guide";

/** Teks dokumen sesuai bahasa; EN jatuh kembali ke Indonesia bila belum ada terjemahan. */
function localize(d: DocSection, lang: Lang) {
  const en = lang === "en" ? QALLING_DOCS_EN[d.id] : undefined;
  return {
    title: en?.title ?? d.title,
    summary: en?.summary ?? d.summary,
    steps: en?.steps ?? d.steps,
    tips: en?.tips ?? d.tips,
    table: en?.table ?? d.table,
    code: d.code?.map((c, i) => ({ ...c, title: en?.codeTitles?.[i] ?? c.title })),
  };
}
const groupLabel = (g: string, lang: Lang) => (lang === "en" ? (GROUP_EN[g] ?? g) : g);

const AREA_TABS: { area: DocArea; id: string; en: string; first: string }[] = [
  { area: "guide", id: "Panduan", en: "Guide", first: "mulai" },
  { area: "developer", id: "Developer", en: "Developer", first: "dev-intro" },
  { area: "api", id: "API Reference", en: "API Reference", first: "api-reference" },
];

const toMarkdown = (d: DocSection, lang: Lang) => {
  const x = localize(d, lang);
  const steps = lang === "en" ? "Steps" : "Langkah";
  return [
    `# ${x.title}`,
    "",
    x.summary,
    ...(x.table
      ? [
          "",
          `| ${x.table.head.join(" | ")} |`,
          `| ${x.table.head.map(() => "---").join(" | ")} |`,
          ...x.table.rows.map((r) => `| ${r.join(" | ")} |`),
        ]
      : []),
    ...(x.steps ? ["", `## ${steps}`, ...x.steps.map((s, i) => `${i + 1}. ${s}`)] : []),
    ...(x.code ? x.code.flatMap((c) => ["", `\`\`\`${c.lang}`, c.body, "```"]) : []),
    ...(x.tips ? ["", "## Tips", ...x.tips.map((t) => `- ${t}`)] : []),
  ].join("\n");
};

function Heading({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="group mt-8 scroll-mt-24 text-lg font-semibold text-navy dark:text-foreground"
    >
      {children}
      <a
        href={`#${id}`}
        aria-label={children}
        onClick={() => {
          const url = `${window.location.origin}${window.location.pathname}#${id}`;
          navigator.clipboard?.writeText(url).then(() => toast.success("Link copied"));
        }}
        className="ml-2 inline-flex align-middle text-muted-foreground opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
      >
        <Link2 className="h-4 w-4" />
      </a>
    </h2>
  );
}

function CodeBlock({ title, body, lang }: { title?: string; body: string; lang: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border bg-secondary/40">
      <div className="flex items-center justify-between border-b bg-secondary/70 px-3 py-1.5 text-xs text-muted-foreground">
        <span>{title ?? lang}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => navigator.clipboard?.writeText(body).then(() => toast.success("Copied"))}
        >
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code>{body}</code>
      </pre>
    </div>
  );
}

type ApiTool = {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  params: {
    name: string;
    type: string;
    required: boolean;
    description: string;
    default?: unknown;
  }[];
};

const CATEGORIES: [string, string, RegExp][] = [
  [
    "Posts & media",
    "Postingan & media",
    /post|media|idea|platform_rules|publishing_limits|best_times/,
  ],
  ["Inbox & comments", "Inbox & komentar", /conversation|dm|comment|automation|template/],
  ["Analytics", "Analitik", /insights/],
  ["CRM", "CRM", /lead|activit|contact|crm|search_leads/],
  ["ERP", "ERP", /.*/],
];
const categoryOf = (n: string) =>
  CATEGORIES.find(([, , re], i) =>
    i === CATEGORIES.length - 1
      ? !n.startsWith("qalling_")
      : n.startsWith("qalling_") && re.test(n),
  ) ?? CATEGORIES[0];

function ApiReference({ lang }: { lang: Lang }) {
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["mcp-tools-doc"],
    queryFn: async () => {
      const r = await fetch("/api/public/docs/mcp-tools");
      if (!r.ok) throw new Error("failed");
      return (await r.json()) as { server: { name: string; version: string }; tools: ApiTool[] };
    },
    staleTime: 300_000,
  });
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (data?.tools ?? []).filter(
      (t) => !term || `${t.name} ${t.title} ${t.description}`.toLowerCase().includes(term),
    );
    const map = new Map<string, ApiTool[]>();
    for (const t of list) {
      const [en, id] = categoryOf(t.name);
      const label = lang === "en" ? en : id;
      map.set(label, [...(map.get(label) ?? []), t]);
    }
    return [...map.entries()];
  }, [data, q, lang]);

  if (isLoading)
    return (
      <p className="mt-6 text-sm text-muted-foreground">{lang === "en" ? "Loading…" : "Memuat…"}</p>
    );
  if (error || !data)
    return (
      <p className="mt-6 text-sm text-destructive">
        {lang === "en" ? "The tool list could not be loaded." : "Daftar tool tidak dapat dimuat."}
      </p>
    );
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === "en" ? "Filter tools…" : "Saring tool…"}
            className="h-9 pl-9"
            aria-label="Filter"
          />
        </div>
        <Badge variant="secondary">
          {data.server.name} v{data.server.version} · {data.tools.length} tools
        </Badge>
      </div>
      {groups.map(([label, tools]) => (
        <section key={label} className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-primary/80">
            {label}
          </h3>
          <div className="mt-2 space-y-2">
            {tools.map((t) => (
              <details
                key={t.name}
                id={t.name}
                className="group rounded-lg border bg-card open:shadow-sm"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5">
                  <code className="text-sm font-semibold text-primary">{t.name}</code>
                  <Badge variant={t.readOnly ? "secondary" : "outline"}>
                    {t.readOnly
                      ? lang === "en"
                        ? "read-only"
                        : "baca saja"
                      : lang === "en"
                        ? "changes data"
                        : "mengubah data"}
                  </Badge>
                  <span className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1 sm:truncate">
                    {t.title}
                  </span>
                </summary>
                <div className="space-y-3 border-t px-3 py-3 text-sm">
                  <p className="text-muted-foreground">{t.description}</p>
                  {t.params.length > 0 ? (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="bg-secondary/60 text-left">
                          <tr>
                            <th className="px-2 py-1.5">
                              {lang === "en" ? "Parameter" : "Parameter"}
                            </th>
                            <th className="px-2 py-1.5">{lang === "en" ? "Type" : "Tipe"}</th>
                            <th className="px-2 py-1.5">
                              {lang === "en" ? "Description" : "Keterangan"}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.params.map((p) => (
                            <tr key={p.name} className="border-t align-top">
                              <td className="px-2 py-1.5 font-mono">
                                {p.name}
                                {p.required && <span className="text-destructive"> *</span>}
                              </td>
                              <td className="px-2 py-1.5 font-mono text-muted-foreground">
                                {p.type}
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">
                                {p.description}
                                {p.default !== undefined && (
                                  <span className="block">
                                    {lang === "en" ? "Default" : "Bawaan"}:{" "}
                                    <code>{JSON.stringify(p.default)}</code>
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {lang === "en" ? "No parameters." : "Tanpa parameter."}
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
      {groups.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          {lang === "en" ? "No tools match." : "Tidak ada tool yang cocok."}
        </p>
      )}
    </div>
  );
}

export function DocsPage({ slug }: { slug?: string }) {
  const { lang: rawLang } = useI18n();
  const lang: Lang = rawLang === "en" ? "en" : "id";
  const doc = QALLING_DOCS.find((d) => d.id === (slug ?? QALLING_DOCS[0].id));
  const area = doc ? areaOf(doc) : "guide";
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const t = (en: string, id: string) => (lang === "en" ? en : id);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return QALLING_DOCS.filter((s) => {
      const x = localize(s, lang);
      return [x.title, x.summary, ...(x.steps ?? []), ...(x.tips ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(term);
    }).slice(0, 8);
  }, [q, lang]);

  const inArea = QALLING_DOCS.filter((d) => areaOf(d) === area);
  const index = doc ? inArea.indexOf(doc) : -1;
  const prev = index > 0 ? inArea[index - 1] : null;
  const next = index >= 0 && index < inArea.length - 1 ? inArea[index + 1] : null;
  const x = doc ? localize(doc, lang) : null;
  const toc = x
    ? [
        ...(x.table ? [{ id: "tabel", label: t("Comparison", "Perbandingan") }] : []),
        ...(x.steps ? [{ id: "langkah", label: t("Steps", "Langkah") }] : []),
        ...(x.code ? [{ id: "contoh", label: t("Examples", "Contoh") }] : []),
        ...(x.tips ? [{ id: "tips", label: "Tips" }] : []),
      ]
    : [];

  const navList = (
    <>
      {AREA_GROUPS[area].map((g) => (
        <div key={g} className="mb-4 last:mb-0">
          <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-primary/70">
            {groupLabel(g, lang)}
          </p>
          <ul className="space-y-0.5 text-sm">
            {inArea
              .filter((d) => d.group === g)
              .map((d) => (
                <li key={d.id}>
                  <Link
                    to="/qalling/docs/$slug"
                    params={{ slug: d.id }}
                    className={
                      "block rounded-md px-2 py-1.5 transition-colors " +
                      (d.id === doc?.id
                        ? "bg-primary/15 font-medium text-primary"
                        : "text-foreground/70 hover:bg-primary/10 hover:text-primary")
                    }
                  >
                    {localize(d, lang).title}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </>
  );

  return (
    <QallingShell>
      <section className="container-x py-4 sm:py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b">
          <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
            {AREA_TABS.map((tab) => (
              <Link
                key={tab.area}
                to="/qalling/docs/$slug"
                params={{ slug: tab.first }}
                className={
                  "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm " +
                  (tab.area === area
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground")
                }
              >
                {lang === "en" ? tab.en : tab.id}
              </Link>
            ))}
          </div>
          <div className="relative mb-2 w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setTimeout(() => setFocus(false), 150)}
              placeholder={t("Search docs…  (Ctrl/⌘ + K)", "Cari dokumentasi…  (Ctrl/⌘ + K)")}
              className="h-9 pl-9"
              aria-label={t("Search docs", "Cari dokumentasi")}
            />
            {focus && q.trim() && (
              <ul className="absolute right-0 z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
                {results.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">
                    {t("No results for", "Tidak ada hasil untuk")} “{q}”.
                  </li>
                )}
                {results.map((r) => (
                  <li key={r.id}>
                    <Link
                      to="/qalling/docs/$slug"
                      params={{ slug: r.id }}
                      onClick={() => setQ("")}
                      className="block px-3 py-2 hover:bg-secondary"
                    >
                      <span className="text-sm font-medium">{localize(r, lang).title}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {groupLabel(r.group, lang)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {localize(r, lang).summary}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="sticky top-16 z-10 mb-4 flex w-full items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-left shadow-sm backdrop-blur lg:hidden"
        >
          <Menu className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {x?.title ?? t("Browse topics", "Pilih topik")}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-3xl">
            <SheetHeader>
              <SheetTitle>{t("Documentation", "Dokumentasi")}</SheetTitle>
            </SheetHeader>
            <div className="mt-3" onClick={() => setMenuOpen(false)}>
              {navList}
            </div>
          </SheetContent>
        </Sheet>

        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)_180px]">
          <nav
            aria-label={t("Documentation", "Dokumentasi")}
            className="hidden rounded-xl border border-primary/15 bg-primary/5 p-3 lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto"
          >
            {navList}
          </nav>

          <article className="min-w-0">
            {!doc || !x ? (
              <div>
                <h1 className="text-2xl font-bold">
                  {t("Page not found", "Halaman tidak ditemukan")}
                </h1>
                <p className="mt-2 text-muted-foreground">
                  {t("Pick a topic from the list or ", "Pilih topik dari daftar atau ")}
                  <Link to="/qalling/docs" className="text-primary underline">
                    {t("start from the beginning", "mulai dari awal")}
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {groupLabel(doc.group, lang)}
                    </p>
                    <h1 className="text-3xl font-bold text-navy dark:text-foreground">{x.title}</h1>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigator.clipboard
                        ?.writeText(toMarkdown(doc, lang))
                        .then(() =>
                          toast.success(t("Copied as Markdown", "Disalin sebagai Markdown")),
                        )
                    }
                  >
                    <Copy className="h-4 w-4" /> {t("Copy Markdown", "Salin Markdown")}
                  </Button>
                </div>
                <p className="mt-3 text-muted-foreground">{x.summary}</p>

                {doc.id === "api-reference" && <ApiReference lang={lang} />}

                {x.table && (
                  <>
                    <Heading id="tabel">{t("Comparison", "Perbandingan")}</Heading>
                    <div className="mt-3 overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-primary/5 text-left">
                          <tr>
                            {x.table.head.map((h) => (
                              <th key={h} className="px-3 py-2 font-medium">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {x.table.rows.map((r) => (
                            <tr key={r[0]} className="border-t">
                              {r.map((c, i) => (
                                <td
                                  key={i}
                                  className={
                                    "px-3 py-2 " +
                                    (i === 0 ? "font-medium" : "text-muted-foreground")
                                  }
                                >
                                  {c}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {x.steps && (
                  <>
                    <Heading id="langkah">{t("Steps", "Langkah")}</Heading>
                    <ol className="mt-3 list-decimal space-y-2 pl-5">
                      {x.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </>
                )}
                {x.code && (
                  <>
                    <Heading id="contoh">{t("Examples", "Contoh")}</Heading>
                    {x.code.map((c) => (
                      <CodeBlock key={c.body} title={c.title} body={c.body} lang={c.lang} />
                    ))}
                  </>
                )}
                {x.tips && (
                  <>
                    <Heading id="tips">Tips</Heading>
                    <ul className="mt-3 space-y-2 rounded-lg border border-primary/15 bg-primary/5 p-4 text-sm">
                      {x.tips.map((s) => (
                        <li key={s}>💡 {s}</li>
                      ))}
                    </ul>
                  </>
                )}

                <div className="mt-10 grid gap-3 border-t pt-6 sm:grid-cols-2">
                  {prev ? (
                    <Link
                      to="/qalling/docs/$slug"
                      params={{ slug: prev.id }}
                      className="rounded-lg border p-3 hover:bg-primary/5"
                    >
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ChevronLeft className="h-3 w-3" /> {t("Previous", "Sebelumnya")}
                      </span>
                      <span className="font-medium">{localize(prev, lang).title}</span>
                    </Link>
                  ) : (
                    <span />
                  )}
                  {next && (
                    <Link
                      to="/qalling/docs/$slug"
                      params={{ slug: next.id }}
                      className="rounded-lg border p-3 text-right hover:bg-primary/5"
                    >
                      <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        {t("Next", "Berikutnya")} <ChevronRight className="h-3 w-3" />
                      </span>
                      <span className="font-medium">{localize(next, lang).title}</span>
                    </Link>
                  )}
                </div>
                <p className="mt-6 text-sm text-muted-foreground">
                  {t("Can't find the answer? ", "Belum menemukan jawabannya? ")}
                  <Link
                    to="/qalling/kontak"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {t("Contact us", "Hubungi kami")}
                  </Link>
                  .
                </p>
              </>
            )}
          </article>

          <aside
            aria-label={t("On this page", "Di halaman ini")}
            className="hidden lg:sticky lg:top-24 lg:block lg:self-start"
          >
            {toc.length > 0 && (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary/70">
                  {t("On this page", "Di halaman ini")}
                </p>
                <ul className="space-y-1 text-sm">
                  {toc.map((i) => (
                    <li key={i.id}>
                      <a href={`#${i.id}`} className="text-muted-foreground hover:text-primary">
                        {i.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      </section>
    </QallingShell>
  );
}
