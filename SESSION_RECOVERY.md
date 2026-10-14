# Oturum ve PomoNotes onarımı

## Doğrulanan nedenler

- Paylaşılan `claim_focus_session` yanıtları başarılı (`status: claimed`). `paused` ve ardından `running` yanıtları devralma/devam etme akışıyla uyumlu; tek başına SQL eksikliği göstermiyor.
- Görev seçimi Vue'nun reaktif nesnesini BroadcastChannel'a gönderiyordu. Tarayıcının kullandığı structured clone ile testte `DataCloneError` yeniden üretildi. Başarılı sunucu isteğinden sonra başlatma hatası gösterebiliyor, kapatma işlemini kesebiliyordu. Mesaj artık düz JSON verisi olarak gönderiliyor; iletişim kanalı hatası sayaç işlemini kesmiyor.
- Önceki giriş depolama yedeği yalnız bellekteydi. Depolama yazımı başarısız olursa giriş çalışsa da F5 bellekteki oturumu kaybediyordu. Artık localStorage yazılamadığında sessionStorage kullanılıyor. İkisi de engellenirse bellekteki oturumun yenileme sonrasında korunması mümkün değil; uygulamanın geçici oturum uyarısı bu durum için kalıyor. Gerçek tarayıcıdaki kota/erişim sorununun ayrıca doğrulanması gerekiyor.
- Sıfırlama ve görev bağlantısını kaldırma farklı sonuçlar gerektiriyor. Önceki uzak oturum sıfırlaması görevi de kaldırıyordu; yerel kapatma hatasında yeniden denenecek oturum kimliği kaybolabiliyordu.
- Bazı Türkçe hata mesajlarında kaynak dosyada soru işareti karakterleri bulunuyordu; UTF-8 Türkçe metinlerle düzeltildi.

## Uygulanan sıra

1. Giriş oturumu: Supabase'in kalıcı depolama anahtarı açıkça tanımlandı; localStorage → sessionStorage → bellek sırası kullanılıyor. SDK oturumu başlangıçta geri yükleniyor. Geçici bağlantı hatası geçerli oturumu silmiyor; kesin yetkilendirme reddi giriş ekranına dönüyor. Geç gelen başlangıç yanıtı yeni girişi silemiyor.
2. Sayaç iletişimi: reaktif nesnelerin BroadcastChannel'a gönderilmesi düzeltildi. Sunucu yanıtı başarılıyken iletişim kanalı kaynaklı hata artık başlatma/kapatma işlemini yarıda kesmiyor.
3. Oturum yaşam döngüsü: yerel sıfırlama önce geçen süreyi sonlandırıp eşitliyor, sonra eski sunucu oturumunu kapatıyor. Sıfırlama görevi tutuyor; çarpı görevi kaldırıyor. Başarısız kapatma aynı kimlikle tekrar deneniyor; yerel bekleyen işlem F5 sonrasında da geri yükleniyor. Bekleyen süre kaydı onaylanmadan sunucudaki oturum kalıcı olarak kapatılmıyor.
   Sayfa yenilendiğinde görev ve kalan süre korunur, sayaç duraklatılmış açılır. Otomatik devralma/başlatma kaldırıldı. Mola da yenilemeyle çalışmaz; devam etmek için kullanıcının tıklaması gerekir. Bekleme süresi odak istatistiklerine eklenmez.
4. Doğrulama: gerçek Supabase Auth SDK'sıyla depolama/yenileme/çıkış testleri, tarayıcıya uygun structured clone testi, sayaç yaşam döngüsü ve yerel PostgreSQL entegrasyon testleri çalıştırılıyor. Bunlar canlı Supabase ve kullanıcının tarayıcısındaki kontrolün yerine geçmez.

## Tarayıcıda kabul kontrolü

1. Güncel uygulamayı açıp giriş yap. Aynı adres ve sekmede birkaç kez F5 yap; giriş korunmalı. sessionStorage yedeği kullanılıyorsa sekme kapanması sonrası kalıcılık garanti edilmez.
2. PomoNotes'tan bir görev başlat. Sayaç çalışmalı; başarılı `claimed` yanıtıyla birlikte hata bildirimi çıkmamalı.
3. Duraklat, bekle ve devam ettir. Bekleme süresi görev süresine eklenmemeli.
   Çalışan veya duraklatılmış sayacı F5 ile yenile. Görev/kalan süre korunmalı; sayaç kullanıcı başlatana kadar durmalı. Yenileme yeni `claim_focus_session` isteği üretmemeli. Aynı kontrolü mola için de yap.
4. Sıfırla. Sayaç seçili görevin tam süresine dönmeli ve durmalı; görev etiketi kalmalı. Tekrar başlatınca yeni bir odak oturumu oluşmalı.
5. Çarpıya bas. Sayaç durmalı ve görev etiketi kalkmalı. Ardından bağımsız sayaç başlatılabilmeli.
6. Analiz/PomoNotes sürelerini kontrol et. Yarım bırakılan süre korunmalı; tamamlanmamış döngü tamamlanan pomodoro sayısına eklenmemeli.

## Sorun sürerse

- Bu istemci düzeltmeleri için yeni SQL sorgusu çalıştırmak gerekmiyor. Başarılı RPC'lerden SQL'in tamamını yeniden kurmak gerektiği sonucu çıkmaz.
- İlk adım tüm çerezleri veya site verilerini silmek değil. Silme işlemi eşitlenmemiş odak kayıtlarını ve taslakları kaybettirebilir. Yalnız bir depolama hatası doğrulanırsa, bekleyen kayıtlar korunduktan sonra uygulamaya ait giriş anahtarları için hedefli temizlik değerlendirilir.
- Network'te gerçekten başarısız olan isteğin adı, HTTP durumu ve Response içindeki `code`, `message`, `details`, `hint` yeterli. Token, parola, Authorization veya tam giriş yanıtı paylaşılmamalı.
- Veritabanı için mevcut [sağlık kontrolü](supabase/diagnostics/application_health.sql) kullanılır. Veri veya işlev onarımı ancak bu kontrol ve başarısız isteğin sonucu belirli bir eksikliği gösterirse yapılır.
