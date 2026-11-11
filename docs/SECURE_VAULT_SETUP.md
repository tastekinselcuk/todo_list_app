# Güvenli Kasa v2 kurulumu

12 Kasım 2026: Bu sürüm Netlify ve Supabase üzerinde **test e-posta modunda yayınlandı**. Gerçek test e-postasının Resend teslim durumu `delivered` olarak doğrulandı. Mevcut kasa içerikleri açılmadı veya dönüştürülmedi. Aşağıdaki adımlar yeni kurulumlar ve üretim göndericisine geçiş için korunmuştur. [Yayın doğrulama kaydı](SECURE_VAULT_RELEASE_2026_11_12.md).

Yeni migration eski arayüzün kasa yazımlarını bilgilendirme/step-up eksikliği nedeniyle engeller; **yalnızca SQL'i önce çalıştırıp eski arayüzü uzun süre açık bırakmayın**. Bütün bekleyen migration'ları körlemesine `db push` ile uygulamayın.

## E-posta sağlayıcısı

### Alan adı olmadan yalnızca kendi hesabında test

Resend'in `onboarding@resend.dev` göndericisi, yalnızca Resend hesabının kayıtlı e-posta adresine gerçek test e-postası gönderebilir. Alan adı/DNS doğrulaması bu test için gerekmez. [Resend kısıtı](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

1. Resend → API Keys üzerinden Sending access anahtarı oluşturun; Domains adımını şimdilik geçin.
2. Supabase → Edge Functions → Secrets içine `RESEND_API_KEY` ekleyin.
3. `VAULT_MAIL_MODE=test`, `VAULT_FROM_EMAIL=Pomodolist <onboarding@resend.dev>`, `VAULT_TEST_EMAIL=Resend hesabınıza kayıtlı gerçek adres` olarak ayarlayın.
4. Aşağıdaki bölümde açıklandığı gibi bağımsız `VAULT_OTP_SECRET` üretip ekleyin.
5. Uygulamaya da **aynı doğrulanmış e-posta adresiyle** giriş yapın. Testte diğer hesapların işlemleri engellenir; onların kodları test adresine yönlendirilmez.
6. Migration/function/frontend yayın sırasını aşağıdaki bölümden uygulayın. Bu ayarlar tek başına henüz yayınlanmamış kodu etkinleştirmez.

Gönderici Resend'in test adresidir; alıcı sizin kişisel adresiniz olabilir. Başka test kullanıcılarına gönderim için bu yöntem yeterli değildir. Test bittiğinde doğrulanmış alan adıyla `VAULT_FROM_EMAIL` değerini değiştirin, `VAULT_MAIL_MODE=production` yapın ve `VAULT_TEST_EMAIL` değerini kaldırın. Varsayılan mod production'dır; üretim modunda test göndericisi engellenir.

### Tüm kullanıcılara üretim gönderimi

1. Resend → **Domains → Add Domain** ile DNS'ini yönetebildiğiniz gönderici alan adını ekleyin. Gösterilen SPF/DKIM kayıtlarını alan adınızın DNS paneline aynen girin; **Verified** durumunu bekleyin. `gmail.com` veya DNS'ini yönetemediğiniz `pomodolist.netlify.app` adresini kendi gönderici alan adınız olarak doğrulayamazsınız.
2. Resend → **API Keys → Create API Key** üzerinden yalnızca **Sending access** yetkisi verin; mümkünse doğruladığınız alan adıyla sınırlandırın.
3. Supabase → Edge Functions → Secrets içine `RESEND_API_KEY` ve `VAULT_FROM_EMAIL` ekleyin. Gönderici örneği: `Pomodolist <guvenlik@size-ait-alan-adi>`. Örnek gerçek gönderici değildir. `onboarding@resend.dev` üretim için kabul edilmez.
4. Ayrı rastgele `VAULT_OTP_SECRET` oluşturup Secrets içine koyun. En az 32 rastgele bayt önerilir. Bu, kullanıcının kurtarma anahtarı değildir; istemciye/`VITE_` değişkenlerine konmaz. Takvim şifreleme anahtarı tekrar kullanılmaz.
5. `VAULT_ALLOWED_ORIGINS`: üretim için `https://pomodolist.netlify.app`; yerel geliştirme gerekiyorsa ayrıca `http://localhost:5173`. Kullanılmayan origin'i eklemeyin.

Secret'ları sohbete, repoya veya günlük dosyasına koymayın. OTP secret değişirse bekleyen kodlar geçersiz olur; kasa şifrelemesi etkilenmez.

