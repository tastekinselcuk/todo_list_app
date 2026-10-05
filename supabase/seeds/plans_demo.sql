-- Supabase SQL Editor: a single-user project selects its account automatically.
-- For multiple users, set demo_email to the intended application login email.
-- Adds 12 monthly/yearly examples. Re-running does not duplicate or reset them.
-- No existing plans are modified. Cleanup: plans_demo_cleanup.sql.
do $$
declare
  demo_email text := '';
  demo_user uuid;
  user_count bigint;
  month_start date := date_trunc('month', timezone('Europe/Istanbul', now()))::date;
  year_start date := date_trunc('year', timezone('Europe/Istanbul', now()))::date;
begin
  if nullif(trim(demo_email), '') is not null then
    select id into demo_user from auth.users where lower(email) = lower(trim(demo_email));
  else
    select count(*) into user_count from auth.users;
     if user_count = 1 then
      select id into demo_user from auth.users;
    elsif user_count = 0 then
      raise exception 'Bu Supabase projesinde kullanıcı yok. Önce uygulamadan hesap oluştur veya doğru projeyi aç.';
    else
      raise exception 'Birden fazla kullanıcı var. SELECT id, email FROM auth.users; sorgusuyla hesabını bulup demo_email alanına e-postanı yaz.';
    end if;
  end if;
  if demo_user is null then
    raise exception 'Bu e-posta projedeki kullanıcılarla eşleşmiyor. SELECT id, email FROM auth.users; sorgusuyla kayıtlı e-postayı kontrol et.';
  end if;

  insert into public.plans (id, user_id, title, period, period_date, completed, reason, history)
  values
    ('f84c81bd-ec7f-4df9-a1d0-800000000001', demo_user,
     '[PLAN TEST] Bu ay okuma listesini tamamla', 'monthly', month_start, true, '', '[]'::jsonb),
    ('f84c81bd-ec7f-4df9-a1d0-800000000002', demo_user,
     '[PLAN TEST] Portfolyoya yeni bir proje ekle', 'monthly', month_start, false, '', '[]'::jsonb),
    ('f84c81bd-ec7f-4df9-a1d0-800000000003', demo_user,
     '[PLAN TEST] Evdeki çalışma alanını düzenle', 'monthly', month_start, false,
     'Masa teslimatını bekliyorum.',
     jsonb_build_array(
       jsonb_build_object('date', (month_start - interval '2 months')::date::text, 'completed', false, 'reason', 'Ölçüleri netleştirmem gerekiyor.'),
       jsonb_build_object('date', (month_start - interval '1 month')::date::text, 'completed', false, 'reason', 'Masa teslimatını bekliyorum.')
     )),
    ('f84c81bd-ec7f-4df9-a1d0-800000000004', demo_user,
     '[PLAN TEST] Geçen ay fotoğrafları arşivle', 'monthly', (month_start - interval '1 month')::date, true, '', '[]'::jsonb),
    ('f84c81bd-ec7f-4df9-a1d0-800000000005', demo_user,
     '[PLAN TEST] Üç aydır bekleyen dil kursunu araştır', 'monthly', (month_start - interval '3 months')::date, false, '', '[]'::jsonb),
    ('f84c81bd-ec7f-4df9-a1d0-800000000006', demo_user,
     '[PLAN TEST] Beş ay önce tamamlanan kitap listesi', 'monthly', (month_start - interval '5 months')::date, true, '', '[]'::jsonb),

    ('f84c81bd-ec7f-4df9-a1d0-800000000007', demo_user,
     '[PLAN TEST] Bu yıl kişisel web sitesini yayınla', 'yearly', year_start, true, '', '[]'::jsonb),
    ('f84c81bd-ec7f-4df9-a1d0-800000000008', demo_user,
     '[PLAN TEST] Yıl sonuna kadar bir yabancı dilde ilerle', 'yearly', year_start, false, '', '[]'::jsonb),
    ('f84c81bd-ec7f-4df9-a1d0-800000000009', demo_user,
     '[PLAN TEST] Uzun vadeli seyahat planını hazırla', 'yearly', year_start, false,
     'Uygun tarih ve bütçeyi netleştirmeyi bekliyorum.',
     jsonb_build_array(
       jsonb_build_object('date', (year_start - interval '2 years')::date::text, 'completed', false, 'reason', 'Rota henüz belli değildi.'),
       jsonb_build_object('date', (year_start - interval '1 year')::date::text, 'completed', false, 'reason', 'Uygun tarih ve bütçeyi netleştirmeyi bekliyorum.')
     )),
    ('f84c81bd-ec7f-4df9-a1d0-800000000010', demo_user,
     '[PLAN TEST] Geçen yıl tamamlanan eğitim programı', 'yearly', (year_start - interval '1 year')::date, true, '', '[]'::jsonb),
    ('f84c81bd-ec7f-4df9-a1d0-800000000011', demo_user,
     '[PLAN TEST] İki yıldır bekleyen hobi projesi', 'yearly', (year_start - interval '2 years')::date, false, '', '[]'::jsonb),
    ('f84c81bd-ec7f-4df9-a1d0-800000000012', demo_user,
     '[PLAN TEST] Üç yıl önce tamamlanan kişisel hedef', 'yearly', (year_start - interval '3 years')::date, true, '', '[]'::jsonb)
  on conflict (id) do nothing;
end;
$$;
