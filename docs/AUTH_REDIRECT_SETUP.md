# Giriş ve e-posta dönüş adresleri

Canlı site: `https://pomodolist.netlify.app`.

Supabase **Authentication → URL Configuration → Site URL**, canlı sitenin adresi olmalıdır. `http://localhost:3000` bırakılırsa, açık dönüş adresi verilmemiş veya izin listesiyle eşleşmemiş işlemler kullanıcının kendi cihazındaki localhost'a gider. Telefonda Safari sunucuya bağlanamadı, bilgisayarda bağlantı reddedildi hatası görülür.

## Canlı yapılandırma

11 Kasım 2026 tarihinde canlı projede kontrol edilip düzeltildi:

```text
Site URL:
https://pomodolist.netlify.app

Redirect URLs:
https://pomodolist.netlify.app
https://pomodolist.netlify.app/
https://pomodolist.netlify.app/auth/callback
https://pomodolist.netlify.app/reset-password
http://localhost:5173
http://localhost:5173/
http://localhost:5173/auth/callback
http://localhost:5173/reset-password
```

Mevcut `http://localhost:3000/auth/callback` geliştirme izni korundu; varsayılan canlı dönüş adresi olarak kullanılmaz. E-posta doğrulama, Google giriş, MFA ve parola güvenlik ayarları değiştirilmedi. Kontrol edilmiş CLI yaması yalnızca `auth.site_url` ve `auth.additional_redirect_urls` alanlarını güncelledi; ayarları yeniden uygularken diğer Auth alanlarını varsayılanlarıyla ezme.

Kayıt kodu `signUp.options.emailRedirectTo` ile işlemin başlatıldığı sitenin kök adresini açıkça verir. Google/GitHub girişi, şifre sıfırlama ve e-posta değişimi de mevcut browser origin'inden açık dönüş adresi oluşturur. Kullanıcının `next` veya `redirect_to` sorgu parametresi e-posta dönüş hedefi olarak alınmaz. Üretim ve geliştirme origin'lerinin her ikisi de Supabase izin listesinde bulunmalıdır.

Google Cloud'daki OAuth callback adresi yine Supabase Auth adresidir:

```text
https://saamxvuphakjpffvvcbj.supabase.co/auth/v1/callback
```

Takvim bağlantısının `/functions/v1/outlook-calendar/google/callback` adresi ayrı bir akıştır; burada değişiklik gerektirmez.

## Kullanıcı tekrar denerken

1. Giriş/kayıt akışını canlı siteyi açarak yeniden başlat.
2. Hatalı adrese giden eski e-postanın yerine, yeniden gönderilen güncel e-postayı kullan. Eski e-posta bağlantısında localhost dönüş adresi zaten kayıtlıysa ayar değişikliği o eski linki yeniden yazmaz.
3. Google ile girişte canlı siteden yeni giriş başlat; eski `localhost:3000/?code=...` sayfasını yenileme. OAuth kodları tek kullanımlı ve ilgili PKCE akışına bağlıdır; URL'yi elle başka domaine taşıma.
4. E-posta doğrulandıysa kullanıcı canlı siteden normal e-posta/parola girişi yapabilir.

Bu düzeltme canlı Supabase yapılandırmasında hemen geçerlidir. Yeni kayıt isteğindeki açık `emailRedirectTo` koruması, frontend'in bir sonraki normal yayınıyla devreye girer. Üretimde doğrulama e-postası veya parola e-postası göndererek deneme yapmak gerçek kullanıcıya ileti gönderir; otomatik testler dışarı e-posta göndermez.

[Supabase dönüş adresi yapılandırması](https://supabase.com/docs/guides/auth/redirect-urls)
