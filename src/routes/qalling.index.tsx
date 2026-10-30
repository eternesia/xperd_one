import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ADVANTAGES,
  FEATURES,
  ItemGrid,
  PricingGrid,
  QallingShell,
  SOLUTIONS,
  seo,
} from "@/components/qalling/QallingSite";

export const Route = createFileRoute("/qalling/")({
  head: () =>
    seo(
      "Qalling — Kelola Media Sosial & Pelanggan dalam Satu Dashboard",
      "Jadwalkan posting, balas DM, pantau insight, dan kelola prospek. Mulai Rp49.000/bulan, gratis 14 hari.",
    ),
  component: QallingLanding,
});

function Block({
  title,
  to,
  children,
}: {
  title: string;
  to: "/qalling/solusi" | "/qalling/fitur" | "/qalling/kelebihan" | "/qalling/harga";
  children: React.ReactNode;
}) {
  return (
    <section className="container-x py-12">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="text-2xl font-bold text-navy dark:text-foreground sm:text-3xl">{title}</h2>
        <Link to={to} className="text-sm font-medium text-gold hover:underline">
          Selengkapnya →
        </Link>
      </div>
      {children}
    </section>
  );
}

function QallingLanding() {
  return (
    <QallingShell>
      <section className="container-x py-16 text-center lg:py-24">
        <span className="inline-flex rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
          Media sosial + CRM dalam satu dashboard
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-navy dark:text-foreground sm:text-6xl">
          Posting, balas, dan jualan lebih cepat dengan <span className="text-gold">Qalling</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Jadwalkan konten ke semua akun, balas DM dari satu kotak masuk, dan ubah percakapan jadi
          pelanggan. Mulai Rp49.000/bulan.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild variant="gold" size="lg">
            <Link to="/qalling/daftar">
              Coba Gratis 14 Hari <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/qalling/harga">Lihat Harga</Link>
          </Button>
        </div>
      </section>
      <Block title="Solusi untuk setiap tim" to="/qalling/solusi">
        <ItemGrid items={SOLUTIONS} cols={2} />
      </Block>
      <Block title="Dari konten hingga pelanggan" to="/qalling/fitur">
        <ItemGrid items={FEATURES.filter((_, i) => [0, 1, 5, 6, 7, 12].includes(i))} />
      </Block>
      <Block title="Kenapa Qalling" to="/qalling/kelebihan">
        <ItemGrid items={ADVANTAGES} cols={2} />
      </Block>
      <Block title="Harga" to="/qalling/harga">
        <PricingGrid />
      </Block>
    </QallingShell>
  );
}
