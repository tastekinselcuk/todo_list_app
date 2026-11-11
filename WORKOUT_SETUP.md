# Antrenman programları

Programlar mevcut `workout_routines` tablosunu ve paylaşımlı alanlardaki `mutate_collection_item` işlevini kullanır. Kalıcı özel hareket kütüphanesi için aşağıdaki SQL güncellemesi gerekir. API anahtarı gerekmez; mevcut programlar korunur.

## Kalıcı özel hareket kütüphanesi

Supabase SQL Editor'da önce `supabase/migrations/202611070001_workout_custom_library.sql`, ardından `supabase/migrations/202611070002_workout_library_removal.sql` dosyalarının tamamını çalıştırın. İlk dosyayı önceden uyguladıysanız yalnızca ikinci dosya gerekir. Çalışma alanları, paylaşım modülleri ve paylaşım izinleri önceden kurulmuş olmalıdır. İşlemler transaction içindedir ve yeniden çalıştırılabilir. Ardından uygulamayı yenileyin.

“Özel hareket” sekmesi kütüphaneyle aynı pencere ölçülerini kullanır. Kullanıcı hareket adını, doğrudan HTTP(S) GIF/görsel bağlantısını ve program için set/tekrar bilgilerini girer. Bağlantı kart üzerinde önizlenir. “Hareketi ekle” doğrudan mevcut programa ekler. Hemen üzerindeki “Kütüphaneye de ekle” varsayılan olarak işaretsizdir; yalnızca işaretlendiğinde ayrıca kalıcı kütüphane kaydı oluşturulur. Kas grubu ve ekipman bu durumda zorunludur; yalnızca programa eklemede isteğe bağlıdır. Her yeni açılışta seçenek tekrar işaretsiz başlar. Kayıt başarısızsa form ve seçim korunur; kütüphane kaydı başarılı olup programa ekleme başarısız olduğunda tekrar denemek ikinci bir kütüphane kaydı oluşturmaz.

Özel hareketler çalışma alanının antrenman koleksiyonuna aittir. Yeni programlar oluşturulurken de yüklenir; standart hareketlerle aynı arama, kas grubu ve ekipman filtrelerinde görünür. Tarayıcı önbelleği temizlense de kayıtlar Supabase'de kalır. Paylaşılan antrenman koleksiyonunda görüntüleme yetkisi olan üyeler okuyabilir; ekleme düzenleme yetkisi gerektirir. Başka çalışma alanları ve yetkisi kaldırılan üyeler bu kayıtlara erişemez. Çalışma alanı silindiğinde kendi koleksiyonunun özel hareketleri de kaldırılır.

Kaydetme başarısızsa form korunur; aynı istek tekrarlandığında ikinci kayıt oluşturulmaz. Özel bir hareketin adı standart bir hareketle aynı olsa bile kullanıcının verdiği görsel kullanılır. Önceden yalnızca program içine eklenmiş özel hareketler değiştirilmez; sınıflandırma bilgileri olmadığı için otomatik olarak kütüphaneye aktarılmaz.

Kullanıcının eklediği hareketlerin detay alanının en altında “Kütüphaneden kaldır” bulunur. Standart katalog hareketlerinde bu işlem gösterilmez. Kaldırılan özel hareket yeniden açılan kütüphanede, aramada veya filtrelerde görünmez. Programlardaki mevcut hareket kopyaları, görselleri ve tamamlanma durumları korunur. Kaldırma için koleksiyonda düzenleme yetkisi gerekir; başarısız işlem kartı veya açık formu silmez. Eski bir oluşturma isteğinin gecikmiş tekrarı kaldırılmış kaydı yeniden etkinleştiremez.

Programlar isim ve isteğe bağlı gün seçimiyle oluşturulur. Koleksiyon kartlarından açılabilir, yeniden adlandırılabilir, günleri değiştirilebilir, çoğaltılabilir veya silinebilir. Çoğaltma yeni hareket kimlikleri üretir ve kopyanın tamamlanma işaretlerini temizler; kaynak programı değiştirmez.

Her hareket için ad, set, tekrar veya süre, ağırlık (kg), dinlenme (saniye), tempo, alternatif hareket ve kişisel not düzenlenebilir. Bu bilgiler hareket JSON'una eklenir. Özel hareketler isteğe bağlı HTTP(S) görsel bağlantısıyla eklenebilir.

Hareket kütüphanesi [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) kaynağından alınmış, uygulamaya dahil edilen 876 hareketlik bir katalogdur. Arama Türkçe kas ve ekipman ifadelerini destekler. Görseller GitHub'dan yüklenir; hata durumunda aynı görsel jsDelivr üzerinden denenir. Eski ExerciseDB görselleri, hareket adı katalogla eşleşiyorsa yenilenir. Eşleşmeyen veya tüm kaynakları yüklenemeyen hareketler okunabilir bir simgeyle gösterilir. Görseller için internet bağlantısı gerekir.

Salt okunur paylaşımda düzenleme, oluşturma, silme, çoğaltma ve tamamlanma işlemleri kapalıdır. Hareket düzenleme, pencere açılırken alınan sürümü kullanır; başka bir kişinin değişikliklerini sessizce ezmez. Kayıt başarısızsa formdaki değerler korunur. Paylaşımlı program kopyalanırken hareketler mevcut RPC üzerinden eklenir; bir ekleme başarısızsa oluşturulan kısmi kopyanın silinmesi denenir. Silme başarısız olursa program listesi yenilenir ve kullanıcı hatayı görür.

Doğrulama: `node --test tests/workout.test.cjs tests/workout-library-sql.test.cjs tests/workout-sequence-sql.test.cjs`, `npm.cmd test`, `npm.cmd run build`.
