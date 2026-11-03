# Çalışma alanı sekmelerini sadeleştirme analizi

İnceleme tarihi: 3 Kasım 2026. Bu değerlendirme mevcut bileşenler, veri modelleri ve gezinme akışlarına dayanır. Kullanım ölçümü veya kullanıcı testi yapılmış gibi bir sonuç çıkarılmaz. Aşağıdaki birleştirmeler öneridir; henüz uygulanmadı.

## Mevcut durum

Uygulamada 13 modül var. Tümü etkin olduğunda üst seçim alanlarında toplam 15 seçenek oluşuyor; bunlar aynı anda tek satırda gösterilmiyor, beş sidebar alanına dağılıyor.

| Sidebar alanı | Üst alandaki seçenekler |
| --- | --- |
| Notlar | Planlar, Detaylı Notlar, Hızlı Notlar, Güvenli Kasa, Kod Kütüphanesi, PomoNotes |
| Takvim | Takvim, Periyodik Hatırlatmalar |
| Öğrenme | Konular, Yanlış Defteri, Bilgi Kartları |
| Yaşam | Antrenman Takipçisi, Listelerim |
| Finans | Gelir / Gider, Yatırım |

Liste / Pano / Takvim, Planlar içindeki dönem seçimleri ve Periyodik Hatırlatmalar içindeki bugün / tümü seçimleri bu sayıya dahil değil. Bunların bir kısmı ayrı bir işlev değil, aynı veriye farklı bakışlar. Aşağıda Rutinler adı, mevcut Periyodik Hatırlatmalar modülünü ifade eder.

Temel karışıklık: Kullanıcı bir yapılacak işi Planlar, takvim görevleri, Detaylı Notlar, Hızlı Notlar veya PomoNotes içine yazabiliyor. Bir not yazarken de önce hızlı mı detaylı mı olduğuna karar veriyor. Kararı içeriği yazmadan önce istemek gereksiz yük oluşturuyor.

## Bu çalışmada tamamlanan iki düzeltme

- Finansın kendi içinde tekrar çizdiği Gelir / Gider ve Yatırım satırı kaldırıldı. Üstteki ortak sekmeler kaldı; dönem, para birimi, yenileme ve analiz kontrolleri korundu.
- Liste / Pano / Takvim seçimi tek bir ortak araç çubuğuna alındı. Liste ve panodaki giriş formu bu çubuğun altında. Takvim görünümü aynı menüyü kendi içinde yeniden oluşturmuyor. Takvim saatlerinin iç kaydırması korunuyor.

## Birleştirme adayları

| Alanlar | Örtüşme ve fark | Öneri |
| --- | --- | --- |
| Hızlı Notlar + Detaylı Notlar | İkisinde de metin, oluşturma tarihi ve tamamlanma durumu var. Detaylı notlarda ayrıca zengin içerik, kategori, öncelik ve tarih bulunuyor. | **İlk birleştirme adayı.** Tek Notlar listesi; kısa içerik de uzun içerik de aynı notun farklı kapsamı olur. Kategorisiz kısa notlar doğrudan eklenir; kart açıldığında odaklı editör kullanılır. |
| Planlar + takvim görevleri | İkisi de yapılacak işi takip ediyor. Planlarda dönemler, sonraki döneme taşıma, erteleme nedeni ve geçmiş; görevlerde proje, durum, öncelik, termin ve kontrol listesi var. | **Tek Planlama alanı.** Liste / Pano / Takvim aynı iş kayıtlarını gösterir. Dönem planı bir görev özelliği veya dönem filtresi olur. Dönem taşıma geçmişi kaybolmaz. |
| Rutinler + Planlama | Rutin, belirli bir kuralla yeniden yapılacak iş. Mevcut rutinlerde özel aralıklar ve hatırlatmalar da var. | Ayrı üst sekme yerine görevde Tekrar seçeneği; gerekirse Rutinler filtresi. Her gerçekleşmenin tamamlanması ayrı tutulur: bugünü tamamlamak bütün rutini bitirmez. |
| PomoNotes + Planlama | Başlık ve tamamlanma tekrar ediyor. PomoNotes'un farklı değeri oturum hedefi, harcanan süre, odak kuyruğu ve oturum geçmişi. | Ayrı iş listesi yerine görev üzerinde Odaklan eylemi ve oturum hedefi. Sayaç yine bağımsız çalışabilir. Oturumlar görevle ilişkilendirilir; geçmiş kopyalanıp iki yerde sayılmaz. |
| Kod Kütüphanesi + Notlar | Saklama, kart listesi ve odaklı düzenleme benziyor. Kodda dil seçimi ve özel editör gerekli. | **İkinci aşama adayı.** Tek not kütüphanesinde Kod türü filtresi olabilir; kod açıldığında mevcut özel editör korunur. İlk aşamada ayrı kalması daha az değişiklik gerektirir. |
| Yanlış Defteri + Konular | Yanlışlar zaten çalışma ve konuya bağlı. Ancak kullanıcı çalışmalar arasında bütün yanlışlarını da görmek isteyebilir. | Konu içindeki Yanlışlar alanı ve çalışma genelinde tek bir Yanlışlar görünümü yeterli olabilir. Bir yanlış kaydı, ilgili konu veya çalışma silinmeden erişilemez hale gelmemeli. İlk aşamada mevcut doğrudan erişim korunsun. |

