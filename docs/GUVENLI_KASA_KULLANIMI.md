# Kasa parolası, kurtarma anahtarı ve şifreli yedek

## Üç farklı amaç

| Araç | Ne işe yarar? | Ne yapmaz? |
|---|---|---|
| Kasa parolası | Kasayı günlük kullanımda açar. | Uygulama hesabının giriş parolası veya yedek dosyasının parolası değildir. |
| `PV2-…` kurtarma anahtarı | Kasa parolası unutulduğunda, hesap/e-posta doğrulamasıyla mevcut kasaya erişim sağlar. | GUID veya kayıtları içeren bir yedek değildir. Silinmiş kasayı geri getiremez. |
| `.pvault` dosyası + yedek dosyası parolası | Dışarıya alınmış, şifreli bir kayıt kopyasını yeni kasaya geri yükler. | Canlı kasa değiştikçe kendiliğinden güncellenmez. Kurtarma anahtarıyla açılamaz. |

Kasa oluştururken belirlediğin ilk parola **kasa parolasıdır**. Ardından gösterilen kurtarma anahtarını kaydetmek, kayıtlarının dosya yedeğini almak anlamına gelmez. Anahtar rastgele üretilmiş 256 bit gizli bilgidir; kasa veya kayıt UUID'si değildir. Anahtarı kasanın dışında güvenli bir yerde sakla.

## Yedek dışa aktarma

1. Kasa yönetiminden **Yedeği dışa aktar** seçilir.
2. Mevcut kasa parolasıyla kayıtlar cihazda açılır.
3. **Yedek dosyası parolası** ve tekrarı girilir; dosya bu parola ile cihazda ayrıca şifrelenir.
4. `.pvault` dosyası indirilir. Parola dosyanın içine açık olarak yazılmaz.

İki parola alanı farklı amaç taşır: biri kasayı açar, diğeri indirilen kopyayı korur. Kasa parolasının sonradan değiştirilmesi, daha önce indirilmiş yedeğin parolasını değiştirmez. Yedek parolası unutulursa e-posta veya kurtarma anahtarı dosyayı çözemez.

Yedek; başlık, açıklama, tür, kullanıcı adı, saklanan parola, URL ve gizli metnin o andaki kopyasını içerir. Silinenlerdeki mevcut kayıtlar da dosyaya alınır; geçmiş sürümler dahil değildir. Kayıtların eski UUID'leri, oluşturulma tarihleri ve silinmiş durumu korunmaz. Dosya otomatik güncellenmez; önemli değişikliklerden sonra yeniden dışa aktarılmalıdır. Bu özellik Supabase'in platform/veritabanı yedeklerinden ayrıdır.

## Geri yükleme

**Yedekten geri yükle** ekranında önce dosya ve dosyanın parolası seçilir. Alt bölümde yeni kasa adı, yeni kasa parolası ve tekrar belirlenir. Kayıtlar cihazda açılıp yeni anahtar ve yeni kimliklerle tekrar şifrelenir; tek işlemle ayrı kasaya yazılır. Mevcut kasalar üzerine yazılmaz. Yedekteki silinen kayıtlar aktif kayıt olarak geri gelir. Yeni kasa için yeni kurtarma anahtarı oluşturulur.

## Şifreleme ve eski kayıtlar

Yeni ve yükseltilmiş kasalarda kayıt içerikleri AES-256-GCM ile cihazda şifrelenir. Kasa başına ayrı rastgele veri anahtarı vardır; anahtar hem parola hem kurtarma sırrıyla ayrı ayrı şifrelenmiş zarflar içinde tutulur. Yeni parola zarfı PBKDF2-SHA256 / 600.000 iterasyon kullanır. Rastgele IV ve kasa/kayıt kimlikleriyle doğrulanan bağlam, ciphertext'in değiştirilmesini veya farklı kayda taşınmasını algılar.

Yeni ve yükseltilmiş kasalarda kasa parolası ve kurtarma sırrı sunucuya gönderilmez. Şifre çözme anahtarı ve açık notlar bellekte tutulur; tarayıcı depolamasına kaydedilmez. Kasa adı, kimlikler, tarihler, sahiplik ve paylaşım bilgileri şifrelenmiş kayıt içeriği kapsamına girmez.

**Eski biçimdeki her kayıt otomatik şifrelenmiş sayılmaz.** `Şifreleme güncellemesi gerekli` görünen kasanın sahibi mevcut parolasıyla yükseltmeyi tamamlar. Parola doğrulandıktan sonra kayıtlar cihazda şifrelenir ve sürüm kontrolleriyle atomik olarak değiştirilir. Yeni sunucu kuralı, yükseltilmemiş kasalara yeni düz metin yazılmasını da reddeder. Bu, eski kayıtların kullanıcı parolası olmadan sunucuda sessizce dönüştürüldüğü anlamına gelmez.

Diğer katmanlar: kullanıcı/çalışma alanı bazlı RLS ve sahip/editör/izleyici yetkileri; kasa güvenlik işlemlerinde sahiplik ve e-posta kodu; kodlarda süre, tek kullanım, deneme/istek sınırları ve oturuma bağlama; mevcut MFA için AAL2; beş dakika hareketsizlikte, bir dakika arka planda ve modülden çıkışta kilitleme. Web uygulaması ve açık cihaz risklerine karşı mutlak güvenlik garantisi verilmez.

## Silme

Tek bir kayıt silinirse 30 gün boyunca silinenlerden geri alınabilir; düzenlemelerde son 10 şifreli sürüm tutulur. **Kasayı sil**, e-posta doğrulamasıyla kasayı, tüm kayıtlarını ve sürüm geçmişini kalıcı olarak kaldırır. `İçeriği silerek sıfırla` işlemi kaldırılmıştır; eski bekleyen sıfırlama kodları geçersizdir. Kullanıcının önceden indirdiği yedek dosyaları kasa silinmesiyle otomatik silinmez.
