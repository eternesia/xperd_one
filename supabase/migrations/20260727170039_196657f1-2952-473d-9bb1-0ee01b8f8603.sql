CREATE TABLE public.site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  key text NOT NULL,
  title_en text,
  title_id text,
  body_en text,
  body_id text,
  image_url text,
  link_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section, key)
);

GRANT SELECT ON public.site_content TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content TO authenticated;
GRANT ALL ON public.site_content TO service_role;

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_content public read" ON public.site_content
  FOR SELECT TO anon, authenticated USING (is_published = true);

CREATE POLICY "site_content admin manage" ON public.site_content
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_site_content_updated BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.site_content (section, key, title_en, title_id, body_en, body_id, sort_order) VALUES
('home','hero','One ERP platform for every scale of business','Satu platform ERP untuk setiap skala bisnis','From SME to enterprise, XPERD unifies finance, operations, and growth in one cloud platform.','Dari UMKM hingga korporasi, XPERD menyatukan keuangan, operasional, dan pertumbuhan dalam satu platform cloud.',1),
('home','cta','Ready to simplify your business?','Siap menyederhanakan bisnis Anda?','Start with XPERD One today or talk to our team about Business and Enterprise.','Mulai dengan XPERD One hari ini atau bicara dengan tim kami untuk Business dan Enterprise.',2),
('announcement','banner','XPERD 2026 release is live','Rilis XPERD 2026 telah hadir','New AI forecasting, faster reporting, and a redesigned customer portal.','Forecast AI baru, pelaporan lebih cepat, dan portal pelanggan yang didesain ulang.',1);