/**
 * Ritme HabitOS Backend — Gemini Edition
 * Fungsi:
 * 1) menerima sync data dari PWA
 * 2) menyimpan data ke Google Sheets
 * 3) memanggil Google Gemini Flash untuk AI Habit Coach
 *
 * Setup:
 * - Buat Google Sheets kosong
 * - Extensions > Apps Script
 * - Paste file ini ke Code.gs
 * - Project Settings > Script Properties:
 *   GEMINI_API_KEY = API key Gemini dari Google AI Studio
 *   Opsional: GEMINI_MODEL = gemini-2.0-flash
 *   Opsional: SPREADSHEET_ID = id spreadsheet kalau script tidak bound ke Sheet
 * - Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 */

const GEMINI_MODEL = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || 'gemini-2.0-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

function doGet(e) {
  return jsonOutput({ ok: true, app: 'Ritme HabitOS Backend Gemini', provider: 'gemini', model: GEMINI_MODEL, time: new Date().toISOString() });
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    const action = body.action || 'ping';
    const payload = body.payload || {};

    if (action === 'ping') {
      return jsonOutput({ ok: true, message: 'Backend Gemini aktif', provider: 'gemini', model: GEMINI_MODEL, time: new Date().toISOString() });
    }

    if (action === 'saveAll') {
      saveAll_(payload.state || {});
      return jsonOutput({ ok: true, message: 'Data tersimpan ke Google Sheets', time: new Date().toISOString() });
    }

    if (action === 'aiHabitFitting') {
      const result = aiHabitFitting_(payload.state || {});
      appendAIInsight_('aiHabitFitting', result.summary || '', result);
      return jsonOutput({ ok: true, provider: 'gemini', data: result });
    }

    if (action === 'aiCoach') {
      const result = aiCoach_(payload.message || '', payload.state || {});
      appendAIInsight_('aiCoach', result.answer || '', result);
      return jsonOutput({ ok: true, provider: 'gemini', data: result });
    }

    if (action === 'weeklyReview') {
      const result = weeklyReview_(payload.state || {});
      appendAIInsight_('weeklyReview', result.review || '', result);
      return jsonOutput({ ok: true, provider: 'gemini', data: result });
    }

    return jsonOutput({ ok: false, error: 'Action tidak dikenal: ' + action });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  const text = e.postData.contents;
  try { return JSON.parse(text); } catch (err) { return {}; }
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getDb_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name, headers) {
  const ss = getDb_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

function resetSheet_(name, headers) {
  const sh = getSheet_(name, headers);
  sh.clearContents();
  sh.appendRow(headers);
  return sh;
}

function saveAll_(state) {
  const savedAt = new Date().toISOString();

  const summary = resetSheet_('summary', ['savedAt', 'identity', 'habitCount', 'scheduleCount', 'anchorCount', 'checkinCount']);
  summary.appendRow([savedAt, state.identity || '', (state.habits || []).length, (state.schedules || []).length, (state.anchors || []).length, (state.checkins || []).length]);

  const schedules = resetSheet_('schedules', ['id', 'name', 'day', 'start', 'end', 'energy', 'savedAt']);
  (state.schedules || []).forEach(s => schedules.appendRow([s.id, s.name, s.day, s.start, s.end, s.energy, savedAt]));

  const anchors = resetSheet_('anchors', ['id', 'trigger', 'routine', 'type', 'savedAt']);
  (state.anchors || []).forEach(a => anchors.appendRow([a.id, a.trigger, a.routine, a.type, savedAt]));

  const habits = resetSheet_('habits', ['id', 'name', 'target', 'category', 'difficulty', 'frequency', 'anchor', 'reason', 'savedAt']);
  (state.habits || []).forEach(h => habits.appendRow([h.id, h.name, h.target, h.category, h.difficulty, h.frequency, h.anchor, h.reason, savedAt]));

  const checkins = resetSheet_('checkins', ['id', 'habitId', 'date', 'status', 'reason', 'note', 'createdAt', 'savedAt']);
  (state.checkins || []).forEach(c => checkins.appendRow([c.id, c.habitId, c.date, c.status, c.reason, c.note, c.createdAt, savedAt]));

  const raw = resetSheet_('raw_state', ['savedAt', 'json']);
  raw.appendRow([savedAt, JSON.stringify(state)]);
}

function appendAIInsight_(type, text, raw) {
  const sh = getSheet_('ai_insights', ['createdAt', 'type', 'provider', 'model', 'text', 'raw']);
  sh.appendRow([new Date().toISOString(), type, 'gemini', GEMINI_MODEL, text, JSON.stringify(raw)]);
}

function callGemini_(systemPrompt, userPrompt, options) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY belum diisi di Script Properties.');

  const url = GEMINI_BASE_URL + encodeURIComponent(GEMINI_MODEL) + ':generateContent?key=' + encodeURIComponent(key);
  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt || 'Kamu adalah AI habit coach.' }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt || '' }]
      }
    ],
    generationConfig: {
      temperature: options && options.temperature !== undefined ? options.temperature : 0.55,
      topP: options && options.topP !== undefined ? options.topP : 0.95,
      maxOutputTokens: options && options.maxOutputTokens !== undefined ? options.maxOutputTokens : 2048,
      responseMimeType: options && options.json ? 'application/json' : 'text/plain'
    }
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code === 429) throw new Error('Gemini 429: provider sedang terlalu ramai atau kena rate limit.');
  if (code < 200 || code >= 300) throw new Error('Gemini error ' + code + ': ' + text.slice(0, 500));

  const data = JSON.parse(text);
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!parts || !parts.length) {
    const reason = data && data.candidates && data.candidates[0] && data.candidates[0].finishReason;
    throw new Error('Gemini tidak mengirim jawaban' + (reason ? ': ' + reason : '.'));
  }
  return parts.map(p => p.text || '').join('\n').trim();
}

