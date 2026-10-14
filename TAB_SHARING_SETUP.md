# Sekme paylaşımını etkinleştirme

PomoNotes kurulduktan sonra yükseltmeleri [POMONOTES_SETUP.md](POMONOTES_SETUP.md) üzerinden yap. Aşağıdaki eski kurulum scriptlerini yeni fonksiyonların üstüne tek başına yeniden uygulama.

Uygulama kodu ve yerel testler hazırdır. Bu çalışma canlı Supabase projesine migration uygulamaz; aşağıdaki kurulum tamamlanınca paylaşım kullanılabilir. Mevcut modül tablolarının zaten kurulu olması gerekir.

## 1. Veritabanı geçişi

**Paylaşım zaten çalışıyorsa:** Yalnızca `supabase/migrations/tab_sharing_permissions.sql` dosyasının tam içeriğini SQL Editor'da çalıştır ve uygulamayı yenile. Bu güncelleme okuma/düzenleme yetkilerini ve herkes için kesin tek kullanımlık davetleri ekler. Mevcut katılımcılar düzenleyici kalır; güncellemeden önce üretilmiş kullanılmamış davetler de düzenleyici yetkisini korur. Onları görüntüleme yetkisine çevirmek için iptal edip yeni link oluştur.

Supabase SQL Editor'da dosyaların **tam içeriğini**, aşağıdaki sırayla çalıştır:

1. `supabase/migrations/workspaces.sql` — çalışma alanları kurulumu daha önce yapıldıysa bunu yeniden çalıştırman gerekmez.
2. `supabase/migrations/tab_sharing.sql` — koleksiyonlar, üyelikler, davetler, yetkiler ve temel not sekmeleri.
3. `supabase/migrations/tab_sharing_modules.sql` — Planlar, Rutinler, Öğrenme, Bilgi Kartları ve Antrenman.
4. `supabase/migrations/tab_sharing_vault.sql` — Güvenli Kasa için şifreli saklama ve paylaşım.
5. `supabase/migrations/tab_sharing_permissions.sql` — görüntüleme/düzenleme yetkileri ve kesin tek kullanımlık linkler.

Her dosya kendi transaction'ı içinde çalışır. Hata alırsan sonraki dosyaya geçme. Geçişten önce mevcut veritabanının yedeğini al; eski notlar ve çalışma alanları korunur. Paylaşım migration'ları yeniden uygulanabilir; tekrar çalıştırırken 2 → 3 → 4 → 5 sırasını koru. Yetki migration'ı her zaman en son uygulanmalıdır.

Bu dosyalarda e-posta değiştirme veya demo kullanıcı ekleme adımı yoktur. Hesap, oturumdaki `auth.uid()` ile belirlenir. SQL Editor'da davet RPC'lerini doğrudan çağırmak yerine uygulamadan giriş yaparak test et.

Kurulum kontrolü (SQL Editor):

```sql
select c.module, count(*) as koleksiyon_sayisi
from public.module_collections c
group by c.module order by c.module;

select p.proname as rpc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('sharing_context', 'create_collection_invite',
    'accept_collection_invite', 'mutate_collection_item',
    'rollover_collection_plans', 'personal_workspace_reminders', 'seal_vault');
```

İkinci sorguda yedi fonksiyon görünmeli. İlk sorguda her mevcut çalışma alanı için on veri sekmesinin kişisel koleksiyonları bulunur. Daha önce bağlanan ortak alanlar ayrıca korunur.

## 2. Realtime ve uygulama

Projenin Realtime servisi etkin olmalı. Migration, `realtime.messages` üzerinde `tab_sharing_broadcast` isimli okuma politikasını ekler. Uygulama private Broadcast kanalları kullanır; veri tablolarını `supabase_realtime` yayınına eklemek gerekmez. Başka Realtime politikaların varsa bunların herkese açık okuma izni vermediğini kontrol et.

Uygulamayı yenile. Ayarlar → **Sekmeler ve araçlar** kartlarında bağlantı ikonları, bölüm başlığında **Paylaşılan sekme ekle** görünür. Sekme anahtarı ile paylaşım ikonu ayrı kontrollerdir. PomoNotes güncellemesiyle Pomodoro kartı da odak görevlerini paylaşabilir; sayaç, hedefler ve oturum geçmişi kişisel kalır.

