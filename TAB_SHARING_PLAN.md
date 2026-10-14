# Sekme bazında ortak çalışma planı

Durum: Mevcut kod incelendi; uygulama ve veritabanı değişiklikleri henüz başlamadı.

## Hedef ve örnek

Ayşe, İş workspace'indeki Hızlı Notlar sekmesi için davet linki oluşturur. Mehmet bu linki kendi Kişisel workspace'inde kabul eder. İki sekme aynı kayıtları gösterir; ekleme, düzenleme, tamamlama ve silme işlemleri diğer kişiye yansır. Kullanıcıların diğer sekmeleri, workspace adları, tema ve dil tercihleri bağımsız kalır.

Paylaşım bir workspace'in tamamını kapsamaz. Aynı workspace'in farklı sekmeleri farklı kişilerle kullanılabilir. Her workspace + sekme için bir etkin veri alanı bulunur. Aynı ortak veri alanı, üyelik kontrolüyle birden fazla workspace'e bağlanabilir.

## Mevcut yapıdan çıkan bulgular

- `src/lib/workspaceScope.ts` sorgulara hem workspace hem kullanıcı sahipliği filtresi ekliyor. Bazı modüller bu kullanıcı filtresini ayrıca kendileri de ekliyor. Paylaşıma katılan kullanıcı diğer kişinin kayıtlarını bu yapı üzerinden göremez.
- `supabase/migrations/workspaces.sql` kayıtların kullanıcı/workspace eşleşmesini birleşik foreign key ve RLS ile koruyor. Ortak erişim için yalnızca istemci filtrelerini kaldırmak yeterli olmaz; veritabanı ilişkileri de yeniden düzenlenmeli.
- Detaylı Notlar, Hızlı Notlar ve Kod Kütüphanesi aynı `todo` store'unda tutuluyor. Koleksiyonları, önbellekleri ve bağlantıları bağımsız yönetilmeli.
- Öğrenme konuları, destelerdeki kartlar ve antrenman egzersizleri JSON dizilerinin tamamı güncellenerek kaydediliyor. Eşzamanlı değişiklikler birbirini ezebilir.
- Planlar yüklenirken dönem geçişleri istemcide yazılıyor. Ortak kullanımda bu işlem sunucuda, tekrar çalıştırıldığında aynı sonucu veren atomik bir işlem olmalı.
- Rutin bildirimleri kullanıcı + workspace'e göre çalışıyor ve bildirim durumu görev üzerinde tutuluyor. Ortak görevlerde bildirim tercihleri ve gönderim kayıtları kişi bazında ayrılmalı.
- Güvenli Kasa'da `password_hash` değerleri doğrudan girilen şifreyle karşılaştırılıyor. Bu sekme ortak erişime açılmadan önce şifre saklama, doğrulama ve anahtar paylaşma modeli düzeltilmeli; alan adının hash olması mevcut uygulamada hash kullanıldığı anlamına gelmiyor.
- Pomodoro yerel bir sayaç; ortak not alanı gibi değerlendirilmemeli. Ortak sayaç/oturum başka bir özellik olarak ele alınmalı.

## Arayüz ve kullanıcı akışı

### Ayarlardaki sekme kartları

- Mevcut boyutlar, renkler ve aç/kapa davranışı korunur.
- Her paylaşılabilir sekme kartının sağında küçük bir bağlantı/paylaşım ikonu bulunur. İkon, aç/kapa kontrolünü tetiklemez.
- Mevcut kartın tamamı `button role="switch"`; içine başka bir buton eklenmez. Dış yapı kart kapsayıcısına dönüştürülür, sekme aç/kapa ve paylaşım ayrı erişilebilir kontroller olur.
- Paylaşım ikonuna ilk tıklama, o sekme için davet üretir ve küçük bir paylaşım penceresi açar. Pencerede workspace, sekme adı, paylaşılan kapsam, link ve Kopyala bulunur.
- Varsayılan kapsam, o sekmenin mevcut kayıtları ve geçmişiyle birlikte gelecekte eklenecek kayıtlardır. Bu bilgi linkin yanında açıkça belirtilir.
- Paylaşılan sekmede ikon küçük bir ortak kullanım göstergesine dönüşür. Katılımcılar ve paylaşım yönetimi aynı pencereden açılır; kartın yüksekliği artmaz.
- Yeni link oluşturma ve katılımcı yönetimi sahibin yetkisidir. Editör, ortak kayıtları ekleyebilir, düzenleyebilir, tamamlayabilir ve silebilir.

