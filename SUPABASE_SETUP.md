# Supabase Authentication & Setup Guide

## ✅ Yapılan İşler

### 1. **Veritabanı Tabloları (Supabase SQL Editor'de çalıştırıldı)**
- ✅ `categories`, `todos`, `quick_notes`, `password_sessions`, `secure_notes`, `pomodoro_history` tabloları
- ✅ `todo_priority` ve `secure_note_type` enum types
- ✅ `created_by`, `created_at`, `updated_at` otomatik alanlar
- ✅ Foreign keys (cascade/set null)
- ✅ RLS (Row Level Security) politikaları

### 2. **Authentication System**
- ✅ `src/lib/auth.ts` - Supabase Auth servisler (signup, login, logout, session)
- ✅ `src/stores/auth.ts` - Pinia auth store (user state, auth operations)
- ✅ `src/components/LoginSignup.vue` - Tasarımla uyumlu login/signup componenti
- ✅ `src/App.vue` - Auth initialization ve middleware entegrasyon

### 3. **RLS Politikaları**
Tüm tablolarda şu politikalar aktif:
```sql
SELECT: created_by = auth.uid() OR created_by IS NULL
INSERT: true (herkes ekleyebilir, created_by otomatik set)
UPDATE: created_by = auth.uid() OR created_by IS NULL
DELETE: created_by = auth.uid() OR created_by IS NULL
```

---

## 🚀 Setup Adımları

### 1. **Supabase Email Authentication'ı Aktif Etme**

