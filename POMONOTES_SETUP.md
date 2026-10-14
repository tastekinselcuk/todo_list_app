# PomoNotes kurulumu

Kod hazırdır; bu çalışma canlı Supabase veritabanını veya Edge Function dağıtımını değiştirmedi.

## Mevcut uygulamayı yükseltme

Çalışma alanları, tüm sekme paylaşımı ve yetki güncellemesi kurulu olmalı. Analiz daha önce kurulmadıysa önce [ANALYTICS_SETUP.md](ANALYTICS_SETUP.md) adımını tamamla.

Supabase **SQL Editor** içinde şu dosyaların **tam içeriğini**, ayrı ayrı ve sırayla çalıştır:

1. [202610110001_reminder_delivery.sql](supabase/migrations/202610110001_reminder_delivery.sql) — güvenli e-posta gönderim kaydı, yetki kontrolü, tekrar deneme ve gönderim sınırı.
2. [202610110002_pomonotes.sql](supabase/migrations/202610110002_pomonotes.sql) — PomoNotes görevleri, kişisel hedefler, sayaç sahipliği, oturum ilerlemesi ve Analiz özeti.
3. [202610110003_focus_repair.sql](supabase/migrations/202610110003_focus_repair.sql) — güncel odak fonksiyonları, güvenli iptal ve kapanmış oturum indeksi.
4. [202610120001_workspace_rpc_permissions.sql](supabase/migrations/202610120001_workspace_rpc_permissions.sql) — varsayılan çalışma alanı RPC'sinin çağırma yetkilerini düzeltir.

E-posta veya kullanıcı UUID'si yazmana gerek yok. PomoNotes migration'ı mevcut her çalışma alanına boş bir kişisel odak koleksiyonu ekler. Var olan notlar, paylaşımlar ve odak kayıtları korunur; eski oturumlara görev bağı uydurulmaz.

Yeni kurulumda sıra: modül tabloları → `workspaces.sql` → `tab_sharing.sql` → `tab_sharing_modules.sql` → `tab_sharing_vault.sql` → `tab_sharing_permissions.sql` → `analytics.sql` → yukarıdaki dört tarihli migration.

PomoNotes kurulduktan sonra eski paylaşım/Analiz scriptlerini üstüne tek başına yeniden çalıştırma. Eski scriptler fonksiyonları yeniden tanımlar; sonraki yükseltmeler tarihli migration'larla yapılmalı. Tarihli dosyalar yeniden uygulanabilir; hata durumunda transaction geri alınır.

## Mevcut kurulumda sayaç onarımı ve kontrol

PomoNotes zaten kuruluysa ilk iki dosyayı baştan uygulamak gerekmez. Önce [application_health.sql](supabase/diagnostics/application_health.sql) dosyasının tamamını tek seferde SQL Editor'da çalıştır. Sorgu uygulama verilerini yalnız okur; sonuçlar oturuma özel geçici bir tabloya yazılır. Fonksiyon imzaları/parametreleri, sürümleri, yetkiler, RLS, tetikleyiciler, indeksler ve toplu veri tutarlılığı kontrol edilir. Eksik tablo/kolon varsa sorgu kontrol satırlarında raporlar.

İlk 12 Ekim kontrolünde yalnız **3. ve 4. dosyalar** eksikti. Bunlar uygulandıktan sonraki güncel sonuç **368 PASS, 0 FAIL, 2 WARN, 0 SKIP**. Bu durumda bu dosyaları tekrar çalıştırmak gerekmez. `INVALID_FOCUS_SESSION` ve saklama uyarısı için istemcide yapılan zaman hassasiyeti/kayıt kuyruğu düzeltmelerini kullanmak üzere uygulamayı yenile. Çıktının analizi ve kullanım doğrulaması [SUPABASE_HEALTH_REVIEW.md](SUPABASE_HEALTH_REVIEW.md) içindedir. Yeni FAIL/SKIP varsa sonucu incelemeden eski migration'ları rastgele tekrar çalıştırma.

Görev etiketindeki çarpı, başka cihazdan görüntülenen oturumu da o kullanıcı için doğrudan kapatır. Bekleyen başlatmanın iptali geç yanıtla geri alınmaz. Çalışılmış kısmi süre korunur; iptal edilen kısmi oturum tam Pomodoro sayılmaz.

## Hatırlatma fonksiyonunu güncelleme

Veritabanı adımından sonra `send-periodic-reminder` fonksiyonunu **index.ts ve handler.ts birlikte** yeniden dağıt. CLI kurulumu ve proje bağlantısı hazırsa:

```powershell
supabase functions deploy send-periodic-reminder
```

Dashboard üzerinden dağıtıyorsan `supabase/functions/send-periodic-reminder` içindeki iki dosyayı birlikte kullan. JWT doğrulamasını koru. Fonksiyon, giriş token'ını ayrıca doğrular ve doğrulanmış hesabın e-postasını kullanır. İstek gövdesinden alıcı, kullanıcı veya not içeriği kabul etmez.

