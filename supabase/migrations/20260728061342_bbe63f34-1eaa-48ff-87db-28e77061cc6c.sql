CREATE TABLE public.fa_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  category text,
  acquisition_date date NOT NULL DEFAULT CURRENT_DATE,
  acquisition_cost numeric NOT NULL DEFAULT 0,
  salvage_value numeric NOT NULL DEFAULT 0,
  useful_life_months integer NOT NULL DEFAULT 60,
  method text NOT NULL DEFAULT 'straight_line',
  asset_account_code text,
  accum_account_code text,
  expense_account_code text,
  location text,
  status text NOT NULL DEFAULT 'active',
  accumulated_depreciation numeric NOT NULL DEFAULT 0,
  disposal_date date,
  disposal_amount numeric,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fa_assets TO authenticated;
GRANT ALL ON public.fa_assets TO service_role;
ALTER TABLE public.fa_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fa_assets_select" ON public.fa_assets FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "fa_assets_insert" ON public.fa_assets FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "fa_assets_update" ON public.fa_assets FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid())) WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "fa_assets_delete" ON public.fa_assets FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()));
CREATE TRIGGER update_fa_assets_updated_at BEFORE UPDATE ON public.fa_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fa_depreciations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.fa_assets(id) ON DELETE CASCADE,
  asset_code text,
  asset_name text,
  period_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  book_value_after numeric NOT NULL DEFAULT 0,
  journal_entry_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fa_depreciations TO authenticated;
GRANT ALL ON public.fa_depreciations TO service_role;
ALTER TABLE public.fa_depreciations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fa_dep_select" ON public.fa_depreciations FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "fa_dep_insert" ON public.fa_depreciations FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "fa_dep_update" ON public.fa_depreciations FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid())) WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "fa_dep_delete" ON public.fa_depreciations FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()));
CREATE TRIGGER update_fa_dep_updated_at BEFORE UPDATE ON public.fa_depreciations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tax_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tax_no text NOT NULL,
  tax_type text NOT NULL,
  tax_date date NOT NULL DEFAULT CURRENT_DATE,
  period text,
  partner_name text,
  partner_tax_id text,
  doc_number text,
  faktur_number text,
  description text,
  base_amount numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 11,
  tax_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  ref_type text,
  ref_id uuid,
  journal_entry_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, tax_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_records TO authenticated;
GRANT ALL ON public.tax_records TO service_role;
ALTER TABLE public.tax_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_select" ON public.tax_records FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "tax_insert" ON public.tax_records FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "tax_update" ON public.tax_records FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid())) WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "tax_delete" ON public.tax_records FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()));
CREATE TRIGGER update_tax_updated_at BEFORE UPDATE ON public.tax_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();