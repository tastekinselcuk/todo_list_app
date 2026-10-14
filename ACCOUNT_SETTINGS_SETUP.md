# Profil ve hesap ayarları

Giriş yapmış kullanıcıda sağ üst profil menüsü ana sayfa, çalışma alanı ve ayarlarda gösterilir. Görünen adın baş harfleri ve seçilen profil rengi kullanılır. Profili düzenle seçeneği Ayarlar sayfasındaki sekme kartlarının altındaki Hesabım bölümüne gider ve ad alanını odaklar.

Hesabım bölümünde görünen ad/profil rengi, e-posta ve doğrulama durumu, parola değişikliği, hesap oluşturma/son giriş tarihleri, kopyalanabilir hesap kimliği ve bu cihazdan/tüm cihazlardan çıkış kontrolleri vardır. Tema seçimi Genel Tercihler'de kalır. Formlar düğmeyle kaydedilir; sekme tercihleri otomatik kaydedilmeye devam eder.

## Kurulum

Yeni SQL migration gerekmez. Profil alanları mevcut Supabase Auth kullanıcı metadata'sında `full_name` ve `avatar_tone` olarak saklanır; bunlar sadece gösterim içindir, erişim yetkilerini belirlemez.

Supabase Authentication → URL Configuration'da uygulamanın kullandığı HTTPS adresini Site URL/Redirect URLs ayarlarına ekle. E-posta değişikliği uygulamanın mevcut origin adresine döner. E-posta değişim doğrulaması ve parola güvenlik politikaları Supabase Auth ayarlarına bağlıdır; doğrulama beklerken yeni adres giriş adresi olarak gösterilmez.

Kaynaklar: [Supabase updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser), [Supabase signOut](https://supabase.com/docs/reference/javascript/auth-signout).

## Doğrulama

Profil değiştirme ve menüye yansıma; hatalı kaydetmede taslağın korunması; eski hesapların e-posta kullanıcı adı/varsayılan renk ile görünmesi; e-posta doğrulama beklemesi; yanlış mevcut parola; eşleşmeyen yeni parolalar; Supabase ek doğrulama kodu akışı; yerel ve tüm cihazlardan çıkış; hesap değiştikten sonra gelen yanıtların yeni hesabı etkilememesi otomatik testlerle kontrol edilir.

Mevcut parola doğrulaması, browser storage veya uygulamanın aktif oturumunu değiştirmeyen geçici bir Auth istemcisinde yapılır. Geçici doğrulama oturumu yerel kapsamda kapatılır. Parolalar metadata'ya, localStorage'a veya çalışma alanı taslaklarına yazılmaz; başarılı işlem, iptal ve bileşen kapanışında alanlar temizlenir.

Tüm cihazlardan çıkış refresh oturumlarını sonlandırır; mevcut access token'lar geçerlilikleri bitene kadar geçerli kalabilir. Uygulama diğer cihazların/IP adreslerinin güvenilir bir envanterini elde etmediği için oturum listesi veya cihaz sayısı üretmez.
