# PomoNotes uygulama durumu

11 Ekim 2026. Onaylanan [POMONOTES_PLAN.md](POMONOTES_PLAN.md) ilk sürümü kodlandı. Canlı veritabanı/Edge dağıtımı ve gerçek tarayıcı incelemesi yapılmadı; [POMONOTES_SETUP.md](POMONOTES_SETUP.md) bunları açıklar.

## Tamamlanan paketler

1. **Güvenlik ve açılış:** Hatırlatma endpoint'i doğrulanmış kullanıcı ve yetkili görevden alıcı/içerik üretir. Gönderim lease'i, dönem bazlı tek anahtar, hız sınırı ve sağlayıcı idempotency anahtarı vardır. Tarayıcı/e-posta başarıları ayrıdır. Ayar, tema, dil, not önbelleği ve taslaklar hata toleranslı depolama yardımcısını kullanır.
2. **Ortak temel:** Modül kataloğu sekme/ayar/paylaşım/alan istemcisi/ana sayfa kayıtlarını besler. Sayaç mantığı tek global Pinia store'unda; görünüm değişimi, dil ve çalışma alanı değişimi oturumu sıfırlamaz. Kişisel süre ayarları hesap kapsamında saklanır.
3. **Sahiplik ve veri:** Görev, kişisel hedef ve oturum ilişkisi için artımlı migration. PostgreSQL kullanıcı kilidi ve oturuma bağlı yazma token'ı; devralmada yeni token, eski yazmaların etkisiz kalması. Duraklama aralığı devralmada sayılmaz. Çakışan çevrimdışı aralıklar ortak zaman üzerinden tek kredilendirilir.
4. **Minimal ekran:** Tek satır ekleme, kişisel hedef/süre düzenleme, tamamla/yeniden aç, odaklan/duraklat, sıradaki görev, bitir ve geç, kopyala/sil. Aynı çerçeve standardı, menü klavye gezinmesi, native dialog ve boş/hata/yükleme durumları.
5. **Geçmiş ve Analiz:** Kişisel sayfalı geçmiş; gerçek dakika/tam oturum ayrımı; ilk tahminin korunması. Analiz bağlı/serbest/erişilemeyen görev süreleri; tarih aralığına daraltılmış odak hesapları. Ana sayfada tek hafif özet sorgusu, önceki dönemde ayrıntı indirmeme.
6. **Otomatik doğrulama:** SQL gerçek PostgreSQL motorunda; sayaç deterministik saat ile; arayüz etkileşimleri Vue ile; mevcut regresyon testleri ve TypeScript/üretim derlemesi. Gerçek tarayıcı görsel kontrolü bekliyor.

Tam pakette 156 test geçti. Sonradan eklenen yavaş gönderim/tam oturum yarışı, sayaç ve gezinmeyle birlikte 21 testlik kontrolde geçti. Güncel test paketi 157 test içerir.

İlgisiz koleksiyon bağının değişmesi veya PomoNotes eklenmesi mevcut taslak anahtarını değiştirmez. Eski anahtarlar yalnız ilgili koleksiyon eşleşirse kopyalanır; başka koleksiyonun taslağı açılmaz. Eski kayıtlar silinmez.

## Bağımlılık ve kalan işler

- Kullanılmayan FontAwesome/Tiptap/sürükleme paketleri kaldırıldı; uyumlu bağımlılıklar güncellendi. Vite 7 kullanılıyor. Audit bildirimi 27'den 8'e indi.
- Kalan 8 bildirim Tailwind 3 araç zincirindedir. Tailwind 4 geçişi tasarım/konfigürasyon değişikliği gerektirdiğinden zorlanmadı; ayrıca test edilerek ele alınmalı.
- Mevcut modüllerin tamamının sayfalaması, ana sayfa modül özetleri, ortak görünürlük temelli abonelikler, ağır kod editörü paketi, Analiz ayrıntı sayfalaması ve sunucu e-posta zamanlayıcısı [PROJECT_REVIEW.md](PROJECT_REVIEW.md) sonraki paketleridir.
- Premium ödeme, takım odak istatistikleri, tekrar eden görevler ve gelişmiş tahmin grafikleri ilk sürüme dahil değildir.

## Kontrol komutları

```powershell
npm.cmd test
npm.cmd run build
```

Belleği sınırlı makinede SQL testlerini ve derlemeyi sırayla çalıştır. Testleri tek süreçle yürütmek için `node --test --test-concurrency=1 tests/*.test.cjs` kullanılabilir.
