# Supabase kontrol değerlendirmesi — 12 Ekim 2026

## Onarım sonrası güncel sonuç

Son paylaşılan çıktı: **370 kontrol; 368 PASS, 0 FAIL, 2 WARN, 0 SKIP**. Aşağıdaki ilk değerlendirmede eksik görünen onarım ve yetki kontrolleri artık geçiyor. Bu sonuç, kontrol edilen veritabanı yapısında eksik bir kurulum adımı göstermiyor; canlı kullanımın her senaryosunu doğrulamaz.

- `expired active focus lease`: bir oturumun sahiplik süresi dolmuş. Kapalı/çevrimdışı tarayıcı veya terk edilmiş oturumda görülebilir; eksik tablo anlamına gelmez. Gerekiyorsa uygulamadaki iptal/devralma akışıyla ilgili oturumu yönet; toplu sahiplik veya geçmiş silme sorgusu kullanma.
- SQL dışı kontroller: tarayıcı ve Edge dağıtımını SQL sorgusu doğrulayamaz. Bilgilendirme uyarısıdır.

`INVALID_FOCUS_SESSION` için istemcide yeniden üretilen hata: PostgreSQL'in `…22.856714` bitiş zamanından sonra tarayıcı `…22.856` ile yeni aralık başlatabiliyordu. Aralıklar 714 mikrosaniye çakıştığından SQL haklı olarak kaydı reddediyor. İstemci artık mikro saniye hassasiyetini koruyarak devam ediyor; eski kayıtlarda yalnız aynı milisaniye içindeki bu sınır hatası kırpılarak düzeltiliyor. Kimlik, başlangıç, görev bağı ve hedef korunuyor, süre artırılmıyor. Daha büyük veya farklı bozukluklar otomatik değiştirilmeden saklanıyor. Paylaşılan isteğin ikinci aralığı kısaltılmış olduğundan o isteğin kesin nedenini doğrulamak için endpoint adı ve tüm `segments` dizisi gerekir.

Reddedilen tek kayıt artık sonraki geçerli oturumların eşitlenmesini durdurmuyor. Çalışan eski bir sayaç kaydı bu sınır hatası nedeniyle onarılırsa duraklatılmış olarak açılıyor; devam et seçimi yeni ve geçerli bir aralık başlatıyor. Bozuk JSON ile gerçek tarayıcı saklama/kapasite hatası da ayrılıyor; küçük bir saklama testi başarılı olsa bile bekleyen tam kayıt saklanamıyorsa uyarı korunuyor. Yerel kayıtlar topluca silinmiyor.

**Bu düzeltme için yeni SQL gerekmez.** Güncel istemciyi açıp eski uygulama sekmelerini yenile. Geliştirme sunucusu eski kodu sunuyorsa yeniden başlat. Yeni bir görevde başlat → duraklat → devam et → iptal akışını dene; kısmi süre korunmalı ve tam oturum sayısı artmamalı. Paylaşılan görevdeki `10.222` saniye / `0` oturum, kısmi çalışma için normaldir; `association: free` olan hata kaydı ise görevle eşleştirilmemiş bir oturumdur.

Saklama uyarısı yenilemeden sonra sürerse yalnız geçici bir anahtar yazıp silen şu tarayıcı Console kontrolüyle erişimi test edebilirsin. Mevcut notlara veya kayıtlara dokunmaz; küçük testin başarısı mevcut tüm kayıtların kotaya sığdığını tek başına kanıtlamaz.

```js
(() => {
  const key = 'focus-storage-probe:' + crypto.randomUUID();
  try {
    localStorage.setItem(key, '1');
    return { writable: localStorage.getItem(key) === '1' };
  } catch (error) {
    return { writable: false, name: error.name, message: error.message };
  } finally {
    try { localStorage.removeItem(key); } catch {}
  }
})()
```

## Giriş yanıtı başarılı, ekran girişte kalıyor

Paylaşılan yanıt Supabase'in kimlik doğrulamayı kabul ettiğini gösteriyor; istemcinin oturumu saklayıp uygulama ekranını açtığını tek başına kanıtlamıyor. Console'da hata görünmemesi de yeterli değil: `login()` hatayı yakalıyordu; `App.vue` aynı yükleme durumuyla giriş formunu kaldırdığından formdaki mesaj ve girilen alanlar yeniden oluşturulurken kayboluyordu.

