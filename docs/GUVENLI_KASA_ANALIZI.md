# Güvenli Kasa: ihtiyaç analizi ve geliştirme önerisi

> Bu dosya ilk incelemenin kaydıdır. 11–12 Kasım 2026 tarihli uygulama, Apple/rakip karşılaştırması ve yayın sınırları için [güncel raporu](GUVENLI_KASA_APPLE_VE_UYGULAMA.md) ve [kurulum rehberini](SECURE_VAULT_SETUP.md) okuyun. Aşağıdaki ilk inceleme durumu, yeni kodun henüz uygulanmadığı zamana aittir.

Tarih: 11 Kasım 2026. Bu rapor uygulama kodunun, mevcut testlerin, canlı veritabanındaki erişim politikalarının ve ürünlerin resmî belgelerinin incelenmesine dayanır. Uygulama davranışı değiştirilmedi; canlı kasalarda silme, parola değiştirme veya kurtarma işlemi yapılmadı. Özel kasa içerikleri okunmadı. Bu çalışma bağımsız bir sızma testi veya kriptografik denetim yerine geçmez.

## 1. Önerilen karar

**E-posta onayı eklenmeli; ancak kimlik doğrulama ile şifreli içeriği kurtarma ayrı işlemler olarak tasarlanmalı.**

Önerilen ürün modeli:

- **Parolayı değiştir:** Kasa açılabiliyorsa mevcut içerik korunarak yeni parola belirlenir.
- **Erişimi kurtar:** Önceden oluşturulmuş kurtarma anahtarı ve hesap doğrulamasıyla içerik korunarak yeni parola belirlenir.
- **Kasayı sıfırla:** Kurtarma anahtarı da kayıpsa, sahibi hesap doğrulaması yaparak içerikleri kaldırır ve boş kasayla yeniden başlar. Bu işlem veri kurtarmaz.
- **Kasayı sil:** Sahibi doğrulandıktan sonra kasa ve içerikleri kaldırılır; diğer kasalara veya uygulama hesabına dokunulmaz.

Sadece e-posta kodu ile mevcut şifreli içeriği kayıpsız açma sözü verilmemeli. Bugünkü modelde kasa parolası veriyi açan anahtarın kaynağıdır. E-postaya erişmek bu anahtarı üretmez.

Silmenin yalnızca kasa içerisinde bulunması, parolasını unutan kullanıcının yönetim sorununu çözmez. Normal silme içeride kalabilir; kilit ekranındaki **Kasaya erişemiyorum** bağlantısından da sahip doğrulamasıyla sıfırlama/silme yolu bulunmalıdır.

## 2. Mevcut uygulama ne yapıyor?

| Alan | İncelenen davranış | Değerlendirme |
| --- | --- | --- |
| İçerik şifreleme | Tarayıcıda AES-256-GCM; kayıt başına rastgele IV ve kasa/kayıt bağlamı | Korunmalı |
| Görünür metadata | Kasa adı ve zaman bilgileri sunucuda açık; yeni formattaki kayıt başlığı/içeriği şifreli yük içinde | Kasa adına sır yazılmaması önerilmeli; bütün metadatanın gizli olduğu söylenmemeli |
| Anahtar türetme | Kasa parolasından PBKDF2-HMAC-SHA256, 310.000 iterasyon | Yeni sürümde güçlendirme ve mobil ölçüm gerekli |
| Anahtar saklama | Açık anahtar CryptoKey nesnesi olarak bellekte; dışa aktarım kapalı | Kalıcı tarayıcı depolamasına taşınmamalı |
| Kilitleme | Modülden ayrılınca ve bileşen kapanınca anahtar, çözülmüş kayıtlar ve taslaklar temizleniyor | Olumlu; hareketsizlik ve ekranın arka plana geçmesi eksik |
| Parola değiştirme | Bütün kayıtlar çözülüp yeni paroladan türetilmiş anahtarla yeniden şifreleniyor | Çalışıyor; çok kayıtta maliyetli |
| Eşzamanlı değişiklik | Kayıt sürümleri ve atomik `seal_vault` işlemi kullanılıyor; başka yerde parola değişirse açık kasa kilitleniyor | Yeni kurtarma akışında korunmalı |
| Kurtarma | Bağımsız kurtarma anahtarı/anahtar zarfı yok | E-posta tek başına veri kurtaramaz |
| Silme | Buton kasa açıldıktan sonra görünüyor; doğrudan kayıt silme çağrısı yapılıyor | Sunucu onayı ve yanlış silmeye karşı koruma eksik |
| İçerik tipleri | Parola ve gizli not; göster/gizle, kopyala, bağlantı aç | İlk aşama için kapsam yeterli |
| Geçmiş/geri alma | Kasa ve güvenli kayıtlar ortak çöp kutusu kapsamına alınmamış | Yanlış silmede uygulama içi geri alma yok |
| Parola politikası | Yeni kasa için boş olmayan parola yeterli; oluştururken ikinci giriş yok | Yazım hatası ve zayıf parola riski |
| Hata geri bildirimi | `verificationError` hesaplanıyor, doğrulama penceresinde gösterilmiyor | Kullanıcı yanlış parolada sonuç alamıyor gibi hissedebilir |
| Eski format | Eski kasa parolasıyla açık metin karşılaştırma yapabilen uyumluluk kolu var; açılışta yeni şifreli formata geçebiliyor | Eski kayıt varsa kontrollü geçiş öncelikli; canlıda bu tür kayıt bulunduğu iddia edilmiyor |

