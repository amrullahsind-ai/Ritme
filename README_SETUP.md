# Ritme Student — Revised Edition

Versi ini memperbaiki alur Ritme supaya lebih cocok untuk mahasiswa dan lebih sesuai konsep habit stacking.

## Perubahan utama

- Habit ditempel ke **kegiatan nyata**, bukan sekadar "sebelum/sesudah" abstrak.
- Jadwal tidak wajib pakai jam. Kamu bisa cukup pilih blok: Pagi, Siang, Sore, Malam, atau Fleksibel.
- Tambah **Tujuan Hari Ini** untuk diisi setiap pagi.
- AI Coach bisa menambah hal dari chat:
  - tambah tujuan hari ini
  - tambah habit
  - tambah jadwal fleksibel
- Sync sekarang mendukung:
  - `saveAll` untuk kirim data ke Google Sheets
  - `loadAll` untuk ambil data dari Google Sheets
- Heatmap diperbaiki agar berdasarkan **tanggal check-in**, bukan urutan data.
- Profil lokal ditambahkan. Ini belum login sungguhan, tapi cukup untuk personalisasi.
- UI/UX diperhalus: goal card, profile pill, habit card, dan energy map lebih jelas.

## Struktur

- `index.html`, `styles.css`, `app.js` = frontend/PWA
- `api/ritme.js` = backend Vercel untuk Groq/Gemini dan sync
- `apps-script/Code.gs` = backend Google Sheets
- `manifest.json`, `service-worker.js`, `icon.svg` = PWA

## Environment Variables di Vercel

### Pakai Groq

```txt
AI_PROVIDER=groq
GROQ_API_KEY=gsk_isi_key_groq_kamu
GROQ_MODEL=llama-3.3-70b-versatile
```

Kalau ingin lebih cepat dan ringan:

```txt
GROQ_MODEL=llama-3.1-8b-instant
```

### Pakai Gemini

```txt
AI_PROVIDER=gemini
GEMINI_API_KEY=isi_api_key_gemini_kamu
GEMINI_MODEL=gemini-2.0-flash
```

### Sync ke Google Sheets

```txt
APPS_SCRIPT_URL=https://script.google.com/macros/s/xxxx/exec
```

Setelah mengubah Environment Variables, lakukan **Redeploy** di Vercel.

## Cek backend Vercel

Buka:

```txt
https://namaprojectkamu.vercel.app/api/ritme
```

Kalau sukses, akan muncul JSON berisi provider, model, dan status key.

## Setup Google Sheets

1. Buat Google Sheets baru.
2. Extensions → Apps Script.
3. Copy isi `apps-script/Code.gs`.
4. Paste ke Apps Script.
5. Save.
6. Deploy → New deployment → Web app.
7. Setting:
   - Execute as: Me
   - Who has access: Anyone
8. Copy URL `/exec`.
9. Masukkan ke Vercel Environment Variable `APPS_SCRIPT_URL`.
10. Redeploy Vercel.

## Catatan akun

Menu Profil saat ini masih **profil lokal**, bukan login akun sungguhan. Kalau nanti aplikasi mau dipakai banyak user, sebaiknya tambah auth beneran seperti Supabase/Firebase.


## Update V2 AI Fitting

Versi ini mengubah Habit Plan menjadi lebih ramah user:

- User cukup menulis habit mentah seperti `Baca buku`, `Olahraga`, `Tilawah`.
- AI Fitting yang membuat detail: kegiatan tempelan, pemicu detail, tempat, target minimum, durasi awal, formula habit, reminder block, dan alasan.
- Check-in menampilkan formula habit, bukan hanya nama habit.
- AI Coach bisa mengusulkan action `addHabit`, `updateHabit`, `addGoal`, dan `addSchedule`.
- Notifikasi PWA bisa diaktifkan dari menu Profil.

Setelah upload ke GitHub/Vercel, jangan lupa redeploy. Kalau memakai Google Sheets, copy ulang `apps-script/Code.gs` ke Apps Script dan deploy ulang.
