# MedArşiv

Kişisel ders arşivi. PDF ve sesler Google Drive'da; ders bilgileri,
Drive bağlantıları, favoriler ve tamamlanma oranları Supabase'de tutulur.

## Bir defalık kurulum

1. Supabase projesinde **Authentication > Users > Add user > Create new user**
   üzerinden kendi e-postan ve şifrenle bir kullanıcı oluştur.
   **Auto Confirm User** seçeneğini aç. Bu, Supabase panel hesabından ayrı site girişidir.
2. **Authentication > Sign In / Providers** bölümünde
   **Allow new users to sign up** seçeneğini kapat; e-posta ile giriş açık kalsın.
3. **SQL Editor > New query** bölümüne `supabase-setup.sql` içeriğini yapıştırıp **Run** seç.
   Kurulum tam olarak bir Auth kullanıcısı ister. Tekrar çalıştırmak arşivi silmez.
4. GitHub deposunda **Settings > Pages > Deploy from a branch > main > /(root) > Save**.
5. `https://muhammedguven108.github.io/medweb/` adresini açıp oluşturduğun hesapla giriş yap.

## Kullanım

- Kaydetme yalnızca sunucu onayladığında başarılı sayılır; çevrimdışı yazma yoktur.
- Sekmeye döndüğünde kayıtlar yenilenir; **Yenile** düğmesi de kullanılabilir.
- Başka cihazda yapılan değişiklikle çakışan kayıt reddedilir. Yenile ve işlemi tekrarla.
- Deneme amaçlı eski yerel kayıtlar otomatik aktarılmaz.
- JSON dışa aktarma ve geri yükleme kullanılabilir. Ücretsiz planda düzenli yedek al.
- Supabase Free düşük kullanımda duraklatılabilir; panelden Resume ile açılabilir.

GitHub Pages giriş sayfası ve kodlar herkese açıktır. Ders verilerine erişim,
Supabase RLS ve yalnızca hesap sahibini içeren izin tablosuyla korunur.
Publishable key tarayıcıda kullanıma uygundur; secret/service_role key kullanılmaz.
Drive dosyalarının paylaşım izinleri Drive üzerinden yönetilir.

`vendor/supabase.js`: @supabase/supabase-js 2.57.4 (MIT), resmî SDK'nın UMD paketi.