function compactState_(state) {
  return JSON.stringify({
    identity: state.identity || '',
    schedules: state.schedules || [],
    anchors: state.anchors || [],
    habits: state.habits || [],
    checkins: (state.checkins || []).slice(-80)
  }, null, 2);
}

function aiHabitFitting_(state) {
  const prompt = `
Data user:
${compactState_(state)}

Tugas:
Susun habit baru ke dalam jadwal dan routine anchor user.

Aturan:
- Jangan membuat habit terlalu berat.
- Tempelkan habit baru ke anchor/rutinitas lama yang paling cocok.
- Pertimbangkan energi, jadwal, dan kesulitan habit.
- Kalau habit terlalu berat, kecilkan targetnya.
- Balas JSON valid saja, tanpa markdown.

Format:
{
  "summary": "ringkasan singkat",
  "plans": [
    {
      "habitId": "id habit jika ada",
      "habit": "nama habit",
      "anchor": "anchor yang dipilih",
      "target": "target realistis",
      "reason": "alasan singkat"
    }
  ]
}`;

  const content = callGemini_(
    'Kamu adalah AI habit coach untuk aplikasi Ritme HabitOS. Balas JSON valid saja.',
    prompt,
    { maxOutputTokens: 2048, temperature: 0.35, json: true }
  );

  return parseJsonFromText_(content, { summary: content, plans: [] });
}

function aiCoach_(message, state) {
  const prompt = `
Data user:
${compactState_(state)}

Pertanyaan user:
${message}

Jawab sebagai coach habit. Ringkas, praktis, dan langsung bisa dilakukan. Jangan terlalu panjang.
Balas JSON valid saja dengan format:
{
  "answer": "jawaban coach"
}`;

  const content = callGemini_(
    'Kamu adalah AI habit coach yang hangat, realistis, jujur, dan praktis. Balas JSON valid saja.',
    prompt,
    { maxOutputTokens: 1200, temperature: 0.65, json: true }
  );

  return parseJsonFromText_(content, { answer: content });
}

function weeklyReview_(state) {
  const prompt = `
Buat review mingguan habit user berdasarkan data berikut:
${compactState_(state)}

Isi review:
- skor/kondisi umum
- habit paling stabil
- habit paling bermasalah
- pola alasan gagal
- rekomendasi minggu depan

Balas JSON valid saja:
{
  "review": "review singkat namun berguna"
}`;

  const content = callGemini_(
    'Kamu adalah AI habit reviewer. Balas JSON valid saja.',
    prompt,
    { maxOutputTokens: 1400, temperature: 0.5, json: true }
  );

  return parseJsonFromText_(content, { review: content });
}

function parseJsonFromText_(text, fallback) {
  if (!text) return fallback;
  let cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);
  try { return JSON.parse(cleaned); } catch (err) { return fallback; }
}
