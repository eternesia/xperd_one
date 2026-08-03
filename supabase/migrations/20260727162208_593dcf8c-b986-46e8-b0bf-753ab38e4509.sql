REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

DROP POLICY "leads public submit" ON public.leads;
CREATE POLICY "leads public submit" ON public.leads FOR INSERT TO anon, authenticated
WITH CHECK (
  length(btrim(company_name)) BETWEEN 2 AND 150
  AND length(btrim(contact_name)) BETWEEN 2 AND 100
  AND email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 255
  AND (phone IS NULL OR length(phone) <= 30)
  AND (message IS NULL OR length(message) <= 2000)
  AND status = 'new'
);

DROP POLICY "registrations public submit" ON public.registrations;
CREATE POLICY "registrations public submit" ON public.registrations FOR INSERT TO anon, authenticated
WITH CHECK (
  length(btrim(company_name)) BETWEEN 2 AND 150
  AND subdomain ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'
  AND length(btrim(contact_name)) BETWEEN 2 AND 100
  AND email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 255
  AND length(btrim(phone)) BETWEEN 6 AND 30
  AND package_code IN ('one-starter','one-professional')
  AND status = 'pending'
  AND tenant_id IS NULL
  AND (notes IS NULL OR length(notes) <= 1000)
);