# Analiz kurulumu

PomoNotes güncellemesi de kuruluysa eski `analytics.sql` dosyasını üstüne yeniden çalıştırma. Görev ilişkileri ve sayaç sahipliği için yeni [POMONOTES_SETUP.md](POMONOTES_SETUP.md) sırasını kullan; eski script yeni fonksiyonları önceki sürüme çevirebilir.

## Bir defalık veritabanı adımı

Çalışma alanları ve paylaşım sistemi zaten kuruluysa Supabase **SQL Editor** içinde
`supabase/migrations/analytics.sql` dosyasının tamamını çalıştır. E-posta veya kullanıcı
kimliği yazmana gerek yok. Script tüm mevcut kullanıcıların not durumlarını başlangıç
olarak alır; tekrar çalıştırılması geçmişi sıfırlamaz.

Yeni bir veritabanında sıralama: modüllerin kendi tabloları → `workspaces.sql` →
`tab_sharing.sql` → `tab_sharing_modules.sql` → `tab_sharing_vault.sql` (kasa kullanılıyorsa)
→ `tab_sharing_permissions.sql` → `analytics.sql`.

Bu çalışma sırasında canlı veritabanına yönetici bağlantısı bulunmadığı için migration
yerel PostgreSQL test ortamında doğrulandı; canlı ortama uygulanmadı.

Kontrol:

```sql
select proname as rpc
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and proname in ('analytics_report','record_focus_session');
```

İki satır dönmeli. Uygulamayı yenileyip üst menüden **Analiz** ekranını aç.
Kurulum mesajı kalırsa Supabase SQL Editor içinde `notify pgrst, 'reload schema';`
çalıştırıp Analiz ekranındaki yenile düğmesine bas.

## İlk kullanım

1. Bir odak oturumu başlat, duraklat, devam ettir ve bitir veya sıfırla. Mola modları
   odak olarak kaydedilmez. Kayıtlar çalışırken 15 saniyede bir kontrol noktası alır.
2. Bir hızlı not, detaylı not veya plan ekleyip tamamla. Yeniden açıp tekrar
   tamamlamak aynı rapor aralığındaki benzersiz not sayısını artırmaz.
3. Analiz ekranında hafta/ay/tarih aralığını, çalışma alanını ve hareket kapsamını
   seç. Bir güne tıklayarak günlük dökümü; yaş kutularıyla mevcut birikimi incele.
4. CSV düğmesi seçili kapsamın günlük istatistiklerini indirir. Not gövdeleri
   dışarı aktarılmaz; henüz kaydı bulunmayan günlerin değerleri boş bırakılır.

## Ölçümlerin anlamı

- **Kayıtlı odak:** Sayaç çalışırken kaydedilen süre. Gerçekte ekrana bakıldığının
  kanıtı değildir. Mola/duraklama hariçtir. Sıfırlama öncesi kısmi süre korunur.
- **Tamamlanan:** Seçili aralıkta en az bir kez tamamlanan farklı notlar.
  Aynı not başka bir aralıkta yeniden tamamlandıysa o aralıkta yeniden sayılabilir.
- **Bekleyen:** Her günün sonunda alanın tüm üyelerine ait açık not sayısı.
  Oluşturulan/tamamlanan sütunlarının hareket kapsamı ayrı seçilebilir.
- **Birikim ve planlar:** Tarih filtresinden bağımsız, seçili alanın mevcut durumu.
  Yaş, oluşturma tarihinden raporun saat dilimindeki takvim günleriyle hesaplanır.
- **Karşılaştırma:** Seçili aralıktan hemen önce gelen aynı sayıda gün.
  Hafta ve ay filtreleri bugün itibarıyla geçen günleri kapsar. Önceki aralık
  ölçüm başlangıcıyla kesişiyorsa karşılaştırma ve yüzdelik değişim gösterilmez.
- **Devreden plan:** Açık planın dönem geçmişi varsa tek bir plan olarak sayılır;
  devrettiği dönem sayısı ayrıntıda görünür. Otomatik devir tamamlama değildir.

Ölçüm kurulduğu gün kısmi olabilir. Eski notların mevcut durumu korunur; hangi gün
tamamlandıkları bilinmiyorsa geçmiş başarı grafiğine eklenmez. Sonradan silinen
notların gövdeleri kayıt defterinde tutulmaz; anonim durum/değişim olayları korunur.

## Gizlilik ve bağlantı kesilmesi

Odak oturumları yalnızca sahibinin raporlarına girer. Alanın notlarını paylaşmak
kişisel odak verisini paylaşmaz. Rapor RPC'si alan sahipliğini ve koleksiyon erişimini
sunucuda kontrol eder. Aynı koleksiyon iki alana bağlıysa tüm alanlar raporunda bir
kez sayılır. Erişim iptal edilince koleksiyon sonraki raporda görünmez.

Odak kayıtları kullanıcı ve oturum kimliğiyle cihazda kuyruklanır; sunucuya
eşitlenince kuyruktan çıkar. Ağ hatasında veya migration henüz kurulmamışsa kuyruk
korunur. Yeniden denemeler ve farklı cihazlardaki örtüşen odak aralıkları süreyi
çoğaltmaz. Çalışma alanı oturumun başlangıcında sabitlenir. Aynı sekmeyi yenilemek
sayacı geri yükler; mola sayacı geçmişe dahil edilmez.

Tarayıcı depolamasını temizlemek henüz eşitlenmemiş kayıtları kaldırır. Sekme
kapatıldığında son kontrol noktası saklanır; tekrar açılmayan bir sekme için son
kontrol noktasından sonraki süre tahmin edilmez. Tarayıcı yerel depolamayı
engellerse Analiz ekranında uyarı görünür.

## Sonraki aşama

Rutinlerin gerçekleşme geçmişi, yapılan antrenmanların gerçek set/tekrar kayıtları
ve öğrenme/test denemeleri henüz ölçülmüyor. Bu modüller için ayrı olay kayıtları
kurulmadan performans grafikleri gösterilmeyecek. İlk sürüm sınırsız kişisel
kullanımı korur; premium üyelik veya ödeme akışı içermez.