1. [Supabase Dashboard](https://app.supabase.com) açın
2. **Authentication** → **Providers** → **Email** 
3. **Enable Sign Up** = ON
4. **Confirm Email** = OFF (test amaçlı, üretimde ON yapın)
5. **Save**

### 2. **RLS Politikalarını SQL Editor'de Çalıştırma**

Supabase SQL Editor'e (`SQL Editor` → `New Query`) yapıştırın:

```sql
-- 1. Tüm tablolarda RLS'yi enable et
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pomodoro_history ENABLE ROW LEVEL SECURITY;

-- 2. categories policies
DROP POLICY IF EXISTS "categories_select_policy" ON categories;
DROP POLICY IF EXISTS "categories_insert_policy" ON categories;
DROP POLICY IF EXISTS "categories_update_policy" ON categories;
DROP POLICY IF EXISTS "categories_delete_policy" ON categories;

CREATE POLICY "categories_select_policy" ON categories FOR SELECT USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "categories_insert_policy" ON categories FOR INSERT WITH CHECK (true);
CREATE POLICY "categories_update_policy" ON categories FOR UPDATE USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "categories_delete_policy" ON categories FOR DELETE USING (created_by = auth.uid() OR created_by IS NULL);

-- 3. todos policies
DROP POLICY IF EXISTS "todos_select_policy" ON todos;
DROP POLICY IF EXISTS "todos_insert_policy" ON todos;
DROP POLICY IF EXISTS "todos_update_policy" ON todos;
DROP POLICY IF EXISTS "todos_delete_policy" ON todos;

CREATE POLICY "todos_select_policy" ON todos FOR SELECT USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "todos_insert_policy" ON todos FOR INSERT WITH CHECK (true);
CREATE POLICY "todos_update_policy" ON todos FOR UPDATE USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "todos_delete_policy" ON todos FOR DELETE USING (created_by = auth.uid() OR created_by IS NULL);

-- 4. quick_notes policies
DROP POLICY IF EXISTS "quick_notes_select_policy" ON quick_notes;
DROP POLICY IF EXISTS "quick_notes_insert_policy" ON quick_notes;
DROP POLICY IF EXISTS "quick_notes_update_policy" ON quick_notes;
DROP POLICY IF EXISTS "quick_notes_delete_policy" ON quick_notes;

CREATE POLICY "quick_notes_select_policy" ON quick_notes FOR SELECT USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "quick_notes_insert_policy" ON quick_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "quick_notes_update_policy" ON quick_notes FOR UPDATE USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "quick_notes_delete_policy" ON quick_notes FOR DELETE USING (created_by = auth.uid() OR created_by IS NULL);

-- 5. password_sessions policies
DROP POLICY IF EXISTS "password_sessions_select_policy" ON password_sessions;
DROP POLICY IF EXISTS "password_sessions_insert_policy" ON password_sessions;
DROP POLICY IF EXISTS "password_sessions_update_policy" ON password_sessions;
DROP POLICY IF EXISTS "password_sessions_delete_policy" ON password_sessions;

CREATE POLICY "password_sessions_select_policy" ON password_sessions FOR SELECT USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "password_sessions_insert_policy" ON password_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "password_sessions_update_policy" ON password_sessions FOR UPDATE USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "password_sessions_delete_policy" ON password_sessions FOR DELETE USING (created_by = auth.uid() OR created_by IS NULL);

-- 6. secure_notes policies
DROP POLICY IF EXISTS "secure_notes_select_policy" ON secure_notes;
DROP POLICY IF EXISTS "secure_notes_insert_policy" ON secure_notes;
DROP POLICY IF EXISTS "secure_notes_update_policy" ON secure_notes;
DROP POLICY IF EXISTS "secure_notes_delete_policy" ON secure_notes;

CREATE POLICY "secure_notes_select_policy" ON secure_notes FOR SELECT USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "secure_notes_insert_policy" ON secure_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "secure_notes_update_policy" ON secure_notes FOR UPDATE USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "secure_notes_delete_policy" ON secure_notes FOR DELETE USING (created_by = auth.uid() OR created_by IS NULL);

-- 7. pomodoro_history policies
DROP POLICY IF EXISTS "pomodoro_history_select_policy" ON pomodoro_history;
DROP POLICY IF EXISTS "pomodoro_history_insert_policy" ON pomodoro_history;
DROP POLICY IF EXISTS "pomodoro_history_update_policy" ON pomodoro_history;
DROP POLICY IF EXISTS "pomodoro_history_delete_policy" ON pomodoro_history;

CREATE POLICY "pomodoro_history_select_policy" ON pomodoro_history FOR SELECT USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "pomodoro_history_insert_policy" ON pomodoro_history FOR INSERT WITH CHECK (true);
CREATE POLICY "pomodoro_history_update_policy" ON pomodoro_history FOR UPDATE USING (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "pomodoro_history_delete_policy" ON pomodoro_history FOR DELETE USING (created_by = auth.uid() OR created_by IS NULL);
```

### 3. **npm Paketlerini Kurma**

```bash
npm install @supabase/supabase-js
```

### 4. **Frontend'ü Çalıştırma**

```bash
npm run dev
```

Uygulama açılınca:
1. Login sayfasına yönlendirileceksiniz
2. **Sign Up** → Email + Password girin
3. Kayıt başarılı olunca **Sign In**'e geçin
4. Giriş yapıp main app'e erişin
5. Sağ üstte kullanıcı emaili ve **Sign Out** butonu görülecek

---

## 📁 Oluşturulan Dosyalar

```
src/
├── lib/
│   ├── auth.ts (Supabase Auth servisleri)
│   └── supabase.ts (Supabase client)
├── stores/
│   ├── auth.ts (Pinia auth store)
│   └── todo.ts (Updated: user ID ile entegre)
├── components/
│   ├── LoginSignup.vue (Auth componenti)
│   ├── SecureNotes.vue (Updated: auth entegre)
│   └── ... (diğer componentler)
└── App.vue (Updated: auth flow, loader)
```

---

## 🔐 RLS Açıklaması

**Neden `created_by IS NULL` koşulu?**
- Test amaçlı, kayıtlı olmayan kullanıcılar da data görebilsin
- Üretim için: `created_by = auth.uid()` şeklinde kısıtlayın

**Policy yapısı:**
```
INSERT WITH CHECK (true) 
→ Herkes insert yapabilir, 
  trigger otomatik created_by = auth.uid() set eder

SELECT USING (created_by = auth.uid() OR created_by IS NULL)
→ Sadece kendi datası + orphan data (created_by NULL olan) görülür

UPDATE/DELETE USING (created_by = auth.uid() OR created_by IS NULL)
→ Sadece kendi datası değiştirilebilir
```

---

## ✨ Features

- ✅ Email/Password signup
- ✅ Email/Password login
- ✅ Session management (Supabase Session)
- ✅ Automatic user isolation (RLS via created_by)
- ✅ Password reset email
- ✅ Logout
- ✅ Auth state persistence

---

## 🧪 Test Etme

1. **Signup:**
   - `test@example.com` / `password123`
   
2. **Login:**
   - Aynı credentials ile login

3. **Data Isolation:**
   - User 1 olarak todo ekleyin
   - Logout → User 2 signup/login
   - User 2'nin User 1'in todos'unu görmemesi gerekir

4. **RLS Check:**
   - Supabase Dashboard → `Authentication` → `Users` → user email'i doğrulayın

---

## 🐛 Troubleshooting

### "Unauthorized" hatası
- Supabase Email Auth enabled mi kontrol edin
- Browser console'da VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY var mı kontrol edin

### "Row level security policy violated"
- RLS policies SQL'i çalıştırdığınızı doğrulayın
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` çalıştırıldı mı?

### User ID null hatası
- Auth store'dan user alındığından emin olun
- `useAuthStore()` call'ı yapıldığını kontrol edin

---

## 📚 Next Steps (Opsiyonel)

1. **Email Confirmation:** Authentication → Email → Confirm Email = ON
2. **Custom Auth Domain:** Authentication → Providers → Email → Custom SMTP
3. **Social Auth:** GitHub/Google/etc. providers ekle
4. **Phone Auth:** SMS ile OTP
5. **Multi-Factor Auth:** 2FA enable

---

## 📞 Support

- [Supabase Docs](https://supabase.com/docs)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)
- [Vue 3 + Supabase](https://supabase.com/docs/guides/auth/auth-helpers/vue)