### Özellikle dikkat edilmesi gereken yetki ayrımı

Canlı veritabanında, hem `password_sessions` hem `secure_notes` için DELETE politikası `collection_write(collection_id)` olarak doğrulandı. Kodda bu yetki koleksiyonun owner/editor üyelerine veriliyor. Kasa silme için ayrıca e-posta onayı, yakın zamanda hesap doğrulaması veya kasa parolasının bilindiğine dair sunucu tarafında bir kapı görünmüyor.

Bu, herkesin başkasının kasasını silebildiği anlamına gelmez; koleksiyon erişim denetimi var. **Kasa parolası içerik gizliliği sağlar; bütün kasa üzerinde yıkıcı işlemlerin kim tarafından yapılabileceği ayrı bir sunucu yetkisi olmalıdır.** Butonun kilitli kasada görünmemesi bu yetkinin yerine geçmez.

`seal_vault` içindeki `previous_hash` da mevcut metadata değeriyle sürüm uyumunu kontrol eder; kasa parolasının sunucuda doğrulandığı şeklinde yorumlanmamalıdır.

İncelenen başlıca dosyalar:

- `src/lib/vaultCrypto.ts`: parola türetme, şifreleme ve kilit açma.
- `src/features/secure_notes/components/SecureNotes.vue`: oluşturma, kilitleme, silme, parola değiştirme ve doğrulama pencereleri.
- `src/features/secure_notes/components/SecureNoteItem.vue`: kopyalama, gösterme ve kart davranışı.
- `src/lib/workspaceScope.ts`: koleksiyon sınırı ve sürüm kontrolleri.
- `src/lib/workspaceTrash.ts`: güvenli kasanın çöp kutusu kapsamı dışında kalması.
- `supabase/migrations/tab_sharing_vault.sql` ve `tab_sharing_permissions.sql`: şifreli veri kontrolleri, atomik anahtar değişimi ve erişim politikaları.

## 3. Alternatif ürünlerden alınacak dersler

| Ürün | İlgili yaklaşım | Bizim ürüne çıkarım |
| --- | --- | --- |
| Bitwarden | Unutulan master parolayı sağlayıcı geri getiremiyor; önceden ayarlanmış alternatif erişim yolları var. Hesap, e-posta onayıyla giriş yapmadan da silinebiliyor. | Kurtarma ve silme aynı şey değil. E-posta sahipliği, içeriği okumadan silme yetkisi verebilir. |
| 1Password | Kişisel/aile hesaplarında önceden oluşturulmuş recovery code, e-posta doğrulamasıyla birlikte kullanılabiliyor; veri korunarak yeni hesap parolası ve Secret Key oluşturuluyor. | Kullanıcının sakladığı bir kurtarma sırrı ile e-posta doğrulamasını birleştirmek uygulanabilir bir örnek. |
| Proton | Hesap parolasını sıfırlama ile şifreli veriyi kurtarma açıkça ayrılıyor. E-posta üzerinden parola sıfırlama tek başına geçmiş veriyi açmıyor. | Ekran metinlerinde “hesaba erişim”, “kasayı kurtarma” ve “kasayı sıfırlama” ayrımı net olmalı. |

