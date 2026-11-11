# Güvenli Kasa: Apple karşılaştırması ve uygulama kararı

İnceleme: 11–12 Kasım 2026. Kullanıcının Apple/Keychain araştırması, kaynak kodu ve resmi belgeler birlikte değerlendirildi. Önceki `GUVENLI_KASA_ANALIZI.md` önerilerinin uygulama karşılığı bu belgedir. Bu metin bağımsız güvenlik denetimi veya hukuki uygunluk belgesi değildir.

## Apple parolayı yeniden nasıl gösterebiliyor?

Kimlik doğrulamada kullanılan parola özeti (hash) ile kasada saklanan bir sitenin parolası farklı şeylerdir. Hash geri çevrilmez; bir parolanın doğru olup olmadığını sınamak içindir. Saklanan parolayı tekrar göstermek için **doğru anahtarla geri çözülebilen şifreleme** gerekir. Şifrelenmiş veri düz metin parola değildir.

Apple, Keychain öğelerini AES-256-GCM ile korur; metadata ve gizli kayıtlar için ayrı anahtarlar kullanır. Anahtar erişimi cihazın koruma sınıfları, kilidi ve Secure Enclave ile ilişkilidir. Face ID/Touch ID, biyometrik görüntünün doğrudan AES anahtarı olması anlamına gelmez. [Apple: Keychain data protection](https://support.apple.com/en-sg/guide/security/secb0694df1a/web).

iCloud Keychain kurtarması yalnızca e-posta onayından ibaret değildir; ikincil doğrulama ve özel korumalı escrow altyapısı içerir. [Apple: Secure iCloud Keychain recovery](https://support.apple.com/en-ca/guide/security/secdeb202947/web).

Araştırmadaki istemci tarafı şifreleme, rastgele kasa anahtarı, parola ile anahtar sarma ve önceden hazırlanmış kurtarma anahtarı önerilerini uygulayabiliyoruz. Apple donanım güvenliği, cihazlar arası güven zinciri veya HSM destekli kurtarma sağladığımızı iddia edemeyiz. Web uygulaması teslim edilen JavaScript koduna, tarayıcıya ve cihaz güvenliğine güvenmeye devam eder. Aynı kökenden çalışan zararlı kod açık kasadaki sırları okuyabilir.

## Rakip not uygulamalarında karşılığı

| Ürün | Koruma / kurtarma davranışı | Bizim için karşılığı |
|---|---|---|
| Apple Notes | Cihaz parolası veya ayrı Notes parolasıyla kilitleme. Ayrı parola unutulursa yeni parola eski kilitli notları açmaz. | Hesap sıfırlaması geçmiş şifreli içeriği otomatik açmaz. |
| Standard Notes | İçeriği cihazda uçtan uca şifreler. Parola ve açık oturumlar kaybedildiğinde normal parola sıfırlaması yok; açık cihazdan dışa aktarma veya hesabı silip yeniden başlama seçenekleri var. | Açık kurtarma sınırı, yedek ve veri kaybı ayrımı. |
| Evernote | Not içindeki seçili metni ayrı parola ile şifreleme. Bu, tüm hizmetin uçtan uca şifreli olduğu anlamına gelmez. | Şifreli kasa ile normal notların güvenlik kapsamını ayırmak. |
| Bitwarden | Ana parola olmadan hesap e-postasındaki onay üzerinden hesabı silme yolu sunar. Bu eski sırları çözmez. | E-posta ile yetkili silme mümkün; içeriği koruyan kurtarma için ek sır gerekir. |

Kaynaklar: [Apple Notes](https://support.apple.com/en-us/102537), [Standard Notes parola unutma](https://standardnotes.com/help/6/i-ve-forgotten-my-password-what-should-i-do), [Evernote metin şifreleme](https://help.evernote.com/hc/en-us/articles/209005547-Encrypt-text-in-a-note), [Bitwarden hesap silme](https://bitwarden.com/help/delete-your-account/). Uyarlamalar ürün tasarımı değerlendirmesidir; aynı teknik altyapıyı kullandığımız anlamına gelmez.

## Uygulanan anahtar modeli

1. Her yeni kasada kriptografik rastgele **256 bit veri anahtarı** üretilir.
2. Başlık, açıklama, kullanıcı adı, saklanan parola, URL ve gizli içerik cihazda AES-256-GCM ile şifrelenir. Her yazımda yeni 96 bit IV kullanılır. Kasa/kayıt UUID'si ek doğrulama verisidir; başka kayda taşınan ciphertext açılamaz.
3. Kasa parolasından PBKDF2-HMAC-SHA256, rastgele salt ve **600.000 iterasyon** ile sarma anahtarı türetilir. Yeni parola en az 12 karakterdir; uzunluk güvenlik garantisi sayılmaz. Yerleşik WebCrypto kullanıldı. Argon2id bellek maliyeti avantajına sahiptir; incelenmemiş WASM bağımlılığı ve CSP değişikliği bu sürüme eklenmedi. Bu seçim FIPS sertifikası iddiası değildir. [OWASP seçenekleri](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
4. Veri anahtarı ayrıca rastgele **256 bit kurtarma sırrından** HKDF ile türetilen anahtarla sarılır. Sunucuda iki şifreli anahtar zarfı bulunur; yeni/güncellenmiş kasalarda kasa parolası ve kurtarma sırrı gönderilmez.
5. Parola değişikliği yalnızca anahtar zarfını değiştirir; bütün kayıtları tekrar şifrelemez. Kurtarma işlemi önceki kurtarma sırrını geçersiz kılar. Mevcut parolayla yeni kurtarma anahtarı da oluşturulabilir.
6. Kullanımdaki AES anahtarları export edilemeyen CryptoKey olarak bellekte tutulur. JS belleğinin fiziksel sıfırlanması veya işletim sistemi seviyesinde gizlenmesi garanti edilmez.

Kasa adı, sahiplik/paylaşım, UUID'ler, zaman damgaları, silinme zamanı ve güvenlik işlemi türü açık metadatadır; kişisel veri değerlendirmesine dahildir.

### Eski kasalar

Mevcut AES-GCM v1 kasalar okunmaya devam eder. Kasa sahibi **Kurtarmayı etkinleştir** ile mevcut parolayı doğrular, yeni güçlü parola belirler; tüm kayıtlar istemcide açılıp v2 rastgele anahtarla yeniden şifrelenir. Silinen kayıtlar ve şifreli sürüm geçmişi dahil geçiş atomiktir; eksik kayıt/geçmiş, yanlış sürüm veya hatalı ciphertext varsa işlem geri alınır.

Çok eski düz metin uyumluluk biçimi doğrudan içerik ekranına açılmaz; sahibine yükseltme sunulur. Geçmişte sunucuda bulunmuş düz metnin önceki yedeklerden veya günlüklerden silindiği iddia edilmez. Mevcut canlı kasaların tamamının yükseltildiği doğrulanmış değildir; migration içerikleri otomatik çözmez veya değiştirmez.

### Kurtarma ve silme

| Elindeki doğrulama | Sonuç |
|---|---|
| Mevcut kasa parolası + hesap e-posta kodu | Parola veya kurtarma anahtarı yenilenir; içerik korunur. |
| Önceden kaydedilmiş kurtarma anahtarı + hesap e-posta kodu | Yeni parola ve kurtarma anahtarı; içerik korunur. |
| Yalnızca hesap erişimi + e-posta kodu | Açık kalıcı silme onayıyla kasa silinebilir veya içi boşaltılarak yeniden kurulabilir. |
| Parola da kurtarma anahtarı da yok | Eski içerikler geri getirilemez. E-posta şifrelemeyi çözmez. |

E-posta işlemleri kasa sahibine özeldir. Kod doğrulanmış hesap e-postasına gider; body'den kullanıcı/alıcısı kabul edilmez. Kod 8 hane, 10 dakika, en fazla 5 deneme ve tek kullanımlıktır. Kodlar HMAC özetleriyle tutulur; kullanıcı, oturum, e-posta, kasa, sürüm ve hazırlanmış işleme bağlanır. Kullanıcı başına dakikada 30 güvenlik isteği, 15 dakikada 3 gönderim ve gönderimler arasında 60 saniye sınırı vardır. Aktif MFA varsa AAL2 gerekir. Bunlar sınırsız DDoS koruması iddiası değildir.

Doğrudan REST ile kasa anahtarı değiştirme veya kasayı silme engellenir. Çalışma alanını silerek denetimi atlama da engellenir; önce kasalar e-posta doğrulamasıyla kaldırılmalıdır. Editörler kayıt yazabilir; kasa güvenliği sahibindedir. Paylaşımdan çıkarılmış birinin daha önce gördüğü/kopyaladığı veri geri alınamaz. Kişi başına anahtar zarfı ve kriptografik erişim iptali bu sürümün kapsamında değildir.

## Günlük kullanım

- Beş dakika etkileşimsizlik, bir dakika arka planda kalma, modülden çıkış ve pagehide durumunda kilit; parola, açık kayıtlar ve taslaklar temizlenir. Dönüşte gerçek geçen süre kontrol edilir.
- Gösterilen sırlar 30 saniye sonra maskelenir. Panonun diğer uygulamalardan veya işletim sistemi geçmişinden silindiği vaat edilmez.
- Kayıt silme 30 günlük kasa içi silinenlere taşır. Son 10 **şifreli** sürüm tutulur. Tüm kasayı silme/sıfırlama bunları da kaldırır.
- Bağımsız parolayla şifreli `.pvault` yedek; içe aktarma mevcut kasayı ezmeden yeni kasa oluşturur. Kayıtlar yeni UUID/anahtarla tekrar şifrelenir. Yedek silinen kayıtları içerebilir; geri yüklenenler aktif gelir. Geçmiş sürümler yedekte yer almaz.
- Tarayıcı depolamasına kasa anahtarı, parolası, kurtarma anahtarı veya açık not yazılmaz. Sunucudan başarı gelmeden kayıt tamamlandı sayılmaz. Kaydedilmemiş taslak sekme kapanınca kaybolur; sunucuya kaydedilen şifreli kayıt tarayıcı önbelleği silindiği için kaybolmaz.

## Bilgilendirme ve hukuki sorumluluk

İlk kullanım ekranı **bilgilendirme ve okundu kaydıdır**. Önceden işaretlenmiş kutu yoktur. Kullanıcı/sürüm/zaman kaydı sunucuda tutulur; hesabın diğer cihazları ve çalışma alanlarında yerel kabul gerekmez. Güncel kaydı bulunmayan eski kullanıcılar da görür. Metin sürümü değişirse veritabanı ve arayüz birlikte güncellenmelidir.

“Hiçbir sorumluluk kabul etmiyoruz” kutucuğu zorunlu hukuki yükümlülükleri kaldırmaz. KVKK aydınlatması ile gerektiğinde alınacak açık rıza birbirinden ayrıdır. Uygun hukuki sebep ayrıca belirlenir; toplu rıza istenmez. [KVKK aydınlatma](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-), [aydınlatma rehberi](https://kvkk.gov.tr/SharedFolderServer/CMSFiles/a569a068-c079-4189-b134-f57bc727af7d.pdf), [veri güvenliği yükümlülükleri](https://www.kvkk.gov.tr/Icerik/2040/Veri-Guvenligine-Iliskin-Yukumlulukler).

Teknik metin tam KVKK aydınlatma metni değildir. Yayından önce gerçek veri sorumlusu adı/iletişimi, amaçlar/hukuki sebepler, alıcı ve sağlayıcılar, saklama süreleri, başvuru kanalı, yurt dışı aktarım düzeni ve sözleşmeler hukuk uzmanıyla tamamlanmalıdır. Supabase/Netlify/e-posta sağlayıcısı kullanımı değerlendirilmelidir. Bu bilgiler bilinmediği için şirket veya adres uydurulmamıştır. Şifreleme hukuki değerlendirmeyi gereksiz kılmaz.

Güvenlik olayları 180 gün, kod kayıtları en fazla bir gün; silinen kayıtlar 30 günlük geri alma süresinden sonra kuyruk halinde temizlenir. Barındırma yedeklerinin saklama/silme takvimi ayrıca belirlenmelidir; “anında her yedekten silindi” iddiası kullanılmaz.

## Yayın durumu

12 Kasım 2026'da yeni arayüz, migration, kasa güvenlik servisi ve temizlik servisi yayınlandı. Projedeki altı Resend/kasa ayarı doğrulandı; tek gerçek test e-postası için Resend teslim durumu `delivered` olarak görüldü. `VAULT_MAIL_MODE=test` olduğundan güvenlik e-postaları yalnızca yapılandırılmış test hesabına gönderilir. Bu, tüm kullanıcılara üretim gönderiminin açıldığı anlamına gelmez. [Yayın kaydı](SECURE_VAULT_RELEASE_2026_11_12.md), [kurulum ve üretime geçiş](SECURE_VAULT_SETUP.md).

Bağımsız denetim, gerçek mobil Safari testi, e-posta teslimatı ve hukuki belgeler tamamlanmadan “hatasız”, “Apple kadar güvenli”, “denetlenmiş sıfır bilgi” veya “tüm hukuki sorumluluk kaldırıldı” denmemelidir.

## Doğrulama kaydı

Genel regresyon paketi: 574 test geçti. Ardından eklenen v1 sürüm geçmişi geçişi / eksik geçmişte rollback / hatalı içe aktarmada rollback senaryoları dahil kasa odaklı 14 test de geçti. Üretim build'i ve Edge handler TypeScript kontrolü başarılı. Derlemede mevcut büyük bundle uyarıları bulunuyor. Veritabanı testleri PGlite üzerinde gerçek SQL ve rol politikalarını çalıştırır; canlı kullanıcı kasalarıyla deneme yapılmadı. Gerçek sağlayıcı e-postası gönderilmedi.
