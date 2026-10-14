# Analiz alanı: ürün araştırması ve öneri

Araştırma tarihi: 11 Ekim 2026. Bu belge bir ürün önerisidir; uygulama kodu, veritabanı veya üyelik sistemi değiştirilmedi. İnceleme resmî ürün sayfaları ve mevcut depo üzerinden yapıldı; giriş gerektiren rakip ekranlarında canlı kullanım testi yapılmadı. Belgedeki örnek içgörüler temsilidir, kullanıcının gerçek istatistikleri değildir.

## 1. Önerilen ürün yönü

Ana navigasyonda ayrı bir **Analiz** sayfası; Ana Sayfa'da bunun küçük bir haftalık özeti. Analiz bir çalışma alanı modülü olarak sekme şeridine eklenmemeli: Pomodoro, görevler, planlar ve birden fazla çalışma alanı arasında bağlantı kuran ortak bir görünüm olmalı.

İlk ürün odağı üç kullanıcı sorusu:

1. Zamanımı hangi işlere ayırıyorum?
2. Listeme eklediklerimi sonuçlandırabiliyor muyum?
3. Sürekli taşıdığım işler nerede takılıyor?

Premium değer önerisi: kişisel geçmişi karşılaştırmak, tekrar eden darboğazları görmek ve sonraki dönemi daha gerçekçi planlamak. Kullanıcının ödeme isteği henüz doğrulanmadı; rakiplerin benzer özellikleri ücretli sunması bir ürün hipotezini destekler, bizim gelirimiz veya kullanıcı sonuçlarımız için kanıt oluşturmaz.

## 2. Rakiplerden alınabilecek dersler

| Ürün | Resmî olarak sunduğu yaklaşım | Bizim uygulama için ders |
| --- | --- | --- |
| Todoist | Günlük/haftalık görev hedefleri, tamamlanan görev grafikleri, Karma ve seriler; ücretli planda tam raporlama geçmişi. | Geçmiş karşılaştırması, mevcut toplam sayısından daha kullanışlı. Hedefleri kişiye bırakmak gerekir. |
| TickTick | Görev, odak ve alışkanlık istatistikleri; ücretsiz planda temel, Premium'da geniş istatistik erişimi. | Farklı araçların verisini aynı analiz alanında toplamak kullanışlı bir ürün yönü. |
| Focus To-Do | Gün/hafta/ay çalışma zamanı, görev tamamlanması ve projelerin zaman payı. | Pomodoro ile görev arasında isteğe bağlı bir ilişki kurulması raporun açıklayıcılığını artırır. İncelenen sayfa üzerinden hangi raporun ücretli olduğu doğrulanmadı. |
| Forest | Odak geçmişini görünür bir birikime dönüştürür; ileri analiz ve özel etiketler Plus kapsamındadır. | Düzenliliğin görünür olması değerlidir. Bizim mevcut tasarımımızda orman/oyun arayüzü yerine sade bir etkinlik takvimi daha uyumludur. |
| RescueTime | Zaman kategorileri, hedefler, uzun rapor geçmişi ve odak örüntüleri. | Raporun bir sonraki karara yardım etmesi gerekir. Otomatik uygulama/site takibi bizim mevcut web uygulamamızda bulunmuyor; aynı kapsam varmış gibi sunulmamalı. |
| Notion | Veritabanı verilerinden grafikler ve dashboard; ücretsiz planda bir, ücretli planda sınırsız grafik. | Esnek rapor düzeni ve kaydedilmiş filtreler ileride değerli olabilir. Biz kullanıcıdan kendi raporunu kurmasını beklemek yerine işe yarayan hazır görünümler sunabiliriz. |