Kaynaklar: [Bitwarden parola kaybı](https://bitwarden.com/help/forgot-master-password/), [Bitwarden e-posta ile hesap silme](https://bitwarden.com/help/delete-your-account/), [1Password recovery codes](https://support.1password.com/recovery-codes/), [Proton hesap/veri kurtarma ayrımı](https://proton.me/support/set-account-recovery-methods).

Bitwarden'ın ayarlanabilir kasa zaman aşımı ve parola üreticisi; 1Password'ün kayıt geçmişi ile Watchtower kontrolleri de günlük kullanımda somut fayda sağlayan örnekler. Bunların hepsini ayrı sayfalar olarak kopyalamak yerine, mevcut kasa akışına küçük kontroller halinde eklemek daha uygun. [Bitwarden zaman aşımı](https://bitwarden.com/help/vault-timeout/), [parola üretimi](https://bitwarden.com/help/generator/), [1Password geçmiş](https://support.1password.com/item-history/), [Watchtower](https://support.1password.com/watchtower/).

Bu ürünlerin çoğunda kurtarma hesap düzeyinde; bizim mevcut yapımızda her kasanın ayrı parolası var. Ürün karşılaştırması birebir mimari eşitlik anlamına gelmez.

## 4. E-posta koduyla neler yapılabilir?

| İşlem | E-posta kodu tek başına şifreli içeriği açar mı? | Önerilen koşul |
| --- | --- | --- |
| Kasa parolası biliniyorken değiştirme | İçerik zaten mevcut parola ile açılır | Mevcut parola; riskli güvenlik işlemlerinde taze hesap doğrulaması |
| Parola unutulmuşken veriyi koruyarak kurtarma | Hayır | Kayıtlı kurtarma anahtarı + sahip/hesap doğrulaması |
| İçeriği boşaltıp yeni parola belirleme | İçeriği açmaya gerek yok | Sahip doğrulaması + açık veri kaybı onayı |
| Kasayı tümüyle silme | İçeriği açmaya gerek yok | Sahip doğrulaması + kasa adını doğrulama + son onay |

**Önerilmeyen varsayılan:** Sunucunun kurtarabileceği bir anahtar kopyası tutup e-posta kodundan sonra kullanıcıya vermek. Yönetilen anahtar kurtarma teknik olarak tasarlanabilir; ancak sunucunun veri açabilme yeteneğini ve güven modelini değiştirir. Mevcut tarayıcı tarafında gizlilik hedefinin küçük bir “parolamı unuttum” özelliği gibi sunulmamalıdır.

**Mevcut kilitli kasalara ilişkin sınır:** Bugüne kadar oluşturulmamış bir kurtarma anahtarını sonradan ekleyerek kayıp parolanın açtığı veriyi kurtaramayız. Kurtarma yeteneği, kullanıcı kasayı açabildiğinde kurulabilir. Parola da kurtarma sırrı da yoksa kalan yol veri kaybıyla sıfırlama/silmedir.

## 5. Önerilen şifreleme düzeni

Parola ile veriyi doğrudan şifrelemek yerine yeni sürümde bir kasa veri anahtarı kullanılmalı:

1. Kasa için rastgele bir veri anahtarı oluşturulur; kayıtlar bununla şifrelenir.
2. Kasa parolasından türetilen ayrı bir anahtar, veri anahtarını şifreli bir zarf içinde korur.
3. Önceden oluşturulan, yüksek entropili kurtarma sırrı aynı veri anahtarı için ikinci bir şifreli zarf oluşturur.
4. Sunucuda bu zarflar ve şifreli kayıtlar tutulur; açık veri anahtarı veya açık kurtarma sırrı saklanmaz.
5. Parola değişiminde genellikle yalnızca parola zarfı yenilenir. Veri anahtarının ele geçirildiği senaryoda ayrıca kayıtların yeniden şifrelenmesi gerekir.

Bu öneri ürünümüz için bir mimari tasarımdır; adı geçen ürünlerin iç uygulamasını birebir anlattığı iddia edilmiyor. İncelenmiş kriptografik yapı taşları ve kütüphaneler kullanılmalı; protokol uygulaması ayrıca denetlenmelidir.

Mevcut sürüm geçişi, kasa açıldığında atomik yapılmalı. Bütün kayıtların ve varsa geçmiş sürümlerinin tutarlı taşınması, eski anahtarla gelen eşzamanlı yazmaların reddedilmesi, yarıda kalan işlemde geri dönülebilmesi ve eski istemcinin yeni formatı bozamaması kabul koşulları olmalı. Açık kasadan ayrılınca devam eden bir işlemin anahtarı tekrar arayüze koymaması mevcut `lockEpoch` yaklaşımıyla korunmalı.

## 6. Minimalist kullanıcı akışı

### Kilitli kasa

Kartta kasa adı, kilit durumu ve küçük bir yönetim menüsü yeterli. Tıklayınca parola penceresi açılır. Pencerenin altında tek bir **Kasaya erişemiyorum** bağlantısı bulunur.

Bu bağlantıdan:

- **Kurtarma anahtarım var:** E-posta doğrulama → kurtarma anahtarı → yeni parola → kasaya erişim.
- **Kurtarma anahtarım yok:** Veri kaybı açıklaması → doğrulama → kasayı sıfırlama veya silme.

“Parolayı yenile” adıyla veriyi kaybettiren bir işlem sunulmamalı. Veri korunuyorsa **Erişimi kurtar**, siliniyorsa **Kasayı sıfırla** denmeli.

### Kasa oluşturma

Mevcut yalın ekleme alanı korunabilir; parolanın sonlandırılması odaklı, tek bir pencerede yapılmalı. Parola tekrarı, yerel güç değerlendirmesi ve kurtarma anahtarını güvenle saklama adımı burada bulunmalı. Uzun formlar veya yeni ana sekmeler eklenmemeli. Kurtarma kurulumu tamamlanmadıysa kasada küçük bir durum etiketi yeterli; sürekli uyarı kartı gösterilmemeli.

Kurtarma anahtarı sıradan e-posta kodundan farklı, güçlü bir sır olmalı; indirilebilir/yazdırılabilir sunulmalı ve kurulurken kullanıcının sakladığını doğrulayan küçük bir kontrol yapılmalı. Sadece kurtaracağı kasanın içine kaydedilmesi yeterli değildir.

### Açık kasa

Tek bir **Kasa ayarları** penceresinde ad, parola, kurtarma ve kilitleme ayarları yönetilmeli. Sadece kasa adını değiştirmek için kullanıcıya arka arkaya iki ayrı pencere açtırmak gerekli değil; parola/kurtarma gibi işlemler gerektiğinde ek doğrulama ister.

Kayıt kartlarında doğrudan kopyalama ve göster/gizle korunmalı. Ayrıntı veya düzenleme için tek bir odaklı pencere kullanılabilir; kopyalama gibi sık yapılan işlemler bu pencereye girmeyi gerektirmemeli. İçerik kartını açmak parolayı otomatik görünür yapmamalı.

## 7. Öncelik tablosu

| Öncelik | İyileştirme | Kullanıcı faydası | Efor |
| --- | --- | --- | --- |
| P0 | Bütün kasa üzerinde silme/sıfırlama/kurtarmayı sunucuda sahibi ve işlem onayıyla sınırla | Aktif oturum veya editör rolüyle kontrolsüz yıkıcı işlem riskini azaltır | Orta |
| P0 | Silme öncesi onay; güvenli kayıt silmede geri alma tasarımı | Tek tıklamayla kalıcı kaybı önler | Düşük–orta |
| P0 | Hareketsizlik kilidi ve arka plana geçme davranışı | Açık bırakılan kasayı korur | Düşük–orta |
| P0 | Yanlış parola mesajını görünür yap; parola tekrarını ve güç kontrolünü ekle | Sessiz hata ve yazım hatasıyla kilitlenmeyi azaltır | Düşük |
| P0 | Eski format envanteri ve açılabilen eski kasaların güvenli dönüşümü | Uyumluluk kodunu kalıcı güven modeli olmaktan çıkarır | Orta |
| P1 | Veri anahtarı/anahtar zarfı mimarisi ve kurtarma anahtarı | Veri kaybetmeden parola kurtarma, daha verimli parola değişimi | Yüksek |
| P1 | Kasaya bağlı e-posta onay servisi | Sahip doğrulamasıyla kurtarma/sıfırlama/silme | Orta |
| P1 | Parola üretici ve yerel zayıf/tekrarlanan parola kontrolü | Günlük kullanım kalitesi | Düşük–orta |
| P1 | Şifreli dışa aktarma ve doğrulanabilir geri yükleme | Kullanıcının kendi yedeği ve taşınabilirlik | Orta |
| P1 | Şifreli kayıt geçmişi ve sınırlı saklama | Yanlış değişiklikten geri dönme | Orta |
| P2 | Kasa bazlı paylaşım ve kullanıcıya özel anahtar zarfları | Ortak parola dağıtımını azaltır | Yüksek |
| P2 | Passkey/biyometrik kilit açma | Daha az parola girişi | Yüksek; cihaz/tarayıcı desteğine bağlı |

P0, önerilen ilk uygulama sırasıdır; listedeki her madde doğrulanmış bir saldırı yaşandığı anlamına gelmez.

## 8. Güvenlik ayrıntıları ve sınırlar

- **Sunucu onayı:** İstemciden gelen `verified=true` gibi bir alan kabul edilmez. İşlem onayı kullanıcı, kasa, işlem türü, güncel sürüm ve oturum bağlamına bağlı olur; atomik tüketilir. Silme doğrudan REST DELETE üzerinden bu kapıyı atlayamamalı. Çalışma alanı/koleksiyon silme gibi üst düzey işlemler de aynı politikayla değerlendirilmelidir.
- **Yetki:** Kayıt düzenleyen editör, bütün kasayı silen veya kurtaran yönetici sayılmamalı. Mevcut yapıda koleksiyon sahibi başlangıç referansı olabilir; kasa sahipliği ayrılaştırılacaksa açık alan ve yetki kuralları eklenmeli.
- **E-posta adresi:** Kod, istemcinin gönderdiği bir adrese değil sunucuda oturum sahibine ait doğrulanmış adrese gider. Google ile giriş yapmış kullanıcının uygulama parolası bulunmayabileceği hesaba katılmalı.
- **Kod yaşam döngüsü:** Başlangıç ürün önerisi 8 haneli kod, yaklaşık 10 dakika geçerlilik ve en fazla 5 deneme. Gönderme/yeniden gönderme için kullanıcı ve IP bütçesi uygulanmalı. Kodlar açık metin loglanmamalı; düşük entropili OTP'nin saklanmasında sunucu sırrıyla HMAC gibi doğrulama kullanılmalı. Bunlar ürün önerisidir; OWASP'ın birebir sayısal zorunluluğu olarak sunulmuyor.
- **Oturum:** Kullanıcı, e-posta veya sahiplik değişirse bekleyen onay geçersiz olmalı. Hesapta MFA etkinse işlem politikası buna saygı göstermeli. Aynı e-posta hesabına gönderilen kod, tek başına bağımsız bir MFA faktörü gibi anlatılmamalı.
- **Supabase:** Mevcut `auth.reauthenticate()` akışı doğrudan her kasa işlemi için genel yetki belgesi kabul edilmemeli. Mevcut hatırlatma function'ında Resend gönderim altyapısı bulunuyor; güvenlik e-postaları ayrı, işlem kapsamlı bir Edge akışı olarak tasarlanabilir. Bu rapor için gerçek kod/e-posta gönderilmedi.
- **KDF:** 310.000 PBKDF2-SHA256 iterasyonu, OWASP'ın güncel 600.000 referansının altında. Bu tek başına verinin kırıldığı anlamına gelmez. Yeni metadata sürümünde en az güncel referans ve gerçek mobil performans değerlendirmesi hedeflenmeli; Argon2id ayrıca değerlendirilebilir. Eski metadata sessizce yeniden yorumlanmamalı; geçiş kasa açılırken yapılmalı. UI deneme sınırı, şifreli veri kopyalandıktan sonraki çevrimdışı parola denemelerini durdurmaz.
- **Gösterme/pano:** Gösterilen sır kısa süre sonra tekrar maskelenebilir. Web panosunu her tarayıcıda güvenilir biçimde temizleme garantisi verilemez; destek varsa yalnızca uygulamanın son kopyaladığı değer için, kullanıcının daha yeni kopyasını silmeden en iyi çaba uygulanmalı.
- **Yedek/geçmiş:** Geçmiş ve çöp kutusu da şifreli tutulmalı. Kullanıcıya görünen silme ile sunucu yedeğinden fiziksel silinme aynı anda gerçekleşmeyebilir; anında her yedekten silindiği söylenmemeli. Erişim kaldırma, daha önce okunmuş/kopyalanmış veriyi geri alamaz.
- **Arama:** Ayrı büyük bir arama alanı eklemek yerine mevcut aramaya yalnızca açık kasanın bellekteki kayıtları dahil edilebilir. Çözülmüş içerik genel sunucu indeksine veya tarayıcı kalıcı depolamasına yazılmaz; kasa kilitlenince arama sonuçları da temizlenir.
- **Denetim:** Silme, sıfırlama, kurtarma ve kurtarma anahtarı yenileme gibi sunucunun gerçekten doğrulayabildiği olaylar, içeriksiz bir güvenlik geçmişinde tutulabilir. İstemcide gerçekleşen her çevrimdışı okuma/kopyalamayı eksiksiz izlediğimiz söylenmemeli.

Kaynaklar: [OWASP parola türetme referansı](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP kurtarma akışları](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## 9. Şimdilik eklenmemesi gerekenler

Tarayıcı otomatik doldurma eklentisi, TOTP üretimi, ödeme kartı/kimlik şablonları, karanlık web taraması, acil erişim kişileri ve gelişmiş kurumsal politika sayfaları ilk kapsamı gereksiz büyütür. Bunlar bazı parola yöneticilerinde anlamlı olabilir; mevcut ürünün güvenli parola/not saklama ihtiyacı için kurtarma, kilitleme ve yanlış işlemden geri dönme daha önceliklidir.

Biyometri de yalnızca ekrana Face ID düğmesi koyarak sağlanmaz; cihazda kullanılabilir anahtar açma yöntemi, WebAuthn/PRF desteği ve yedek yöntem gerekir. Şifreli veri açılmadan yalnızca hesap doğrulaması yapan bir passkey işlemi, kasa kilidini açmış sayılmamalı.

## 10. Uygulama sırası ve kabul koşulları

### Aşama 1 — Günlük güvenlik ve anlaşılır yönetim

Otomatik kilit, görünür hata mesajları, parola tekrarı/gücü, kalıcı silme onayı ve owner/editor yetki ayrımı. Kasayı açamayan kullanıcı için **Kasaya erişemiyorum** girişi tasarlanır; kurtarma kurulmadan kayıpsız kurtarma vaadi gösterilmez.

### Aşama 2 — Veri koruyan kurtarma

Sürümlü anahtar zarfı formatı, mevcut kasalar için açılışta dönüşüm, kurtarma anahtarı kurulumu, işlem kapsamlı e-posta onayı ve kayıpsız parola yenileme. Parola ve kurtarma anahtarı birlikte kayıpsa kullanılacak sıfırlama/silme akışı da aynı sürümde tamamlanır.

### Aşama 3 — Kullanışlılık ve geri dönüş

Parola üretimi, şifreli yedek/geri yükleme, kayıt geçmişi, güvenli silinenler ve yerel parola sağlığı. Özellikler yeni ana tablar açmadan kayıt penceresi ve Kasa ayarları içine yerleştirilir.

Her aşamada doğrulanacak senaryolar:

1. Yanlış kullanıcı, başka kasa veya başka işlem için alınmış kod reddedilir; başka kullanıcıya ait kasa silinemez.
2. Süresi dolan, fazla denenmiş ve daha önce tüketilmiş onay ikinci kez kullanılamaz; eşzamanlı iki istek tek işlem üretir.
3. Editör kayıt düzenleyebilirken owner yetkisi gerektiren bütün kasa işlemlerini yapamaz; doğrudan REST yolu da aynı kurala tabidir.
4. Eski parolayla açılan kasa yeni sürüme kesintisiz geçer; bozuk içerik veya sürüm çatışmasında kısmi geçiş yapılmaz.
5. Kurtarma anahtarı + hesap doğrulamasıyla yeni parola belirlenir, önceki kayıtlar açılır; eski kurtarma yetkisi tasarlanan politikaya göre iptal edilir.
6. Her iki sır da kayıpsa içerik gösterilmez; yalnızca açık veri kaybı onayıyla sıfırlama/silme mümkündür.
7. Kasa kilitlenirken devam eden istek tamamlandığında eski anahtar, taslak veya çözülmüş içerik ekrana dönmez.
8. Kasa sıfırlama/silme yalnızca hedef kasayı etkiler; diğer kasalar, çalışma alanı ve uygulama hesabı korunur.
9. Şifreli dışa aktarma başka bir tarayıcıda geri yüklenerek doğrulanır; dosyaya açık parola, başlık veya içerik sızmaz.

## 11. İnceleme doğrulaması

`tests/vault.test.cjs` ve `tests/sharing-sql.test.cjs` çalıştırıldı: **17 test geçti.** Bunlar mevcut şifreleme, yanlış anahtar/bağlam reddi, eski format geçişi, eşzamanlı anahtar değişimi, kilit sonrası temizlik ve paylaşım yetkilerinin ilgili senaryolarını kapsıyor. Yeni kurtarma sistemi uygulanmış veya doğrulanmış değildir.

Canlı veritabanında yalnızca erişim politikaları okundu; içerik veya parola değeri okunmadı. Mevcut tüm canlı kasaların yeni formatta olduğu bu incelemeyle doğrulanmadı. Değiştirilen tek ürün dışı çıktı bu analiz raporudur.
