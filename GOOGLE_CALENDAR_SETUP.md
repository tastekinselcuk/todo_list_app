# Google Calendar bağlantısı

Google Calendar, mevcut Outlook altyapısına ikinci sağlayıcı olarak eklendi. Bağlı takvimler penceresinde iki sağlayıcı da kendi ikonu ile görünür. Sunucuda ayarları tamamlanmamış sağlayıcı **Kurulum bekliyor** olarak gösterilir. Uygulamanın Google ile giriş özelliği ile takvim yetkisi birbirinden ayrıdır; takvim bağlamak giriş oturumunu değiştirmez.

## Kapsam ve maliyet

| Sağlayıcı | Bu sürümde durum | Kapsam |
| --- | --- | --- |
| Outlook / Microsoft 365 | Destekleniyor | Kişisel ve uygun iş/okul hesapları; mevcut Entra kurulumu korunur |
| Google Calendar | Destekleniyor; aşağıdaki kurulum gerekli | Gmail ve Google Workspace; erişim izni bulunan takvimler |
| iCloud / Apple Calendar | Eklenmedi | Ayrı yetkilendirme ve sunucu adaptörü gerektirir |
| ICS / webcal abonelikleri | Eklenmedi | İleride ayrı bir bağlantı türü olabilir; mevcut hesap bağlantısı değildir |