Broadcast erişimi kesilirse uygulama ortak kayıtları 15 saniyede bir yeniden okur. Düzenleme sırasında taslaklar korunur; düzenleme kapandığında bekleyen değişiklikler alınır. Üyelik kaldırıldığında veri erişimi veritabanında hemen kapanır; ekranın kişisel notlara dönmesi bildirime veya en fazla bir sonraki üyelik kontrolüne bağlıdır.

## 3. Kullanım

**Paylaşan kişi:** İlgili çalışma alanını seç → Ayarlar → sekmenin bağlantı ikonu → davet yetkisini seç → Yeni davet linki → Kopyala. Varsayılan yetki **Yalnızca görüntüleme**. **Düzenleyici** yetkisi ekleme, düzenleme, tamamlama ve silmeye izin verir. Seçeneği sonradan değiştirmek üretilmiş linkin yetkisini değiştirmez; yeni bir davet oluşturmalısın. Bağlantı yalnızca o sekmeyi paylaşır; mevcut kayıtlar ve dönem geçmişi de dahildir. Her yeni katılımcı için yeni bağlantı oluştur.

**Katılan kişi:** Kendi hesabında giriş yap → Ayarlar → Paylaşılan sekme ekle → bağlantıyı yapıştır → hedef çalışma alanını seç → daveti kontrol et → Bağlan. Bağlantıyı tarayıcıda doğrudan açmak da kabul penceresini açar. Paylaşılan sekme hedef çalışma alanında etkinleştirilir. Önceden bulunan kişisel notlar silinmez; bağlantıyı kaldırınca geri görünür.

Davetler yedi gün geçerli ve **tek kabul işlemi** içindir. Kabul tamamlanınca aynı hesap dahil hiç kimse linki tekrar kullanamaz. Erişimi kaldırılan kişinin eski linkiyle geri katılması engellenir. Aynı koleksiyon başka çalışma alanına yeni bir davetle bağlanabilir. Bir sekme zaten başka bir ortak alana bağlıysa önce bağlantısı kaldırılır. Görüntüleyiciler notları okuyabilir ve kopyalayabilir; ortak içeriği değiştiremez. Yetkiler RLS ve yazma RPC'lerinde de doğrulanır. Alan sahibi katılımcı erişimini kaldırabilir, kullanılmamış daveti iptal edebilir veya paylaşımı sonlandırabilir. Mevcut bir katılımcının yetkisini değiştirmek için erişimini kaldırıp yeni yetkiyle davet et.

Link belirli bir e-posta adresine bağlı değildir: kullanılmamış linki elinde bulunduran ve giriş yapmış **ilk kişi** kabul edebilir. Bu nedenle daveti doğrudan hedef kişiye ilet; yanlış kişiyle paylaşılmış kullanılmamış daveti iptal et. Oturumsuz kullanıcılar ortak notlara erişemez. Token veritabanında yalnızca SHA-256 özetiyle saklanır; linkteki token URL fragment'ında yer alır.

Rutinlerin tamamlanması ortak, tarayıcı/e-posta bildirim tercihleri ve gönderim geçmişi kişiseldir. Yeni katılımcının bildirimleri varsayılan olarak kapalıdır. E-posta hatırlatmaları mevcut `send-periodic-reminder` kurulumu üzerinden çalışır; uygulama açıkken kontrol edilir.

Plan dönemleri tüm katılımcılarda aynı koleksiyon takvimine göre hesaplanır. İlk kurulumda saat dilimi `Europe/Istanbul`'dur. Öğrenme, kart ve egzersiz eklemeleri alt kayıtlar üzerinden yapılır; başka bir katılımcının eklediği kaydı dizi güncellemesiyle silmez. Bilgi Kartları'nda başlamış test/oyun kendi başlangıç kartlarıyla sürer, çalışma görünümüne dönüşte güncel deste gösterilir.

## 4. Güvenli Kasa