`VAULT_OTP_SECRET` üretmek için kendi terminalinizde aşağıdaki komutu çalıştırıp çıkan değeri yalnızca Supabase Secrets alanına koyabilirsiniz:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Bu anahtar Resend API anahtarından farklıdır. Resend anahtarı e-posta gönderir; OTP anahtarı kodların sunucu tarafındaki HMAC özetini korur. Güncel kaynaklar: [Resend alan adı kılavuzu](https://resend.com/docs/dashboard/domains/introduction), [API anahtarları](https://resend.com/docs/api-reference/api-keys/create-api-key), [Supabase Secrets](https://supabase.com/docs/guides/functions/secrets).

## Test ve yayın sırası

```powershell
node --test --test-concurrency=2 tests/vault.test.cjs tests/vault-security.test.cjs tests/sharing-permissions-ui.test.cjs tests/workspaces.test.cjs
npm.cmd run build
```

Staging'de migration'ı uygulayın; gerçek içeriği bulunmayan ayrı deneme hesabıyla aşağıdaki akışları kontrol edin. Üretim yayını hazır olduğunda yalnızca bu sürümün migration'ını uygulayın:

```powershell
npx.cmd --no-install supabase db query --remote=saamxvuphakjpffvvcbj --file supabase/migrations/202611110001_vault_security.sql --yes
npx.cmd --no-install supabase functions deploy vault-security --project-ref saamxvuphakjpffvvcbj --no-verify-jwt
```

Function JWT'yi Supabase Auth üzerinden doğrular. `verify_jwt=false`, kimlik denetiminin kaldırılması değildir. Başka servislerin JWT ayarlarını değiştirmeyin.

Yeni frontend'i aynı yayın penceresinde Netlify'a yayınlayın. Mevcut açık sekmeleri yenileyin. Eski istemcilerden e-posta kontrolünün REST veya eski arayüzle atlanamadığını doğrulayın.

`pg_cron` etkinse migration saatlik `vault-retention` işini kurar. Değilse Supabase Cron etkinleştirilmeli veya güncellenmiş `trash-cleanup` function'ı servis yetkili mevcut zamanlayıcıyla çalıştırılmalıdır. Function eksik migration durumunda eski çöp kutusu temizliğini korur. Zamanlayıcı kurulmadan fiziksel temizlik yapıldığı söylenmez. Yedek saklama politikasını ayrıca belirleyin.

## Gerçek ortam kabul kontrolü

- Güncel bilgilendirme kaydı olmayan eski/yeni hesap metni görür. Devam eden hesap başka cihazda gereksiz yerel onayla karşılaşmaz.
- Yeni kasayı açın, kurtarma anahtarını kaydedin. Şifreli kayıt ekleyin; yenileyip açın.
- Eski v1 kasayı yedekleyip yükseltin. Tüm aktif/silinen kayıtlar korunmalı; yanlış parola veya sürüm çakışmasında yarım geçiş olmamalı.
- Parola değiştirme, kurtarma anahtarını yenileme ve anahtarla erişim kurtarmada kod gerçek doğrulanmış hesap e-postasına gitmeli. E-posta/oturum değişmişse eski kod çalışmamalı.
- Yanlış/süresi dolmuş/tüketilmiş kod, beş yanlış deneme, çoklu gönderim, owner/editor/viewer ve MFA gereksinimini deneyin.
- Deneme kasasında silme/sıfırlama yalnızca seçili kasayı etkilemeli. Gerçek kullanıcı kasalarıyla test yapmayın.
- Beş dakika boşta, bir dakika arka planda, modül değişiminde ve tarayıcı geri/ileri önbelleğinde kilidi; açık sırların 30 saniyede maskelendiğini kontrol edin.
- Silme/geri alma, sürüm geri alma, başka tarayıcıda `.pvault` içe aktarma. Yedek mevcut kasayı ezmemeli; yanlış yedek parolası kayıt oluşturmamalı.
- iPhone Safari'de e-posta kodu alma/dönme/otomatik kilit etkileşimini deneyin. Bir dakikadan uzun arka planda kalınırsa işlem yeniden başlatılabilir.
- Gerçek veri sorumlusu/iletişim/sağlayıcı/aktarım belgeleri tamamlanmadan teknik bilgilendirmeyi tam hukuki aydınlatma veya sorumsuzluk beyanı saymayın.

Üretim geri dönüşünde v2 verisini v1'e düşürmeyin; v2 okuyabilen frontend'i koruyun. Migration mevcut içerikleri kendiliğinden yükseltmez. Kullanıcıların v2'ye geçişinden sonra eski frontend güvenli geri dönüş seçeneği değildir.
