# Ortak görev ve zaman editörü kurulumu

Bu güncelleme `202610180001_tasks_calendar.sql` kurulu bir veritabanı üzerine uygulanır.

Supabase SQL Editor'da aşağıdaki dosyanın tamamını çalıştır:

`supabase/migrations/202611090001_unified_work_details.sql`

Mevcut projeler, görevler ve zaman kayıtları korunur. Güncelleme:

- Görev kartlarına, görüntülenen ayla sınırlı olmayan tüm çalışma zamanlarını getirir.
- Zamanlara seçilen alt görev kimliklerini bağlar; adlar güncel görev verisinden okunur.
- Görev ve zaman değişikliklerini tek işlemde kaydeder. Bir sürüm uyuşmazlığı veya geçersiz zaman varsa tamamı geri alınır.
- Proje silindiğinde görevleri ve zamanları koruyarak projesiz bırakır.

Dosya tekrar çalıştırılabilir. Migration uygulanmadan yeni editörün kaydetme işlemi çalışmaz; uygulama kurulum uyarısı gösterir.

Uyguladıktan sonra sayfayı yenile. Listeye bir başlık yazıp Enter'a bas; açılan pencerede iki farklı çalışma zamanı ekleyip birini alt göreve bağla. Kaydettiğinde iki zaman da kart üzerinde görünmeli. Karttan açıldığında görev bağlantısı değiştirilememeli. Bir projeyi silmek görevlerini veya çalışma zamanlarını silmemeli.

Tahmini süre mevcut eski kayıtlarda korunur; yeni arayüzde kullanılmaz. Planlamada başlangıç ve bitiş saatleri esas alınır. Outlook ve Google Calendar bağlantıları salt okunurdur. Google bağlantısının API, OAuth, migration ve yayın adımları için [Google Calendar kurulumu](../GOOGLE_CALENDAR_SETUP.md) dosyasını izle.