Hızlı ve detaylı notlar birleşirken mevcut tamamlanma işlevi korunmalı. Uzun vadede Notlar içinde tarih, proje ve gelişmiş görev durumu da çoğaltılırsa Planlama ile aynı karmaşa yeniden oluşur. Bunun yerine bir nottan ilişkili görev oluşturma akışı daha anlaşılır olur; bu da mevcut işlevler taşındıktan sonra değerlendirilmelidir.

## Ayrı kalması anlamlı olanlar

- **Güvenli Kasa:** Normal notlardan farklı olarak kilit açma ve istemci tarafı şifreleme kullanıyor. Normal not listesinin, önizlemesinin veya aramasının içine doğrudan karıştırılmamalı.
- **Gelir / Gider ve Yatırım:** Biri para hareketi ve bütçe, diğeri miktar, alış maliyeti ve güncel fiyatla varlık takibi yapıyor. Finans altında iki görünüm olarak kalmaları anlaşılır. Tekrarlanan ikinci menü gereksizdi; iki işlevin kendisi gereksiz değil.
- **Antrenman ve Listelerim:** Hareket sırası, set, tekrar, dinlenme ve animasyon ile kitap / film / yer koleksiyonları farklı işler. Yaşam altında iki seçenek kalabilir.
- **Konular ve Bilgi Kartları:** Konu ilerlemesi ile kart çalışması birbirini destekliyor, birbirinin yerini almıyor. Bilgi kartları bir konuya bağlı veya bağımsız kullanılabilmeli.
- **Analiz ve Ayarlar:** Veriyi düzenleme ekranlarıyla aynı amaçta değiller. Sidebar'daki mevcut sabit girişleri yeterli; yeniden alt sekmelere parçalanmalarına gerek yok.

## Önerilen hedef düzen

| Ana alan | İlk aşama hedefi | Daha sonra değerlendirilebilecek sadeleşme |
| --- | --- | --- |
| Notlar | Notlar · Kod Kütüphanesi · Güvenli Kasa | Kod, özel editörü korunarak Notlar türüne dönüşebilir. |
| Planlama | Tek görev akışı; Liste / Pano / Takvim görünümleri | Rutin ve odak hedefleri görev özellikleri olur. Yeni ayrı sekmeler eklenmez. |
| Öğrenme | Konular · Yanlış Defteri · Bilgi Kartları | Yanlış Defteri, doğrudan erişilebilir çalışma / konu görünümüne dönüşebilir. |
| Yaşam | Antrenman · Listelerim | İşlevler farklı olduğu için birleşme önerilmiyor. |
| Finans | Gelir / Gider · Yatırım | Tek üst sekme satırı korunur. |

Sidebar'da beş ana alan, Analiz ve Ayarlar korunabilir. Takvim alanının adı, görevleri ve dönem planlarını da kapsadığında Planlama olarak değişebilir. Liste / Pano / Takvim ayrı veri kaynakları veya kopya listeler değil, aynı kayıtların görünüm seçenekleri olmalı.