Kaynaklar: [Todoist Karma](https://www.todoist.com/karma), [Todoist planları](https://www.todoist.com/pricing), [TickTick özellikleri](https://ticktick.com/), [TickTick planları](https://ticktick.com/upgrade), [Focus To-Do raporları](https://www.focustodo.cn/), [Forest özellikleri ve planları](https://forestapp.cc/), [RescueTime planları ve raporlar](https://www.rescuetime.com/pricing), [Notion grafik belgeleri](https://www.notion.com/help/charts).

Bu kaynaklardan yaptığım çıkarım: uzun geçmiş, kişisel karşılaştırmalar, anlamlı kırılımlar ve hedef takibi ücretli analiz alanı için makul temellerdir. Grafik sayısını artırmak tek başına değer yaratmaz.

## 3. Mevcut verinin durumu

| Alan | Bugün güvenilir biçimde görülebilen | Tarihsel analiz için eksik |
| --- | --- | --- |
| Pomodoro | Çalışan sayacın modu ve kalan süre. | Kalıcı oturum, başlangıç/bitiş, duraklama, erken bitirme ve çalışma alanı/görev ilişkisi. Aktif bileşen yerel sayaç durumunu kullanıyor. |
| Detaylı Notlar | Mevcut tamamlanma durumu, kategori, öncelik, son tarih, oluşturma ve son güncelleme zamanı. | Tamamlanma zamanı, yeniden açılma ve önceki durumlar. Son güncelleme zamanı tamamlanma zamanı değildir. |
| Hızlı Notlar | Oluşturma zamanı ve mevcut tamamlanma durumu. | Tamamlanma zamanı ve durum değişiklikleri. |
| Planlar | Dönem, mevcut durum, erteleme nedeni ve önceki dönemlerin durum kayıtları. | Kesin tamamlanma/erteleme zamanı, dönem başlangıcındaki hedef kümesi, silinen planların tarihsel katkısı. Eldeki geçmiş dönem düzeyindedir. |
| Rutinler | Takvim kuralı ve son tamamlanma tarihi. | Her planlanan tekrarın ayrı tamamlanma/atlama kaydı ve takvim kuralı geçmişi. Tek bir son tarih, aylık devamlılık grafiği için yeterli değildir. |
| Antrenman | Program, planlanan set/tekrar/ağırlık ve hareketlerin mevcut tamamlanma işareti. | Tarihli antrenman oturumları ve gerçekten yapılan setler. Programdaki ağırlık değeri gerçekleştirilen performans değildir. |
| Öğrenme/bilgi kartları | Konuların mevcut aşaması ve mevcut kartlar. | Tarihli öğrenme değişiklikleri, test denemeleri ve tekrar sonuçları. Bilgi kartı test sonucu şu anda bileşende geçici tutuluyor. |
| Paylaşım | Koleksiyon, işlem yapan kullanıcı, kayıt kimliği, INSERT/UPDATE/DELETE ve zaman bilgisi içeren etkinlik kaydı. | İşlemin anlamı: UPDATE bir tamamlanma, başlık değişikliği veya otomatik taşıma olabilir. Eski/yeni durum bu kayıtta tutulmuyor. |

Depo kanıtları:

- `src/features/pomodoro/components/PomodoroTimer.vue`: yerel timer durumları ve `startTimer` / `notifyTimerComplete`.
- `src/features/todos/stores/todo.ts`: `Todo` ve `QuickNote` veri tipleri.
- `src/features/plans/stores/plans.ts`: `Plan`, `Snapshot`, dönem taşıma işlemi.
- `src/features/PeriodicTasks/stores/periodicTasks.ts`: `completed_date` ve tekrar takvimi.
- `src/features/workout/stores/workout.ts`: `Exercise` ve `Routine` veri tipleri.
- `src/features/flashcards/components/Flashcards.vue`: geçici `testResults` ve `handleTestFinish`.
- `supabase/migrations/tab_sharing.sql`: `collection_activity` ve `collection_record_changed`.

Bugün mevcut notların oluşturulma dağılımı, açık görevlerin yaşı, kategori/öncelik dağılımı ve kalan/tamamlanan mevcut planlar gösterilebilir. Kesin günlük tamamlanma serisi, geçmiş Pomodoro saati veya antrenman gelişimi henüz güvenilir biçimde üretilemez.

Geçmiş veriler olduğu gibi korunmalı. Eksik zamanlar tahmin edilerek doldurulmamalı. Ekranda veri kapsamı ve yeni ölçümün başlangıç tarihi belirtilmeli; sınırlı geçmiş dönem bilgisi ile kesin olay zamanı ayrı gösterilmeli.

## 4. Önerilen istatistikler ve gösterimleri

| Öncelik | Kullanıcı sorusu / istatistik | Grafik | Ne yaptırır? | Gerekli veri |
| --- | --- | --- | --- | --- |
| İlk sürüm | Bu hafta ne kadar odak süresi kaydettim? | Günlük sütunlar; önceki eşdeğer dönem daha soluk karşılaştırma serisi. | Çalışma temposunu değerlendirmek. | Kalıcı Pomodoro oturumları. |
| İlk sürüm | Listem büyüyor mu, işler sonuçlanıyor mu? | Eklenen/tamamlanan ayrı sütunlar ve açık görev sayısı çizgisi; hepsi adet biriminde. | Yeni yük ile sonuçlanan iş arasındaki dengeyi görmek. | Başlangıç durumu ve anlamlı görev olayları. |
| İlk sürüm | Hangi planlar dönemler boyunca taşınıyor? | Dönemlere göre durumları gösteren yatay yığılmış çubuklar; yanında taşınan iş listesi. | Eski planları küçültmek, yeniden planlamak veya kaldırmak. | Plan dönemi geçmişi, dönem durumları ve yeni olaylar. |
| İlk sürüm | Bekleyen işler ne kadar eski? | 0–7, 8–30, 31–90, 90+ gün aralıklarında yatay çubuklar. | Birikmiş işleri doğrudan açıp temizlemek. | Mevcut açık görevler ve oluşturma zamanı. |
| İlk sürüm sonrası | Düzenli bir çalışma ritmim var mı? | Günlük etkinlik ısı haritası; kullanıcı tek seferde odak dakikası veya hedefe ulaşmayı seçer. | Günlük ritmi, tatilleri ve dinlenme günlerini görmek. | Oturumlar ve isteğe bağlı çalışma günü/hedef ayarı. |
| Premium adayı | Hangi saatlerde oturumlarımı daha çok sürdürüyorum? | Haftanın günü × saat ısı haritası; hücre ayrıntısında kayıt sayısı. | Zor işleri uygun zamanlara taşımayı denemek. | Zaman aralıkları ve oturum sonuçları; yeterli gözlem. |
| Premium adayı | İş ve kişisel alanlara zamanımı nasıl bölüyorum? | Çalışma alanı/kategori bazlı yatay yığılmış çubuk veya sıralı yatay çubuklar. | İstenen denge ile kaydedilen dağılımı karşılaştırmak. | Oturumun başladığı çalışma alanı; isteğe bağlı görev/kategori bağlantısı. |
| Premium adayı | En sık neden erteliyorum? | Sebeplere göre sıralı yatay çubuklar ve ilgili planlara geçiş. | Takvim, bağımlılık veya öncelik sorununu ayırt etmek. | Serbest metin yanında isteğe bağlı neden kategorisi. |
| Premium adayı | Bir işi sonuçlandırmam genellikle ne kadar sürüyor? | Kategori bazında medyan takvim süresi ve dağılım aralığı. | Eski görevleri ve gecikme örüntüsünü görmek. | Oluşturma/tamamlama olayları; yeterli örnek. Bu değer fiilî çalışma süresi değildir. |
| Premium adayı | Bir iş için tahminim ile kaydettiğim süre ne kadar farklı? | Tahmini süre işareti üzerinde gerçek süre çubuğu; sapma etiketi. | Sonraki planı daha gerçekçi kurmak. | İsteğe bağlı süre tahmini ve göreve bağlı odak kayıtları. |
| Sonraki modüller | Rutinlerime ne kadar uyuyorum? | Takvim ve haftalık uyum oranı çizgisi. | Hangi rutinlerin sürdürülebilir olduğunu görmek. | Planlanan her tekrar ve tamamlanma/atlama kaydı. |
| Sonraki modüller | Öğrenme ve spor çalışmalarım gelişiyor mu? | Tekrar doğruluğu çizgisi; hareket bazında yapılan ağırlık/tekrar eğrileri. | Sonraki çalışma veya antrenmanı düzenlemek. | Test denemeleri ve gerçek antrenman kayıtları. |

Not alma için oluşturulan not sayısı ikincil bir ölçüdür. Kullanıcı açıkça bir notu tekrar açtığında kaydedilen olaylarla sonradan tekrar kullanılan notlar gösterilebilir; okunma veya düzenlenme sayısı notun kalitesini kanıtlamaz. Kasa içeriği bu analiz için okunmamalı veya ayrı bir analiz kopyasına taşınmamalı.

## 5. Ölçümlerin dürüst hesaplanması

### Odak süresi

- Ölçüm adı kayıtlı odak süresi olmalı; sayacın çalışması kişinin gerçekten odaklandığını kanıtlamaz.
- Duraklama ve mola süreleri odak süresine eklenmez. Bir tamamlanan oturum her zaman 25 dakika kabul edilmez; özel süreler zaten destekleniyor.
- Erken biten oturumlarda kaydedilen dakika korunur; oturum tamamlanma sayısı ile kısmi süre ayrı gösterilir. Erken bitirme doğrudan başarısızlık olarak adlandırılmaz.
- Gece yarısını aşan kayıtlar raporun saat diliminde günlere bölünür. Kullanıcı başka çalışma alanına geçince oturum sessizce yeni alana taşınmaz.
- Aynı kullanıcının iki cihazındaki çakışan süreler iki kat toplam odak zamanı oluşturmaz; birden fazla sekmedeki kayıtların tekilleştirilmesi gerekir.

### Görev ve planlar

- Günlük tamamlanan benzersiz görev adedi, aynı görevin tikinin tekrar tekrar değiştirilmesiyle büyümez. Yeniden açılan görevler ayrıca gösterilir.
- Açık görev akışında yeni kayıt, yeniden açma, tamamlama, silme ve kapsam değişiklikleri ayrı ele alınır. Silinen görev tamamlanmış sayılmaz.
- Kullanıcının ay içinde eklediği yeni işler ilk günün hedef listesiyle karıştırılmaz. Dönem başındaki planlar, sonradan eklenenler ve önceki dönemden gelenler ayrılabilir.
- İlk dönem hedeflerinin kapanma oranı aynı görev kümesi üzerinden hesaplanır; sonradan silinen bir hedef oranı sessizce iyileştirmez. İptal edilenler ayrıca açıklanır.
- Bir plan üç ay taşındığında genel toplamda üç ayrı iş sayılmaz. Dönem grafiğinde ise üç ayrı dönemde beklemiş olması görünürdür.
- Dönem taşıma otomatik bir sistem olayıdır; kullanıcının aktif olarak üç kez erteleme yaptığı anlamına gelmez.
- Medyan tamamlama süresi, oluşturma ile tamamlama arasındaki takvim süresidir. Bu veriden çalışma hızı veya görev zorluğu çıkartılmaz.

### Karşılaştırma ve düzenlilik

- Devam eden hafta, geçen haftanın aynı geçen gün sayısıyla karşılaştırılır; tam hafta ile üç günlük hafta yan yana başarı değerlendirmesi yapılmaz.
- Önceki dönemin değeri sıfırsa yanıltıcı sonsuz yüzde artışı yerine mutlak fark gösterilir. Oran değişimleri gerektiğinde yüzde puan ile yazılır.
- Veri yok ile sıfır farklı durumlardır. Heatsmap takvimi ve seriler bunu ayırt etmelidir.
- Tatil, dinlenme ve hedeflenmeyen günler başarısız gün değildir. Kullanıcı haftada üç gün çalışmayı hedefleyebilir.
- Saat örüntüleri nedensellik veya biyolojik verimlilik iddiası taşımaz. Gözlem sayısı görünür olmalıdır. Az kayıt varsa yorum üretilmez.

### Paylaşımlı çalışma alanları

- Kişisel etkinlik, işlemi yapan kişiye göre; koleksiyonun toplamı ayrı bir kapsamda hesaplanır. Bir başka üyenin tamamladığı görev kişinin kendi başarısı olarak yazılmaz.
- Aynı paylaşımlı koleksiyon iki çalışma alanına bağlandığında hesap genelinde aynı kayıt veya olay iki kez sayılmaz.
- Kişisel Pomodoro kayıtları varsayılan olarak özel kalır. Paylaşımlı notlara erişim, diğer kişilerin özel zaman istatistiklerine erişim vermez.
- Okuma kapsamı mevcut kullanıcı ve koleksiyon izinlerinden türetilir. Yetki kaybedilen koleksiyonlar analiz ayrıntısında görünmez.

## 6. Yerleşim ve görsel tasarım

### Ana Sayfa

Mevcut giriş akışını koruyarak en fazla bir kompakt haftalık özet eklenir: kayıtlı odak süresi, sonuçlandırılan görevler ve ince mini grafik. Yanında Analizi aç bağlantısı. Büyük karşılama metni, kocaman sayılar veya birden fazla rapor bölümü eklenmez.

### Analiz sayfası

Ana navigasyon önerisi: Ana Sayfa · Çalışma Alanı · Analiz · Ayarlar. Mevcut navbar yüksekliği korunur; dar ekranlarda erişim aynı sade navigasyon davranışıyla çözülür. Çalışma alanının mevcut sekme adları ve sıralaması bu analiz için değiştirilmez.

Üst satır: çalışma alanı seçimi, dönem seçimi ve karşılaştırma. İleri filtreler açılır bir alanda kalır. Varsayılan kapsam aktif çalışma alanıdır; Tüm alanlar seçeneği ayrıca sunulur. Paylaşımlı kapsam varsa Benim etkinliğim / Koleksiyon ayrımı açıkça belirtilir.

İlk genel bakış ekranı en fazla dört kompakt gösterge, iki ana grafik ve en fazla üç kısa bulgu içermeli. İlk göstergeler: kayıtlı odak süresi, tamamlanan görevler, 30+ gündür açık işler ve taşınan planlar. Taşınan planlar dönem filtresine bağlı, ayrı adlandırılmış bir ölçüdür.

Başlangıçta Genel Bakış ve Odak / Planlar ve Görevler alt görünümleri yeterlidir. Rutinler ve öğrenme/spor raporları hazır olmadan boş sekme veya çok sayıda kilitli kart eklenmez. Kullanmadığı modülün analizine kullanıcı yönlendirilmez.

Yerleşim: odak süresi trendi geniş ana grafik; görev akışı ikinci ana grafik; eski işler ve taşınan planlar ayrıntı görünümünde. İlk sürümde tüm grafik türleri aynı ekranda gösterilmez.

### Etkileşim ve stil

- Mevcut tema renkleri, yazı ölçüsü ve ortak kart kenarlığı korunur. Grafikler için ayrı gösterişli bir tasarım dili kurulmaz.
- Bir ana seri rengi; karşılaştırma için aynı rengin soluk tonu veya farklı çizgi biçimi. Renklerin yanında etiket ve değer bulunur.
- Tarih grafikleri sıfır başlangıçlı sütunlarda okunur. Farklı birimler çift Y ekseniyle tek grafiğe zorlanmaz.
- Pasta/donut yalnızca birkaç parçalı dağılım veya tek hedef için kullanılabilir; ana raporların çoğunda yatay çubuk daha kolay karşılaştırılır. Üç boyutlu, neon, çok renkli radar veya hız göstergesi tercih edilmez.
- Bir gün, çubuk veya neden seçildiğinde altta ilgili kayıtlar açılır; kullanıcı tekrar doğru sekmeyi aramak zorunda kalmaz. Mobilde dokunma ve klavye erişimi desteklenir.
- Eksenler sönük olabilir, veri değerleri okunabilir kalmalıdır. Grafiklerin kısa metin özeti ve ayrıntı listesi bulunur.
- Kısa ve ölçülü giriş/filtre geçişleri; azalan hareket tercihinde animasyon kapalı. Grafikler kaydırırken sürekli hareket etmez.

### İlgili modüllerden erişim

Pomodoro'nun mevcut menüsünden Odak analizini aç; Planlar ve Detaylı Notlar'dan filtreli rapora geçiş. İlk sürümde her kartın yanına yeni analiz ikonu eklenmez. Ayarlar ekranına grafikler yerleştirilmez; hedef, rapor ve veri tercihleri gerektiğinde oradan yönetilebilir.

## 7. İçgörülerin premium değeri

Her bulgu üç şey içermeli: gözlem, karşılaştırma dayanağı ve ilgili kayda veya eyleme geçiş. Kullanıcının amacı bilinmeden başarı/başarısızlık hükmü verilmemeli.

Temsili örnekler:

- Bu dönem taşınan beş planın üçünde aynı bağımlılık nedeni var → ilgili planları aç.
- Son üç haftada eklenen görev adedi sonuçlandırılanların üzerinde → biriken işleri göster.
- Kayıtlı uzun oturumlarda erken bitirme daha sık → daha kısa süreyi deneme seçeneği; örnek sayısı görünür.
- İş alanındaki kayıtlı odak süresinin payı geçen eşdeğer döneme göre yükseldi → alan dağılımını aç. Artış kendiliğinden kötü olarak değerlendirilmez.

İlk yorumlar açıklanabilir kurallarla üretilebilir. Yapay zekâ veya not içeriklerini okuyan bir servis ilk sürüm için gerekli değildir. İleride bir öneri sistemi eklenirse veriye dayanan gözlem ile tavsiye ayrı belirtilmelidir.

Premium için güçlü ikinci aşama fikirleri:

- Birden fazla dönemi ve çalışma alanını karşılaştırma.
- Kaydedilmiş rapor filtreleri ve hedef kırılımları.
- Erteleme örüntüleri ve başlangıç hedefi / dönem sonucu karşılaştırması.
- Tahmini süre / kaydedilen odak süresi analizi.
- Kullanıcının seçtiği çalışma günlerine göre geçmişten türetilen haftalık kapasite aralığı; sonuç tahmin olarak etiketlenir.
- Aylık/yıllık kişisel değerlendirme ve şık rapor dışa aktarımı.
- İsteğe bağlı haftalık değerlendirme; e-posta gönderimi ayrıca açık tercihe bağlı bir sonraki ürün kararıdır.

## 8. Ücretsiz / Premium önerisi

Bu paketler birer başlangıç hipotezidir; henüz uygulanmayacak.

| Ücretsiz | Premium adayı |
| --- | --- |
| Mevcut görev/not ve geçmiş özelliklerini koruma. | Uzun dönemler arası karşılaştırmalar ve ileri rapor filtreleri. |
| Gün/hafta özeti ve son 30 günün temel trendleri. | Kayıtlı geçmişin tamamını kapsayan gelişmiş analiz. |
| Temel odak süresi, görev akışı ve açık iş yaşları. | Saat örüntüleri, süre tahmini sapmaları ve neden kırılımları. |
| Aktif çalışma alanının temel raporu. | Birden fazla çalışma alanının karşılaştırılması. |
| Kişisel veriye erişim ve temel ham veri dışa aktarımı. | Kaydedilmiş raporlar, özenli PDF/görsel değerlendirme raporları. |

Veri birikimi ücretsiz kullanıcılar için de başlamalı. Premium açıldığında geçmiş bulunmalıdır; abonelik bittiğinde kayıtlar silinmez. Mevcut geçmiş not özelliği sonradan ücret duvarının arkasına taşınmaz. Ücretli özellik açma kararı yalnızca arayüzde değil, rapor erişim katmanında da uygulanmalıdır.

Bugünkü kişisel kullanımda sınırlama koymak gerekmiyor. İlk uygulama tüm özellikleri denemeye açık olabilir; ücretlendirme ve fiyat kararı gerçek kullanım ve geri bildirim sonrası verilmelidir.

## 9. Uygulama sırası

### Aşama 1 — Ölçüm temeli

Kalıcı odak oturumları, anlamlı görev/plan olayları ve raporun veri kapsamını oluşturmak. Görev tamamlanmasını başarılı veritabanı işlemiyle kaydetmek; otomatik taşıma, düzenleme, silme ve yeniden açmayı ayırmak. Yeni bir rapor ekranından önce bu kayıtların doğruluğu kontrol edilir.

Olası veri modelleri:

- Odak oturumu: kimlik, kullanıcı, başlangıç çalışma alanı, isteğe bağlı kayıt/koleksiyon bağlantısı, mod, planlanan süre, çalışan zaman aralıkları, durum ve zamanlar.
- Görev/plan olayı: kimlik, kayıt kimliği, koleksiyon/modül, gerçek aktör veya sistem aktörü, olay türü, olay zamanı, gerekli durum/dönem/kategori metadatası. İçeriğin tam kopyası gerekmez.
- Günlük/haftalık özetler: yukarıdaki kayıtlardan üretilebilen hesaplamalar. İlk aşamada gereksiz büyük bir ayrı veri ambarı kurmak gerekmez.

Rutin tekrarları, antrenman gerçekleşmeleri ve test denemeleri sonraki modüller için ayrı modellerdir. Genel INSERT/UPDATE sayısını başarı veya çalışma kalitesi olarak sunan bir ortak olay modeli kullanılmaz.

### Aşama 2 — İlk kullanılabilir Analiz ekranı

Ana Sayfa haftalık özeti, ayrı Analiz sayfası, tarih/çalışma alanı filtresi, odak trendi, görev akışı ve planların taşınma/eski iş ayrıntıları. Grafiklerden asıl kayıtlara geçiş. Veri bulunmayan durumlar, açık/koyu tema ve mobil kullanımı tamamlanır.

### Aşama 3 — Gelişmiş raporlar

Yeterli kayıtla saat örüntüleri, alan karşılaştırması, erteleme kategorileri, süre tahmini ve aylık değerlendirme. Kullanıcıların hangi grafikleri tekrar açtığı ve rapordan hangi işlemleri yaptığı gözlenerek paket sınırı belirlenir. Salt tıklama sayısı kullanıcıya sağlanan fayda yerine geçmez.

### Aşama 4 — Modül raporları ve ürünleşme

Rutin geçmişi, öğrenme/test ve gerçekleşen antrenman kayıtları; ardından ilgili raporlar. Ödeme, üyelik ve gelişmiş rapor hakları, doğrulanmış değer önerisi üzerine eklenir.

## 10. Doğrulama ölçütleri

- Zamanlanmış süre, duraklama ve erken bitirme doğru toplam verir; mola odak süresine karışmaz.
- Çoklu sekme/cihaz ve tekrar gelen kayıtlar toplamları şişirmez.
- Tik değişikliği ve yeniden açma, başarı sayısını yapay olarak artırmaz.
- Silme, otomatik dönem taşıma ve sonradan eklenen planlar raporda açıklanır.
- Saat dilimi ve gece yarısı doğru gün sınırlarını üretir.
- Paylaşımlı koleksiyonlarda kişisel katkı ve koleksiyon toplamı ayrılır; aynı koleksiyon iki alanda iki kez sayılmaz.
- Önceki dönemin sıfır/eksik verisi ve kısmi dönem karşılaştırması dürüst gösterilir.
- Grafik toplamları ilgili kayıt listesiyle uyuşur.
- Ekran mevcut minimal tasarımda kalır; mobilde okunabilir, klavyeyle kullanılabilir ve grafik olmadan da özet anlaşılır.

İlk geliştirme için önerilen kapsam: **ölçüm temeli + ayrı Analiz sayfası + odak trendi + görev akışı + eski/taşınan plan ayrıntıları**. Bu kapsam hem bugünkü kişisel kullanımına hem de ileride ücretli derin analiz sunmaya doğrudan hizmet eder.
