CREATE TABLE public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  display_name text NOT NULL,
  mode text NOT NULL DEFAULT 'sandbox',
  is_active boolean NOT NULL DEFAULT false,
  merchant_id text,
  client_key text,
  server_key_secret_name text,
  callback_url text,
  instructions text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payment gateways" ON public.payment_gateways
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_payment_gateways_updated BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en text NOT NULL,
  title_id text,
  body_en text,
  body_id text,
  severity text NOT NULL DEFAULT 'info',
  audience text NOT NULL DEFAULT 'all',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read published announcements" ON public.announcements
  FOR SELECT TO authenticated USING (is_published AND starts_at <= now() AND (ends_at IS NULL OR ends_at >= now()));
CREATE POLICY "Admins read all announcements" ON public.announcements
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write announcements" ON public.announcements
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update announcements" ON public.announcements
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete announcements" ON public.announcements
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_announcements_updated BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no text NOT NULL UNIQUE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  description text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  assigned_to uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users create tickets" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Owners or admins update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete tickets" ON public.support_tickets
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_support_tickets_updated BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read ticket messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR (NOT is_internal AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.created_by = auth.uid()))
  );
CREATE POLICY "Write ticket messages" ON public.support_ticket_messages
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid() AND (
      public.has_role(auth.uid(),'admin')
      OR (NOT is_internal AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.created_by = auth.uid()))
    )
  );
CREATE POLICY "Admins delete ticket messages" ON public.support_ticket_messages
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ticket_messages_updated BEFORE UPDATE ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_url text,
  ADD COLUMN IF NOT EXISTS gateway_reference text,
  ADD COLUMN IF NOT EXISTS auto_reminder boolean NOT NULL DEFAULT true;