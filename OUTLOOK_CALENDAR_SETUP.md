# Outlook takvimi bağlantısı

İlk aşama, kullanıcının kişisel veya iş/okul Microsoft hesabındaki takvimleri mevcut uygulama takviminde görüntülemesini sağlar. Entra uygulama kaydı ve aşağıdaki sunucu kurulumu tamamlanınca canlı bağlantı kullanılabilir.

## Sağlanan akış

- Takvim araç çubuğundaki **Bağlı takvimler** ikonundan Outlook hesabı bağlanır.
- Aynı kullanıcı en fazla 5 Microsoft hesabı bağlayabilir. Hesapların içindeki en fazla 10 takvim birlikte seçilebilir; tümünü seçme ve temizleme kontrolleri bulunur.
- İlk bağlantıda yeni hesabın varsayılan takvimi seçilir. Yeniden bağlama veya yenileme mevcut seçimi korur.
- Seçili takvimler yerel etkinliklerle birlikte gün, hafta, ay ve ajanda görünümünde gösterilir. Kaynağın rengi, takvim adı ve Outlook etiketi kullanılır.
- Etkinlik tıklanınca salt okunur ayrıntı açılır; uygunsa Outlook'ta aç bağlantısı sunulur. Özel/gizli etkinliklerin başlığı ve konumu gösterilmez.
- Saatli etkinlikler UTC'den kullanıcının yerel saatine çevrilir. Tüm gün etkinlikleri tarih ve hariç tutulan bitiş tarihiyle gösterilir. Tekrarlı etkinlik örneklerini Microsoft Graph `calendarView` üretir.
- Takvimde tarih değiştirmek, bağlantı içinden yenilemek veya en az bir dakika sonra uygulamaya geri dönmek görünür tarih aralığını yeniden getirir. Push/webhook veya arka planda sürekli senkronizasyon bu aşamaya dahil değildir.
- Görünür aralık istek başına en fazla 63 gün, toplam yanıt en fazla 2.000 etkinliktir. Sınıra ulaşılırsa uyarı verilir; yoğun takvimde gün/hafta görünümü kullanılabilir.
- Outlook etkinlikleri sürüklenmez, yerel göreve çevrilmez veya Microsoft'a yazılmaz. Yerel görevlerin ve etkinliklerin düzenlenmesi devam eder.

Bağlantı, kullanıcının uygulamaya giriş yaptığı hesapla ilişkilidir. Google ile giriş yapan bir kullanıcı da ayrıca Outlook bağlayabilir. Supabase Auth içinde Microsoft giriş sağlayıcısını açmak gerekmez.

## 1. Microsoft Entra uygulamasını kaydet

