# Planlar — Zamansız notlar ve odak oturumları

## Mevcut kurulumun güncellenmesi

Supabase SQL Editor'da `supabase/migrations/202611060001_timeless_plans_focus.sql` dosyasının **tamamını** çalıştırın. Ardından uygulamayı yenileyin. Bu dosya mevcut çalışma alanı, paylaşım, analiz, odak oturumları, arama ve çöp kutusu kurulumunun üzerine uygulanır. Yeni bir projede önce bu modüllerin önceki migration dosyaları kurulmalıdır.

Güncelleme tek transaction içinde uygulanır ve tekrar çalıştırılabilir. Uygulama kodunu yüklemek veritabanındaki dönüşümü kendi başına çalıştırmaz.

- Kişisel Hızlı Notlar aynı kimlik, metin, tamamlanma durumu, oluşturulma tarihi ve silinme bilgisiyle Planlar → Zamansız'a taşınır. Çöp kutusundaki kayıtlar da korunur; geri alındıklarında Zamansız'da görünür.
- Paylaşılan eski Hızlı Notlar aynı listede gösterilir, ancak mevcut erişim izinlerini korumak için kaynak koleksiyonları değiştirilmez. Bir koleksiyonun üyeleri diğer koleksiyonun notlarına erişemez. Eski paylaşım Ayarlar'daki “Zamansız notların paylaşımı” bağlantısından yönetilebilir.
- Hızlı Notlar ve PomoNotes ayrı sekme olarak kaldırılır. Eski PomoNotes listesi yeni Planlar'a aktarılmaz; bu listenin eski paylaşım bağlantıları ve üyelikleri kapatılır. Odak oturumu altyapısı ve geçmiş süreler korunur. Planların kendisi paylaşılabilir; sayaç bağlantıları ve odak kayıtları kişiseldir.
- Önceden ertelenmiş planlar normal listeye döner. Erteleme eylemi ve geçmişteki erteleme açıklamaları kaldırılır. Eski migration/RPC uyumluluğu için veritabanındaki `reason` sütunu boş olarak kalır; uygulama bu alanı kullanmaz.

## Planların davranışı

- Dönem sırası: **Zamansız, Günlük, Haftalık, Aylık, Yıllık**.
- Zamansız notlar dönem değişiminden etkilenmez. Tamamlanmış olanlar da siz silene kadar bu listede kalır. “Geçmişi göster” burada bulunmaz.
- Diğer dönemlerde tamamlanmayan işler yeni döneme taşınır; önceki dönemlerin tamamlanma durumu geçmişte korunur. Tamamlanan işler kendi döneminde kalır. Haftalar pazartesi başlar. Paylaşılan koleksiyonun saat dilimi kullanılır.
- Giriş alanında dönem seçip Enter'a veya Ekle'ye basın. Kayıt sunucuda doğrulanmadan başarı gösterilmez. Yazılmamış taslaklar sekmeden çıkınca temizlenir.
- Silme mevcut çöp kutusu akışını kullanır. Zamansız notların **aktif listede** süre sınırı yoktur; çöp kutusunun mevcut saklama süresi değişmez.

## Plan üzerinden odaklanma

Odak Zamanlayıcı etkinse tüm Planlar dönemlerindeki notların yanında oynat simgesi bulunur. Simge o plan için odak başlatır; aktif yerel oturumda duraklatır. Başka bir plan üzerinde devam eden oturum varsa seçilen plan sıraya alınır.

İlk bağlantı mevcut sayaç süresini ve **1 oturum** hedefini kullanır. Sonrasında satırdaki `tamamlanan/hedef` göstergesinden süre ve hedef düzenlenebilir. Süre 1–90 dakika, hedef 1–999 oturum olabilir. Bu değerler ve oturum sayıları kişiseldir; paylaşılan planı görüntüleyenler bağımsız odaklanabilir. Hedefe ulaşmak planı kendiliğinden tamamlamaz.

Sayaç mevcut oturum kaydı, cihazlar arası sahiplik ve analiz altyapısını kullanır. İçeride oluşturulan odak kaydı ikinci bir not olarak listelenmez, aramaya veya plan adetlerine eklenmez. Silinen, tamamlanan ya da erişimi kaldırılan bir planla yeni oturum başlatılamaz; önceden kaydedilmiş süreler kaybolmaz.

## Doğrulama

`npm run build`

`node --test tests/plans.test.cjs tests/plans-focus-ui.test.cjs tests/plans-timeless-sql.test.cjs`

SQL testleri veri dönüşümünü, tekrar uygulamayı, paylaşılan koleksiyon izinlerini, çöp kutusunu, aramayı, dönem devrini, kişisel hedefleri, oturum sayımını ve erişim kaldırılmasını kapsar.
