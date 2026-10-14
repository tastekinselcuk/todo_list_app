# PomoNotes: ürün, ekran ve uygulama planı

Durum: tasarım ve uygulama sırası önerisi; henüz uygulanmadı.
İnceleme tarihi: 11 Ekim 2026.

## 1. Ürün içindeki yeri

PomoNotes, belirli bir işe odaklanmak ve o işe ayrılan gerçek süreyi görmek için
çalışma alanına eklenen küçük bir görev listesidir. Detaylı Notlar'ın kategorilerini,
önceliklerini ve uzun metinlerini burada tekrar kurmayacağız. Planlar dönem hedeflerini;
PomoNotes ise o anda üzerinde çalışılan işi ve odak oturumlarını tutar.

- Üst menü aynı kalır: Ana Sayfa, Çalışma Alanı, Analiz, Ayarlar.
- Mevcut `pomodoro` modül ayarı sayacı ve PomoNotes sekmesini birlikte etkinleştirir.
  Kullanıcıya ikinci bir modül anahtarı açılmaz.
- Çalışma alanı şeridinde **PomoNotes** görünür. Pomodoro şu anda şeritte bir sekme
  olmadığı için mevcut sekme adları değiştirilmez; yeni giriş Pomodoro'nun modül
  sırasına yerleştirilir.
- Sayaç kartı ve üst bar gösterimi korunur. PomoNotes içinde ikinci büyük sayaç olmaz.
- Genel sayaç görev seçmeden kullanılabilir. PomoNotes kartındaki **Odaklan** ise
  görevi seçer ve ona bağlı oturumu tek hareketle başlatır.
- Görevler ilgili çalışma alanının koleksiyonunda kalır. Devam eden oturum,
  kullanıcının başka bir alana geçmesiyle yeni alana taşınmaz.

## 2. Rakiplerden alınan yararlı örnekler