### Davet linkini ekleme

- Ayarlar'da Sekmeler ve araçlar başlığının yanında `Paylaşılan sekme ekle` bulunur. Kalıcı, büyük bir form eklenmez.
- Açılan küçük pencerede link giriş alanı ve hedef workspace seçimi bulunur; mevcut workspace varsayılan gelir.
- Link doğrulanınca sekme türü otomatik anlaşılır. Kullanıcıya ortak alan adı, davet eden kişi, düzenleme yetkisi ve hedef workspace gösterilir.
- `Bağlan` işlemi üyeliği ve sekme bağlantısını tek transaction içinde oluşturur. Sekme kapalıysa bu işlemle etkinleştirilir.
- Link doğrudan açıldığında da aynı kabul ekranı gösterilir. Giriş yapmamış kullanıcı girişten sonra davetine geri döner.
- Yanlış uygulamaya ait, süresi bitmiş, iptal edilmiş, kullanılmış linkler ve aynı bağlantıyı yeniden ekleme için ayrı sonuçlar gösterilir.

### Hedef sekmede mevcut notlar varsa

- Önerilen varsayılan: Kişisel kayıtlar korunur; sekmenin etkin görünümü ortak koleksiyona geçer. Kayıtlar otomatik birleştirilmez.
- Önceki kişisel koleksiyon bağlantısı saklanır. Ortak bağlantı kaldırıldığında kişisel kayıtlar yeniden görünür.
- İleride `Kişisel kayıtları ortak alana kopyala` ayrı ve açık bir işlem olarak eklenebilir. Ortak alan oluşturulurken sahibin mevcut kayıtları zaten paylaşılacak kapsam içindedir.
- Sekme başka bir ortak alana bağlıysa mevcut bağlantı gösterilir ve değiştirme etkisi açıklanır. Sessizce üzerine yazılmaz.
- Bağlantıyı bu workspace'ten kaldırmak, ortak kayıtları silmez. Aynı kullanıcı başka workspace'inde bu alanı kullanıyorsa diğer bağlantı etkilenmez.

### Günlük kullanım

- Sekme içeriği mevcut görünümünü korur; başlık çevresinde küçük ortak kullanım ikonu bulunur.
- Normal çalışmada sürekli bildirim veya toast gösterilmez. Bağlantı kesilmesi, kaydetme hatası ve düzenleme çakışması gerektiğinde kısa durum bilgisiyle gösterilir.
- Bir kullanıcı not yazarken gelen güncelleme onun taslağını ve odağını bozmaz.
- Workspace arşivlemek diğer katılımcıların ortak alanını kapatmaz. Paylaşımı sonlandırmak ayrı işlemdir.
- Linki iptal etmek gelecekteki katılımları engeller; mevcut üyeler ayrıca kaldırılır.

## Veri modeli

| Yeni yapı | Görevi |
| --- | --- |
| `module_collections` | Sekmenin kişisel/ortak veri alanı; modül türü, sahibi, erişim nesli ve durum bilgisi. |
| `collection_members` | Koleksiyon + kullanıcı üyeliği; owner/editor rolleri ve üyelik durumu. |
| `workspace_module_bindings` | Kullanıcının kendi workspace'indeki sekmenin hangi koleksiyona bağlı olduğu; önceki kişisel koleksiyon. |
| `collection_invites` | Sunucuda üretilen rastgele davet token'ının hash'i, izin, son kullanma, kullanım sınırı ve iptal bilgisi. |
| `collection_activity` | Kayıt, işlemi yapan kişi, zaman ve değişiklik türü; not metni gereksiz yere loglanmaz. |
| Kişisel rutin tercihleri/gönderimleri | Ortak görev için kullanıcının kendi hatırlatma tercihi ve bildirim geçmişi. |

Kayıtlara `collection_id`, sunucunun artırdığı `version` ve işlemi yapan kişi/zaman bilgileri eklenir. Koleksiyonun modül türü kayıt tablosuyla eşleşmek zorundadır. Detaylı not-kategori ve kasa-not/oturum ilişkileri aynı koleksiyonda kalacak biçimde korunur.

