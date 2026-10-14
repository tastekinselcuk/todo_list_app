# Davet ve yetki güvenlik incelemesi

İnceleme kapsamı: sekme davetleri, koleksiyon üyeliği, okuma/yazma yetkileri ve başka bir kullanıcıdan gelen not içeriğinin gösterimi.

## Bulgular ve yapılan düzeltmeler

| Bulgu | Sonuç |
| --- | --- |
| Kullanılmış link başka hesapta reddediliyordu; aynı hesap yeniden kabul edebiliyordu. Erişimi kaldırılan kişi eski davetle geri dönebilirdi. | İlk başarılı kabulden sonra aynı hesap dahil tüm kabuller `INVITE_USED` ile reddedilir. Sahibinin kendi davetini kabul etmesi de linki tüketir. |
| Bütün katılımcılar düzenleyiciydi. | Davete `viewer` / `editor` yetkisi eklendi. Yeni davetlerin varsayılanı görüntülemedir. Eski katılımcıların ve kullanılmamış davetlerin düzenleyici yetkisi korunur. |
| Arayüzde kontrolleri gizlemek tek başına yeterli olmaz. | 12 kök tabloda SELECT üyelik erişimini, INSERT/UPDATE/DELETE yazma yetkisini kullanır. Alt kayıt mutasyonları, plan dönem taşıma ve kasa yeniden şifreleme RPC'leri de yazma yetkisini doğrular. Üyelik tablosuna doğrudan rol yazılamaz. |
| Detaylı not HTML'i editörün DOM'una temizlenmeden yükleniyordu. | DOMPurify ile gösterim, kaydetme ve yapıştırma temizlenir. Salt okunur editörde biçimlendirme ve içerik değiştirme kapatılır. |
| Kasa bağlantılarında tehlikeli URL şemaları gösterilebilirdi. | Bağlantılar yalnızca HTTP(S) olabilir; yeni pencere bağlantılarında `noopener noreferrer` kullanılır. |

Davetin tüketilmesi, üyeliğin eklenmesi ve çalışma alanına bağlanması tek transaction içinde gerçekleşir. Koleksiyon ve davet satırları kilitlenir; kabul sırasında kullanılmış/iptal edilmiş/süresi dolmuş durumları tekrar denetlenir. Başarısız kabul daveti tüketmez. Mevcut üyenin farklı yetkili bir linkle sessizce rol değiştirmesi reddedilir; sahibi erişimi kaldırıp yeni yetkiyle davet eder.

Token iki rastgele UUID'den oluşur; yalnızca SHA-256 özeti veritabanında tutulur. Davetler yedi gün geçerlidir, kullanılmadan önce iptal edilebilir ve oturum gerektirir. Realtime kanalları özel üyelik kontrolünü kullanmaya devam eder; erişim kaldırılınca kanal sürümü değişir.

Görüntüleyici ortak notları okuyabilir/kopyalayabilir ve Bilgi Kartları'nın kişisel test/oyun ekranlarını kullanabilir. Ekleme, düzenleme, ortak tamamlama ve silme hem sekmelerde hem ana sayfada kapalıdır. Görüntüleme yetkisi kasa parolası ihtiyacını kaldırmaz.

## Sınırlar

Kullanılmamış link belirli bir e-posta adresine bağlı değildir. Linki elinde bulunduran, giriş yapmış ilk kişi kabul edebilir. Tek kullanımlılık linki yanlış kişiye iletmeyi önlemez; bu durumda açık davet iptal edilmelidir. Kabul edildikten sonra erişim linkten bağımsız üyelikle sürer; üyelik sahibi tarafından kaldırılabilir.

Bu inceleme paylaşım akışını kapsar; tüm uygulama için bir sızma testi veya sıfır risk garantisi değildir. `npm audit`, mevcut paket ağacında 4 orta / 23 yüksek olmak üzere 27 uyarı bildiriyor. DOMPurify bu uyarılar arasında yok. Uyarılar mevcut Vue/Tiptap ve geliştirme/derleme bağımlılıklarını da kapsıyor; paket ağacının genel güncellemesi bu paylaşım değişikliğine dahil edilmedi.

## Doğrulama ve kurulum

`npm.cmd test`: 85 test geçti. Gerçek PostgreSQL motoruyla (PGlite) migration, RLS, RPC, aynı hesabın kullanılmış davetle dönmesi, rol değiştirme girişimi, 12 tablonun görüntüleyici yazma engelleri ve eski kurulumun yükseltilmesi sınandı. Ek olarak arayüzün salt okunur kontrolleri, HTML/URL güvenliği, Supabase sorguları ve kasa şifrelemesi test edildi.

`npm.cmd run build`: TypeScript kontrolü ve üretim derlemesi geçti. Canlı Supabase'e bu çalışmada SQL uygulanmadı; açık tarayıcı bulunmadığından görsel doğrulama yapılmadı.

Mevcut kurulumda yalnızca `supabase/migrations/tab_sharing_permissions.sql` çalıştırılıp uygulama yenilenmelidir. Tam kurulum sırası ve canlı hesap kontrolleri [TAB_SHARING_SETUP.md](TAB_SHARING_SETUP.md) içinde.

İlgili temel belgeler: [PostgreSQL satır kilitleri](https://www.postgresql.org/docs/current/explicit-locking.html), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [DOMPurify](https://github.com/cure53/DOMPurify).
