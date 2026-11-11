# Güvenli Kasa yayın doğrulaması — 12 Kasım 2026

## Yayınlananlar

- Uygulama kodu: `f3e366a` — Add encrypted vault recovery and verified security operations.
- Netlify: `https://pomodolist.netlify.app`, yeni SecureNotes bundle'ında bilgilendirme ve v2 şifreleme kodu doğrulandı.
- Supabase projesi: `saamxvuphakjpffvvcbj`; yalnızca `202611110001_vault_security.sql` migration'ı uygulandı.
- `vault-security`: ACTIVE, sürüm 1. JWT handler içinde Auth üzerinden doğrulanır.
- `trash-cleanup`: ACTIVE, sürüm 18.
- Saatlik `vault-retention` görevi etkin.

## Kontroller

- Yayın öncesi 52 ilgili test ve üretim build'i başarılı.
- İlk kullanım bilgilendirme RPC'si ve e-posta işlem RPC'leri mevcut.
- Authenticated rolünün `vault_challenge_finish` çağırarak e-posta doğrulamasını atlama yetkisi yok.
- Oturumsuz güvenlik isteği HTTP 401 `AUTH_REQUIRED` döndürüyor; canlı origin için CORS başlığı doğru.
- Test modu, gönderici ve origin değerleri secret özetleri karşılaştırılarak doğrulandı. API/OTP anahtarları boş değil; değerleri rapora veya kaynak koduna yazılmadı.
- Test adresi uygulamadaki doğrulanmış bir hesapla eşleşiyor.
- E-posta: **Pomodolist · E-posta testi**, Resend kabulü HTTP 200, son teslim olayı **delivered**.
- Test hiçbir kasa açma, parola değiştirme, kurtarma, sıfırlama veya silme işlemi başlatmadı.
- Tek seferlik, yalnızca servis yetkili posta kontrol function'ı testten sonra kaldırıldı; kalıcı uygulama koduna eklenmedi.
- `npm audit --omit=dev`: üretim bağımlılıklarında 0 açık. GitHub'ın geliştirme araçları dahil bağımlılık uyarıları bununla aynı kapsamda değildir ve ayrıca izlenmelidir.

## Sınırlar

E-posta **test modundadır**: yalnızca yapılandırılan test hesabı kendi doğrulanmış adresine kod alabilir. Başka kullanıcıların kodları bu adrese yönlendirilmez. Tüm kullanıcılar için doğrulanmış gönderici alan adı ve production modu gerekir.

Canlıda gerçek kullanıcı kasalarıyla açma/değiştirme/silme deneyi yapılmadı; veri koruyan şifreleme/kurtarma işlemleri otomatik testlerde doğrulandı. Resend'in `delivered` olayı alıcı posta sunucusuna teslimi gösterir; mesajın gelen kutusu yerine spam klasörüne düşmediğini veya okunduğunu garanti etmez.

Windows tarayıcı otomasyonu mevcut URL'yi güvenle belirleyemediği için sonlandırıldı; kullanıcı kimlik doğrulama pencereleri otomatik doldurulmadı. GitHub hesabı seçimini kullanıcı tamamladı; yayın bundan sonra Git/Supabase CLI ile yapıldı.
