import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { QallingShell, PageHero, seo } from "@/components/qalling/QallingSite";
import { Input } from "@/components/ui/input";
import { QALLING_DOCS } from "@/lib/qalling-docs";

export const Route = createFileRoute("/qalling/docs")({
  head: () =>
    seo(
      "Dokumentasi — Qalling",
      "Panduan memakai Qalling: hubungkan akun, jadwalkan postingan, kelola inbox, lead, laporan, dan tagihan.",
    ),
  component: DocsPage,
});

function DocsPage() {
  const [q, setQ] = useState("");
  const sections = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return QALLING_DOCS;
    return QALLING_DOCS.filter((s) =>
      [s.title, s.summary, ...(s.steps ?? []), ...(s.tips ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(t),
    );
  }, [q]);

  return (
    <QallingShell>
      <PageHero
        eyebrow="Dokumentasi"
        title="Panduan memakai Qalling"
        desc="Dari menghubungkan akun sampai laporan dan tagihan, semuanya dijelaskan langkah demi langkah."
      />
      <section className="container-x pb-16">
        <div className="mx-auto mb-8 max-w-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari panduan, mis. jadwal, komentar, saldo…"
              className="pl-9"
              aria-label="Cari dokumentasi"
            />
          </div>
        </div>
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <nav aria-label="Daftar isi" className="lg:sticky lg:top-24 lg:self-start">
            <ul className="space-y-1 text-sm">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-10">
            {sections.length === 0 && (
              <p className="text-muted-foreground">Tidak ada panduan yang cocok dengan “{q}”.</p>
            )}
            {sections.map((s) => (
              <article key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-2xl font-bold text-navy dark:text-foreground">{s.title}</h2>
                <p className="mt-2 text-muted-foreground">{s.summary}</p>
                {s.steps && (
                  <ol className="mt-4 list-decimal space-y-2 pl-5">
                    {s.steps.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ol>
                )}
                {s.tips && (
                  <ul className="mt-4 space-y-2 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
                    {s.tips.map((x) => (
                      <li key={x}>💡 {x}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
            <p className="text-sm text-muted-foreground">
              Belum menemukan jawabannya?{" "}
              <Link to="/qalling/kontak" className="text-gold underline-offset-4 hover:underline">
                Hubungi kami
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </QallingShell>
  );
}