Mevcut `RESEND_API_KEY` ve doğrulanmış gönderici için `REMINDER_FROM_EMAIL` secret'ları kullanılır; Supabase ortam değişkenleri Edge ortamında sağlanır. Servis anahtarını `VITE_` değişkenine koyma. Migration ve Edge dağıtımını aynı sürüm geçişinde tamamla; yeni istemci eski endpoint'e alıcı/içerik göndermiyor.

E-posta henüz sunucu cron işiyle gönderilmez; uygulama açıkken kontrol edilir. Başarısız gönderim başarılı sayılmaz ve yeniden denenebilir. Sunucu zamanlayıcısı sonraki geliştirme paketidir.

## Kurulum kontrolü

SQL Editor'da:

```sql
select p.proname as rpc
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'focus_context','claim_focus_session','end_focus_session','pomonotes_mutate',
  'pomonotes_page','pomonotes_history','analytics_summary',
  'claim_periodic_email','finish_periodic_email'
)
order by p.proname;
```

Dokuz satır dönmeli. Bu kısa sorgu yalnızca fonksiyon adlarını kontrol eder; tam inceleme için `application_health.sql` kullan. Bağımlılıklar güncellendiğinden açık geliştirme sunucusunu bir kez yeniden başlat (`npm.cmd run dev`) ve uygulamayı yenile. Ayarlar → **Odak Zamanlayıcısı** etkin olduğunda çalışma alanında **PomoNotes** sekmesi de görünür. Şema önbelleği gecikirse `notify pgrst, 'reload schema';` çalıştırıp tekrar dene.

## Kullanım ve ölçüm

- Görevi yaz, oturum hedefini seç, ekle. Karttaki oynat ikonuyla aynı global sayaç o göreve bağlanır.
- 5 hedefli görevde iki tam oturum bitmişse `2/5`; üçüncüsü çalışırken ayrıca `3. oturum sürüyor` görünür.
- Görev tamamlanması ayrı bir seçimdir. Hedefin altında tamamlayabilir veya hedefi aşarak devam edebilirsin. Hedefe ulaşmak görevi otomatik tamamlamaz.
- A sürerken B'yi seçmek B'yi sıraya alır. **Bitir ve geç**, A'nın gerçek kısmi süresini koruyup B'yi yeni oturumla başlatır. Kısmi süre tam Pomodoro sayılmaz.
- Sayaç etiketindeki küçük çarpı görevden ayırır; sonraki başlangıç serbest odaktır. Görev seçmek zorunlu değildir.
- Süre ayarı veya kişisel hedef değişikliği sürmekte olan oturumu sıfırlamaz. Bağlı görev kendi oturum süresini kullanır; görevde düzenlenen süre sonraki oturumuna uygulanır. Genel sayaç süresi serbest odak ve yeni görevler içindir. İlk tahmin ayrı korunur.
- Görev metni/tamamlanması paylaşılabilir; hedef, oturum geçmişi ve odak süresi kişiseldir. Görüntüleyici kendi hedefini düzenleyip odaklanabilir, ortak içeriği değiştiremez. Davetler mevcut tek kullanımlık yetki sistemini kullanır.
- Başka sekme/cihazdaki sayaç görüntülenir. **Burada devam et** aynı oturumu devralır; eski cihazın geç yazmaları reddedilir. Sayfa yenilendiğinde yerel oturum görevini, kimliğini ve kalan süresini koruyarak duraklatılmış açılır; kullanıcı tıklamadan sürdürülmez. Mola da yenileme sonrasında otomatik başlamaz.
- Çevrimdışı süre cihazdaki kayıt kuyruğunda korunur. Eşitlenmeyen kayıt için küçük durum metni görünür; kart ilerlemesi sunucunun onayladığı kayıttan hesaplanır. Çakışan süre ikinci bir oturum kredisi üretmez.
- Silinen veya erişimi kaldırılmış görevin kişisel süresi Analiz'de korunur; metni gösterilmez ve serbest odak olarak yeniden sınıflanmaz.
- İlk listede 30 görev yüklenir; daha fazlası istekle gelir. Geçmiş de 30 oturumluk sayfalarla açılır. Yenileme, açılmış görev sayfalarını korur .
- Ana sayfa haftalık kartı özet RPC kullanır. Analiz odak grafiğinin altında bağlı/serbest/erişilemeyen görev süreleri görünür. Ayrıntı listesinin genel sayfalaması sonraki ölçeklenme paketindedir.

## Görsel kullanım kontrolü

Bu ortamda bağlı tarayıcı bulunmadığı için gerçek ekran incelemesi yapılmadı. Kurulumdan sonra açık/koyu tema, dar/geniş ekran, menünün klavye okları ve iki hesap/iki cihaz senaryolarını kontrol et. Oturum başlatma, duraklama, yeniden yükleme, görev geçişi, yetkiler, sayfalama ve SQL uzlaştırması yerel otomatik testlerle doğrulanır.
