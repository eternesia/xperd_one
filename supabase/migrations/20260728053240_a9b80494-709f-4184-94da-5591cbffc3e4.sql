CREATE TABLE public.cb_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_kind text NOT NULL DEFAULT 'bank',
  gl_account_code text,
  bank_name text,
  account_number text,
  currency text NOT NULL DEFAULT 'IDR',
  opening_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cb_accounts TO authenticated;
GRANT ALL ON public.cb_accounts TO service_role;
ALTER TABLE public.cb_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cb_accounts_select" ON public.cb_accounts FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "cb_accounts_insert" ON public.cb_accounts FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "cb_accounts_update" ON public.cb_accounts FOR UPDATE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()))
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "cb_accounts_delete" ON public.cb_accounts FOR DELETE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE TRIGGER update_cb_accounts_updated_at BEFORE UPDATE ON public.cb_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.cb_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  trx_no text NOT NULL,
  trx_date date NOT NULL DEFAULT CURRENT_DATE,
  trx_type text NOT NULL,
  account_code text NOT NULL,
  account_name text,
  counterpart_account_code text,
  counterpart_account_name text,
  category_account_code text,
  category_account_name text,
  contact_name text,
  method text NOT NULL DEFAULT 'cash',
  reference text,
  memo text,
  amount numeric NOT NULL DEFAULT 0,
  is_reconciled boolean NOT NULL DEFAULT false,
  reconciled_at timestamptz,
  journal_entry_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, trx_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cb_transactions TO authenticated;
GRANT ALL ON public.cb_transactions TO service_role;
ALTER TABLE public.cb_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cb_transactions_select" ON public.cb_transactions FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "cb_transactions_insert" ON public.cb_transactions FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "cb_transactions_update" ON public.cb_transactions FOR UPDATE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()))
  WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));
CREATE POLICY "cb_transactions_delete" ON public.cb_transactions FOR DELETE TO authenticated
  USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE TRIGGER update_cb_transactions_updated_at BEFORE UPDATE ON public.cb_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX cb_transactions_ws_date_idx ON public.cb_transactions (workspace_id, trx_date DESC);