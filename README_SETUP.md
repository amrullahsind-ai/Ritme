# Ritme Student V3 — Gemini + Sheets Only

Versi ini memakai arsitektur:

```txt
AI:
Ritme PWA → Vercel API `/api/ritme` → Gemini Flash

Database:
Ritme PWA → Vercel API `/api/ritme` → Apps Script → Google Sheets
```

Apps Script hanya untuk Google Sheets. Tidak ada Gemini/Groq API key di Apps Script.

## Environment Variables di Vercel

Wajib untuk AI Gemini:

```txt
AI_PROVIDER=gemini
GEMINI_API_KEY=isi_api_key_gemini_kamu
GEMINI_MODEL=gemini-2.0-flash
```

Untuk sync ke Google Sheets:

```txt
APPS_SCRIPT_URL=https://script.google.com/macros/s/xxxx/exec
```

Groq masih opsional kalau nanti mau balik lagi:

```txt
AI_PROVIDER=groq
GROQ_API_KEY=gsk_isi_key_groq_kamu
GROQ_MODEL=llama-3.3-70b-versatile
```

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
9. Masukkan URL itu ke Vercel sebagai `APPS_SCRIPT_URL`.
10. Redeploy Vercel.

## Cara deploy ke Vercel

1. Upload isi folder ini ke GitHub.
2. Import repo ke Vercel.
3. Set Environment Variables:
   - `AI_PROVIDER=gemini`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL=gemini-2.0-flash`
   - `APPS_SCRIPT_URL`
4. Redeploy.

## Cek apakah backend aktif

Buka:

```txt
https://namaprojectkamu.vercel.app/api/ritme
```

Harus muncul JSON semacam:

```json
{
  "ok": true,
  "service": "Ritme Student API",
  "provider": "gemini",
  "model": "gemini-2.0-flash"
}
```

Kalau provider masih `groq`, berarti `AI_PROVIDER=gemini` belum kebaca atau belum redeploy.
