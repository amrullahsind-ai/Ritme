# Ritme Student — Vercel API Version

Versi ini dibuat agar aplikasi tidak lagi meminta endpoint di menu. Frontend langsung memanggil endpoint relatif:

```txt
/api/ritme
```

Artinya AI dan sync berjalan lewat Vercel API.

## Struktur

- `index.html`, `styles.css`, `app.js` = PWA/frontend
- `api/ritme.js` = backend Vercel untuk Gemini dan sync
- `apps-script/Code.gs` = jembatan Google Sheets, opsional tapi dipakai untuk sync ke Spreadsheet
- `manifest.json`, `service-worker.js`, `icon.svg` = PWA

## Environment Variables di Vercel

Wajib untuk AI:

```txt
GEMINI_API_KEY=isi_api_key_gemini_kamu
```

Opsional:

```txt
GEMINI_MODEL=gemini-2.0-flash
```

Untuk sync ke Google Sheets:

```txt
APPS_SCRIPT_URL=https://script.google.com/macros/s/xxxx/exec
```

Kalau `APPS_SCRIPT_URL` belum diisi, aplikasi tetap jalan dan data tetap tersimpan lokal di browser, tapi tidak masuk Google Sheets.

## Setup Google Sheets

1. Buat Google Sheet baru.
2. Extensions → Apps Script.
3. Copy isi `apps-script/Code.gs`.
4. Paste ke Apps Script.
5. Save.
6. Deploy → New deployment → Web app.
7. Setting:
   - Execute as: Me
   - Who has access: Anyone
8. Copy URL `/exec`.
9. Masukkan URL itu ke Environment Variable Vercel: `APPS_SCRIPT_URL`.
10. Redeploy Vercel.

## Cara deploy ke Vercel

1. Upload folder ini ke GitHub.
2. Import repo ke Vercel.
3. Set Environment Variables:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` opsional
   - `APPS_SCRIPT_URL` opsional untuk sync Sheets
4. Deploy.

## Catatan penggunaan

- User tidak perlu mengisi endpoint di aplikasi.
- Kalau tidak punya jadwal tetap, user tetap bisa memakai anchor seperti setelah bangun, setelah mandi, setelah makan, setelah sholat, sebelum tidur.
- Check-in harian dan alasan gagal adalah data utama untuk AI memperbaiki sistem habit.