| Ürün | Resmî kaynakta görülen akış | Bizim için sonuç |
|---|---|---|
| [Pomofocus](https://pomofocus.io/) | İş ekle, tahmini Pomodoro sayısını belirle, işi seç, sayacı başlat. Gün/hafta/ay raporları da bulunuyor. | Tahmin ve görev seçimi ekleme akışının yakınında olmalı; başlamak için uzun form gerekmemeli. |
| [TickTick](https://help.ticktick.com/articles/7055792921664028672) | Görev üzerinden odak başlatma ve tahmini Pomodoro/süre belirleme; [görev ayrıntısından başlatma](https://help.ticktick.com/articles/7055782408586526720) da destekleniyor. | Odak eylemi görevin üzerinde olmalı. Sayaç, görev ekranından bağımsız kalabilmeli. |
| [Focus To-Do](https://www.focustodo.cn/) | Görevle odak süresini birleştiriyor; günlük/haftalık/aylık süre ve proje dağılımı raporları sunuyor. | Oturumlar görev kimliğiyle ilişkilendirilirse anlamlı süre dağılımı çıkarılabilir. |

Bu kaynaklar tam ürün kullanılabilirlik testi veya ücretli ekranların incelenmesi
değildir. Aşağıdaki tasarım, bu belgelerdeki akışlar ile mevcut uygulamanın kart,
filtre, tema ve çalışma alanı standartlarından çıkarılan öneridir.

## 3. Ekranı gözümüzde canlandırma

Sekme açılınca başlık/yazı bloğu yerine doğrudan mevcut not kutularıyla aynı
standartta küçük ekleme satırı gelir:

```text
[ Odaklanacağın işi yaz…                    ] [ −  3 oturum  + ] [ + ]

[ Aktif ▾ ]                       [ Ara…                 ]  4 görev

┌───────────────────────────────────────────────────────────────────┐
│ ○  Teklif dosyasını hazırla                              [Ⅱ] [⋯] │
│    2/5 tamamlandı · 3. oturum sürüyor · 50 dk odak                 │
│    ━━━━━━━━━━━━━━━━─────────────────────────                    │
└───────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────┐
│ ○  Sunum taslağı                                        [▶] [⋯] │
│    1/3 tamamlandı · 25 dk odak                                   │
└───────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────┐
│ ○  Gelen kutusunu temizle                               [▶] [⋯] │
│    0/1 tamamlandı                                                │
└───────────────────────────────────────────────────────────────────┘
```

Bu bir yerleşim taslağıdır; çerçeveler ve çizgi kalınlıkları son tasarım ölçüsü değildir.

### Ekleme

- Metin + oturum hedefi yeterli. Hedef başlangıçta 1; artı/eksi ya da klavyeyle değişir.
- Enter görevi ekler, giriş temizlenir ve odak girişte kalır. Art arda görev eklemek kolaydır.
- Boş/yalnız boşluk içeren metin eklenmez. İstek sürerken aynı ekleme iki kez gönderilmez.
- Başarılı kayıt hemen listede görünür. Hata olursa yazılan metin ve hedef korunur;
  başarısız görev gerçek sunucu kaydı gibi kalmaz.
- Oturum süresi ilk eklemede mevcut odak ayarından alınır. Örneğin 5 × 25 dk = 125 dk.
  Süreyi değiştirme ikincil düzenleme alanındadır; giriş satırına üçüncü büyük seçim eklenmez.
- Hedef/süre sonradan değiştirilebilir. Değişiklik çalışan oturumu etkilemez.

### Kartlar ve filtre

- Hızlı Notlar ve Detaylı Notlar ile aynı arka plan, köşe, kenarlık ve küçük hover.
- Çalışılan görev küçük bir odak ikonu ve ölçülü vurgu ile ayrılır. Geniş renk şeridi,
  parlak yeni arka plan, büyük başlık veya ayrı pano eklenmez.
- Kartın solundaki işaret görevin tamamlanmasıdır. Görev başlığına basmak düzenlemeyi
  açar; sayacı istemeden başlatmaz.
- Sağda sürekli erişilebilir başlat/duraklat ikonu ve menü bulunur. Menü: Düzenle,
  Kopyala, Sil. Kopyalama yalnız metni kopyalar; yeni göreve oturum geçmişi taşımaz.
- İnce ilerleme çizgisi yalnız ilgili hedefi gösterir; genel liste için ikinci bir çizgi olmaz.
- Tek seçimde Aktif / Tamamlanan / Tümü. Başlangıç Aktif; tamamlanan kayıtlar saklanır.
- Arama ve adet mevcut filtreler gibi aynı satırda. Küçük ekranda metin ve hedef
  okunabilirliği korunarak gerektiğinde iki kısa satıra geçer.
- Başlangıç boşluğu: “Henüz odak görevi eklenmedi.”
- Tamamlananlar ve oturum ayrıntıları sayfalı yüklenir. Kartın menüsündeki ayrıntı
  açılınca oturum geçmişi küçük panelde gelir; tüm kartlar ilk açılışta geçmiş getirmez.

### Mevcut üst sayaçla bağlantı

- Bağlı görev adı mevcut sayaçta küçük, kısaltılabilir bir bağlam satırında görünür.
  Tam ad ve başlangıç çalışma alanı erişilebilir açıklama/tooltip ile okunur.
- Navbar modunda mevcut yükseklik ve merkez menü korunur. Görev bilgisi sol sayaç
  bölümünün alanına sığar; merkez gezinmenin yanına yeni geniş bir kutu eklenmez.
- Başka sekme, Ana Sayfa veya Ayarlar açılırsa oturum sürer. Görev bilgisine tıklama,
  erişim hâlâ varsa ilgili alanın PomoNotes kartına götürür.
- Çalışılan alanın Pomodoro ayarı farklı olsa bile devam eden oturumun durumu küçük
  sayaç kontrolünden erişilebilir kalır. Alan değişimi sayacı sessizce gizlememeli.
- Sekme girişi mevcut aşağıdan yukarı belirme hareketini kullanır. Kart durum
  değişimleri kısa geçişlerle olur; azaltılmış hareket tercihi desteklenir.
- İkonlar klavye ile erişilir; isimleri/tooltip'leri vardır. Dokunmatik kullanım hover'a bağlı değildir.

## 4. Sayaç davranışı ve doğru ilerleme

### Göreve bağlanmak isteğe bağlı

Genel sayaçtaki Başlat görev gerektirmez. Bu süre Analiz'de “Serbest odak” olarak
kalır; kullanıcıya eksik veri veya kötü kullanım olarak gösterilmez.

PomoNotes kartındaki Odaklan, boşta olan sayacı o göreve bağlar ve başlatır. Ayrı bir
“seç, sonra başka yerde başlat” zorunluluğu yoktur. Kart duraklatılmış aynı oturumu
sürdürürse yeni Pomodoro açılmaz.

### Sayacın ortasında görev değiştirme

Çalışan A görevinde geçen süre, B kartına tıklanınca B'ye taşınmaz. B için eylem
“Sonraki oturumda odaklan” olur ve küçük bir sıradaki görev göstergesi çıkar.
İkinci bir tıklama sıradaki seçimi kaldırabilir.

Hemen geçmek isteyen kullanıcı ikincil “Bitir ve geç” eylemini seçer. A'nın gerçek
kısmi süresi kaydedilir, tam Pomodoro kredisi verilmez, B için yeni oturum başlar.
Mola çalışıyorsa seçilen görev sonraki odak oturumuna hazırlanır; mola süresi göreve yazılmaz.

### Sayılar ne demek?

| Durum | Gösterim / kayıt |
|---|---|
| Hedef 5, henüz başlanmadı | 0/5 tamamlandı |
| İki tam oturum bitmiş, üçüncü çalışıyor | 2/5 tamamlandı · 3. oturum sürüyor |
| Üçüncü gerçekten bitiyor | 3/5 tamamlandı; üçüncü oturumun süresi kayıtlı |
| 10 dk sonra duraklatılıyor | Süre korunur; aynı oturum kaldığı yerden sürer; adet artmaz |
| 10 dk sonra oturum bitiriliyor | 10 dk gerçek odak; yeni tam Pomodoro yok |
| Kısa/uzun mola | Görev adedi ve odak süresi artmaz |
| 5/5 ama iş bitmemiş | “Hedefe ulaşıldı”; görev açık kalır; devam etmek mümkün |
| Altıncı oturum da bitiyor | 6/5; olumsuz renk/uyarı yok; çizgi en fazla %100 |
| İş 3/5'te tamamlanıyor | İşaretlenebilir; tahminin altında bitmiş görev olarak saklanır |
| Tamamlanmış görev tekrar açılıyor | Gerçek geçmiş korunur, adet sıfırlanmaz |

Çalışan görevi tamamlanmış işaretlemek mevcut oturumu otomatik silmez veya kesmez.
Kullanıcı isterse sayacı bitirir; yeni otomatik odak oturumu tamamlanmış göreve bağlanmaz.
“Tam Pomodoro”, oturumun başında belirlenen sürenin gerçekten tamamlanmasıdır.
Adet tarayıcının `++` sayacından değil, sunucunun kabul ettiği oturum kayıtlarından türetilir.

### Özel süreler

- Görevin hedef oturum uzunluğu saklanır; 5 × 25 dk, 5 × 40 dk ile aynı süre tahmini değildir.
- Görev üzerinden başlatılan oturum o görevin süre ayarını kullanır. Bu, genel sayacın
  serbest odak tercihlerini değiştirmez.
- Görev hedefi/süresi düzenlenirse değişiklik gelecek oturumlara uygulanır. Önceki
  oturumun hedefi, süresi ve görev bağı geçmişte değiştirilmez.
- İlerlemede oturum adedi, analizde ayrıca dakika kullanılır. Farklı uzunluktaki
  oturumlar gizlice “25 dakikalık birime” dönüştürülmez.
- Tamamlanan görevlerin tahmin karşılaştırması için ilk bağlı oturumdaki kişisel
  hedef/süre referansı korunur. Sonradan ayarlanan hedef ayrıca güncel hedef olarak
  gösterilir; geçmiş tahmin başarısı geriye dönük iyileştirilmiş gibi hesaplanmaz.

## 5. Çalışma alanı, paylaşım ve gizlilik

- Mevcut tek kullanımlık davet ve owner/editor/viewer modeli kullanılır.
- Görev metni ve tamamlanma durumu koleksiyon içinde paylaşılabilir.
- Odak oturumları, aktif görev seçimi ve kişisel hedef kullanıcıya aittir.
  “Benim ilerlemem 2/5” karşıdaki kullanıcının sayacını başlatmaz veya onun
  ilerlemesini artırmaz.
- Paylaşılan kartlarda hedef düzenleme “Hedefim” olarak adlandırılır. Koleksiyona
  katılan kişi kendi hedefini belirler; diğer kişinin hedefi/süresi sessizce kopyalanmaz.
  Hedef seçilmediyse mevcut odak süresi ve 1 oturum varsayılanı görünür.
- Viewer ortak metni veya tamamlanma durumunu değiştiremez; okuyabildiği göreve kendi
  özel odağını ve hedefini bağlayabilir. Ortak görev hedefi/team toplamı ilk sürümde yoktur.
- Alan veya görev kimliği değişimi çalışan oturumun sahipliğini değiştirmez.
- Yeni görev bağı oluştururken erişim sunucuda kontrol edilir. Paylaşım erişimi
  kaldırılmış görev için yeni oturum açılamaz; başlık ve koleksiyon içeriği kapanır.
- Önceden yetkili olarak başlatılmış oturumun kullanıcının kendi süre kaydı bitirilebilir.
  Bu işlem kaldırılan koleksiyon içeriğine yeniden okuma/yazma yetkisi vermemeli.
- Görev silinse de kullanıcının süre geçmişi korunur. Eski bağlantı “Silinen görev”
  olur; serbest odak sayılmaz. Silinen görev metni analiz kaydına kopyalanıp tutulmaz.
- Silme/erişim kaldırma çok hesaplı testlerle doğrulanır. Ekip odak sürelerini açmak
  ileride ayrı ve açık bir ürün/izin kararı gerektirir.

## 6. Veri ve mimari önerisi

Yeni bir tab için mevcut tüm uygulamayı yeniden yazmak gerekmiyor. Ancak sayaç
paylaşılabilir bir store'a taşınmadan PomoNotes eklenmemeli.

### İstemci

1. **Modül kataloğu:** Anahtar, ayar başlığı, sekme başlığı, görünüm, paylaşım desteği,
   özet ve veri kapsamı tek türü belirli istemci kaynağından gelir. SQL kayıtları
   ayrıca kalır; eşleşme testiyle korunur.
2. **Tek odak store'u:** Mod/süre, running/paused durumu, başlangıç kapsamı,
   seçilen/sıradaki görev, bitiş zamanı ve komutlar burada bulunur. Mevcut sayaç
   bileşeni yalnız gösterim ve kullanıcı eylemlerini taşır.
3. **Oturum kaydı:** Mevcut FocusJournal'ın ağ hatası, kalıcı kuyruk, revision ve
   tekrar gönderim koruması korunur; görev ilişkisinin sözleşmesi eklenir.
4. **PomoNotes store'u:** Sayfalı görevler, filtre, kişisel hedef ve toplu ilerleme
   sorgusu. Her satır için ayrı RPC veya her kartta ayrı interval yoktur.
5. **Saklama:** Ayarlar/taslak için korumalı depolama. Görevlerin doğruluk kaynağı
   sunucudur. Modüle özel alan/koleksiyon cache anahtarı kullanılır.
6. **Sekme yaşam döngüsü:** Yeni girişle birlikte `KeepAlive` sınırı ve taslak
   saklama politikası gözden geçirilir. Sayaç tabdan bağımsız yaşar; gizli tab ağ
   yenilemesi ve klavye dinleyicisi çalıştırmaz.

### Sunucu

Önerilen yeni kayıtlar:

| Kayıt | İçerik / yetki |
|---|---|
| `pomo_tasks` | Koleksiyon, kimlik, görev metni, tamamlanma, oluşturma/güncelleme tarihi, sürüm. Metin/durum owner/editor; viewer salt okur. |
| `pomo_task_member_preferences` | Görev + kullanıcı için oturum hedefi ve odak uzunluğu. Yalnız ilgili kullanıcının tercihi; görev erişimi denetlenir. |
| Mevcut `focus_sessions` genişlemesi | İlişki türü, görev/koleksiyon kimliği, başlangıç çalışma alanı, hedef/süre referansı. Başlangıçtan sonra görev bağı değişmez. |
| Odak sahipliği/uzlaştırma sözleşmesi | Kullanıcının aynı zaman aralığını farklı sekme/cihazlardan iki göreve ya da iki tam Pomodoro'ya yazmasını önler. |

- Tek ekleme RPC'si görev ve oluşturan kişinin hedefini aynı transaction'da kaydeder.
- Okuma, cursor sayfalaması ve kararlı `(created_at, id)` sıralamasıyla yapılır.
- Görev ilerlemeleri bir sayfa için topluca döner; geçmiş oturumlar ayrı sorgulanır.
- Görev yazmalarında mevcut CAS/sürüm kontrolleri; tercih yazmalarında kullanıcı sınırı.
- Başka kullanıcının süresi/oturumu doğrudan okunamaz. İstemcinin gönderdiği
  `completed_count`, sahibi veya erişim izni kabul edilmez.
- Focus kayıtlarının geçerlilik, tekrar gönderim ve aralık kontrolleri korunur.
- Silmede canlı göreve FK boşalabilir; ayrıca ilişki türü saklandığından geçmiş
  sınıflandırma “serbest”e dönmez.
- Başlangıçta hedefi yetkili biçimde sabitleyen sunucu sözleşmesi gerekir.
  Bir tarayıcı payload'una sonradan görev kimliği eklemek tek başına yeterli değildir.

### Çok sekme, cihaz ve çevrimdışı kayıt

Mevcut süre raporu çakışan aralıkları birleştiriyor. Bu, görev dağılımı ve tam oturum
adedi için tek başına yeterli değil: iki farklı oturum kimliği aynı 25 dakikayı
iki Pomodoro gibi gösterebilir.

Önerilen sözleşme:

- Aynı tarayıcıda tek aktif sayaç sahibi; diğer sekmeler durumu yansıtır. Lider
  kapanınca devralma, yenilenme ve kopyalanmış sekme kimliği test edilir.
- Bağlı cihazlarda sunucu mevcut aktif oturumu bildirir. İkinci bağımsız oturumu
  sessizce başlatmak yerine “Burada devam et” eylemiyle açık devralma yapılır.
- Sahiplik yenilemesi ve kurtarma kuralı olmalıdır; çöken tarayıcı sonsuza kadar
  aktif kilit bırakamaz. Eski sahibin gecikmiş cevabı yeni oturumu değiştiremez.
- Bağlantı kesilince çalışan sayaç devam eder, süre kuyruğa alınır. Çevrimdışı
  başlatılan oturum yerelde geçici görünür; başka cihazda aynı aralık çalışmışsa
  sunucu uzlaştırması ikinci tam oturum kredisi üretmez.
- Uzlaştırma aynı aralığı iki göreve dağıtmaz. Kabul edilen sahiplik/ilişki esas alınır;
  çatışan kayıt silinmeden, çakışan kısmı toplamdan ve ikinci krediden çıkarılır.
- Bu davranış sırf istemcide düğmeyi gizleyerek uygulanmaz. İki farklı istemci,
  gecikmiş kayıt ve tekrar gönderim SQL testleri kabul koşuludur.

Bu sözleşmenin SQL ayrıntısı sayaç temeli aşamasında prototiplenir; PomoNotes veri
migration'ı uygulanmadan çakışma/kurtarma davranışı testlerle sabitlenir.

### Migration ve uyumluluk

- Eski paylaşım scriptlerini üstüne tekrar çalıştırmak yerine yeni tarihli migration.
- Koleksiyon modül kontrolü, paylaşım izinleri, tab bindings, mutasyon RPC'si,
  analytics olay modülü ve workspace client kaydı birlikte güncellenir.
- Mevcut kayıtsız/serbest focus oturumlarına görev uydurulmaz; geçmiş serbest kalır.
- İstemci şema yeteneğini kontrol eder. Eski RPC görev alanlarını tanımayıp sessizce
  yok sayarsa “başarılı eşleştirme” gösterilmez; kurulum eksikliği açıkça belirtilir.
- Yeni kurulum ve var olan veri üstüne yükseltme iki ayrı SQL testiyle doğrulanır.

## 7. Analiz bölümüne sağlayacağı değer

İlk Analiz sürümüne şimdi yeni grafik eklemek zorunlu değil. PomoNotes gerçek görev
bağı üretmeye başladıktan sonra aşağıdakiler anlamlı hâle gelir:

1. **Tahmin ve gerçekleşen süre:** Tamamlanan görevler için ilk kişisel tahmin ile
   gerçek dakika yan yana yatay çubuklar. Güncel hedef değişiklikleri ayrıca açıklanır.
2. **İşe ayrılan süre:** Görev/alan başına odak dağılımı; serbest odak açık bir kategori.
3. **Tahmin sapması:** Tamamlanan, bağlı süre verisi olan görevlerin medyan farkı ve
   örnek sayısı. Bir görevden genel kişilik/verimlilik puanı üretilmez.
4. **Oturum ve sonuç ayrımı:** Tam oturumlar, kısmi odak dakikaları, hedefe ulaşan
   görevler ve gerçekten tamamlanan görevler ayrı ölçülerdir.

İlk sürümde kart ilerlemesi ve mevcut Analiz'de bağlı/serbest odak kırılımı yeterlidir.
Yeni çapraz grafikler yeterli kayıt oluşunca eklenir. Başka üyelerin özel odak süresi
paylaşılmış görev raporuna eklenmez. Özet ve ayrıntı sorguları ayrılır; küçük bir
haftalık kart tüm görev/oturum geçmişini indirmez.

## 8. Sıralı uygulama paketleri

11 Ekim 2026 uygulama notu: 1–5 kodlandı; 6'nın otomatik kontrolleri eklendi. Canlı SQL/Edge dağıtımı ve bağlı tarayıcıda görsel kontrol bekliyor. Ayrıntılar [POMONOTES_IMPLEMENTATION.md](POMONOTES_IMPLEMENTATION.md), kurulum [POMONOTES_SETUP.md](POMONOTES_SETUP.md).

| Sıra | Paket | Tamamlanma koşulu |
|---|---|---|
| 1 | Güvenlik ve açılış dayanıklılığı | Hatırlatma alıcısı/görev yetkisi sunucuda; öncelikli bağımlılıklar sınıflandırılmış; bozuk/engelli depolama ekran açılışını bozmaz. |
| 2 | Ortak modül kataloğu ve odak store'u | Mevcut sayaç görünümü korunur. Dil, sayfa, navbar/kart ve alan değişimi süreyi sıfırlamaz. Özel süreler kalıcıdır; tek sayaç kaynağı vardır. |
| 3 | Sayaç sahipliği ve yeni veri modeli | İki sekme/cihaz çifte süre veya oturum kredisi üretmez; erişim/sürüm testleri geçer. Görev bağı ve çevrimdışı uzlaştırma sunucuda doğrulanır. |
| 4 | Minimal PomoNotes ekranı | Tek satırda ekleme, hedef değiştirme, odaklan/duraklat, sıradaki görev, tamamla/yeniden aç, kopyala/sil; tema ve mobil standartları. |
| 5 | Geçmiş ve Analiz bağlantısı | Gerçek oturumdan türetilen ilerleme; bağlı/serbest ayrımı; silinen görev/erişim kaldırma gizliliği; sayfalı geçmiş. |
| 6 | Son doğrulama | Mevcut test/build; aşağıdaki davranış testleri ve gerçek tarayıcıda açık/koyu, dar/geniş, klavye ve dokunmatik inceleme. |

Ana sayfa özet sorgusu, mevcut modüllerin sayfalaması ve abonelik maliyeti iyileştirmeleri
`PROJECT_REVIEW.md` sırasıyla küçük paketlerde ilerler. PomoNotes'a başlangıçtan
itibaren sayfalama/toplu ilerleme uygulanır; tüm eski modüller bitmeden ekranı
tamamen bekletmek gerekmez.

## 9. Kabul senaryoları

- 5 hedefli görevin üçüncü oturumu çalışırken 2/5; bitince yalnız bir kez 3/5.
- Durakla/sürdür ve sayfa yenileme aynı oturum kimliğini/süresini korur.
- Aynı oturumun 10 defa gönderimi aynı ilerlemeyi üretir.
- A çalışırken B seçimi A'nın önceki süresini B'ye yazmaz; sıradaki görev görünür.
- A kısmi bitirilip B başlayınca A'nın gerçek dakikası kalır; tam oturum artmaz.
- Hedefi aşmak ve hedefin altında görevi tamamlamak mümkündür.
- İş tamamlanması odak süresinden bağımsızdır; çalışırken tamamlama geçmişi silmez.
- Serbest sayaç görev olmadan başlar ve Analiz'de doğru sınıflanır.
- Başka sayfa/alan/dil ve navbar görünümü süren oturumu değiştirmez.
- 25 ve 40 dakikalık oturumlarda hem adet hem gerçek dakika açık ve doğrudur.
- Hedef düzenleme geçmişteki tahmini yeniden yazmaz.
- Görev silme veya paylaşım erişimi kaldırma süreyi sızdırmaz, serbest odak yapmaz.
- Viewer kendi odağını kaydeder; ortak görevi değiştiremez, başkasının ilerlemesini okuyamaz.
- İki sekme, kopyalanmış sekme ve iki cihaz aynı aralıktan iki tam oturum üretmez.
- Ağ kesintisi sırasında süre korunur; tekrar bağlanınca çakışma uzlaştırılır.
- Bozuk/kotasız depolama ve kayıt hatası metni/ekranı kaybettirmez.
- Büyük listede ilk sayfa ve sayfa toplamları yüklenir; her kart ayrı geçmiş RPC'si çalıştırmaz.

## 10. İlk sürümün dışında

Şablonlar, tekrar eden odak görevleri, sürükleme, görev atama, takım odak panosu,
otomatik günlük program, ödül/seri sistemi ve premium ödeme ilk paket için gerekli
değildir. Detaylı Notlar veya Planlar'daki bir kaydı ileride “Odaklan” eylemiyle
doğrudan bağlamak mümkündür; ilk sürümde aynı görevi iki tabloya kopyalayarak sahte
bağlantı kurulmaz.

Öncelik: kolay ekleme, tek görevle tek harekette odak, doğru kayıt ve sade gösterim.
