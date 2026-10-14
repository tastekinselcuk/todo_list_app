# Bir kullanıcı altında birden fazla çalışma alanı

## Tamamlanan aşamalar

- [x] Workspace tablosu, kullanıcı sahipliği ve mevcut kayıtların ilk **Kişisel** alana geçirilmesi.
- [x] Tüm sekmelerde sorguların ve kayıtların kullanıcı + workspace ile ayrılması.
- [x] Ayarlarda sınırsız workspace oluşturma, isim değiştirme, arşivleme ve geri yükleme.
- [x] Sekme kartının üstünde arama destekli hızlı workspace seçimi.
- [x] Workspace'e özel etkin sekmeler, son açık sekme, filtreler ve not taslakları.
- [x] Geçişlerde eski isteklerin yeni workspace durumuna yazmasının önlenmesi; kasa oturumunun kapanması.
- [x] Pomodoro'nun workspace geçişinde devam etmesi; rutin bildirimlerinin tüm açık alanları kapsaması.
- [x] Uygulama ve PostgreSQL migration testleri.
- [ ] Aşağıdaki SQL migration'ının canlı Supabase projesinde çalıştırılması.
- [ ] Canlı verilerle tarayıcıda son görünüm kontrolü.

## Etkinleştirme

1. Mevcut modüllerin tablo kurulumlarını tamamla. Bu migration, kurulu olmayan modül tablolarını `NOTICE` ile atlar; yeni modül tablosu sonradan kurulursa migration'ı tekrar çalıştır.
2. Supabase **SQL Editor** içinde `supabase/migrations/workspaces.sql` dosyasının tamamını çalıştır.
3. Uygulamayı yenile. Mevcut kayıtların ve sekme tercihlerinin **Kişisel** alanında görünmesi gerekir.
4. **Ayarlar → Çalışma Alanları** bölümünden örneğin **İş** oluştur. Yeni alan boş başlar; mevcut notlar kopyalanmaz.
5. Sekme kartının üstündeki workspace adıyla alanlar arasında geçiş yap. Ayarlardaki modül seçimleri seçili workspace için geçerlidir.

Migration bir transaction içinde çalışır ve tekrar uygulanabilir. Mevcut notları, plan geçmişlerini, erteleme nedenlerini ve kasa içeriğini silmez. Eski `user_settings` tablosu geçiş için korunur; sonraki modül ayarları `workspaces.active_modules` üzerinden saklanır.

Eski kayıtların sahibinin boş olması durumunda veritabanında yalnızca bir kullanıcı varsa kayıtlar bu kullanıcıya bağlanır. Birden fazla kullanıcı varsa migration sahipliği tahmin etmez: hata verip tüm değişiklikleri geri alır. Bu durumda sahipliği boş kayıtların doğru `created_by` / `user_id` değerlerini belirleyip migration'ı tekrar çalıştır.

## Davranışlar

- Workspace sayısına uygulama sınırı uygulanmaz. Adlar kullanıcı içinde benzersizdir; 1–80 karakter kullanılır.
- Arşivlenen alanların kayıtları korunur; alan geri yüklendiğinde notlar tekrar erişilebilir olur. En az bir alan açık kalır. Kalıcı workspace silme bu sürümde bulunmaz.
- Planlar, detaylı/hızlı notlar, kategoriler, kasa oturumları ve notları, kodlar, öğrenme konuları, kart desteleri, antrenmanlar, rutinler ve listeler ayrıdır.
- Son workspace, açık sekme, filtreler ve taslaklar bu tarayıcıda kullanıcı + workspace anahtarıyla saklanır. Etkin sekmeler ve asıl kayıtlar Supabase'de tutulur. Eski ortak not önbelleği yeni alanlara aktarılmaz; gerçek veriler migration'dan sonra Supabase'den yüklenir.
- Kasa şifreleri ve gizli içerikler taslak olarak tarayıcıya yazılmaz. Workspace geçişi kasayı kilitler.
- Dil, tema ve geniş ekran tercihi kullanıcı genelinde kalır.
- Pomodoro workspace geçişinde ve ayarlara geçerken sıfırlanmaz.
- Rutin bildirimi izleyicisi uygulama açıkken etkin workspace'leri kontrol eder. Arşivlenen veya Rutinler sekmesi kapatılan alanlar bildirim göndermez. Bildirimde workspace adı bulunur. Uygulama kapalıyken sunucuda bildirim zamanlaması bu değişikliğin kapsamında değildir.
- E-posta bildirimleri kullanılıyorsa workspace adını e-postada göstermek için güncellenen `send-periodic-reminder` Edge Function'ını mevcut yöntemle tekrar deploy et. Eski function, workspace adı olmadan çalışmaya devam eder.

## Doğrulama

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
```

`tests/workspaces.test.cjs` gerçek workspace/store kodunu test istemcisiyle çalıştırır. `tests/workspaces-sql.test.cjs` migration'ı PGlite üzerinde PostgreSQL ile çalıştırarak kayıtların korunmasını, tekrar uygulanabilirliği, aynı isimli kayıtların ayrı alanlarda tutulmasını, ilişkilerin workspace dışına taşamamasını, RLS kurallarını ve arşivlemeyi doğrular. PGlite yalnızca geliştirme/test bağımlılığıdır; uygulamada Supabase kullanılmaya devam eder.

Canlı kontrol için Kişisel ve İş alanlarında aynı sekmeye farklı notlar ekle; alanı değiştirip yenile. Bir alanda düzenleme veya silmenin diğer alanı etkilemediğini, sekme tercihlerini ve arşivden geri yüklemeyi kontrol et.
