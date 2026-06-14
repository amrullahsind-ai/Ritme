# Ritme Student V3 — Groq + Sheets Only

Versi ini sudah memakai arsitektur bersih:

```txt
AI:
Ritme PWA → Vercel API `/api/ritme` → Groq/Llama

Database:
Ritme PWA → Vercel API `/api/ritme` → Apps Script → Google Sheets
```

Apps Script hanya untuk sync Google Sheets. AI tidak lagi dipanggil dari Apps Script.

## Revisi utama V3

- AI Coach tidak langsung membuat/mengubah data kalau user hanya minta saran.
- AI Coach hanya menyiapkan aksi jika user jelas meminta, lalu user harus menekan tombol **Terapkan**.
- AI Fitting memakai konsep habit atomik: kecil, sistem > tujuan, identitas, dan 4 hukum perilaku.
- AI Fitting menghasilkan micro trigger detail seperti: setelah menaruh handuk, setelah melipat sajadah, setelah menaruh HP untuk dicas, bukan sekadar “setelah mandi”.
- Habit card menampilkan micro trigger, formula, confidence, dan 4 hukum: obvious, attractive, easy, satisfying.
- Apps Script sudah Sheets-only dan menyimpan field habit baru.
- Heatmap tetap pakai tanggal lokal.
- Notifikasi PWA tetap tersedia.

## Environment Variables di Vercel

Disarankan:

```txt
AI_PROVIDER=groq
GROQ_API_KEY=gsk_isi_key_groq_kamu
GROQ_MODEL=llama-3.3-70b-versatile
APPS_SCRIPT_URL=https://script.google.com/macros/s/xxxx/exec
```

Model lebih cepat:

```txt
GROQ_MODEL=llama-3.1-8b-instant
```

Setelah env diubah, lakukan **Redeploy**.

## Setup Google Sheets

1. Buat Google Sheets baru.
2. Extensions → Apps Script.
3. Copy isi `apps-script/Code.gs` dari folder ini.
4. Paste ke Apps Script.
5. Save.
6. Deploy → New deployment → Web app.
7. Setting:
   - Execute as: Me
   - Who has access: Anyone
8. Copy URL `/exec` ke Vercel Environment Variable `APPS_SCRIPT_URL`.
9. Redeploy Vercel.

## Cek backend

Buka:

```txt
https://nama-project-kamu.vercel.app/api/ritme
```

Harus muncul provider `groq` dan model yang kamu pilih.

## Cara update dari versi lama

1. Upload semua isi folder ini ke GitHub.
2. Commit: `Update Ritme V3 atomic fitting`.
3. Tunggu Vercel deploy.
4. Copy ulang `apps-script/Code.gs` ke Apps Script lama.
5. Deploy Apps Script sebagai **New version**.
6. Pastikan env Vercel masih lengkap.
7. Coba AI Fitting dan check-in baru.
