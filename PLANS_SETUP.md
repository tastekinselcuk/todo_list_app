# Planlar — kurulum ve davranış

Supabase SQL Editor'da `supabase/migrations/plans.sql` dosyasının tamamını çalıştırın. Bu işlem mevcut görev ve hatırlatma tablolarını değiştirmez. Yeni `plans` tablosu ve her kullanıcının yalnızca kendi kayıtlarına erişmesini sağlayan RLS politikası oluşturulur.

Uygulamada **Planlar** sekmesini açın. Yeni ve mevcut kullanıcılar için bu modül varsayılan olarak etkinleştirilir; çalışma alanı ayarlarından kapatılabilir. Türkçe metinler için uygulama dilini Türkçe seçin.

- Bir metin ve günlük / haftalık / aylık / yıllık dönem seçip Enter'a veya Ekle'ye basın. Kayıt, ekleme gününün içinde bulunduğu döneme yazılır.
- Sekme açıldığında güncel dönemde kaydı bulunan en kısa vade seçilir. Hiç kayıt yoksa günlük açılır. Tamamlanmış kayıtlar da dolu liste sayılır.
- Haftalar pazartesi başlar; aylar ve yıllar takvim sınırlarını izler. Tarayıcının yerel saat dilimi kullanılır.
- Dönem değiştiğinde tamamlanmayan planlar yeni döneme taşınır. Önceki dönemin durumu ve erteleme nedeni geçmişe kaydedilir. Birden fazla dönem boyunca giriş yapılmasa da aradaki dönemler korunur. Taşıma, sekme açılınca veya açık sekmede tarih değişince gerçekleşir.
- Erteleme nedeni zorunludur. Plan tamamlanınca güncel erteleme listesinden ve nedeninden temizlenir; önceki dönemlerdeki nedenler tarihsel kayıt olarak korunur. Listeye geri al düğmesi yalnızca güncel erteleme nedenini kaldırır.
- Geçmişi göster anahtarı kullanıcı bazında bu tarayıcıda hatırlanır. Günlük / haftalık / aylık / yıllık sekmelerin her birinde kendi geçmişi dönemlere göre açılır. Geçmiş kayıtlar salt okunurdur.

Planlar Supabase'de tutulur. Veritabanı kurulmadan veya bağlantı başarısızken uygulama başarı göstermeden hata ve tekrar deneme seçeneği sunar. Mevcut Detaylı Notlar modülündeki kayıtlar otomatik olarak dönüştürülmez; o modülde kalır.

Doğrulama: `npm run build` ve `node --test tests/plans.test.cjs`.

## Geçici örnek veriler

`supabase/seeds/plans_demo.sql` dosyasının tamamını Supabase SQL Editor'da çalıştırın. Projede tek kullanıcı varsa hesap otomatik seçilir. Birden fazla kullanıcı varsa `SELECT id, email FROM auth.users;` sorgusuyla uygulamadaki hesabınızı bulup dosyanın başındaki `demo_email text := '';` alanına kayıtlı e-postanızı yazın. Hiç kullanıcı yoksa doğru Supabase projesini açtığınızı kontrol edin ve uygulamadan hesap oluşturun. Tarihler İstanbul saat dilimindeki güncel ay ve yıldan hesaplanır. Sorgu 6 aylık ve 6 yıllık örnek ekler; mevcut planları değiştirmez ve tekrar çalıştırıldığında örnekleri çoğaltmaz.

Planlar sekmesini yeniden açın veya sayfayı yenileyin. **Aylık** ve **Yıllık** sekmelerinde **Geçmişi göster** anahtarını açıp dönem satırlarına tıklayın. Tamamlanan işler eski dönemlerde kalır; eski tamamlanmamış işler güncele taşınıp önceki durumları arşivlenir. Geçmiş erteleme nedenlerini ve güncel Ertelenenler bölümünü de inceleyebilirsiniz. Yalnızca test verisi varsa, güncel aylık ve yıllık listelerin her birinde 4 plan ve 1/4 tamamlanma görürsünüz.

Temizlemek için `supabase/seeds/plans_demo_cleanup.sql` dosyasını çalıştırın. Tek kullanıcı otomatik seçilir; birden fazla kullanıcı varsa dosyanın başındaki `demo_email` alanına örnekleri eklerken kullandığınız e-postayı yazın. Bu sorgu yalnızca seçilen hesabın örneklerine ait bilinen 12 kimliği ve onların geçmişini siler. Temizlikten sonra sayfayı yenileyin. Bu iki dosya test amaçlıdır; migrations klasörüne eklenmemiştir.
