ALTER TABLE public.prc_documents
  ADD COLUMN IF NOT EXISTS bank_account_code text,
  ADD COLUMN IF NOT EXISTS bank_account_name text;

ALTER TABLE public.sls_documents
  ADD COLUMN IF NOT EXISTS bank_account_code text,
  ADD COLUMN IF NOT EXISTS bank_account_name text;