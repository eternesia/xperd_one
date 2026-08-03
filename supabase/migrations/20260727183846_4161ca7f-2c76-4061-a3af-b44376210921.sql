CREATE OR REPLACE FUNCTION public.find_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id FROM public.profiles p
  WHERE lower(p.email) = lower(btrim(_email))
    AND EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.user_id = auth.uid() AND m.role IN ('owner','admin')
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_user_id_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(text) TO authenticated;