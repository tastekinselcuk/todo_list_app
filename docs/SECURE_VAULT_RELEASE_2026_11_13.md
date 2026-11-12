# Kasa sadeleştirmesi — 13 Kasım 2026

- Kasa içeriğini silerek sıfırlama istemciden, Edge işlem listesinden ve veritabanı challenge akışından kaldırıldı. Eski bekleyen kodlar tüketildi; yeniden etkinleştirilmelerini engelleyen kural eklendi.
- Yeni açık metin kayıt yazımı, eski kasa biçiminde de sunucuda reddedilir. Mevcut eski kayıtlar kullanıcı parolasıyla yükseltilmeden dönüştürülmüş sayılmaz. Kasa kartları gerekli yükseltmeyi açıkça gösterir.
- Kayıt/yönetim pencereleri ortak pencere stillerini kullanır; filtreler ve ikincil eylemler çerçeveli düğmelerdir. Tür seçicisinde seçeneklerin tamamını etkileyen düğme stili yalnızca tetikleyiciye sınırlandı.
- Kurtarma anahtarının yedek olmadığı açıklandı. Dosya parolası ve yeni kasa parolası geri yüklemede ayrıldı. [Yedek kapsamı ve kullanım](GUVENLI_KASA_KULLANIMI.md).

Doğrulama: kasa kriptografisi, SQL/rol kontrolleri, arayüz, paylaşım, çalışma alanı ve finans regresyonlarından 58 test geçti. Üretim derlemesi ve Edge handler TypeScript kontrolü başarılı. Tarayıcı önizleme sağlayıcısı erişilemediği için gerçek tarayıcıda görsel kabul kontrolü yapılamadı.

Canlı `202611120001_vault_simplification.sql` uygulandı; `vault-security` yeniden yayınlandı. Salt okunur toplu kontrolde eski kayıtlara yazmayı engelleyen kural ve sıfırlama kısıtı etkin, bekleyen sıfırlama kodu sayısı sıfır. Kullanıcı içerikleri okunmadı/değiştirilmedi; gerçek kasa silme veya e-posta gönderme denemesi yapılmadı.
