# Proje incelemesi ve uygulama sırası

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