Google'ın 10 Kasım 2026 tarihinde kontrol edilen belgelerine göre standart Calendar API kullanımı ek ücrete tabi değil. Günlük proje eşiği 1.000.000 istek; kota aşımı için ücretlendirme planı belirtiliyor. Bu nedenle sınırsız ve her koşulda ücretsiz olarak değerlendirilmemeli. Supabase'in kendi kullanım kotaları ayrıca geçerlidir. [Güncel kota ve fiyatlandırma](https://developers.google.com/workspace/calendar/api/guides/quota).

Bu sürüm görüntüleme amaçlıdır: dış etkinlikler kaynak takvime yazılmaz, sürüklenmez veya yerel görevlere kopyalanmaz. Seçili takvimler aynı Ay/Hafta/Gün/Ajanda ekranında yerel kayıtlarla birlikte gösterilir. Takvim seçimi kalıcıdır; etkinlik içerikleri yalnızca görünür aralık için belleğe alınır. Webhook ile sürekli arka plan eşitlemesi yapılmaz; tarih değişimi, yenileme ve uygulamaya dönüşte güncel kayıtlar alınır.

## 1. Google Cloud

1. [Google Cloud Console](https://console.cloud.google.com/) içinde mevcut Google ile giriş projenizi kullanabilir veya ayrı bir proje oluşturabilirsin.
2. **APIs & Services → Library → Google Calendar API → Enable** seç.
3. **Google Auth Platform → Audience** altında dış kullanıcılar için **External** kullan. Test aşamasında kendi Google hesabını **Test users** listesine ekle. **Internal**, yalnızca ilgili kuruluşun kullanıcılarına izin verir.
4. **Data Access → Add or remove scopes** altında şu izinleri tanımla:

   ```text
   openid
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/calendar.calendarlist.readonly
   https://www.googleapis.com/auth/calendar.events.readonly
   ```

   Kod, `openid email` ve yukarıdaki iki takvim iznini ister. Yazma, silme, Gmail veya Drive izni gerekmez.

5. **Clients → Create client → Web application** ile takvim için bir istemci oluştur. Mevcut web istemcisini kullanmak da mümkündür; mevcut Google ile giriş dönüş adresini silme veya değiştirme.
6. **Authorized redirect URIs** listesine aşağıdaki adresi ekle:

   ```text
   https://saamxvuphakjpffvvcbj.supabase.co/functions/v1/outlook-calendar/google/callback
   ```

   Başka Supabase projesi kullanıyorsan proje referansını değiştir. Bu adres, Google ile giriş için kullanılan `/auth/v1/callback` adresinden farklıdır. Hem localhost hem canlı site için Google, sunucudaki bu adrese döner; localhost uygulama adresini bu bağlantının callback'i olarak kullanma.

7. **Client ID** ve **Client secret** değerlerini bir sonraki adımda Supabase'e ekle. Secret'ı sohbete veya istemci koduna yazma.

Google Workspace yöneticileri ek onay isteyebilir. Genel kullanıma açmadan önce Branding, gizlilik politikası, alan adı doğrulaması ve hassas kapsam incelemesi gerekebilir. **Testing** durumunda takvim erişimi için verilen refresh token normalde 7 gün sonra sona erer; bu durumda yeniden bağlamak gerekir. Sadece Google ile girişin daha önce onaylanmış olması yeni takvim izinlerinin de onaylandığı anlamına gelmez. [İzin kapsamları](https://developers.google.com/workspace/calendar/api/auth), [doğrulama](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [refresh token kuralları](https://developers.google.com/identity/protocols/oauth2#expiration).

## 2. Veritabanı

Supabase **SQL Editor** içinde şu dosyanın tamamını çalıştır:

```text
supabase/migrations/202611100001_google_calendar.sql
```

Bu migration, mevcut Outlook hesaplarını, şifreli anahtarlarını ve takvim seçimlerini korur. Google sağlayıcısını ve sağlayıcıya bağlı OAuth state kontrolünü ekler; aynı kullanıcı iki sağlayıcıyı birlikte kullanabilir.

İlk kez dış takvim altyapısını kuruyorsan önce `supabase/migrations/202611040001_external_calendars.sql`, ardından yukarıdaki yeni dosya çalıştırılmalıdır. Yeni migration'dan sonra eski dosyayı yeniden çalıştırma; eski hizmet fonksiyonunu geri yükler. Yeni dosya tekrar uygulanabilir.

## 3. Sunucu ayarları

Supabase **Edge Functions → Secrets** bölümüne ekle:

| Secret | Değer |
| --- | --- |
| `GOOGLE_CALENDAR_CLIENT_ID` | Google web istemcisinin Client ID değeri |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Aynı istemcinin Client secret değeri |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Yukarıda Google'a eklediğin birebir aynı callback adresi |

Mevcut `CALENDAR_ENCRYPTION_KEY` ve `CALENDAR_ALLOWED_ORIGINS` değerleri ortak kullanılır. **Şifreleme anahtarını değiştirme**; mevcut Outlook bağlantılarının çözülebilmesi için korunmalıdır. Origin listesinde localhost ve canlı sitenin tam origin'leri bulunmalı; örneğin:

```text
http://localhost:5173,https://pomodolist.netlify.app
```

Mevcut Outlook secret'larını veya Supabase Auth içindeki Google giriş ayarlarını değiştirmek gerekmez. `VITE_` değişkeni ekleme.

## 4. Function ve uygulama

Mevcut `outlook-calendar` function'ı artık iki sağlayıcıyı da yönetir. Microsoft callback adresi aynı kalır. Repo kökünden:

```powershell
npx --yes supabase login
npx --yes supabase functions deploy outlook-calendar --project-ref saamxvuphakjpffvvcbj --no-verify-jwt
```

`--no-verify-jwt`, Microsoft ve Google callback'lerinin Supabase JWT taşımaması içindir. Tüm POST işlemleri yine function'ın içinde kullanıcı oturumunu doğrular. Callback tek kullanımlık, sağlayıcıya bağlı, 10 dakika geçerli state ve PKCE ile kontrol edilir.

Güncel frontend'i normal dağıtım yönteminle yayınla veya localhost'ta yeniden yükle. Canlı OAuth bağlantısı, aşağıdaki kabul adımlarında Google hesabıyla ayrıca doğrulanmalıdır.

## Google test uyarısını kaldırma

1. **Google Auth Platform → Audience → Publishing status → Publish app** ile durumu **In production** yap. Bu işlem test kullanıcılarıyla sınırlı yayın durumunu değiştirir.
2. **Branding** içinde uygulama adı, destek e-postası, herkese açık ana sayfa ve gizlilik politikası adreslerini tamamla; istenen alan adı/marka doğrulamasını yap.
3. **Verification Center** üzerinden istenen takvim okuma kapsamları için doğrulama başvurusunu tamamla. İzinlerin kullanım gerekçesi ve bağlantı akışını gösteren demo videosu istenebilir.

**Publish app** yapmak, hassas kapsamların onaylandığı anlamına gelmez. İnceleme tamamlanana kadar **Google bu uygulamayı doğrulamadı** uyarısı sürebilir. Restricted scope bulunmaması, hassas takvim okuma izinlerinin doğrulama gereksinimini kaldırmaz. [Yayın durumu](https://support.google.com/cloud/answer/15549945), [doğrulama gereksinimleri](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

## 5. Kabul kontrolü

1. **Takvim → Bağlı takvimler → Google Calendar → Hesap bağla** seç. Kurulum tamamlanınca buton etkin olmalı.
2. Google hesabını seç, iki takvim okuma iznini de onayla. Uygulamaya mevcut giriş oturumunla dönmelisin.
3. Bir Google ve bir Outlook takvimini birlikte seç. İkisi de aynı görünümde, doğru sağlayıcı adıyla görünmeli.
4. Saatli, tüm gün, gece yarısını aşan ve tekrarlı etkinlikleri kontrol et. Tüm gün bitiş tarihi hariç tutulur; saatli kayıtlar yerel saatte gösterilir.
5. Google etkinliğine tıklayınca salt okunur ayrıntılar ve güvenli Google Calendar bağlantısı görünmeli. Özel etkinliğin başlık ve konumu gösterilmez.
6. Takvim seçimini değiştir, sayfayı yenile ve tekrar kontrol et. Varsayılan takvim ilk bağlantıda seçilir; yeniden bağlama seçimini korur.
7. Google bağlantısını kaldır. Outlook ve yerel etkinlikler korunmalı; Google'daki asıl takvimler silinmemeli. Bağlantıyı kaldırmak uygulamadaki şifreli anahtarları siler; Google tarafındaki izni de kaldırmak için Google hesabının üçüncü taraf erişim ayarlarını kullan.

Hesaplar yalnızca giriş yapan kullanıcıya aittir; çalışma alanı paylaşımı dış takvimleri paylaşmaz. İki sağlayıcı toplamında en fazla 5 hesap ve 10 seçili takvim desteklenir. Tarih aralığı en fazla 63 gün, sonuç en fazla 2.000 etkinliktir. Kullanıcı başına mevcut sunucu istek bütçeleri ve eşzamanlı token yenileme kilitleri korunur.

## Sık karşılaşılan durumlar

- **Kurulum bekliyor:** Function'ın güncel sürümünü yayınla, Google secret'larını ve ortak şifreleme/origin ayarlarını kontrol et.
- **redirect_uri_mismatch:** Calendar callback'i Google web istemcisindeki Authorized redirect URIs alanına birebir eklenmeli.
- **access_denied:** Testing kullanıcı listesini, verilen kapsamları ve varsa Workspace yönetici kısıtlamasını kontrol et.
- **API etkin değil:** Google Calendar API'yi OAuth istemcisiyle aynı projede aç.
- **Yeniden bağla:** İzin geri alınmış, test token'ı sona ermiş veya Google refresh token'ı geçersiz olmuş olabilir.
- **INVALID_STATE:** Önce güncel function sürümünü yayınla. Supabase relay, isteği function'a iletirken `/functions/v1` önekini çıkarabilir; kod iki yolu aynı callback olarak karşılaştırır. Google Cloud veya `GOOGLE_CALENDAR_REDIRECT_URI` içindeki dış callback adresinden bu öneki kaldırma. Sonra uygulamadaki **Hesap bağla** düğmesinden yeni bir akış başlat; eski callback sayfasını yenileme. Süresi dolmuş, daha önce kullanılmış veya başka sağlayıcıya ait state reddedilir. Google migration'ının uygulanmış olduğunu ve origin listesinde uygulamanın adresinin bulunduğunu da kontrol et.

## Teknik kaynaklar

- [Google web sunucusu OAuth akışı ve çevrimdışı erişim](https://developers.google.com/identity/protocols/oauth2/web-server)
- [CalendarList: list](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list)
- [Events: list ve tekrarlı örnekler](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
- [Apple üçüncü taraf takvim erişimi](https://support.apple.com/en-gb/102654)
