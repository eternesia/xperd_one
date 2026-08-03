CREATE TABLE public.md_taxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  tax_type text NOT NULL DEFAULT 'vat_out',
  rate numeric NOT NULL DEFAULT 0,
  account_code text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.md_taxes TO authenticated;
GRANT ALL ON public.md_taxes TO service_role;
ALTER TABLE public.md_taxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY md_taxes_read ON public.md_taxes FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND public.owns_tenant(w.tenant_id, auth.uid())));
CREATE POLICY md_taxes_insert ON public.md_taxes FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY md_taxes_update ON public.md_taxes FOR UPDATE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid())) WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY md_taxes_delete ON public.md_taxes FOR DELETE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE TRIGGER update_md_taxes_updated_at BEFORE UPDATE ON public.md_taxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  requested_package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  requested_by uuid,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.upgrade_requests TO authenticated;
GRANT ALL ON public.upgrade_requests TO service_role;
ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY upgrade_requests_read ON public.upgrade_requests FOR SELECT TO authenticated
  USING (public.owns_tenant(tenant_id, auth.uid()) OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.workspaces w JOIN public.workspace_members m ON m.workspace_id = w.id
               WHERE w.tenant_id = upgrade_requests.tenant_id AND m.user_id = auth.uid()));
CREATE POLICY upgrade_requests_insert ON public.upgrade_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.workspaces w JOIN public.workspace_members m ON m.workspace_id = w.id
    WHERE w.tenant_id = upgrade_requests.tenant_id AND m.user_id = auth.uid()));
CREATE POLICY upgrade_requests_admin_update ON public.upgrade_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_upgrade_requests_updated_at BEFORE UPDATE ON public.upgrade_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY invoices_member_read ON public.invoices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspaces w JOIN public.workspace_members m ON m.workspace_id = w.id
                 WHERE w.tenant_id = invoices.tenant_id AND m.user_id = auth.uid()));

CREATE POLICY subscriptions_member_read ON public.subscriptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspaces w JOIN public.workspace_members m ON m.workspace_id = w.id
                 WHERE w.tenant_id = subscriptions.tenant_id AND m.user_id = auth.uid()));

INSERT INTO public.md_taxes (workspace_id, code, name, tax_type, rate, description)
SELECT w.id, v.code, v.name, v.tax_type, v.rate, v.description
FROM public.workspaces w
CROSS JOIN (VALUES
  ('NON', 'Non-taxable', 'none', 0, 'Tanpa PPN'),
  ('PPN11', 'PPN 11%', 'vat_out', 11, 'PPN standar'),
  ('PPN12', 'PPN 12%', 'vat_out', 12, 'PPN tarif 12%'),
  ('PPNF11', 'PPN Final 1,1%', 'vat_out', 1.1, 'PPN final'),
  ('PPH21', 'PPh 21', 'withholding', 5, 'PPh Pasal 21'),
  ('PPH22', 'PPh 22', 'withholding', 1.5, 'PPh Pasal 22'),
  ('PPH23', 'PPh 23', 'withholding', 2, 'PPh Pasal 23'),
  ('PPH42', 'PPh 4(2)', 'withholding', 10, 'PPh Pasal 4 ayat 2')
) AS v(code, name, tax_type, rate, description)
ON CONFLICT DO NOTHING;