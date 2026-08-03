create or replace function public.claim_superadmin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  uemail text;
begin
  if uid is null then
    return false;
  end if;

  if exists (select 1 from public.user_roles where role = 'admin') then
    return exists (select 1 from public.user_roles where user_id = uid and role = 'admin');
  end if;

  select email into uemail from auth.users where id = uid and email_confirmed_at is not null;

  if uemail is null or lower(uemail) <> 'dnicorp.id@gmail.com' then
    return false;
  end if;

  insert into public.user_roles (user_id, role) values (uid, 'admin')
  on conflict (user_id, role) do nothing;

  return true;
end;
$$;

revoke all on function public.claim_superadmin() from public, anon;
grant execute on function public.claim_superadmin() to authenticated;