Bu davranış gerçek Auth SDK'sıyla yeniden üretildi: küçük saklama testi başarılıyken tam oturum yazması kapasite hatası alırsa token isteği 200 dönüyor ama `signInWithPassword()` reddediliyor. Bu, önceki tarayıcı saklama uyarısıyla uyumlu bir olasılık; kullanıcının tarayıcısındaki kesin neden yalnız paylaşılan yanıttan belirlenemez.

İlk açılış yüklemesi giriş/kayıt/sıfırlama formunun işlem durumundan ayrıldı. Form işlem sırasında korunuyor, çift gönderim engelleniyor ve hata görünür kalıyor. Auth dinleyicisinin kaldırma işlevi de uygulama yaşam döngüsüne bağlandı. Varsayılan oturum anahtarı korunuyor; tarayıcı saklaması çalıştığında mevcut oturum ve sekmeler arası değişiklikler okunmaya devam ediyor. Saklama çalışma sırasında hata verirse Supabase'in doğruladığı yeni oturum açık sayfanın belleğinde tutuluyor; önceki auth anahtarı erişilebiliyorsa kaldırılıyor, diğer notlar ve odak kuyruğu silinmiyor. Böyle bir girişte kalıcı saklamanın başarısız olduğu kullanıcıya bildirilir; yenileme/kapatma sonrasında yeniden giriş gerekebilir. Bellekteki oturum yeni sayfaya taşınmaz.

Bu değişiklik için SQL, Supabase redirect adresi veya tablo değişikliği gerekmez. Güncel istemciyi yükleyip çıkış → giriş akışını yeniden dene. Giriş hâlâ başarısızsa artık formdaki hata mesajı görünür kalmalı; yalnız o mesajı paylaş. Access/refresh token, parola ve Authorization başlığı paylaşma. Canlı kullanıcı hesabı üzerinde doğrudan giriş denenmedi; otomatik testler sentetik kullanıcı ve tokenlarla çalışır.

## İlk kontrolün değerlendirmesi

Kullanıcının SQL Editor çıktısı: **365 kontrol; 360 PASS, 2 FAIL, 3 WARN, 0 SKIP**. Sayaç onarımı henüz uygulanmamış. Bu değerlendirme paylaşılan çıktıya dayanır; canlı veritabanına doğrudan bağlantı yapılmadı.

## Bulgular

| Kontrol | Değerlendirme | Uygulanacak adım |
| --- | --- | --- |
| `end_focus_session(uuid)` eksik | Onarım öncesinde beklenen eksik. Yeni istemcinin uzak oturumu doğrudan kapatabilmesi için gerekli. | `202610110003_focus_repair.sql` |
| `focus_context(uuid)` sürüm farkı | Onarım öncesinde beklenen fark. Güncel sürüm segment başlangıcını ve kapanmış oturumları bildirir. | Aynı sayaç onarımı |
| `focus_terminal_recent_idx` eksik | Güncel kapanmış-oturum sorgusunu hızlandıran indeks henüz eklenmemiş. | Aynı sayaç onarımı |
| `ensure_default_workspace() execute` | Fonksiyon gövdesi güncel, çağırma yetkileri beklenen sözleşmeyle uyuşmuyor. Eski rapor PUBLIC/anon erişimi ve authenticated eksikliğini tek satırda topladığından hangi rolün sorunlu olduğu bu çıktıdan kesin söylenemez. | `202610120001_workspace_rpc_permissions.sql` |
| SQL dışı kontroller | Veritabanı hatası değil. SQL, canlı Edge dağıtımını, secret'ları, tarayıcı bağlantısını veya etkileşimleri doğrulamaz. | Ayrı kullanım ve endpoint kontrolü |

PomoNotes tabloları/kolonları, gerekli null kısıtları, kritik foreign key'ler, RLS, özel tablo erişimleri, tetikleyiciler ve koleksiyon bağları kontrolden geçmiş. Odak sahipliği/yazma token'ı tutarsızlığı, yanlış çalışma alanına bağlı odak kaydı, geçersiz hedef veya mükerrer analiz kaydı saptanmamış. `claim_focus_session` ve `record_focus_session` fonksiyon gövdeleri, imzaları ve kontrol edilen çağırma yetkileri güncel kodla eşleşiyor.

