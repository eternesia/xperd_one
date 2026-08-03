CREATE TYPE public.prc_doc_type AS ENUM ('purchase_request','purchase_order','goods_receipt','ap_invoice','purchase_return');
CREATE TYPE public.prc_doc_status AS ENUM ('draft','submitted','approved','received','invoiced','paid','cancelled');

CREATE TABLE public.prc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  doc_type public.prc_doc_type NOT NULL,
  doc_number text NOT NULL,
  doc_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  supplier_code text,
  supplier_name text,
  warehouse_code text,
  reference text,
  status public.prc_doc_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'IDR',
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, doc_type, doc_number)
);

CREATE TABLE public.prc_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.prc_documents(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  item_code text,
  description text,
  qty numeric NOT NULL DEFAULT 0,
  uom_code text,
  unit_price numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prc_documents_ws_type_date ON public.prc_documents (workspace_id, doc_type, doc_date DESC);
CREATE INDEX idx_prc_lines_doc ON public.prc_document_lines (document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prc_documents TO authenticated;
GRANT ALL ON public.prc_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prc_document_lines TO authenticated;
GRANT ALL ON public.prc_document_lines TO service_role;

ALTER TABLE public.prc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prc_document_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read prc documents" ON public.prc_documents FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "writers insert prc documents" ON public.prc_documents FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "writers update prc documents" ON public.prc_documents FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid())) WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "writers delete prc documents" ON public.prc_documents FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE POLICY "members read prc lines" ON public.prc_document_lines FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "writers insert prc lines" ON public.prc_document_lines FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "writers update prc lines" ON public.prc_document_lines FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid())) WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "writers delete prc lines" ON public.prc_document_lines FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE TRIGGER trg_prc_documents_updated BEFORE UPDATE ON public.prc_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_prc_lines_updated BEFORE UPDATE ON public.prc_document_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();