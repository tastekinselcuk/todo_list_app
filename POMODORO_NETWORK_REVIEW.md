# Pomodoro yenileme davranışı ve ağ trafiği

## F5 neden sayacı başlatıyordu?

`pomodoro.ts` başlangıç kodu `released` olarak kaydedilmiş yerel oturumu bulunca `startTimer(true)` çağırıyordu. Çalışan kayıtlı odak oturumu ve kayıtlı mola da ayrıca çalışır halde geri yükleniyordu. Bu yüzden yalnız duraklatılmış bir sayfa yenilemesi bile otomatik devralmaya dönüşebiliyordu.

Artık yerel kayıt duraklatılmış geri yükleniyor. Normal sayfa kapanışında geçen süre ve duraklatma önce yerel kuyruğa yazılıyor; sayfa tekrar açıldığında bekleyen kayıt eşitleniyor. Kapanış olayı çalışmamışsa son kaydedilmiş kontrol noktası kullanılıyor, sayfanın kapalı kaldığı süre eklenmiyor. Başlatma/devralma yalnız kullanıcı tıklamasıyla yapılıyor. Aynı görev, aynı oturum kimliği ve kalan süre korunuyor. Başka canlı sekmedeki sayaç yansıtılmaya devam ediyor; bu, yerel yenilemenin yeni bir odak başlatması anlamına gelmiyor.

Kapanışta gönderilen asenkron isteğin ulaşacağı varsayılmıyor. Tarayıcılar özellikle mobilde `pagehide` olayını her durumda çalıştırmayabilir; bu nedenle yerel kontrol noktası ve kalıcı kuyruk önemlidir. [MDN pagehide](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event).

## İsteklerin kaynakları

Koddan çıkarılan olağan aralıklar aşağıda. Bunlar canlı trafik ölçümü değildir; uygulamanın durumu, paylaşım, görünürlük ve yüklenen liste sayfası sayısı sonucu değiştirir.

| İstek | Kaynağı ve amacı | Mevcut davranış |
| --- | --- | --- |
| `claim_focus_session` | Başlatma/devam/devralma; başka cihazla sahiplik çakışmasını engeller | Kullanıcı işlemiyle; F5 otomatik çağırmaz. Devralma ardından sürdürme iki claim üretebilir. |
| `focus_context` | Aktif oturum, sahiplik, erişim ve başka cihazdaki durum | Sayaç saat döngüsü açıkken yaklaşık 15 saniyede bir; ayrıca başlangıç, görünürlük/online olayları. |
| `record_focus_session` | Geçen süreyi eşitleme, çevrim tamamlanması ve sahiplik süresini yenileme | Çalışan odakta yaklaşık 15 saniyede bir; duraklatma/bitirme gibi değişikliklerde de gönderilir. |
| `pomonotes_page` | Görevler, hedefler ve kullanıcıya ait süre istatistikleri | Açılış, filtre/arama/işlem, onaylanan duraklatma/bitirme ve görünür ekranda 120 saniyelik kontrol. Paylaşımlı koleksiyon dinleyicisi ayrıca değişiklik ve 15 saniyelik uzlaştırma çağırabilir. |
| `sharing_context` | Aktif çalışma alanındaki paylaşım bağları ve yetkiler | Paylaşım altyapısı etkinse global servis yaklaşık 15 saniyede bir; özel Broadcast olaylarında da yeniler. Pomodoro'nun başlatma isteği değildir. |
| `personal_workspace_reminders` | Rutinler için çalışma alanları arasındaki hatırlatmaları kontrol etme | Uygun çalışma alanları varsa global servis yaklaşık 30 saniyede bir. Pomodoro'dan bağımsızdır. |

Önce PomoNotes hem `syncSequence` değişince hem 30 saniyelik kendi döngüsünde listeyi tekrar çekiyordu. Sayaçtaki `syncSequence` istatistik değişmese de başlatma, flush ve uzlaştırma sırasında artıyordu. Ayrıca paylaşılan listelerin ayrı uzlaştırması var. Üst üste gelen bu mekanizmalar, gösterilen Network listesindeki tekrarları açıklıyor.

30'dan fazla görev sayfası yüklenmişse bir `load()` birden fazla `pomonotes_page` çağırabilir; açık sayfaları korumak için tekrar okur. Her Network satırını ayrı kullanıcı eylemi olarak değerlendirmemek gerekir.

## Bu turda azaltılan istekler

- Liste yenileme `syncSequence` değişiminden ayrıldı. Başlatma/normal heartbeat tüm görev listesini yenilemiyor.
- Yeni `taskStatsSequence`, göreve bağlı duraklatma/sonlandırma/tamamlanma kaydı başarıyla eşitlenince listeyi güncelliyor. Çakışan flush işlemleri aynı kaydı tekrar sinyal olarak üretmiyor. Uzak oturumun kullanıcı tarafından kapatılması da listeyi güncelliyor.
- Görünür ekrandaki kişisel liste kontrolü 30 saniyeden 120 saniyeye çıkarıldı. Gizli ekranda veya kayıt/düzenleme sırasında çalışmıyor. Paylaşımlı görev değişiklikleri mevcut Realtime dinleyicisiyle korunuyor.
- Başarısız aynı yazımı hemen ikinci kez gönderen flush tekrarı kaldırıldı. Başarılı eski yazım sırasında oluşan yeni revizyon yine kuyruktan boşaltılıyor.

