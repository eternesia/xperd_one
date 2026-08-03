CREATE TYPE public.sls_doc_type AS ENUM ('quotation','sales_order','delivery_order','ar_invoice','sales_receipt','sales_return');

CREATE TABLE public.sls_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  doc_type public.sls_doc_type NOT NULL,
  doc_number text NOT NULL,
  doc_date date NOT NULL DEFAULT current_date,
  due_date date,
  customer_code text,
  customer_name text,
  warehouse_code text,
  reference text,
  status public.prc_doc_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'IDR',
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  source_document_id uuid REFERENCES public.sls_documents(id) ON DELETE SET NULL,
  source_doc_number text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sls_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sls_documents(id) ON DELETE CASCADE,
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
  source_line_id uuid,
  qty_fulfilled numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sls_documents_ws_type ON public.sls_documents(workspace_id, doc_type, doc_date DESC);
CREATE INDEX idx_sls_lines_document ON public.sls_document_lines(document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sls_documents TO authenticated;
GRANT ALL ON public.sls_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sls_document_lines TO authenticated;
GRANT ALL ON public.sls_document_lines TO service_role;

ALTER TABLE public.sls_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sls_document_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read sls documents" ON public.sls_documents FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "writers insert sls documents" ON public.sls_documents FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "writers update sls documents" ON public.sls_documents FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid())) WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "writers delete sls documents" ON public.sls_documents FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE POLICY "members read sls lines" ON public.sls_document_lines FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "writers insert sls lines" ON public.sls_document_lines FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "writers update sls lines" ON public.sls_document_lines FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid())) WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "writers delete sls lines" ON public.sls_document_lines FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE TRIGGER update_sls_documents_updated_at BEFORE UPDATE ON public.sls_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sls_document_lines_updated_at BEFORE UPDATE ON public.sls_document_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();