Mevcut kullanıcı/workspace sahipliği foreign key'leri, aynı kayıt üzerinde farklı üyelerin çalışmasına izin verecek koleksiyon ilişkilerine taşınır. Eski sahiplik alanları geçişte korunur; koleksiyon yetkisiyle karıştırılmaz. İstemci kullanıcı ID'sini değiştirerek başka bir koleksiyona kayıt taşıyamaz.

## Yetki ve davet işlemleri

- Katılım Supabase hesabıyla gerçekleşir. Link anonim düzenleme yetkisi vermez.
- Önerilen davet varsayılanı: tek yeni katılımcı, 7 gün geçerlilik, editör yetkisi. Workspace veya katılımcı sayısına ürün sınırı konulmaz; yeni kişi için yeni davet oluşturulabilir.
- Ham token kalıcı olarak veritabanında tutulmaz. Sunucu token'ı doğrular; üyelik ve bağlama işlemlerini atomik yapar. Tek kullanımlık davetin aynı anda iki kişiye kullandırılmaması veritabanında sağlanır.
- Davet ekranı kabulden önce yalnızca gerekli metadata'yı gösterir; not içeriklerini açmaz.
- Veri okuma, ekleme, güncelleme ve silme RLS ile koleksiyon üyeliğine bağlıdır. Bindings değiştirme kullanıcının kendi workspace'iyle sınırlıdır. Üye/invite yönetimi sahibine özeldir.
- Üye kaldırılınca yeni veri istekleri reddedilir. Uygulama eski ortak önbelleği ve açık editörü temizleyerek kişisel görünüme döner. Daha önce görüntülenmiş/kopyalanmış içerik geri alınamaz.
- Sahip paylaşımı sonlandırdığında koleksiyon kendisinde kalır; diğer üyelerin erişimi kapanır. Sahibin ayrılması için sahiplik devri veya paylaşımı sonlandırma gerekir.

## Canlı güncelleme ve eşzamanlı düzenleme

- Kalıcı kayıt için tek kaynak PostgreSQL olur. Başarılı veritabanı işlemlerinden sonra koleksiyona özel private Realtime Broadcast kanalına yalnızca değişiklik/sürüm bildirimi gönderilir.
- Not içeriği Broadcast mesajına konulmaz. İstemci güncel kaydı RLS korumalı sorguyla alır. Bu tercih, bağlı kanallarda yetki önbelleği olmasını içerik erişiminden ayırır.
- Üyelik değişiminde kanalın erişim nesli yenilenir; eski kanala yeni olay gönderilmez. Uygulama üyeliği yeniden kontrol eder, geçerli kanala bağlanır veya ortak görünümü kapatır.
- Yeniden bağlantıda mevcut durum yeniden okunur. Bildirimler kalıcı kuyruk gibi varsayılmaz; ilk yükleme ve abonelik kurulumu arasındaki yarış da yeniden okuma/sürüm kontrolüyle kapatılır.
- Kullanıcının kendi kaydının hem optimistik güncelleme hem Realtime üzerinden iki kez görünmesi ID ve sürümle engellenir. Workspace veya binding değişiminde eski abonelikler kapatılır, geç dönen istekler yeni state'e yazamaz.
- Aynı kaydın eşzamanlı değişiklikleri beklenen sürümle atomik kaydedilir. Sürüm uyuşmazsa son kayıt alınır, kullanıcının taslağı korunur ve yeniden uygulama seçeneği gösterilir. Sessiz son-yazan-kazan yaklaşımı kullanılmaz.
- Kartlar, konular ve egzersizler ayrı alt kayıtlara taşınır. Her ekleme/güncelleme ilgili alt kayda uygulanır; dizinin tamamı değiştirilmez.
- İlk sürüm kaydedilmiş değişiklikleri canlı gösterir. Aynı metinde harf harf birlikte yazma ve ortak imleçler ayrı bir editör aşamasıdır.
- Plan dönemi devri sunucuda atomik yapılır. Rutin tamamlanma durumu ortak; bildirim alıcısı ve gönderim geçmişi kişiseldir. Öğrenme/antrenman işaretlerinin ortak olacağı kabul ekranında belirtilir; test sonuçları ve Pomodoro kişisel kalır.

## Uygulama sırası ve bitiş ölçütleri

