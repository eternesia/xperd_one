ALTER TYPE prc_doc_type ADD VALUE IF NOT EXISTS 'purchase_payment';
ALTER TYPE prc_doc_status ADD VALUE IF NOT EXISTS 'partial';
ALTER TYPE prc_doc_status ADD VALUE IF NOT EXISTS 'closed';

ALTER TABLE public.prc_documents
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.prc_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_doc_number text;

ALTER TABLE public.prc_document_lines
  ADD COLUMN IF NOT EXISTS source_line_id uuid,
  ADD COLUMN IF NOT EXISTS qty_fulfilled numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.acc_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entry_no text NOT NULL,
  entry_date date NOT NULL DEFAULT current_date,
  source_type text,
  source_id uuid,
  source_doc_number text,
  memo text,
  total_debit numeric NOT NULL DEFAULT 0,
  total_credit numeric NOT NULL DEFAULT 0,
  is_auto boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.acc_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.acc_journal_entries(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  account_code text NOT NULL,
  account_name text,
  description text,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.acc_journal_entries TO authenticated;
GRANT ALL ON public.acc_journal_entries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acc_journal_lines TO authenticated;
GRANT ALL ON public.acc_journal_lines TO service_role;

ALTER TABLE public.acc_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acc_journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal entries readable by members" ON public.acc_journal_entries
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "journal entries insert by writers" ON public.acc_journal_entries
  FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "journal entries update by writers" ON public.acc_journal_entries
  FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()))
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "journal entries delete by writers" ON public.acc_journal_entries
  FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE POLICY "journal lines readable by members" ON public.acc_journal_lines
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "journal lines insert by writers" ON public.acc_journal_lines
  FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "journal lines update by writers" ON public.acc_journal_lines
  FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()))
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "journal lines delete by writers" ON public.acc_journal_lines
  FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_acc_journal_entries_ws ON public.acc_journal_entries(workspace_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_acc_journal_lines_entry ON public.acc_journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_prc_documents_source ON public.prc_documents(source_document_id);

CREATE TRIGGER update_acc_journal_entries_updated_at BEFORE UPDATE ON public.acc_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_acc_journal_lines_updated_at BEFORE UPDATE ON public.acc_journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();