# Analiz uygulama sırası

Bu çalışma, `ANALYTICS_PLAN.md` içindeki ilk sürümü uygular. Üyelik veya kullanım sınırı eklemez.

1. **Ölçüm ve güvenlik:** Kalıcı odak oturumları; oluşturma, tamamlama, yeniden açma, silme, erteleme ve dönem devri kayıtları. Paylaşım yetkileri ve kullanıcı gizliliği sunucuda uygulanır.
2. **Hesaplamalar:** Tarih ve çalışma alanı kapsamı, eşit uzunlukta önceki dönem, çakışan odak sürelerinin birleştirilmesi, günlük görev hareketleri ve mevcut birikim yaşı.
3. **Analiz ekranı:** Küçük özet kartları, etkileşimli odak ve görev grafikleri, birikim ve devreden plan ayrıntıları. Ana sayfada haftalık kısa özet.
4. **Doğrulama ve kurulum:** SQL yetki/senaryo testleri, sayaç kayıtlarının bağlantı kesilmesine dayanıklılığı, mevcut testler ve üretim derlemesi. Canlı veritabanı için tek kurulum dosyası.

İlk sürümün ardından rutin gerçekleşme geçmişi, gerçek antrenman kayıtları ve öğrenme/test denemeleri ayrı ölçüm sözleşmeleriyle eklenir. Mevcut program değerlerinden yapılmış antrenman veya öğrenilmiş konu istatistiği üretilmez.

## Tamamlanma koşulları

- Sayaçta duraklama ve mola odak süresine eklenmez; başlangıç çalışma alanı korunur.
- Ağ hatasında kayıt kuyruğu kaybolmaz; tekrar gönderim süreyi çoğaltmaz.
- Eski notlar başlangıç durumu olarak alınır; bilinmeyen tamamlanma tarihleri uydurulmaz.
- Aynı paylaşımlı koleksiyon birden çok alanda bağlıysa bir kez sayılır.
- Başkasının özel odak süreleri ve erişimi kaldırılmış koleksiyonları raporda görünmez.
- Boş, kısmi geçmiş, kurulum eksikliği ve yükleme hatası birbirinden ayrılır.
- Arayüz mevcut açık/koyu tema, kart ve gezinme standartlarını korur.

## İlk sürüm durumu

- Ölçüm migration'ı, güvenli rapor RPC'si, kalıcı odak kuyruğu ve sayaç bağlantısı hazır.
- Analiz ekranı, etkileşimli grafikler, tarih/alan kapsamları, günlük CSV ve haftalık ana sayfa özeti hazır.
- `npm test`: 129 test geçti. `npm run build`: geçti. Test eşzamanlılığı, bu ortamda bellek taşmasını önlemek için iki süreçle sınırlandı.
- Canlı Supabase migration'ı uygulanmadı; yönetici bağlantısı bulunmuyor. `ANALYTICS_SETUP.md` son kurulum adımını açıklar.
- Bağlı tarayıcı bulunmadığından gerçek ekran üzerinde açık/koyu tema ve mobil görsel doğrulama yapılmadı.
- Yeni grafik özellikleri şimdilik ertelendi. Büyük veri için özet/ayrıntı sorgularını ayırma işi `PROJECT_REVIEW.md` listesine alındı.
