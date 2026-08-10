CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  auth_user_id uuid,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_users_email_key ON public.app_users (lower(email));
CREATE INDEX app_users_auth_user_id_idx ON public.app_users (auth_user_id);

GRANT SELECT ON public.app_users TO authenticated;
GRANT ALL ON public.app_users TO service_role;

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own app user row"
ON public.app_users FOR SELECT TO authenticated
USING (auth_user_id = auth.uid());

CREATE POLICY "Admins can view all app users"
ON public.app_users FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_app_users_updated_at
BEFORE UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();