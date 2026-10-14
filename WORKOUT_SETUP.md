# Antrenman programları

Yeni arayüz mevcut `workout_routines` tablosunu ve paylaşımlı alanlardaki `mutate_collection_item` işlevini kullanır. Ek SQL migration veya API anahtarı gerekmez. Mevcut programlar korunur.

Programlar isim ve isteğe bağlı gün seçimiyle oluşturulur. Koleksiyon kartlarından açılabilir, yeniden adlandırılabilir, günleri değiştirilebilir, çoğaltılabilir veya silinebilir. Çoğaltma yeni hareket kimlikleri üretir ve kopyanın tamamlanma işaretlerini temizler; kaynak programı değiştirmez.

Her hareket için ad, set, tekrar veya süre, ağırlık (kg), dinlenme (saniye), tempo, alternatif hareket ve kişisel not düzenlenebilir. Bu bilgiler hareket JSON'una eklenir. Özel hareketler isteğe bağlı HTTP(S) görsel bağlantısıyla eklenebilir.

Hareket kütüphanesi [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) kaynağından alınmış, uygulamaya dahil edilen 876 hareketlik bir katalogdur. Arama Türkçe kas ve ekipman ifadelerini destekler. Görseller GitHub'dan yüklenir; hata durumunda aynı görsel jsDelivr üzerinden denenir. Eski ExerciseDB görselleri, hareket adı katalogla eşleşiyorsa yenilenir. Eşleşmeyen veya tüm kaynakları yüklenemeyen hareketler okunabilir bir simgeyle gösterilir. Görseller için internet bağlantısı gerekir.

Salt okunur paylaşımda düzenleme, oluşturma, silme, çoğaltma ve tamamlanma işlemleri kapalıdır. Hareket düzenleme, pencere açılırken alınan sürümü kullanır; başka bir kişinin değişikliklerini sessizce ezmez. Kayıt başarısızsa formdaki değerler korunur. Paylaşımlı program kopyalanırken hareketler mevcut RPC üzerinden eklenir; bir ekleme başarısızsa oluşturulan kısmi kopyanın silinmesi denenir. Silme başarısız olursa program listesi yenilenir ve kullanıcı hatayı görür.

Doğrulama: `node --test tests/workout.test.cjs`, `npm.cmd test`, `npm.cmd run build`.