Mevcut kasaların her birini doğru parolasıyla **bir kez aç**. Uygulama eski kayıtları transaction içinde şifreli biçime taşır. Bu işlem tamamlanmadan Güvenli Kasa daveti oluşturulamaz. Yeni kasalarda parola açık metin olarak veritabanına yazılmaz. Başlık, kullanıcı adı, parola, bağlantı, açıklama ve not içeriği AES-GCM ile şifrelenir; kasa adı ve kayıt zamanları metadata olarak kalır.

Kasa parolasını katılımcıya **davet bağlantısından ayrı** ilet. Bağlantı parola veya şifre çözme anahtarı içermez. Parola değiştiğinde mevcut kayıtlar yeni anahtarla birlikte atomik olarak yeniden şifrelenir; diğer kullanıcıların kasası kilitlenir ve yeni parola gerekir. Anahtar yalnızca bellekte tutulur; sekmeden çıkarken temizlenir. Şifreleme için HTTPS gerekir; `localhost` geliştirme ortamı da desteklenir.

Kasa parolası kaybolursa içerik uygulama üzerinden kurtarılamaz. Şifreli içeriği açmış veya kopyalamış bir katılımcıdan daha önce aldığı bilgiyi geri almak mümkün değildir.

## 5. Canlı kabul kontrolü

İki ayrı hesap ve tarayıcı oturumuyla:

1. A hesabında paylaş, B hesabında farklı çalışma alanına bağlan. B'nin önceki kişisel notlarının silinmediğini bağlantıyı kaldırarak doğrula.
2. Her veri sekmesinde ekle, düzenle, tamamla ve sil; karşı oturumda değişikliği kontrol et.
3. Aynı kaydı iki oturumda düzenle. Eski sürüm kaydı ezmemeli; taslak korunmalı. Detaylı Notlar ve Kod'da güncel sürümle yeniden deneme kontrolünü kullan.
4. Aynı konu/deste/rutinde farklı alt kayıtlar ekle; ikisi de kalmalı. Aynı alt kaydı eşzamanlı değiştirince eski sürüm reddedilmeli.
5. Daveti iptal et, kullanılmış bağlantıyı üçüncü hesaba aç, katılımcı erişimini kaldır. Yetkisiz hesap ortak kayıtları okuyamamalı.
   Aynı kullanılmış linki katılan hesapta da dene; erişimi kaldırıldıktan sonra eski linkiyle yeniden bağlanamamalı.
6. Rutin bildirim tercihlerini iki hesapta farklı ayarla; birinin tercihi diğerini değiştirmemeli.
7. Kasaya ortak kayıt ekle; parolayı değiştir; diğer oturumda yeni parola gerektirdiğini doğrula.
8. Mobil genişlikte paylaşım penceresini, klavye ile giriş/kapatmayı ve açık/koyu temayı kontrol et. Çevrimdışından dönüş ve çalışma alanı değişiminde eski ortak içerik yeni alana taşınmamalı.
9. Görüntüleme yetkisiyle ayrı davet oluştur. Katılan hesap her sekmedeki notları görebilmeli; ekleme, düzenleme, silme ve ortak tamamlama kontrolleri kapalı olmalı. Ana sayfadan hızlı ekleme/tamamlama da kapalı olmalı. Bilgi Kartları'nın kişisel test/oyun ekranları kullanılabilmeli.

Yerel doğrulama: `npm.cmd test` ve `npm.cmd run build`. Testler gerçek PostgreSQL davranışıyla migration/RLS/RPC senaryolarını (PGlite), Supabase sorgu oluşturucusunu, Realtime abonelik yaşamını ve Web Crypto şifrelemeyi kapsar. Bu ortamda açık tarayıcı oturumu bulunmadığından görsel kontrol ve gerçek Supabase Broadcast doğrulaması canlı kurulumdan sonra yapılmalıdır.

## Geri dönüş

Bir sekme için ortak kullanımdan çıkmak SQL geri almak gerektirmez: uygulamadaki **bağlantıyı kaldır** veya **paylaşımı sonlandır** işlemini kullan. Migration'ları eski owner-only politikalara elle döndürmek ortak kayıtları görünmez yapabilir. Veritabanı geçişini tamamen geri almak gerekiyorsa geçiş öncesi yedeği ayrı bir proje/ortamda geri yükle; geçişten sonraki yeni ortak kayıtları önce dışarı aktar.
