import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Copy, Link2, Search } from "lucide-react";
import { toast } from "sonner";

import { QallingShell } from "@/components/qalling/QallingSite";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DOC_GROUPS, QALLING_DOCS, type DocSection } from "@/lib/qalling-docs";

const toMarkdown = (d: DocSection) =>
  [
    `# ${d.title}`,
    "",
    d.summary,
    ...(d.table
      ? [
          "",
          `| ${d.table.head.join(" | ")} |`,
          `| ${d.table.head.map(() => "---").join(" | ")} |`,
          ...d.table.rows.map((r) => `| ${r.join(" | ")} |`),
        ]
      : []),
    ...(d.steps ? ["", "## Langkah", ...d.steps.map((x, i) => `${i + 1}. ${x}`)] : []),
    ...(d.tips ? ["", "## Tips", ...d.tips.map((x) => `- ${x}`)] : []),
  ].join("\n");

function Heading({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="group mt-8 scroll-mt-24 text-lg font-semibold text-navy dark:text-foreground"
    >
      {children}
      <a
        href={`#${id}`}
        aria-label={`Tautan ke ${children}`}
        onClick={() => {
          const url = `${window.location.origin}${window.location.pathname}#${id}`;
          navigator.clipboard?.writeText(url).then(() => toast.success("Tautan disalin"));
        }}
        className="ml-2 inline-flex align-middle text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        <Link2 className="h-4 w-4" />
      </a>
    </h2>
  );
}

export function DocsPage({ slug }: { slug?: string }) {
  const doc = QALLING_DOCS.find((d) => d.id === (slug ?? QALLING_DOCS[0].id));
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const input = useRef<HTMLInputElement>(null);

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
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return QALLING_DOCS.filter((s) =>
      [s.title, s.summary, ...(s.steps ?? []), ...(s.tips ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(t),
    ).slice(0, 8);
  }, [q]);

  const index = doc ? QALLING_DOCS.indexOf(doc) : -1;
  const prev = index > 0 ? QALLING_DOCS[index - 1] : null;
  const next = index >= 0 && index < QALLING_DOCS.length - 1 ? QALLING_DOCS[index + 1] : null;
  const toc = doc
    ? [
        ...(doc.table ? [{ id: "tabel", label: "Perbandingan" }] : []),
        ...(doc.steps ? [{ id: "langkah", label: "Langkah" }] : []),
        ...(doc.tips ? [{ id: "tips", label: "Tips" }] : []),
      ]
    : [];

  return (
    <QallingShell>
      <section className="container-x py-8">
        <div className="mx-auto mb-6 max-w-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setTimeout(() => setFocus(false), 150)}
              placeholder="Cari panduan…  (Ctrl/⌘ + K)"
              className="pl-9"
              aria-label="Cari dokumentasi"
            />
            {focus && q.trim() && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
                {results.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">
                    Tidak ada hasil untuk “{q}”.
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
                      <span className="text-sm font-medium">{r.title}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{r.group}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.summary}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)_180px]">
          <nav
            aria-label="Daftar dokumentasi"
            className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto"
          >
            {DOC_GROUPS.map((g) => (
              <div key={g} className="mb-4">
                <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {g}
                </p>
                <ul className="space-y-0.5 text-sm">
                  {QALLING_DOCS.filter((d) => d.group === g).map((d) => (
                    <li key={d.id}>
                      <Link
                        to="/qalling/docs/$slug"
                        params={{ slug: d.id }}
                        className={
                          "block rounded-md px-2 py-1.5 hover:bg-secondary " +
                          (d.id === doc?.id
                            ? "bg-secondary font-medium text-foreground"
                            : "text-muted-foreground")
                        }
                      >
                        {d.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <article className="min-w-0">
            {!doc ? (
              <div>
                <h1 className="text-2xl font-bold">Halaman tidak ditemukan</h1>
                <p className="mt-2 text-muted-foreground">
                  Pilih topik dari daftar di samping atau{" "}
                  <Link to="/qalling/docs" className="text-gold underline">
                    mulai dari awal
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gold">
                      {doc.group}
                    </p>
                    <h1 className="text-3xl font-bold text-navy dark:text-foreground">
                      {doc.title}
                    </h1>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigator.clipboard
                        ?.writeText(toMarkdown(doc))
                        .then(() => toast.success("Disalin sebagai Markdown"))
                    }
                  >
                    <Copy className="h-4 w-4" /> Salin Markdown
                  </Button>
                </div>
                <p className="mt-3 text-muted-foreground">{doc.summary}</p>

                {doc.table && (
                  <>
                    <Heading id="tabel">Perbandingan</Heading>
                    <div className="mt-3 overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/60 text-left">
                          <tr>
                            {doc.table.head.map((h) => (
                              <th key={h} className="px-3 py-2 font-medium">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {doc.table.rows.map((r) => (
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
                {doc.steps && (
                  <>
                    <Heading id="langkah">Langkah</Heading>
                    <ol className="mt-3 list-decimal space-y-2 pl-5">
                      {doc.steps.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ol>
                  </>
                )}
                {doc.tips && (
                  <>
                    <Heading id="tips">Tips</Heading>
                    <ul className="mt-3 space-y-2 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
                      {doc.tips.map((x) => (
                        <li key={x}>💡 {x}</li>
                      ))}
                    </ul>
                  </>
                )}

                <div className="mt-10 grid gap-3 border-t pt-6 sm:grid-cols-2">
                  {prev ? (
                    <Link
                      to="/qalling/docs/$slug"
                      params={{ slug: prev.id }}
                      className="rounded-lg border p-3 hover:bg-secondary"
                    >
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ChevronLeft className="h-3 w-3" /> Sebelumnya
                      </span>
                      <span className="font-medium">{prev.title}</span>
                    </Link>
                  ) : (
                    <span />
                  )}
                  {next && (
                    <Link
                      to="/qalling/docs/$slug"
                      params={{ slug: next.id }}
                      className="rounded-lg border p-3 text-right hover:bg-secondary"
                    >
                      <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        Berikutnya <ChevronRight className="h-3 w-3" />
                      </span>
                      <span className="font-medium">{next.title}</span>
                    </Link>
                  )}
                </div>
                <p className="mt-6 text-sm text-muted-foreground">
                  Belum menemukan jawabannya?{" "}
                  <Link
                    to="/qalling/kontak"
                    className="text-gold underline-offset-4 hover:underline"
                  >
                    Hubungi kami
                  </Link>
                  .
                </p>
              </>
            )}
          </article>

          <aside
            aria-label="Di halaman ini"
            className="hidden lg:block lg:sticky lg:top-24 lg:self-start"
          >
            {toc.length > 0 && (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Di halaman ini
                </p>
                <ul className="space-y-1 text-sm">
                  {toc.map((t) => (
                    <li key={t.id}>
                      <a href={`#${t.id}`} className="text-muted-foreground hover:text-foreground">
                        {t.label}
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
