CREATE TABLE public.workspace_role_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role workspace_role NOT NULL,
  module_id text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, role, module_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_role_access TO authenticated;
GRANT ALL ON public.workspace_role_access TO service_role;
ALTER TABLE public.workspace_role_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read role access" ON public.workspace_role_access
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "admins insert role access" ON public.workspace_role_access
  FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));
CREATE POLICY "admins update role access" ON public.workspace_role_access
  FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));
CREATE POLICY "admins delete role access" ON public.workspace_role_access
  FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

CREATE TRIGGER trg_workspace_role_access_updated BEFORE UPDATE ON public.workspace_role_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sls_shipment_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scan_date date NOT NULL DEFAULT current_date,
  tracking_no text NOT NULL,
  marketplace text NOT NULL DEFAULT 'shopee',
  courier text,
  order_no text,
  buyer_name text,
  item_summary text,
  status text NOT NULL DEFAULT 'scanned',
  document_id uuid REFERENCES public.sls_documents(id) ON DELETE SET NULL,
  doc_number text,
  notes text,
  scanned_by uuid,
  shipped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, tracking_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sls_shipment_scans TO authenticated;
GRANT ALL ON public.sls_shipment_scans TO service_role;
ALTER TABLE public.sls_shipment_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read scans" ON public.sls_shipment_scans
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "writers insert scans" ON public.sls_shipment_scans
  FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "writers update scans" ON public.sls_shipment_scans
  FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()))
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "writers delete scans" ON public.sls_shipment_scans
  FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE TRIGGER trg_sls_shipment_scans_updated BEFORE UPDATE ON public.sls_shipment_scans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_sls_shipment_scans_ws_date ON public.sls_shipment_scans (workspace_id, scan_date DESC);