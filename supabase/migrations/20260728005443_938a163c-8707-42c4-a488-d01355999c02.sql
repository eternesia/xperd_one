REVOKE ALL ON FUNCTION public.can_write_workspace(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_write_workspace(uuid, uuid) TO authenticated;