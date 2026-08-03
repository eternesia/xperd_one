REVOKE ALL ON FUNCTION public.enforce_workspace_quota() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_member_quota() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.workspace_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_tenant(uuid, uuid) FROM PUBLIC, anon;