**Uygulama durumu:** Koleksiyon altyapısı, davet/kabul/yönetim arayüzü, on veri sekmesinin koleksiyon erişimi, private Broadcast + yeniden okuma, sürüm kontrolleri, alt kayıt normalizasyonu, kişisel rutin bildirimleri ve kasa şifreleme geçişi yerel kodda tamamlandı. Migration, sorgu, üyelik, şifreleme ve mevcut uygulama regresyon testleri eklendi. Canlı Supabase migration uygulaması, gerçek Broadcast ve tarayıcıda görsel kabul kontrolü henüz yapılmadı; adımlar `TAB_SHARING_SETUP.md` içinde.

1. **Koleksiyon altyapısı ve güvenli geçiş:** Yeni tablolar, RPC'ler, RLS, modül ilişkileri; her mevcut workspace/sekme için kişisel koleksiyon ve kayıt backfill'i. Tekrar uygulanabilen migration, yedek/geri dönüş adımları ve mevcut notların kayıpsız korunması doğrulanır.
2. **Veri erişimi ve önbellek:** `workspaceScope.ts` koleksiyon bağlantısını çözer. Modüllerdeki tekrarlı sahiplik filtreleri temizlenir. Store/cache anahtarları kullanıcı + workspace + modül + koleksiyon/sürüm içerir. Ana sayfa özetleri de aynı bağlantıları kullanır.
3. **Hızlı Notlar ile uçtan uca paylaşım:** Ayarlar ikonu, paylaşım penceresi, link yapıştırma/doğrudan açma, kabul, ayrılma ve yönetim; iki ayrı hesabın farklı workspace'lerinde çalışır. Mevcut notlar üzerine yazılmaz.
4. **Realtime ve çakışma koruması:** İki oturumda ekleme/düzenleme/tamamlama/silme; yeniden bağlantı, çift olay, iptal edilmiş üyelik ve workspace değişimi test edilir. Çakışan taslak kaybolmaz.
5. **Diğer standart sekmeler:** Kod Kütüphanesi, Detaylı Notlar ve kategoriler, Listelerim; ardından atomik dönem devriyle Planlar ve kişi bazında bildirimlerle Rutinler.
6. **İç içe kayıtlı sekmeler:** Öğrenme, Bilgi Kartları ve Antrenman alt kayıtları ayrıştırılır, mevcut veriler korunur ve eşzamanlı düzenleme test edilir.
7. **Güvenli Kasa ve son kontroller:** Şifre/anahtar modelinin düzeltmesi tamamlandıktan sonra kasa paylaşımı eklenir. Mobil/masaüstü, klavye, Türkçe/İngilizce, paylaşım ile sekme aç/kapa ayrımı ve gerçek Supabase Realtime kontrol edilir. Pomodoro ortak not paylaşımına dahil edilmez.

Hızlı Notlar ilk doğrulama aşamasıdır; kapsam diğer paylaşılabilir sekmeleri de tamamlamayı içerir. Çalışmayan sekmelerde hazırmış gibi link üretme butonu gösterilmez. Canlı SQL ve Realtime ayarlarının uygulanması yerel derlemeden ayrı bir etkinleştirme adımıdır.

## Değişmesi/eklenmesi beklenen dosyalar

- `src/views/WorkspaceCustomizer.vue`: kart içindeki bağımsız paylaşım kontrolü ve davet ekleme girişi.
- `src/views/WorkspaceTabs.vue`, `src/components/ui/WorkspaceModulePane.vue`: ortak kullanım durumu ve binding değişiminde doğru içeriğin yüklenmesi.
- `src/lib/workspaceScope.ts`, ilgili modül store'ları, `src/views/DashboardHome.vue`: koleksiyon bazında veri erişimi ve state.
- `src/lib/workspaceReminders.ts` ve hatırlatma sunucu fonksiyonları: üye bazında bildirimler.
- Yeni `src/stores/sharing.ts`, paylaşım/kabul pencereleri ve Realtime yönetimi.
- Yeni Supabase migration dosyaları, gerekiyorsa davet endpoint'i, kurulum dokümanı ve yetki/eşzamanlılık testleri.
- `src/locales/tr.ts`, `src/locales/en.ts`: davet, paylaşım durumu ve hata metinleri.

## Başvurulan resmi belgeler

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): veritabanı üzerinden üyelik temelli erişim.
- [Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes): veritabanı değişiklikleri için Broadcast yaklaşımı.
- [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization): private kanal yetkileri ve bağlantı süresince yetki önbelleği. Yukarıdaki içeriksiz bildirim/kanal nesli tasarımı bu davranışı dikkate alan proje önerisidir.