Örneğin tek sayfalık kişisel listede, durmadan çalışan bir odakta liste için önce yaklaşık 6 okuma/dakika oluşabiliyordu (4 sayaç yenilemesi + 2 liste kontrolü). Normal heartbeat artık listeyi çekmiyor; genel kontrol yaklaşık 0,5 okuma/dakika. Kullanıcı işlemleri ve paylaşım olayları bu hesaba dahil değil. Diğer global servislerin istekleri sürüyor; uygulamanın toplam trafiğinin sıfıra düşeceği söylenemez.

## Sürekli sorgu gerekli mi?

Geri sayımı ekranda göstermek için sorgu gerekmez. Süre zaten tarayıcıdaki deadline üzerinden hesaplanıyor. Her saniye veritabanını okumak veya yazmak gereksizdir.

Çoklu cihaz, bağlantı kopması, bekleyen süre kayıtlarının korunması ve sahiplik çakışmalarının engellenmesi için olaylar yanında sınırlı aralıklarla eşitleme gerekir. Mevcut SQL `record_focus_session` sırasında sahipliği 45 saniye uzatıyor; istemcinin 15 saniyelik kontrol noktası bu yapıyla uyumludur. SQL sözleşmesini değiştirmeden bunu örneğin iki dakikaya çıkarmak iyi bir optimizasyon olmaz. Tarayıcıların arka plan zamanlayıcılarını geciktirebildiği de hesaba katılmalıdır.

Realtime liste/değişiklik bildirimlerini azaltabilir, fakat süre kaydının veritabanına kalıcı yazılması veya sahiplik güvenliği yerine geçmez. Supabase, ölçeklenebilir veritabanı değişiklik bildirimlerinde özel Broadcast kanallarını öneriyor; kanal erişimi ayrıca RLS ile korunmalıdır. [Supabase veritabanı değişiklikleri](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes), [Realtime yetkilendirme](https://supabase.com/docs/guides/realtime/authorization).

## Sonraki mühendislik sırası — henüz uygulanmadı

1. **Tek odak eşitleme RPC'si:** `record_focus_session` ve `focus_context` yerine, revizyonu kaydeden, sahipliği doğrulayan/yenileyen ve güncel durumu aynı yanıtta döndüren atomik bir uç. Aktif odakta iki yerine tek periyodik istek hedeflenir. Eski lease yazımlarını reddetme, idempotency ve kullanıcı/workspace izolasyonu aynı kalır. Sunucu cevaplarındaki saat farkları ve gecikmeler test edilir.
2. **Paylaşım yenilemesini bağlantıya duyarlı hale getirme:** mevcut özel Broadcast kanalı ana kaynak olur; sağlıklı bağlantıda 15 saniyelik genel tarama yavaşlatılır. Bağlantı kesilmesi, yeniden bağlanma, görünür sayfaya dönüş ve yetki değişiminde hemen uzlaştırılır. RLS/RPC yetkilendirmesi her işlemde korunur; UI önbelleği yetki kanıtı sayılmaz.
3. **Tek liste yenileme koordinatörü:** komponent, Realtime ve periyodik kontrol aynı yüklemeyi çoğaltmamalı. Aynı filtre için devam eden okuma paylaşılır; hızlı değişiklikler birleştirilir; filtre/workspace değişince eski sonuçlar uygulanmaz. Kişisel odak istatistikleri için yalnız o kullanıcıya özel bildirim düşünülür; tüm paylaşımlı koleksiyona herkesin odak süresi yayınlanmaz.
4. **Hatırlatma önbelleği:** her 30 saniyede tüm rutinleri çekmek yerine sonraki hatırlatma tarayıcıda hesaplanır; düzenleme/bağlanma/seyrek kontrol sırasında liste yenilenir. E-posta teslimi sunucuda kalır. Tüm çalışma alanları ve saat dilimi davranışı korunmalıdır.
5. **Ölçüm ve kabul:** 25 dakikalık odak, duraklama, gizli sekme, internet kesilmesi, iki cihaz, F5 ve workspace değişimi için HTTP çağrısı sayısı, toplam veri boyutu, gecikme, kuyruk uzunluğu ve doğru kredilenen süre ölçülür. Request sayısının azalması tek başına yeterli değildir; gecikmiş yetki veya kaybolan süre kabul edilmez.

Bu turdaki istemci düzeltmeleri SQL değişikliği gerektirmiyor. Yeni atomik RPC ve yeni kişisel bildirimler ayrı, geriye uyumlu migration ve entegrasyon testleriyle yapılmalı.
