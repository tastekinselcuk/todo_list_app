# Proje incelemesi ve uygulama sırası

## Oturum ve güvenlik — 23 Ekim 2026

- **Oturum:** aynı origin'deki sekmeler için ortak IndexedDB deposu, eski local/session kaydından geçiş, çıkış sonrası eski yedeği engelleme, tek başlangıç isteği ve SDK'nın token yenileme/sekme eşitlemesi. Depolama kullanılamıyorsa kalıcılık uyarısı. Google/GitHub girişinde PKCE; parola doğrulaması ayrı, geçici istemcide.
- **Üretim tarayıcı koruması:** Netlify CSP, çerçeveleme engeli, MIME/referrer/izin başlıkları; gereksiz Tailwind ve Font Awesome CDN çağrıları kaldırıldı. DOMPurify 3.4.17, selector-parser 6.1.5 güvenlik yamaları; ana sürüm geçişi yok. npm audit dört orta seviye stil zinciri uyarısı bildirmeye devam ediyor; upstream duyurusu 6.1.5'i yamalı sayıyor. [Duyuru](https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf).
- **Hazır sunucu bütçesi:** `202610230001_api_budgets.sql`; kullanıcı başına Data API yazmalarında 240/dakika, kısa pencerede 80/10 saniye. Edge fiyat uç noktasında 20/dakika, e-posta hatırlatmasında 30/dakika. Sayaçlar sunucuda ortak ve atomik; istemci sıfırlayamaz. Aşım 429 + Retry-After. Kullanıcı kimliği JWT doğrulamasından gelir. İki Edge uç noktasının istek gövdesi byte olarak sınırlandırılır.
- **Canlıya geçiş sırası:** önce migration; sonra `finance-prices` ve `send-periodic-reminder` deploy; sonra frontend deploy. Migration başka bir `db_pre_request` hook'u varsa onu ezmek yerine işlemi durdurur; mevcut hook ile birleştirme gerekir. Henüz canlı yapılandırma/deploy yapılmadı.
- **Sınır:** bu bütçeler WAF/DDoS koruması değildir. PostgREST GET/HEAD ve read-only RPC işlemleri sayaç yazamaz; başarısız DB işlemlerindeki sayaç değişikliği de geri alınır. Auth, Storage ve Realtime ayrı koruma ister. IP/okuma limitleri ve başarısız istek bütçesi gateway katmanında uygulanmalı. [Data API güvenliği](https://supabase.com/docs/guides/api/securing-your-api).
- **Kayıt gerçeği:** not/kod/görev mutasyonları sunucu yanıtından sonra başarılı sayılır. Cihaz snapshot'ı hızlandırma içindir. Tercihler ve odak kuyruğu bekleyen değişiklik tutabilir; bunlar sunucuya ulaşmadan site verileri silinirse kaybolur. Sadece HTTP cache temizlemek site verilerini silmekle aynı değildir. Redis kalıcı veri deposu veya tarayıcı kuyruğu yedeği sayılmaz.

Sıradaki adımlar:
1. **Yayın doğrulaması:** aynı origin'de iki sekme, F5, token yenileme, yerel/tüm cihazlardan çıkış; iki ayrı hesapla RLS/Storage/arama/çöp paylaşım testleri. JWT süresi/refresh rotation ayarlarını Supabase'de doğrula; access token çıkıştan sonra süresi dolana kadar geçerli kalabilir. [Oturumlar](https://supabase.com/docs/guides/auth/sessions).
2. **Bot ve yoğun trafik:** Supabase Auth rate limitleri; Turnstile site/secret kurulumu ve giriş/kayıt/reset formu entegrasyonu birlikte. IP ve okuma limitleri için doğrudan Supabase erişimini de kapsayan gateway planı; sadece Netlify sayfasını sınırlamak yeterli değil. Trafik ve 429 oranına göre eşikleri ayarla. [Auth limitleri](https://supabase.com/docs/guides/auth/rate-limits), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).
3. **Güvenilir hızlı kayıt:** önce ekranda bekleyen durum, tekil işlem kimliği, yeniden deneme ve sürüm çakışması; sunucu onayında kaydedildi. Kuyruk kullanıcı/workspace kapsamlı; kasa parolaları ve açık gizli içerik çevrimdışı kuyruğa alınmaz. Yüksek değerli kayıtta server-first korunur. Henüz bütün modüller offline-first yapılmadı.
4. **İşletim:** yetki regresyonları, bağımlılık denetimi, kişisel veri içermeyen hata/limit metrikleri, yük testi ve yedekten geri yükleme tatbikatı. HTTP-only oturum istenirse tokenların tarayıcıya verilmediği ayrı BFF mimarisi gerekir; mevcut SPA deposunu cookie'ye çevirmek tek başına yeterli değildir.

12 Ekim 2026 — Kaynak kod, sorgular, migration'lar, bağımlılıklar ve üretim derlemesi incelendi. Canlı trafik, Supabase işletim ayarları ve gerçek cihaz gecikmeleri henüz ölçülmedi.

## Bu tur tamamlanan

- Geniş ekran, Pomodoro konumu, tema, dil ve sayaç süreleri tek kullanıcı tercih yapısında toplandı.
- Kullanıcıya özel yerel kayıt anında güncellenir; değişen alanlar 400 ms içinde birleştirilerek sunucuya gönderilir. Çevrimdışı değişiklikler sonraki bağlantı/girişte yeniden denenir.
- F5 ve çıkış/giriş tercihleri silmez. Farklı hesaplar ayrılır; geç gelen yanıtlar yeni hesabı veya yeni değişiklikleri ezmez.
- Sunucu kaydı kullanıcıya özel RLS ve doğrulanan, alan bazında birleştiren RPC kullanır. Cihazlar arası eşitleme için [tercih migration'ı](supabase/migrations/202610120002_user_preferences.sql) Supabase SQL Editor'da bir kez uygulanmalı.
- Etkin modüller ve çalışma alanına özel taslaklar kendi kapsamlarında kalır. Tercihler aktif sayacı otomatik başlatmaz.

## Öncelikli işler

1. **İstemci sorgu önbelleği:** Kullanıcı/çalışma alanı/koleksiyon/filtre/sayfa anahtarlarıyla ortak cache; aynı anda aynı sorguyu tek istekte birleştirme. Sekmeye dönüşte mevcut veriyi göster, yalnız eski veriyi yenile. Yazma ve paylaşım yetkisi değişiminde ilgili kayıtları geçersizleştir; hesap değişiminde önceki hesabın verisini kapat.
2. **Notları anında gösterme:** Ekleme/düzenlemeyi sunucu yanıtını beklemeden arayüze yansıt; geçici kimlik ve bekleyen kayıt durumu kullan. Hata halinde taslağı koru, tekrar deneme sun; sürüm çatışmasında sessizce üzerine yazma. Redis tek başına bu kullanıcı deneyimini sağlamaz.
3. **Ana sayfa ve listeler:** Ana sayfa bugün etkin modüllerin tüm kayıtlarını yüklüyor; sayı ve birkaç örnek dönen özet RPC'ye geç. PomoNotes dışındaki büyük listelerde sunucu sayfalaması/arama yaygınlaştırılmalı. İndeksleri gerçek sorguların EXPLAIN sonuçlarıyla seç.
4. **Ağ trafiği:** Ortak koleksiyon için tek abonelik, değişiklikle yenileme, gizli ekranlarda seyrek kontrol ve yeniden bağlantıda uzlaştırma. Sayaç sahipliği için gerekli heartbeat korunmalı; context/record çağrılarının atomik tek RPC'de birleştirilmesi değerlendirilmeli. Lease süresini değiştirmeden heartbeat kapatılmamalı.
5. **Paket boyutu:** Son derlemede ana JS yaklaşık 735 KB, kod sekmesi 1,50 MB (gzip 231/491 KB). Tam highlight.js yerine desteklenen dilleri yükle; düzenleyiciyi açıldığında getir. Mobil cihazda açılış ve etkileşim sürelerini karşılaştır.
6. **Üretim takibi:** Merkezi hata kaydı, işlem/sorgu süreleri, başarısız RPC oranı ve dışarıdan erişilebilirlik kontrolü ekle. Token, özel not ve kasa içeriği loglanmamalı. Kodda merkezi üretim hata takibi bulunamadı.
7. **Dağıtım güvenliği:** Otomatik test/build, staging ve şema tipleri ekle. Mevcut şemadan baseline çıkar; sonraki değişiklikler sıralı artımlı migration olsun. Yeni kurulum ve mevcut veriden yükseltme ayrı doğrulansın; eski SQL dosyaları rastgele yeniden çalıştırılmasın.
8. **Kesinti/veri güvenliği:** Canlı yedekleme, geri yükleme denemesi ve gerekiyorsa PITR doğrulanmalı. Ağ zaman aşımı ve sınırlı yeniden deneme; yazmalarda idempotency uygulanmalı. Çevrimdışı not kuyruğu gerekiyorsa IndexedDB kullan; kasa verisini açık metin saklama.
9. **Hatırlatmalar:** E-posta gönderimini sunucu zamanlayıcısı/kuyruğa taşı; kullanıcı saat dilimi, gönderim tekilleştirme ve gecikmiş denemelerle çalıştır. Açık tarayıcıya bağlı çalışma, uygulama kapalıyken hizmet garantisi vermez.
10. **Bakım ve premium:** Büyük ortak todo store'unu aşamalı olarak modüllere ayır. Premium hakları sunucuda doğrulansın; ödeme webhook'ları tekrar işlendiğinde çift işlem üretmesin. Güncel audit 8 bildirim içeriyor (5 yüksek, 3 orta), ağırlık stil/derleme zincirinde; erişilebilirliği inceleyerek uyumlu güncelle, force kullanma.

## Redis kararı

- **İlk aşama:** İstemci cache'i + anında arayüz güncellemesi + özet sorgular + sayfalama. Bunlar mevcut gecikmelerin kaynağına daha doğrudan müdahale eder.
- **İkinci aşama:** Ölçümler tekrarlanan pahalı okumaları gösterirse analiz özetleri ve ortak dış servis katalogları için Redis değerlendir.
- Redis sunucu katmanında kalmalı. Kullanıcı/kolleksiyon/yetki/veri sürümü kapsamını koru; erişimi cache yanıtından önce doğrula. Süre sınırı ve yazma sonrası geçersizleştirme kullan. Cache boşsa veya Redis erişilemiyorsa veritabanına dön.
- Notların asıl kaydı Postgres'te kalır; Redis arızası not ekleme/kaydetmeyi durdurmamalı. Tasarım referansı: [Redis cache-aside](https://redis.io/docs/latest/develop/use-cases/cache-aside/).

## Doğrulama hedefi

- İlk görünür içerik ve işlem yanıt süresi; p95 sorgu süresi, istek/dakika, yanıt boyutu ve hata oranı ölçülmeli.
- Boş hesap, 1.000+ not, uzun odak geçmişi, iki kullanıcı/sekme, yavaş ağ ve çevrimdışı senaryolarla önce/sonra karşılaştır.
- Önerilen sıra: **cache ve anında kayıt → özet/sayfalama → ağ/paket küçültme → üretim/dağıtım dayanıklılığı → ölçüm gerekirse Redis**. Üretim takibi ve yedek doğrulaması yayına çıkıştan önce tamamlanmalı.

## Ortak arama — 12 Ekim

- Tek giriş: genişletme ikonunun yanındaki arama ve Ctrl/⌘ K. Mevcut çalışma alanındaki etkin sekmelerde içerik aranır; sonuçlar sekmelere göre önizlemeyle gruplanır, ilgili kayıt/deste/program açılır.
- Sunucuda alan listesi ve koleksiyon yetkisi kontrolü; güvenli kasa, şifre alanları, kod gövdesi, URL ve dış servis metadata'sı hariç. Normal not içeriğinde elle yazılmış her sırrı otomatik sınıflandırma garantisi yoktur; belirgin şifre/anahtar etiketleri maskelenir.
- Kurulum: [arama migration'ını](supabase/migrations/202610120003_workspace_search.sql) mevcut şemaya SQL Editor'da bir kez uygula. İstemci eski/eksik kurulumda anlaşılır durum gösterir; sonuçlar cihaz depolamasına yazılmaz.
- Tasarım referansları: [Todoist ortak arama](https://www.todoist.com/help/todoist/features/introduction-to-search-fAfiDSAp), [Obsidian içerik araması](https://obsidian.md/help/plugins/search), [Notion kaynaklı yanıtlar](https://www.notion.com/help/enterprise-search).
- Kullanıcının tercihiyle AI sağlayıcısı sonraya bırakıldı; bu sürümde AI menüsü veya dış sağlayıcıya veri gönderimi yok. Sonraki aşamada aynı izinli alanlar, kesin SQL adetleri, kaynak bağlantıları ve örneklem kapsamı açıkça belirtilen yanıtlar kullanılmalı.

## Finans

- Üstte hızlı giriş: tutar + gelir/gider; bugün varsayılan, tarih ikonla açılır. Kategori/açıklama yok. Yatırım: araç + miktar + alış fiyatı; büyük özet kutuları ve ayrı ekleme butonu kaldırıldı.
- Dönem neti hesap bakiyesi değildir. Varlık alımı bütçeye otomatik gider yazmaz; fark mevcut kayıtlara ait gerçekleşmemiş değişimdir.
- Analiz: 12 aylık nakit akışı, gelir/gider ve mevcut yatırım dağılımı. Eksik fiyatlar sıfır/zarar sayılmaz; eski fiyatlar belirtilir. Geçmiş portföy değerleri uydurulmaz.
- Tek para birimi/çalışma alanı; kayıt varken değiştirilmez. Postgres numeric hesaplar, sayfalama, sürüm kontrolü ve aynı UUID ile güvenli yeniden gönderim.
- Finans arama ve paylaşım dışında; erişim SQL'de kullanıcı ve çalışma alanıyla doğrulanır. Özel kayıtlar tarayıcı depolamasına veya fiyat sağlayıcısına gönderilmez.
- Kurulum: mevcut [finans migration'ı](supabase/migrations/202610120005_finance.sql) üzerine [tekrar/piyasa güncellemesi](supabase/migrations/202610130001_finance_recurring_market.sql); sonra `finance-prices` kodunu yeniden deploy et (`--no-verify-jwt`). Fonksiyon kullanıcı token'ını Auth ile doğrular; service-role yalnızca sunucunun public fiyat cache'ine erişir.
- Tekrarlı gelir/gider: haftalık, aylık, yıllık; isteğe bağlı kısa ad. Ay sonu/29 Şubat korunur, dönem başına unique kayıt; tekrar denemede çoğalmaz. Tutar değişikliği geçmişe işlemez; duraklat/devam et/kaldır geçmiş kayıtları korur. Supabase Cron'u etkinleştirip migration'ı uygularsan saatlik arka plan işi kurulur; cron yokken finans/analiz açılışında eksikler tamamlanır. Gelecek vadeler gerçekleşmiş gelir/gidere katılmaz. Referans: [Lunch Money tekrarlı kayıtları](https://support.lunchmoney.app/getting-started).
- [Hesaplı Altın](https://hesaplialtin.com/altin-fiyati-api): ücretsiz anahtar `HESAPLI_ALTIN_API_KEY`, 60 istek/dakika; bir istek tüm yerel döviz ve altın/gümüş fiyatlarını getirir. Gram altın 24/22 ayar, gümüş ve çeyrek/yarım/tam/ata adet bazında; yerel alış (bozdurma) fiyatı. Yeni yatırım seçeneklerinin tamamı API desteklidir; eski manuel kayıtlar korunur.
- [Gold API](https://gold-api.com/docs): anahtarsız spot altın/gümüş/platin/paladyum; USD/troy ons ÷ 31,1034768 = USD/gram. Diğer para birimine dönüşümde kaynak ve en eski fiyat zamanı korunur; günlük FX kullanılan değerler açıkça “Referans”. [CoinGecko Demo](https://docs.coingecko.com/demo/reference/simple-price) anahtarı `COINGECKO_DEMO_API_KEY`; anahtarlar tarayıcıya girilmez.
- İstekler toplu, ortak fiyat cache'i: piyasa 1 dakika, kripto 5 dakika, günlük FX fallback 6 saat. Yeni canlı anahtar referans cache'ini yükseltir; eski fiyat günceli ezmez. Piyasa kapalıysa son gerçek zaman damgası korunur. Sürekli polling yok; sağlayıcı bekleme toplam 15 saniye ile sınırlı. Referans: [Actual Budget raporları](https://actualbudget.org/docs/reports/custom-reports/).
- [Frankfurter](https://frankfurter.dev/) anahtarsız günlük döviz referansı; [CoinGecko Demo](https://www.coingecko.com/en/api/pricing) $0, 10.000 çağrı/ay, 100/dakika ve kaynak belirtme şartı. Ticari yayında veri lisansı ayrıca kontrol edilir.
- Önceki dağıtım 500 sorunu kullanıcı tarafından Dashboard deploy ile aşıldı. Yeni SQL ve yeni fonksiyon kodu henüz canlıya uygulanmadı; bu güncellemede eski çalışan endpoint değiştirilmedi.

## Gelişmiş Takvim ve Planlama — 22 Ekim 2026

### Karar ve mevcut durum

- Öneri: mevcut Takvim alanını büyüt; yeni uygulama kabuğu veya ayrı proje yöneticisi oluşturma. Liste, Kanban ve Takvim aynı görevleri kullanmaya devam etsin. Yeni yetenekler aşamalı açılsın.
- Gerçek kod: Vue 3/TypeScript, Pinia, FullCalendar **6.1.22**, Supabase Auth/Postgres/RLS ve Edge Functions. Kütüphane yükseltmesi bu çalışma için gerekli değil. `WorkCalendar`, `WorkEditor`, `TaskRow`, `CustomSelect`, mevcut sidebar ve tema tokenları yeniden kullanılabilir.
- `work_projects` proje adı/arşiv; `work_tasks` durum, öncelik, son gün, süre tahmini ve kontrol listesi; `work_blocks` saatli çalışma/etkinlik kaydı tutuyor. Son tarih ile ayrılan çalışma süresi zaten ayrı. Takvim yalnızca görünür tarih aralığını, görev listesi sayfalı kayıtları alıyor.
- Eksikler: harici hesap/OAuth/senkronizasyon yok; görev ve takvim tabloları kişisel. Mevcut not koleksiyonu paylaşımı bu tablolara otomatik erişim sağlamıyor. Bağımsız alt görev, atanan kişi, yorum, bağımlılık, kilometre taşı ve takvim etkinliği tekrarı yok. Kontrol listesi bir ekip alt görevi değildir.
- Bulunan görüntü hataları: önceki varsayılan 08–20 aralığında gizli saatlere kaydırarak ulaşılamıyordu; genişlik animasyonu takvimin ölçümünü yenilemiyordu. Onarım: 00–24 aralığı daima oluşturulur, çalışma saatleri yalnız vurgulanır; gerçek grid genişliği RAF ile birleştirilerek yeniden ölçülür. Dış belge scroll'u korunur, ikinci dikey scrollbar eklenmez; gizlenen takvimin gözlemcisi durur.
- Bu tur Aşama 0 uygulandı: takvim/görev/navigasyon/sidebar kapsamındaki 60 otomatik kontrol geçti; gerçek FullCalendar DOM testinde son 23:30 satırı ve doğal yükseklik doğrulandı. Canlı tarayıcıda 390–1440 px görsel inceleme yapılmadı. Aşağıdaki yeni entegrasyon ve ekip kapsamı, kullanıcının ekindeki araştırma → değerlendirme → geliştirme sırasına göre ürün/mimari önerisidir; çalışan entegrasyon olarak sunulmamalı.

### Referanslardan doğrulananlar ve özellik farkları

Resmi belgeler incelendi; giriş yapılmış ürün içinde canlı kullanım testi yapılmadı. İngilizce ana Notion belgesinin giriş cümlesi Apple/Google derken, aynı belgenin Outlook bağlantı/tekrar/delege bölümleri ve güncel ürün sayfası Outlook desteğini açıklıyor. Eski yerelleştirilmiş sayfalara dayanarak “Outlook desteklenmiyor” sonucu çıkarılmamalı. [Notion yönetim belgesi](https://www.notion.com/help/manage-your-calendars-and-events), [güncel ürün sayfası](https://www.notion.com/product/calendar).

Tabloda **D** doğrudan belgede doğrulananı, **T** ayrıca ürün testi gerektireni gösterir. Son sütun PromptVault önerisidir; rakibin özelliği olduğu iddiası değildir. Zorluk: düşük/orta/yüksek.

| Yetenek / referans | Doğrulanan davranış | PromptVault karşılığı ve faydası | Bağımlılık · zorluk · sıra |
| --- | --- | --- | --- |
| Hesaplar — Notion D | Google, iCloud, Outlook | Önce çoklu Outlook hesabı; tek program görünümü | Entra/OAuth · yüksek · P1 |
| Takvim seçimi — Notion D | Gizleme, renk, varsayılan takvim | Hesap altında checkbox; Tümü / Yalnız bunu / seçimleri hatırla | Hesap/takvim modeli · orta · P1 |
| Hızlı oluşturma — Notion D | Boş zaman seçimi | Başlık + zaman; gelişmiş alanlar sonradan açılır | Mevcut editör · düşük · P0 |
| Taşıma — Notion D | Seçilen etkinlikleri sürükleme | Yerel blok sürükleme zaten var; harici yazmada güvenli geri dönüş | Sağlayıcı yazma izni · orta · P1 |
| Süre değiştirme — Notion T | Ayrıntılı sınırlar canlı test ister | Mevcut resize korunsun; başarısız yazma geri alınsın | Mevcut `saveMove` · düşük · P0 |
| Tekrarlı etkinlik — Notion D | Outlook örneği/gelecek seri düzenleme | Önce görüntüle; sonra tek örnek/tüm seri; geleceği ayırma ayrı iş | Seri/istisna modeli · yüksek · P1 |
| Görünümler — Notion D/T | Hafta/ay gezinme; mobil 1–3 gün | Gün/hafta/ay/ajanda mevcut; gerekirse 3 gün ekle | Aynı olaylar · düşük · P0 |
| Kopyalama — Notion T | İncelenen metinler yeterli değil | Gerekirse “Kopyasını oluştur”; davet otomatik gönderilmesin | UUID ve seri kapsamı · orta · P1 |
| Notlar — Notion D | Sayfa ve tarihli veritabanı ilişkisi | Toplantıya özel not bağlantısı; içerik dışarı aktarılmaz | Yetki kontrollü ilişki · orta · P1 |
| Müsaitlik — Notion D | Tek seferlik/tekrarlı bağlantı | Önce kişisel müsaitlik; rezervasyon ayrı adım | Güvenilir sync · yüksek · P2 |
| Saat dilimi — Notion D | Birincil/ikincil ve geçici dilim | Önce IANA dilimi + ikinci saat cetveli | DST testleri · orta · P1 |
| Davetler — Notion D | Katılımcı, yanıt ve konum | Önce salt görüntüleme; gönderme etkisi açık yazma eylemi | Organizatör yetkisi · yüksek · P1 |
| Görüşme — Notion D | Meet/Teams/Zoom bağlantıları | İlk olarak güvenli bağlantıyı aç; oluşturma sağlayıcıya bağlı | Sağlayıcı kapasitesi · orta · P1 |
| Klavye — Notion D | Bugün/gezinme/komut kısayolları | Yalnız takvim odaklıyken; input ve Ctrl/⌘ K korunur | Ortak arama · düşük · P0 |
| Bildirim — Notion D | Davet ve varsayılan uyarı ayarları | Tek hatırlatma sahibi; uygulama kapalıyken sunucu işi | Zaman dilimi/kuyruk · yüksek · P1 |
| Mobil — Notion D | Bazı düzenleme/görünüm kısıtları | Ajanda varsayılan; dokunarak düzenleme, sürüklemeye alternatif | Responsive düzen · orta · P0 |
| Görünüm tercihleri — Notion D | Dil, hafta başlangıcı, hafta sonu | Hesap tercihleri; seçilen takvim kimlikleri kullanıcıya özel | Mevcut preferences · düşük · P0/P1 |
| Senkronizasyon — Notion T | İç mekanizması belgelerden bilinmiyor | Graph değişiklik takibi; hata/son eşitleme görünür | Webhook/delta/yenileme · yüksek · P1 |
| Ekip — Notion D | İzinli ekip takvimini ekleme, 1:1 | Takım projesi ve kişisel takvim erişimi ayrı | Proje üyeliği/RLS · yüksek · P2 |
| Toplu işlemler — Notion D | Çoklu seçim ve taşıma | Önce tek kayıt doğruluğu; sonra toplu taşıma | İşlem grubu/geri alma · yüksek · P2 |

Diğer Notion bulguları: [not bağlantıları ve özel varsayılan](https://www.notion.com/help/use-notion-calendar-with-notion), [müsaitlik](https://www.notion.com/help/availability-blocking-and-time-zones), [saat dilimleri](https://www.notion.com/help/time-zones), [bildirim/tercihler](https://www.notion.com/help/notion-calendar-settings), [mobil sınırlar](https://www.notion.com/help/notion-calendar-apps), [ekip akışı](https://www.notion.com/help/notion-calendar-for-teams), [komutlar](https://www.notion.com/help/guides/getting-started-with-notion-calendar). Notion Calendar'ın belgelenen [yerel API'si](https://www.notion.com/help/notion-calendar-connections) genel bir takvim senkronizasyon API'si olarak kullanılmamalı.

- **Morgen:** çoklu kişisel/iş takvimi ve görev sürükleyerek zaman ayırma değerli. Önerimiz: planlanmamış işler paneli, son tarihleri zaman bloğuna dönüştürmeden ayrı göstermek. [Hesaplar](https://www.morgen.so/guides/connect-your-work-and-personal-calendars), [entegrasyonlar](https://www.morgen.so/integrations).
- **Sunsama:** görev listesiyle takvimi yan yana tutar; Outlook değişiklikleri iki yönde eşitlenir. Önerimiz: takvimden kopmadan gün planı, tahmin ile gerçekten ayrılan süreyi ayırmak. [Resmi Outlook akışı](https://www.sunsama.com/integrations/outlook-calendar).
- **Linear:** proje kilometre taşları ve bitiş→başlangıç bağımlılıkları. Önerimiz: önce atama/yorum/durum, sonra bağımlılık; tarih kaydırmalarını önizleyerek uygulama. Kritik yol ilk sürüm için gerekli değil. [Kilometre taşları](https://linear.app/docs/project-milestones), [bağımlılıklar](https://linear.app/docs/project-dependencies).
- **Todoist:** görev ve takvim entegrasyonu iyi karşılaştırma; tüm hesap/takvim yeteneklerinin aynı olduğu varsayılmamalı. [Resmi entegrasyon rehberi](https://www.todoist.com/help/articles/use-the-calendar-integration-rCqwLCt3G).

### Önerilen ekran ve kullanıcı akışları

- Global sidebar/nav korunur. Takvimin iç bağlam paneli masaüstünde 200–224 px, kapatılabilir; mini ay seçici ve hesap/takvim listesi. Orta takvim kalan genişliği kullanır; gün ayrıntısı/görev paneli gerektiğinde 240–280 px açılır. Dar ekranda iki yan panel birlikte açık kalmaz. Ek istatistik kartları yok.
- Üstte tek satır tarih, Bugün, görünüm, filtre ve Yeni etkinlik. Etkinlik seçimi okunabilir ayrıntı paneli; hızlı oluşturma küçük form, geniş ayrıntı mevcut odaklı editör desenini kullanır. Mobilde ajanda/gün ve alttan açılan ayrıntı; hiçbir iş yalnız hover/sürükleme ile yapılmaz.
- **İlk Outlook bağlantısı:** Bağlantılar → Microsoft hesabına yönlendirme → izin → hesap/takvim listesi → gösterilecekleri seç. Yalnız okuma durumu kilitle belirtilir. Kurulum eksikken çalışan gibi duran bağlan düğmesi eklenmez.
- **Oluşturma:** boş saat → başlık → yazılabilir hedef takvim → Kaydet. Kişisel görev bloğu varsayılan olarak PromptVault'ta kalır; Outlook'a yayınlama açık seçimdir.
- **Taşıma/resize:** önce yerelde hareket; tek sunucu yazması; yetki/çakışan sürüm/ağ hatasında geri al ve kısa açıklama. Toplantı taşımak davetlilere güncelleme gönderebilir; bu etki basit görev bloğuyla aynı kabul edilmez.
- **Filtre:** bir veya birkaç takvim seçilir; yalnız o takvimlerin etkinlikleri görünür. Bir takvimi gizlemek etkinlik silmez. Varsayılan yazma hedefi görünürlükten ayrı tutulur. Gizli ancak çakışma kontrolüne katılan takvimler açıkça belirtilir.
- **Görev planlama:** aynı görevin birden fazla çalışma bloğu olabilir. Son tarih ayrı, blok ayrı, gerçek Pomodoro süresi ayrı. Bloğu silmek görevi tamamlamaz/silmez.
- **Not ve odak:** toplantıdan mevcut notu aç veya yeni özel toplantı notu oluştur. PomoNotes görev bağlantısı yalnız açık eşleştirmeyle; takvim planı kendiliğinden sayaç başlatmaz veya odak istatistiğine yazılmaz.
- **Çakışma/müsaitlik:** önce uyarı ve uygun boşluk önerisi. Dış toplantıyı otomatik değiştirme yok. Rezervasyon bağlantıları ancak yetki ve senkronizasyon güvenilirliği tamamlanınca.

### Veri, sağlayıcı ve güvenlik yaklaşımı

- Mevcut `work_tasks` ve `work_blocks` korunur. İlk şema ekleri: tüm-gün tarih aralığı (bitiş hariç), açıklama/konum; tekrar için seri kuralı + istisnalar. Tüm-gün kaydını UTC gece yarısı saatli etkinliğe çevirme.
- Sonraki yeni kavramlar: kullanıcıya ait `calendar_accounts`, bu hesaba ait `calendars`, sağlayıcı olay önbelleği, takvim/aralık bazlı sync cursor ve yazma kuyruğu. Bunlar önerilen modellerdir, bu tur oluşturulmadı. Kaynak kimliği `(account, calendar, provider_event_id)`; seri örneğinde özgün occurrence anahtarı. Başlık/tarihe göre tekilleştirme yapılmaz.
- Dış olayın aslı sağlayıcıda; kopya yerel görev oluşturulmaz. Yerel bloğun Outlook izdüşümü ayrı ilişkiyle izlenir. Entegrasyon görünürlüğü kişisel; workspace veya proje üyeliği OAuth erişimi sağlamaz.
- **Outlook ilk sağlayıcı:** Graph `calendarView` ile aralık bazlı örnek/istisna okuma; izinli `PATCH` ile taşıma/resize. Okuma/yazma ve `canEdit` ayrılır. Bağımsız çoklu Microsoft hesabı ayrı OAuth bağlantılarıdır; mevcut Supabase girişini değiştirmez. [Aralık okuma](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0), [olay güncelleme](https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0), [takvim yetenekleri](https://learn.microsoft.com/en-us/graph/api/resources/calendar?view=graph-rest-1.0).
- Sunucu callback + authorization code/PKCE, tek kullanımlık süreli state; server-only şifreli token saklama/yenileme, hesap sahipliği kontrolü. Scope yalnız gereken takvim erişimi; ortak/delege takvim izni ayrı değerlendirilir. Entra uygulama kaydı, izin politikası, production/localhost callback adresleri ve sunucu secret/key kurulumu gerekir. Anahtarlar istemciye veya sohbete girilmez. [Microsoft OAuth](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
- **Sync:** görünür aralığı getir; aynı aralıktaki uçuşan istekleri birleştir; kullanıcı/takvim/aralık/sürüm kapsamlı kısa cache. Graph delta her takvim ve aralık için ayrı; webhook yalnız değişti sinyali, ardından yetkili veri okuma. Her takvim/delege yolunun v1.0 kapasitesi doğrulanır; desteklenmeyen yola beta davranışı varsayılmaz. `nextLink` sayfaları tüketilir; token geçersizleşince kontrollü yeniden eşitleme. [Delta](https://learn.microsoft.com/en-us/graph/delta-query-events), [bildirimler](https://learn.microsoft.com/en-us/graph/change-notifications-overview).
- Retry: 429 `Retry-After`, artan bekleme/jitter, sınırlı deneme; hesap/takvim bazlı kilit, idempotent oluşturma, revizyon/ETag çakışmasında otomatik üzerine yazmama. Refresh token yenilenmesi atomik; bağlantıyı keserken işler iptal, tokenlar silinir. Provider URL/cursor sunucuda allowlist ile doğrulanır. Sırlar/özel notlar loglanmaz. [Graph sınırları](https://learn.microsoft.com/en-us/graph/throttling).
- **Google sonra:** ayrı OAuth kapsamları, `syncToken`, push kanalını yenileme ve token geçersizliği sonrası yeniden sync. [Google senkronizasyonu](https://developers.google.com/workspace/calendar/api/guides/sync).
- **iCloud sonra:** desteklenen Apple yetkilendirmesi uygunluğu ayrıca araştırılmalı; CalDAV/app-specific credential seçeneği ayrı güvenlik ve sunucu adaptörü gerektirir. Birincil Apple parolası istenmez. ICS dosya importu abonelik/çift yönlü sync değildir; URL aboneliği için SSRF koruması gerekir. [Apple yetkilendirmesi](https://support.apple.com/en-us/102654).
- **Ekip:** kişisel workspace modelini sessizce değiştirme. `project_members` ile owner/editor/viewer ve isteğe bağlı assignee; görev/blok/RPC/arama/çöp/analiz her okumada proje yetkisini denetler. Projeden çıkarma anında erişimi keser. Not, kasa ve finans bu üyelikten erişim kazanmaz. Diğer kişinin takviminde yalnız izin verilen ayrıntı veya meşgul aralığı gösterilir.
- Ekip için kritik mevcut sınır: görev→proje ve blok→görev ilişkileri `workspace_id` içeren birleşik FK kullanıyor. Öneri: mevcut not paylaşımına benzer açık proje bağlama; kişisel alanda paylaşılan projeye referans, kaydın asıl alanı değişmez. Kişisel çalışma bloğunu paylaşılan göreve bağlamak için yetkisi sunucuda doğrulanan ilişki gerekir; görevleri katılımcıların alanlarına kopyalama çözüm değildir. Aktör/atanan kişi ile kaydın sahibi ayrı tutulur. Workspace silme/arşiv/üyelikten çıkma akışları da bu ilişkilere uyarlanmalı; mevcut cascade davranışı üzerinde ekip paylaşımı doğrudan açılmamalı.
- İlk aşamada Postgres + mevcut Edge Functions + gereken zamanlayıcı yeterli. Redis ve ayrı worker ancak ölçülen kuyruk yükü gerektirirse. Takvim kaynakları ve OAuth içerikleri cihaz `localStorage` önbelleğine yazılmamalı.

Otomasyon önerileri (P2): seçili işleri uygun boşluklara yerleştiren önizleme; ertelenen çalışma bloklarına yeniden plan önerisi; toplantı öncesi/sonrası tampon; yaklaşan kilometre taşında sorumluya tek bildirim; günlük tahmin/toplantı/boş süre karşılaştırması; tekrarlanan proje kontrol listesi şablonu. İlk algoritma süre, çalışma saati, sabit toplantı ve önceliklerle deterministik çalışabilir; LLM şart değil. Bağlı dış toplantıları sessizce taşımaz. Bağımlılık değişikliğinde etkilenen işler/tarihler önce gösterilir; döngüler reddedilir, toplu değişiklik geri alınabilir.

**Outlook kurulum durumu:** kullanıcı Entra uygulama kaydı olmadığını doğruladı. Aşama 2 başında Entra App registrations → New registration; kişisel Outlook ve kurum hesapları hedefleniyorsa bu hesap kitlesine uygun kayıt seçilmeli. Sunucuda kod değişimi için Web callback; kesin localhost/üretim dönüş adresleri backend endpoint adıyla birlikte belirlenecek. Application ID/tenant yapılandırması ile secret/şifreleme anahtarı Supabase server secrets içinde tutulur; `VITE_` değişkenine yazılmaz. Kurumsal consent politikası test edilir. Bu kayıt, kullanıcının mevcut PromptVault hesabına yeni giriş yöntemi eklemekten ayrı bir takvim yetkilendirmesidir. [Resmi kayıt adımları](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), [callback kuralları](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url). Google push aboneliğinin ayrıca yenilenmesi gerekir: [resmi push rehberi](https://developers.google.com/workspace/calendar/api/guides/push).

### Küçük, sınanabilir geliştirme sırası

| Aşama | Somut çıktı / kullanılan bileşen | Şema / entegrasyon | Geçiş koşulu ve ana risk |
| --- | --- | --- | --- |
| **0 · Onarım** | `WorkCalendar` tüm saatlere erişim, genişlik ölçümü, akıcı yeniden yerleşim; mevcut dış scroll | Yok | Son saat erişilebilir; geniş/dar/KeepAlive geçişi; istek veya olay çoğalması yok |
| **1 · Yerel temel** | Tüm-gün/çok-gün etkinlik, açıklama/konum, panel gizleme, basit tekrar; mevcut editör/çöp | Artımlı block/seri migration | F5 kalıcılığı; DST/ay sonu/istisna; silme/geri alma; eski kayıtlar korunur |
| **2 · Outlook okuma** | Hesap ve seçili takvim paneli, görünürlük, salt-okunur olay ayrıntısı | OAuth backend + hesap/takvim/cache tabloları | İki hesap, çok takvim, izin iptali, disconnect, sayfalama, token güvenliği |
| **3 · Outlook yazma** | Hedef takvim seçimi, oluşturma/taşıma/resize/silme, seri kapsamı | Sunucu provider adaptörü + outbox/sync işleri | Hata geri dönüşü; duplicate/retry/ETag; 429/401; başka hesaba erişim reddi |
| **4 · Modül bağlantıları** | Plan/hatırlatma katmanları, özel not linki, PomoNotes bağlantısı, termin uyarısı | Kaynak referansı, agenda sorgusu, bildirim kuyruğu | Çift görev/bildirim/odak kredisi yok; yalnız izinli kaynağa geçiş |
| **5 · Ekip/proje** | Atama, gerçek alt görev, yorum, geçmiş, kilometre taşı; aynı liste/board/calendar | Proje üyeleri ve kapsamlı RLS/RPC güncellemesi | Owner/editor/viewer/çıkarılan üye/başka workspace testleri; kişisel takvim sızmaz |
| **6 · Planlama** | Bağımlılık, iş yükü, müsaitlik/rezervasyon, önizlemeli otomasyon | Bağımlılık grafiği ve idempotent zamanlayıcı | Döngü engeli; tarih değişikliği önizleme/geri alma; çifte rezervasyon yarış testi |

P0 = onarım ve kullanılabilir yerel temel; P1 = önce Outlook ve modül bağlantıları; P2 = ekip ve otomasyon. Paralel görünüm eklemekten önce veri/yetki/sync doğruluğu tamamlanmalı. Gantt ve kritik yol, süre/bağımlılık/kapasite bilgileri güvenilir olmadan anlamlı sonuç vermez; FullCalendar kaynak/timeline eklentilerinin lisansı ayrıca incelenir, ücretsiz olduğu varsayılmaz.

### Kabul ölçütleri ve netleştirilecekler

- 00:00–24:00 erişilebilir; dış scrollbar ve klavye ile son satıra ulaşılır. İçte ikinci dikey scroll yok. Aç/kapa/genişlet animasyonu sırasında olaylar yanlış güne kaymaz; reduced-motion tercihine uyulur.
- 390/768/1024/1440 px, light/dark ve mevcut yedi tema ailesi: taşma, kesilen araç çubuğu veya görünmez kontrol yok. Dokunma/klavye alternatifi, okunabilir odak ve ekran okuyucu etiketleri var.
- 500 görünür etkinlik, hızlı tarih değiştirme ve yavaş ağ: eski yanıt yeni aralığı ezmez; genişletme yeni veri sorgusu üretmez. Ağdaki başarısız işlem kaydedildi gibi gösterilmez. p95 etkileşim/veri süreleri gerçek cihazda ölçülür; doğrulanmamış performans vaadi verilmez.
- Yayın öncesi: iki gerçek test Outlook hesabı, kişisel + kurum hesabı, salt-okunur/delege takvim, DST, tekrar istisnası, silme/geri alma, token iptali ve webhook yeniden teslimi denenir. Mevcut otomatik testler canlı sağlayıcı testinin yerine geçmez.
- Karar önerileri: Outlook ilk sağlayıcı; bağlantılar varsayılan özel; dış toplantılara otomatik yazma kapalı; ekip paylaşımı proje bazlı. Uygulama öncesi Entra tenant/hesap kitlesi, callback domainleri ve kurumun consent politikası kesinleşmeli. Ekip projelerinde misafir daveti gerekip gerekmediği ürün kararıdır.