1. [Microsoft Entra yönetim merkezinde](https://entra.microsoft.com/) **App registrations → New registration** yolunu aç.
2. Ad olarak örneğin `PromptVault Calendar` kullan.
3. Desteklenen hesap türünü **Accounts in any organizational directory and personal Microsoft accounts** seç. Böylece iş/okul hesapları ve Outlook.com/Hotmail hesapları desteklenir.
4. Redirect URI platformu **Web** olmalı. Bu adres sunucudaki Edge Function'a döner; SPA, localhost uygulama adresi veya Supabase Auth callback adresi değildir:

   ```text
   https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/outlook-calendar/callback
   ```

5. Kaydı oluştur. **Application (client) ID** değerini al.
6. **Certificates & secrets → New client secret** ile secret oluştur. Oluşan **Value** değerini güvenli biçimde sakla; Secret ID ile karıştırma. Son kullanım tarihini takip et.
7. **API permissions → Microsoft Graph → Delegated permissions** altında `User.Read` ve `Calendars.ReadBasic` ekle. Akış ayrıca `offline_access` ister. Application permission veya `Calendars.ReadWrite` ekleme.
8. Kurumsal hesapların yönetici onayı politikaları geçerlidir. Gerekiyorsa ilgili kuruluşun yöneticisi bu izinlere onay verir. Outlook posta kutusu bulunmayan Microsoft hesaplarında takvim API'si çalışmayabilir.

## 2. Veritabanını güncelle

Supabase SQL Editor'de şu dosyanın tamamını çalıştır:

```text
supabase/migrations/202611040001_external_calendars.sql
```

Migration yeniden çalıştırılabilir. Bağlantı metadatası, takvim seçimleri, şifreli erişim anahtarları, tek kullanımlık OAuth state ve sunucu istek bütçeleri için tablolar oluşturur. Bu tablolar ve hizmet RPC'si `anon` / `authenticated` rollerine açık değildir. Kullanıcı doğrulaması Edge Function'da yapılıp her işlem gerçek oturum kullanıcısıyla yürütülür.

## 3. Edge Function secret'larını tanımla

Yalnızca sunucu secret'larına şunları ekle. Bunların hiçbirini `VITE_` değişkenine veya istemci koduna koyma:

| Secret | Değer |
| --- | --- |
| `OUTLOOK_CLIENT_ID` | Entra Application (client) ID |
| `OUTLOOK_CLIENT_SECRET` | Entra client secret **Value** |
| `OUTLOOK_REDIRECT_URI` | Entra Web redirect URI alanına yazılan birebir aynı callback adresi |
| `CALENDAR_ENCRYPTION_KEY` | Rastgele 32 bayt anahtarın standart base64 karşılığı |
| `CALENDAR_ALLOWED_ORIGINS` | Virgülle ayrılmış tam uygulama origin'leri; path veya sondaki `/` olmadan |

Örnek origin listesi:

```text
http://localhost:5173,https://your-app.netlify.app
```

Yalnızca gerçekten kullanılan adresleri ekle. `localhost` ve `127.0.0.1` farklı origin'dir. Önizleme adreslerini gerekiyorsa tek tek ekle; wildcard kullanılmaz.

Anahtarı kendi terminalinde üret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Supabase Dashboard → Edge Functions → Secrets üzerinden secret'ları girebilirsin. CLI kullanıyorsan değerleri git tarafından yok sayılan `.env.calendar.local` dosyasına yazıp aşağıdaki komutu çalıştırabilirsin:

```powershell
npx supabase secrets set --env-file .env.calendar.local --project-ref <SUPABASE_PROJECT_REF>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` ve `SUPABASE_SERVICE_ROLE_KEY` Supabase Edge ortamında sağlanır. Service role key tarayıcıya gönderilmez.

Şifreleme anahtarını sakla: değiştirmek, mevcut şifreli bağlantıların tekrar bağlanmasını gerektirir. Client secret'ı yenilerken yeni değer Supabase secret'ına yazılmalıdır.

## 4. Function'ı yayınla

```powershell
npx supabase functions deploy outlook-calendar --project-ref <SUPABASE_PROJECT_REF> --no-verify-jwt
```

Repo içindeki `supabase/config.toml` aynı function için `verify_jwt = false` tanımlar. Bu gereklidir: Microsoft'un tarayıcıyla döndüğü callback bir Supabase JWT'si taşımaz. **Bütün POST işlemleri**, function'ın içinde `/auth/v1/user` üzerinden JWT doğrular. Callback yalnızca kriptografik, tek kullanımlık ve 10 dakikalık OAuth state ile kabul edilir.

Sonra güncel web uygulamasını mevcut dağıtım yönteminle yayınla veya yerelde yeniden yükle. Takvim bağlantısı için yeni bir frontend environment değişkeni gerekmez.

## 5. Canlı kabul kontrolü

1. Uygulamaya giriş yap, Takvim → Bağlı takvimler → Outlook hesabı bağla seç.
2. Microsoft onayını tamamla. Dönüşte uygulama takvime açılmalı ve bağlantı mesajı görünmeli. Uygulama giriş oturumu değişmemeli.
3. İki takvim seçip tek takvime indir, tümünü temizle ve yeniden seç. Seçim sayfa yenilemesinde korunmalı.
4. Gün, hafta, ay ve ajanda görünümlerinde saatli, tüm gün, birden fazla güne yayılan ve tekrarlı etkinlikleri kontrol et.
5. Etkinlik açıldığında kaynağı ve Outlook bağlantısı görünmeli. Outlook etkinliğini sürüklemek yerel bir kayıt oluşturmamalı.
6. İkinci bir uygulama kullanıcısıyla giriş yap. İlk kullanıcının hesapları veya etkinlikleri görünmemeli; paylaşılan çalışma alanında da aynı kural geçerli olmalı.
7. Hesap bağlantısını kaldır. Görünen etkinlikler, kayıtlı kaynaklar ve sunucudaki şifreli anahtarlar kaldırılmalı. Outlook'taki asıl takvim ve etkinlikler silinmez.

Bağlantıyı uygulamadan kaldırmak yerel erişim anahtarlarını siler. Microsoft tarafındaki uygulama iznini tamamen geri almak için kullanıcının Microsoft hesabındaki uygulama izinleri ekranı kullanılır.

## Güvenlik ve veri kapsamı

- Authorization code + PKCE S256; rastgele state'in yalnızca SHA-256 özeti veritabanında tutulur. Callback state'i atomik olarak tüketir.
- PKCE verifier, access token ve refresh token AES-256-GCM ile, kullanıcı kimliğine bağlı ek doğrulama verisi kullanılarak şifrelenir.
- Erişim anahtarı süresi dolunca sunucu refresh token kullanır; veritabanı kilidi ve sürüm kontrolü eşzamanlı yenilemelerin birbirini ezmesini engeller.
- Hesap başına erişim kontrolü sunucuda yapılır. İstemciden gönderilen kullanıcı veya çalışma alanı kimliğine güvenilmez.
- OAuth dönüş adresi allowlist ile, Graph pagination bağlantıları sabit Microsoft Graph origin'iyle sınırlandırılır. Provider redirect'leri takip edilmez.
- Kullanıcı başına 10 dakikada 5 bağlantı başlatma, 120 etkinlik isteği, diğer işlem türlerinde 60 istek bütçesi vardır.
- Etkinlik gövdeleri, ekleri ve katılımcı listeleri alınmaz. Etkinlik içerikleri veritabanında veya tarayıcı kalıcı depolamasında saklanmaz; görünür aralık için bellekte tutulur.
- Dış takvimler genel not aramasına, ekip paylaşımına veya çalışma alanının ortak analizlerine eklenmez.

Ortak `ConnectedEvent` / `CalendarConnection` modeli takvim görünümünden ayrıdır. Gelecekte başka sağlayıcı eklenirken aynı etkinlik modeli kullanılabilir; sağlayıcının OAuth, izin ve sunucu adaptörü ayrıca uygulanır.

## Resmî kaynaklar

- [Microsoft authorization code ve PKCE akışı](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Microsoft Graph: kullanıcının takvimleri](https://learn.microsoft.com/en-us/graph/api/user-list-calendars?view=graph-rest-1.0)
- [Microsoft Graph: tarih aralığındaki etkinlik örnekleri](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0)
- [Microsoft Graph: etkinlik ve tüm gün tarihleri](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0)
