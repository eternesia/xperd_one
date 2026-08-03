
CREATE TYPE public.md_item_type AS ENUM ('goods','service');
CREATE TYPE public.md_account_type AS ENUM ('asset','liability','equity','revenue','expense');

CREATE OR REPLACE FUNCTION public.can_write_workspace(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_workspace_role(_workspace_id, _user_id, ARRAY['owner','admin','staff']::workspace_role[])
     OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = _workspace_id AND public.owns_tenant(w.tenant_id, _user_id));
$$;

CREATE TABLE public.md_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

CREATE TABLE public.md_uoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

CREATE TABLE public.md_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  item_type public.md_item_type NOT NULL DEFAULT 'goods',
  category_code text,
  uom_code text,
  barcode text,
  cost_price numeric NOT NULL DEFAULT 0,
  sell_price numeric NOT NULL DEFAULT 0,
  min_stock numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

CREATE TABLE public.md_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  city text,
  tax_id text,
  credit_limit numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

CREATE TABLE public.md_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  city text,
  tax_id text,
  payment_terms integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

CREATE TABLE public.md_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  address text,
  city text,
  pic_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

CREATE TABLE public.md_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_type public.md_account_type NOT NULL DEFAULT 'asset',
  parent_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.md_categories, public.md_uoms, public.md_items, public.md_customers, public.md_suppliers, public.md_warehouses, public.md_accounts TO authenticated;
GRANT ALL ON public.md_categories, public.md_uoms, public.md_items, public.md_customers, public.md_suppliers, public.md_warehouses, public.md_accounts TO service_role;

ALTER TABLE public.md_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.md_uoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.md_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.md_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.md_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.md_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.md_accounts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['md_categories','md_uoms','md_items','md_customers','md_suppliers','md_warehouses','md_accounts'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()) OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND public.owns_tenant(w.tenant_id, auth.uid())))', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()))', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid())) WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()))', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()))', t||'_delete', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t||'_updated', t);
  END LOOP;
END $$;
