# Ritme Student — Vercel API Version (Groq Ready)

Versi ini dibuat agar aplikasi tidak lagi meminta endpoint di menu. Frontend langsung memanggil endpoint relatif:

```txt
/api/ritme
```

Artinya AI dan sync berjalan lewat Vercel API.

## Struktur

- `index.html`, `styles.css`, `app.js` = PWA/frontend
- `api/ritme.js` = backend Vercel untuk Groq/Gemini dan sync
- `apps-script/Code.gs` = jembatan Google Sheets, opsional tapi dipakai untuk sync ke Spreadsheet
- `manifest.json`, `service-worker.js`, `icon.svg` = PWA

## Environment Variables di Vercel

### Opsi 1 — Pakai Groq (disarankan kalau kamu mau pindah dari Gemini)

```txt
AI_PROVIDER=groq
GROQ_API_KEY=gsk_isi_key_groq_kamu
GROQ_MODEL=llama-3.1-8b-instant
```

Alternatif model Groq yang bisa kamu coba:

```txt
llama-3.3-70b-versatile
qwen/qwen3-32b
```

### Opsi 2 — Pakai Gemini

```txt
AI_PROVIDER=gemini
GEMINI_API_KEY=isi_api_key_gemini_kamu
GEMINI_MODEL=gemini-2.0-flash
```

### Sync ke Google Sheets

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
3. Set Environment Variables sesuai provider AI yang kamu pilih.
4. Redeploy setelah env ditambahkan/diubah.

## Cek apakah env sudah kebaca

Buka:

```txt
https://namaprojectkamu.vercel.app/api/ritme
```

Kalau berhasil, akan muncul JSON semacam:

```json
{ "ok": true, "service": "Ritme Student API", "provider": "groq", "model": "llama-3.1-8b-instant" }
```

Kalau provider masih `gemini`, berarti environment variable `AI_PROVIDER=groq` belum kebaca atau belum redeploy.

## Catatan penggunaan

- User tidak perlu mengisi endpoint di aplikasi.
- Kalau tidak punya jadwal tetap, user tetap bisa memakai anchor seperti setelah bangun, setelah mandi, setelah makan, setelah sholat, sebelum tidur.
- Check-in harian dan alasan gagal adalah data utama untuk AI memperbaiki sistem habit.