## Uygulama sırası

1. **Hızlı ve detaylı notları tek arayüzde topla.** İlk adımda mevcut kayıtları topluca taşımadan birleşik liste sun. Her kayıt kaynak modülü ve kimliğiyle izlenir; düzenleme, arama sonucu açma ve çöp kutusundan geri alma doğru kaynağa gider. Kategori, tarih ve biçimlendirme kaybolmaz.
2. **Planlar ile görevleri tek Planlama akışında göster.** Dönemli planlar, proje görevleri ve tarihlendirilmiş blokların ilişkisini kur. Dönem taşıma ve erteleme geçmişini koru; bir hedefi sırf takvimde göstermek için kopya görev oluşturma.
3. **Rutinleri bu akışa bağla.** Tekrar kurallarını, gerçekleşme bazında tamamlanmayı ve hatırlatma zamanlarını koru. Aynı olay için iki bildirim üretilmesini engelle.
4. **PomoNotes'u görevlerin odak özelliğine dönüştür.** Mevcut oturum kimlikleri, hedefleri, süreleri, geçmişi ve öğrenme konularından gelen bağlantıları koru. Paylaşılan görev ile kişisel odak geçmişi aynı yetki kapsamına sokulmaz.
5. **Sonra Kod ve Yanlış Defteri kararını ver.** Önceki sadeleşmelerin kullanımı değerlendirilsin. Gerçekten erişimi zorlaştıracaksa bu iki doğrudan giriş korunabilir.

Her aşamada gezinme sadeleşmesi ile veri taşıma ayrı ele alınmalı. Sadece bir sekmeyi gizlemek; arama, paylaşım, etkin modül ayarları ve eski kayıt bağlantıları hâlâ iki ayrı davranıyorsa birleşme sayılmaz. Modül kapatıldığında veya yetki olmadığında birleşik listede o kaynağın içerikleri görünmemeli.

## Tamamlanma ölçütleri

- Yeni kullanıcı kısa veya uzun not yazmadan önce not türünü seçmek zorunda kalmaz.
- Bir iş, tekrar veya odak hedefi eklendiğinde ikinci bir bağımsız yapılacak listesi oluşmaz.
- Aynı menü hem üstte hem içerikte çizilmez; görünüm seçimi giriş formuna göre yer değiştirmez.
- Eski kayıtlara arama, çöp kutusu ve öğrenme bağlantılarından ulaşılmaya devam edilir.
- Şifreli kasa içerikleri ve kişisel öğrenme / odak verileri, arayüz birleşti diye daha geniş görünür hale gelmez.

Önerilen ilk ürün adımı: **Hızlı Notlar + Detaylı Notlar birleşmesi.** En belirgin örtüşmeyi, dönem ve tekrar kurallarını değiştirmeden ortadan kaldırır. Daha büyük fakat daha değerli ikinci adım, Planlar + görevler + Rutinler + PomoNotes için tek Planlama akışıdır.

## İncelenen kaynaklar

- `src/lib/moduleCatalog.ts`, `src/lib/workspaceSections.ts`: Etkin modüller, alanlar ve üst seçimler.
- `src/features/todos/stores/todo.ts`: Hızlı not, detaylı not ve kod veri modelleri.
- `src/features/plans/stores/plans.ts`: Dönemler, erteleme ve taşıma geçmişi.
- `src/features/tasks/lib/tasks.ts`, `src/features/tasks/components/Tasks.vue`: Projeler, görevler, kontrol listeleri ve takvim blokları.
- `src/features/PeriodicTasks/stores/periodicTasks.ts`: Tekrar sıklıkları ve hatırlatma özellikleri.
- `src/features/pomodoro/stores/pomoNotes.ts`: Oturum hedefleri, süreler ve geçmiş.
- `src/features/learning/components/LearningTopicDetails.vue`: Not, kart, takvim ve odak bağlantıları.
- `src/lib/vaultCrypto.ts`: Kasanın ayrı şifreleme modeli.
- `src/features/finance/components/FinanceTracker.vue`: Para hareketleri, bütçe ve yatırım görünümleri.
