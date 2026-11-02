# Finans: kategoriler ve aylık bütçeler

Mevcut gelir/gider ve yatırım kayıtlarına kategori bütçeleri, işlem filtreleri ve kategori harcama analizi ekler. Çalışma alanının kişisel finans erişim kuralları ve fiyat sağlayıcıları korunur.

## Veritabanı geçişi

Önce mevcut çalışma alanı altyapısının ve şu finans geçişlerinin uygulanmış olması gerekir:

1. `supabase/migrations/202610120005_finance.sql`
2. `supabase/migrations/202610130001_finance_recurring_market.sql`
3. `supabase/migrations/202610140001_finance_try.sql`

Ardından [202611010001_finance_budgets.sql](supabase/migrations/202611010001_finance_budgets.sql) dosyasının tamamını ilgili Supabase projesinin SQL Editor ekranında çalıştırın. Yeni arayüzü yayına almadan önce bu geçiş uygulanmalıdır. Bu geliştirme sırasında canlı veritabanına uygulanmadı.

Geçiş tek veritabanı işlemi içinde çalışır. Mevcut gelir/gider, tekrar ve yatırım kayıtlarını silmez. Eski kategori adlarını çalışma alanına ait kategorilere dönüştürür; kategorisiz kayıtlar kategorisiz kalır. Aynı dosyanın tekrar çalıştırılması kayıtları çoğaltmaz. Önceki finans geçişlerini yeni geçişin ardından yeniden çalıştırmayın; eski fonksiyon tanımlarını geri getirebilirler.

Yeni tablolar `finance_categories` ve `finance_budget_limits` için kişisel RLS kuralları uygulanır. Yazmalar, çalışma alanı sahipliğini ve kayıt sürümünü denetleyen RPC fonksiyonlarından geçer. Bu sürüm için fiyat Edge Function yapılandırmasında değişiklik gerekmez.

## Kullanım ve davranış

- Hızlı girişte tutar, gelir/gider ve isteğe bağlı kategori seçilir. Açıklama isteğe bağlıdır; tarih ve tekrar seçenekleri ayrıntılar düğmesindedir.
- **Aylık bütçeler** bölümünden Yiyecek, Aburcubur, Eğlence, Araç gibi istenen kategoriler oluşturulabilir. Otomatik örnek kategori veya harcama eklenmez.
- Limit alanını boş bırakmak sınırsız anlamına gelir. `0`, o kategoriye hiç harcama planlanmadığını belirtir; pozitif harcamalar limiti aşmış görünür. Bütçeler yalnızca giderleri sayar.
- **Yalnızca bu ay**, seçilen aya özel bir değer uygular. **Bu ay ve sonraki aylar**, seçilen aydan itibaren gelecekteki limitleri bu değerle değiştirir. Önceki aylar korunur. Kullanılmayan tutar sonraki aya devretmez.
- Kategoriyi yeniden adlandırmak ilişkili kayıtların görünen adını günceller. Arşivlemek, yeni kayıtlar için seçim listesinden kaldırır; geçmişi ve mevcut tekrarları silmez. Arşivleme bütçeyi kaldırmaz; limiti kaldırmak için ilgili dönem kapsamıyla boş değer kaydedin.
- Bir tekrarın kategorisini değiştirmek gelecekte oluşacak kayıtlara uygulanır. Önceden oluşmuş kayıtlar korunur. Vadesi gelen tekrarın otomatik kaydedilmesi, ödemenin doğrulandığı anlamına gelmez.
- Bütçe çubukları harcanan tutarı, kalan limiti ve aşımı gösterir. Kategori adına tıklamak ilgili giderleri filtreler. Arama, işlem türü, kategori ve tekrar filtreleri birlikte kullanılabilir.
- İşlemler 50 kayıtlık sayfalarla yüklenir. Bütçe ve filtre toplamları yalnızca görünen sayfayı değil, eşleşen tüm kayıtları kapsar. Üst özet her zaman ayın tamamını gösterir.
- **Analiz** bağlantısı seçilen ayı taşır. Kategori harcama çubuğuna tıklamak o kategorinin işlem detaylarını açar. Yatırım değerleri mevcut fiyatlara dayanır; seçilen ayın geçmiş portföy değerini ifade etmez.
- Finans kaydı, tekrar veya tutar tanımlanmış bir bütçe kuralı bulunduğunda temel para birimi değiştirilemez. Dönem neti ve kalan bütçe, banka hesabı bakiyesi değildir.

## Doğrulama

```text
npm.cmd test
npm.cmd run build
```

Finans SQL testleri geçişi geçici PGlite veritabanında çalıştırır; eski kayıtlar, ay kapsamları, sıfır/sınırsız limit, tam toplamlar, sayfalama, sürüm çakışmaları, tekrarlar ve erişim ayrımını kontrol eder. Arayüz testleri jsdom üzerinde bütçe düzenlemeyi, filtrelemeyi ve işlem düzenlenirken hızlı giriş taslağının korunmasını doğrular.

Tarayıcı bağlantısı bu çalışma ortamında kullanılamadığı için görsel tarayıcı doğrulaması yapılamadı. Geçiş sonrasında dar/geniş ekranda açık/koyu tema, kategori açılır menüleri ve düzenleme pencereleri gerçek tarayıcıda kontrol edilmelidir.
