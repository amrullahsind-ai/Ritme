# Ritme HabitOS Full — Setup PWA + Google Sheets + NVIDIA AI

Versi ini dibuat untuk pemakaian pribadi/uji coba beberapa bulan.

Arsitektur:

```text
PWA / Web App Ritme -> Google Apps Script Web App -> Google Sheets
                              |
                              -> NVIDIA API / DeepSeek model
```

Aplikasi tetap dibuka dari file/hosting PWA, bukan dari Apps Script. Apps Script hanya dipakai sebagai backend/API untuk menyimpan data dan memanggil AI.

---

## 1. Jalankan aplikasi lokal

1. Ekstrak ZIP.
2. Buka `index.html` di browser.
3. Klik `Isi contoh` untuk melihat data dummy.
4. Buka menu `Sync & Backup` untuk menghubungkan backend.

Data akan tetap tersimpan lokal di browser meskipun backend belum disambungkan.

---

## 2. Buat Google Sheets database

1. Buka Google Sheets.
2. Buat spreadsheet baru, misalnya: `Ritme HabitOS Database`.
3. Klik `Extensions` > `Apps Script`.
4. Hapus kode bawaan.
5. Copy semua isi file:

```text
apps-script/Code.gs
```

6. Paste ke Apps Script.
7. Simpan project.

Kalau Apps Script dibuat dari dalam Spreadsheet, kamu tidak wajib mengisi `SPREADSHEET_ID`.

---

## 3. Simpan API key NVIDIA dengan aman

Jangan taruh API key di frontend/app.js.

Di Apps Script:

1. Buka `Project Settings`.
2. Scroll ke `Script Properties`.
3. Tambahkan property:

```text
NVIDIA_API_KEY = nvapi-key-baru-kamu
```

Penting: key yang pernah kamu tempel di chat sebaiknya dihapus/rotate, lalu pakai key baru.

Opsional, kalau script tidak bound ke spreadsheet:

```text
SPREADSHEET_ID = id_spreadsheet_kamu
```

---

## 4. Deploy Apps Script sebagai Web App

1. Klik `Deploy` > `New deployment`.
2. Pilih type: `Web app`.
3. Setting:

```text
Execute as: Me
Who has access: Anyone
```

4. Klik `Deploy`.
5. Copy URL Web App yang berakhir dengan `/exec`.

Contoh:

```text
https://script.google.com/macros/s/AKfycb.../exec
```

---

## 5. Hubungkan ke aplikasi

1. Buka aplikasi Ritme.
2. Masuk ke menu `Sync & Backup`.
3. Paste URL Web App Apps Script.
4. Klik `Simpan endpoint`.
5. Klik `Test koneksi`.
6. Klik `Sync`.

Kalau berhasil, sheet otomatis berisi tab:

- `summary`
- `schedules`
- `anchors`
- `habits`
- `checkins`
- `raw_state`
- `ai_insights`

---

## 6. Cara pakai AI

Setelah endpoint aktif dan API key NVIDIA sudah disimpan di Apps Script, kamu bisa pakai:

- `AI Habit Fitting` di menu Habit Plan.
- `AI Coach` di menu AI Coach.
- `AI Review` di menu Insight.

Kalau AI gagal, aplikasi akan fallback ke simulasi lokal untuk Habit Fitting.

---

## 7. Catatan penting soal CORS

Sebagian deployment Apps Script bisa menolak request dari frontend karena CORS/permission/deployment belum benar.

Yang perlu dicek:

- Web App sudah deploy, bukan hanya preview.
- URL yang dipakai adalah URL `/exec`, bukan `/dev`.
- Access diset ke `Anyone`.
- Setelah mengubah kode, klik `Deploy` > `Manage deployments` > `Edit` > pilih `New version`.
- Pertama kali deploy, Google biasanya meminta authorization.

Kalau masih error, coba hosting PWA di Vercel/Netlify/GitHub Pages, bukan membuka dari `file://`. Tetapi untuk banyak kasus, membuka lokal tetap bisa untuk uji coba.

---

## 8. Backup manual

Menu `Sync & Backup` menyediakan:

- `Export JSON`: menyimpan backup data lokal ke file.
- `Import JSON`: mengembalikan data dari file backup.
- `Hapus data lokal`: menghapus data di browser.

Saran: export backup seminggu sekali walaupun auto-save ke Sheets aktif.

---

## 9. Batasan versi ini

Versi ini cocok untuk pribadi, tapi belum untuk banyak user karena:

- belum ada login/signup multi-user
- endpoint Apps Script bersifat cukup terbuka
- belum ada sistem permission per user
- Google Sheets bukan database skala besar

Untuk jualan/publik, nanti lebih cocok pindah ke Supabase/Firebase + backend proper.

## Update Mobile UX

Versi ini menambahkan:
- Burger menu untuk tampilan HP.
- Sidebar berubah menjadi drawer/slide menu.
- Layout card lebih nyaman untuk mobile.
- Energy Map lebih jelas: peta energi pagi/siang/sore/malam yang dipakai AI untuk menaruh habit sesuai kapasitas energi.

Konsep Energy Map:
- Energi tinggi: cocok untuk habit berat seperti belajar fokus, hafalan, olahraga.
- Energi sedang: cocok untuk habit sedang seperti baca, review, journaling ringan.
- Energi rendah: cocok untuk habit mini seperti 2 menit, checklist, atau persiapan besok.

Energy Map dihitung dari jadwal yang kamu masukkan. Kalau jadwal pagi kamu beri energi tinggi, kartu Pagi akan lebih tinggi. Kalau jadwal malam sering rendah, AI sebaiknya tidak menaruh habit berat di malam.
