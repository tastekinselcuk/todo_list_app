-- Single-user projects select the account automatically.
-- For multiple users, set demo_email to the same email used in plans_demo.sql.
-- Deletes only the 12 known test IDs owned by that account, including their history.
do $$
declare
  demo_email text := '';
  demo_user uuid;
  user_count bigint;
begin
  if nullif(trim(demo_email), '') is not null then
    select id into demo_user from auth.users where lower(email) = lower(trim(demo_email));
  else
    select count(*) into user_count from auth.users;
    if user_count = 1 then
      select id into demo_user from auth.users;
    elsif user_count = 0 then
      raise exception 'Bu Supabase projesinde kullanıcı yok. Doğru projeyi açtığını kontrol et.';
    else
      raise exception 'Birden fazla kullanıcı var. SELECT id, email FROM auth.users; sorgusuyla hesabını bulup demo_email alanına e-postanı yaz.';
    end if;
  end if;
  if demo_user is null then
    raise exception 'Bu e-posta projedeki kullanıcılarla eşleşmiyor. SELECT id, email FROM auth.users; sorgusuyla kayıtlı e-postayı kontrol et.';
  end if;

  delete from public.plans
  where user_id = demo_user
  and id in (
  'f84c81bd-ec7f-4df9-a1d0-800000000001',
  'f84c81bd-ec7f-4df9-a1d0-800000000002',
  'f84c81bd-ec7f-4df9-a1d0-800000000003',
  'f84c81bd-ec7f-4df9-a1d0-800000000004',
  'f84c81bd-ec7f-4df9-a1d0-800000000005',
  'f84c81bd-ec7f-4df9-a1d0-800000000006',
  'f84c81bd-ec7f-4df9-a1d0-800000000007',
  'f84c81bd-ec7f-4df9-a1d0-800000000008',
  'f84c81bd-ec7f-4df9-a1d0-800000000009',
  'f84c81bd-ec7f-4df9-a1d0-800000000010',
  'f84c81bd-ec7f-4df9-a1d0-800000000011',
  'f84c81bd-ec7f-4df9-a1d0-800000000012'
);
end;
$$;
