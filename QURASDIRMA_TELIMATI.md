# BAŞKENT RESTORAN — QR Menyu Sistemi Quraşdırma və İstifadə Təlimatı

Bu sistem **BAŞKENT RESTORAN** üçün sıfırdan hazırlanmış, **4 dilli (AZ, EN, RU, TR)**, mobil telefonlara tam uyğun, daimi verilənlər bazası (`SQLite`) və şəkil yaddaşına malik tam işlək veb tətbiqidir.

Heç bir əlavə paket (`npm install`) yükləməyə ehtiyac yoxdur — **Node.js 22+** quraşdırılmış istənilən serverdə və ya kompüterdə birbaşa işləyir.

---

## 1. İki Ayrı QR Linki

Sayt yayımlandıqdan sonra sizin əsas domeniniz (məsələn, `https://baskent-restoran.onrender.com`) üzərindən iki ayrı ünvan işləyəcək:

1. **Müştəri Menyusu (QR kod üçün):** `https://SIZIN-SAYT.com/menu`
   - Qeydiyyat tələb etmir, birbaşa brauzerdə açılır.
   - İlkin dil Azərbaycan dilidir, müştəri yuxarıdan `AZ / EN / RU / TR` dillərini seçə bilər.
2. **Admin Paneli (Yalnız sizin üçün):** `https://SIZIN-SAYT.com/admin`
   - E-poçt və şifrə ilə qorunur.

---

## 2. İlkin Admin Hesabı

Sistem ilk dəfə işə düşdükdə avtomatik olaraq aşağıdakı admin hesabını yaradır:

- **E-poçt:** `admin@baskent.az`
- **Şifrə:** `Baskent2025!`

> **Vacib tövsiyə:** Sayta ilk dəfə `/admin` ünvanından daxil olduqdan sonra **"Təhlükəsizlik"** bölməsinə keçib şifrənizi mütləq dəyişin.

---

## 3. İnternetdə Yayımlamaq (Addım-addım Sadə Təlimat)

Bu layihə **SQLite verilənlər bazası (`data/baskent.db`)** və **yüklənmiş şəkillər (`uploads/`)** ilə işlədiyi üçün daimi disk yaddaşı verən pulsuz/ucuz platformalarda (məsələn: **Railway**, **Render** və ya istənilən **VPS**) çox rahat işləyir.

### Variant A: Render.com və ya Railway.app ilə yayımlamaq (Proqramlaşdırma bilməyənlər üçün)
1. **GitHub hesabı açın** (pulsuzdur: github.com) və bu layihənin fayllarını yeni bir GitHub reposuna yükləyin.
2. **Render.com** (və ya **Railway.app**) saytında GitHub ilə qeydiyyatdan keçin.
3. **"New Web Service"** seçib GitHub reponuzu bağlayın.
4. Ayarlar:
   - **Runtime:** `Node` (və ya `Docker`)
   - **Start Command:** `node --no-warnings server.mjs`
   - **Disk (Persistent Storage):** `/app/data` və `/app/uploads` qovluqlarının itməməsi üçün daimi disk (Persistent Disk) qoşun.
5. **Environment Variables** bölməsinə əlavə edin:
   - `SESSION_SECRET` = uzun təsadüfi mətn (məsələn, 32+ simvol)
   - `ADMIN_EMAIL` = öz admin e-poçtunuz (istəyə bağlı)
   - `ADMIN_PASSWORD` = öz güclü şifrəniz (istəyə bağlı)
6. **"Deploy"** düyməsinə basın. Bir neçə dəqiqəyə saytınız hazır olacaq və sizə `https://...` linki veriləcək!

---

## 4. Kompüterdə Özünüz Yoxlamaq Üçün

1. Kompüterinizdə **Node.js 22** (nodejs.org) quraşdırın.
2. Layihə qovluğunda terminalı açın və yazın:
   ```bash
   node --no-warnings server.mjs
   ```
3. Brauzerdə açın:
   - Müştəri menyusu: `http://localhost:3000/menu`
   - Admin paneli: `http://localhost:3000/admin`