Bu sonuç sayaç onarımının ön koşullarının mevcut olduğunu gösteriyor. İlk başlatma hatasının kesin nedeni ise bu raporda kanıtlanmıyor; özellikle workspace RPC yetki uyumsuzluğunu doğrudan odak başlatma hatasının nedeni sayamayız.

## Güvenli uygulama sırası

1. SQL Editor'da [202610110003_focus_repair.sql](supabase/migrations/202610110003_focus_repair.sql) dosyasının tamamını çalıştır. Mevcut notları/çalışma alanlarını silmez; odak fonksiyonlarını günceller, eksik sütun varsa ekler ve terminal oturum indeksini kurar. Oturumu kapatma işlemi ancak uygulamadan çağrıldığında yapılır.
2. Ayrı çalıştırmada [202610120001_workspace_rpc_permissions.sql](supabase/migrations/202610120001_workspace_rpc_permissions.sql) dosyasının tamamını çalıştır. Yalnız workspace RPC'sinin PUBLIC/anon yetkisini kapatır, authenticated çağırma yetkisini açar. Fonksiyon gövdesini veya kullanıcı verilerini değiştirmez.
3. Uygulamayı yenile. Güncel istemci kodu kullanılıyor olmalı; açık eski cihaz/sekme oturumlarını da yenile. SQL Editor'da [application_health.sql](supabase/diagnostics/application_health.sql) dosyasını yeniden çalıştır.
4. Yeni sonuçta **FAIL ve SKIP kalmamalı**. Üç onarım bulgusu ve workspace yetki kontrolü PASS olmalı. SQL dışı kontrol uyarısının kalması normaldir. Aktif/çevrimdışı oturum uyarısı çıkarsa ilgili satırı ayrıca değerlendir; tüm sayaç sahipliklerini topluca silme.

Eski `workspaces.sql`, paylaşım ve analiz kurulumlarını komple yeniden uygulamak gerekmez. Tarihli iki onarım transaction içinde ve yeniden uygulanabilir şekilde hazırlanmıştır. Hata alırsan o dosyanın çıktısını paylaş; sonraki adıma geçmeden nedeni çözülmeli.

## Kullanım doğrulaması

- Görev ekle: sayaç kendiliğinden başlamamalı. Oynat düğmesi seçilen göreve bağlanmış sayacı başlatmalı.
- Birkaç saniye çalıştır, duraklat ve bekle. Devam ettiğinde beklenen duraklama süresi odağa eklenmemeli.
- Etiketteki çarpıyla oturumu kapat. Etiket kalkmalı, sayaç durmalı; sonraki serbest odak ve başka görev başlatılabilmeli. Kısmi süre tam Pomodoro sayılmamalı.
- İki sekme/cihazda aynı hesabı aç. Devralma ve iptal eski cihazın gecikmiş güncellemesiyle oturumu yeniden açmamalı. Farklı hesaba ait sayaç etkilenmemeli.
- Hata sürerse Network'teki başarısız `claim_focus_session` veya `end_focus_session` isteğinin Response `code`, `message`, gerekirse `details`/`hint` alanlarını paylaş. Token veya Authorization başlığını paylaşmak gerekmez.

## Yerel doğrulama

Gerçek PostgreSQL motoruyla odak başlatma/kapatma, kısmi süre, yetki ayrımı, eski yazmaların engellenmesi ve veritabanı kontrol sorgusu test edilir. Workspace yetki onarımı doğrudan `anon` EXECUTE grant'i olan ortamda yeniden üretilip test edilmiştir: yalnız PUBLIC grant'ini kaldırmak doğrudan anon grant'ini kaldırmaz. Onarım sonrası giriş yapmış kullanıcı mevcut workspace'i kullanır; anon çağrısı engellenir, notlar/workspace satırları ve RPC gövdesi korunur.

İptal edilen çevrimdışı bir oturumun yazma kimliği de iki alanıyla birlikte atanır; yarım-null yazma token'ı bırakılmaz. Test raporlarının UTC tarih sınırı test veritabanında açıkça belirlenmiştir; İstanbul gece yarısı ile UTC tarih farkı üretim kodu hatası olarak değerlendirilmez.
