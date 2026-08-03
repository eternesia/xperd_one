-- enums
CREATE TYPE public.costing_method AS ENUM ('FIFO','LIFO','AVERAGE');
CREATE TYPE public.workspace_role AS ENUM ('owner','admin','staff','viewer');
CREATE TYPE public.workspace_status AS ENUM ('setup','active','suspended');

-- workspaces
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  legal_name text,
  slug text NOT NULL,
  currency text NOT NULL DEFAULT 'IDR',
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  fiscal_year_start_month int NOT NULL DEFAULT 1,
  default_costing_method public.costing_method NOT NULL DEFAULT 'AVERAGE',
  address text,
  tax_id text,
  status public.workspace_status NOT NULL DEFAULT 'setup',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- workspace members
CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- helper functions (security definer, avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = _workspace_id AND m.user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = _workspace_id AND m.user_id = _user_id AND m.role = ANY(_roles));
$$;

CREATE OR REPLACE FUNCTION public.owns_tenant(_tenant_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _tenant_id AND t.owner_id = _user_id);
$$;

REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.workspace_role[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owns_tenant(uuid, uuid) FROM anon;

-- workspaces policies
CREATE POLICY "workspaces admin manage" ON public.workspaces FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "workspaces member read" ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(id, auth.uid()) OR public.owns_tenant(tenant_id, auth.uid()));
CREATE POLICY "workspaces tenant owner insert" ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (public.owns_tenant(tenant_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "workspaces owner update" ON public.workspaces FOR UPDATE TO authenticated
  USING (public.owns_tenant(tenant_id, auth.uid()) OR public.has_workspace_role(id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (public.owns_tenant(tenant_id, auth.uid()) OR public.has_workspace_role(id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY "workspaces owner delete" ON public.workspaces FOR DELETE TO authenticated
  USING (public.owns_tenant(tenant_id, auth.uid()));

-- workspace_members policies
CREATE POLICY "members admin manage" ON public.workspace_members FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "members read own workspaces" ON public.workspace_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "members manage by workspace admin" ON public.workspace_members FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
         OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND public.owns_tenant(w.tenant_id, auth.uid())))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
         OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND public.owns_tenant(w.tenant_id, auth.uid())));

-- tenants: allow a signed-in user to create their own tenant
CREATE POLICY "tenants self provision" ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND status = 'trial'::tenant_status
    AND length(btrim(name)) BETWEEN 2 AND 150
    AND subdomain ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$');
CREATE POLICY "tenants owner update" ON public.tenants FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- quota enforcement
CREATE OR REPLACE FUNCTION public.enforce_workspace_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  limit_ws int;
  used int;
BEGIN
  SELECT p.max_workspace INTO limit_ws
  FROM public.tenants t LEFT JOIN public.packages p ON p.id = t.package_id
  WHERE t.id = NEW.tenant_id;

  IF limit_ws IS NOT NULL THEN
    SELECT count(*) INTO used FROM public.workspaces w WHERE w.tenant_id = NEW.tenant_id;
    IF used >= limit_ws THEN
      RAISE EXCEPTION 'Workspace quota reached for this package (max %).', limit_ws;
    END IF;
  END IF;

  UPDATE public.tenants SET workspace_count = (
    SELECT count(*) + 1 FROM public.workspaces w WHERE w.tenant_id = NEW.tenant_id
  ) WHERE id = NEW.tenant_id;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_workspace_quota BEFORE INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.enforce_workspace_quota();

CREATE OR REPLACE FUNCTION public.enforce_member_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tid uuid;
  limit_users int;
  used int;
BEGIN
  SELECT w.tenant_id INTO tid FROM public.workspaces w WHERE w.id = NEW.workspace_id;
  SELECT p.max_users INTO limit_users
  FROM public.tenants t LEFT JOIN public.packages p ON p.id = t.package_id WHERE t.id = tid;

  IF limit_users IS NOT NULL THEN
    SELECT count(DISTINCT m.user_id) INTO used
    FROM public.workspace_members m JOIN public.workspaces w ON w.id = m.workspace_id
    WHERE w.tenant_id = tid AND m.user_id <> NEW.user_id;
    IF used >= limit_users THEN
      RAISE EXCEPTION 'User quota reached for this package (max %).', limit_users;
    END IF;
  END IF;

  UPDATE public.tenants SET user_count = GREATEST(1, (
    SELECT count(DISTINCT m.user_id) FROM public.workspace_members m
    JOIN public.workspaces w ON w.id = m.workspace_id WHERE w.tenant_id = tid
  ) + 1) WHERE id = tid;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_member_quota BEFORE INSERT ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_member_quota();

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workspace_members_updated_at BEFORE UPDATE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();