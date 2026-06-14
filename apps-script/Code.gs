/**
 * Ritme Student Backend — Google Sheets Only
 *
 * Fungsi Apps Script ini hanya untuk database/sync Google Sheets:
 * - doGet: cek backend aktif
 * - doPost saveAll: simpan seluruh state ke Spreadsheet
 * - doPost loadAll: ambil state terakhir dari Spreadsheet
 *
 * AI tidak dipanggil dari Apps Script.
 * AI dipanggil dari Vercel API `/api/ritme`, bukan dari Apps Script.
 * Default terbaru: Gemini lewat Vercel Environment Variables:
 * - AI_PROVIDER=gemini
 * - GEMINI_API_KEY=...
 * - GEMINI_MODEL=gemini-2.0-flash
 * Groq masih bisa dipakai opsional jika AI_PROVIDER=groq.
 *
 * Setup:
 * 1. Buat Google Sheets kosong.
 * 2. Extensions > Apps Script.
 * 3. Paste file ini ke Code.gs.
 * 4. Opsional Script Properties: SPREADSHEET_ID = id spreadsheet kalau script tidak bound ke Sheet.
 * 5. Deploy > New deployment > Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 * 6. Copy URL /exec ke Vercel Environment Variable APPS_SCRIPT_URL.
 */

function doGet(e) {
  return jsonOutput({
    ok: true,
    app: 'Ritme Student Sheets Backend',
    provider: 'sheets-only',
    ai: 'handled-by-vercel',
    time: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    var action = body.action || 'ping';
    var payload = body.payload || {};

    if (action === 'ping') {
      return jsonOutput({ ok: true, message: 'Ritme Sheets backend aktif', provider: 'sheets-only', time: new Date().toISOString() });
    }

    if (action === 'saveAll') {
      saveAll_(payload.state || {});
      return jsonOutput({ ok: true, message: 'Data tersimpan ke Google Sheets', time: new Date().toISOString() });
    }

    if (action === 'loadAll') {
      return jsonOutput({ ok: true, state: loadAll_(), time: new Date().toISOString() });
    }

    return jsonOutput({ ok: false, error: 'Action tidak dikenal di Sheets backend: ' + action });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  var text = e.postData.contents;
  try { return JSON.parse(text); } catch (err) { return {}; }
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getDb_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name, headers) {
  var ss = getDb_();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

function resetSheet_(name, headers) {
  var sh = getSheet_(name, headers);
  sh.clearContents();
  sh.appendRow(headers);
  return sh;
}

function saveAll_(state) {
  var savedAt = new Date().toISOString();

  var summary = resetSheet_('summary', ['savedAt', 'profileName', 'identity', 'goalCount', 'habitCount', 'scheduleCount', 'anchorCount', 'checkinCount']);
  summary.appendRow([
    savedAt,
    (state.profile && state.profile.name) || '',
    state.identity || '',
    (state.dailyGoals || []).length,
    (state.habits || []).length,
    (state.schedules || []).length,
    (state.anchors || []).length,
    (state.checkins || []).length
  ]);

  var profile = resetSheet_('profile', ['savedAt', 'name', 'role', 'focus']);
  profile.appendRow([
    savedAt,
    (state.profile && state.profile.name) || '',
    (state.profile && state.profile.role) || '',
    (state.profile && state.profile.focus) || ''
  ]);

  var goals = resetSheet_('daily_goals', ['id', 'date', 'text', 'done', 'createdAt', 'savedAt']);
  (state.dailyGoals || []).forEach(function(g) {
    goals.appendRow([g.id, g.date, g.text, g.done, g.createdAt, savedAt]);
  });

  var schedules = resetSheet_('schedules', ['id', 'name', 'day', 'block', 'start', 'end', 'energy', 'savedAt']);
  (state.schedules || []).forEach(function(s) {
    schedules.appendRow([s.id, s.name, s.day, s.block || '', s.start || '', s.end || '', s.energy || '', savedAt]);
  });

  var anchors = resetSheet_('anchors', ['id', 'relation', 'activity', 'trigger', 'routine', 'type', 'savedAt']);
  (state.anchors || []).forEach(function(a) {
    anchors.appendRow([a.id, a.relation || '', a.activity || '', a.trigger || '', a.routine || '', a.type || '', savedAt]);
  });

  var habits = resetSheet_('habits', ['id', 'name', 'target', 'category', 'difficulty', 'frequency', 'anchor', 'microTrigger', 'triggerDetail', 'place', 'duration', 'formula', 'reminderBlock', 'identity', 'obvious', 'attractive', 'easy', 'satisfying', 'confidence', 'reason', 'savedAt']);
  (state.habits || []).forEach(function(h) {
    habits.appendRow([
      h.id,
      h.name,
      h.target,
      h.category,
      h.difficulty,
      h.frequency,
      h.anchor || '',
      h.microTrigger || '',
      h.triggerDetail || '',
      h.place || '',
      h.duration || '',
      h.formula || '',
      h.reminderBlock || '',
      h.identity || '',
      h.obvious || '',
      h.attractive || '',
      h.easy || '',
      h.satisfying || '',
      h.confidence || '',
      h.reason || '',
      savedAt
    ]);
  });

  var checkins = resetSheet_('checkins', ['id', 'habitId', 'date', 'status', 'reason', 'note', 'createdAt', 'savedAt']);
  (state.checkins || []).forEach(function(c) {
    checkins.appendRow([c.id, c.habitId, c.date, c.status, c.reason || '', c.note || '', c.createdAt || '', savedAt]);
  });

  var chat = resetSheet_('chat', ['role', 'text', 'savedAt']);
  (state.chat || []).slice(-80).forEach(function(m) {
    chat.appendRow([m.role || '', m.text || '', savedAt]);
  });

  var raw = resetSheet_('raw_state', ['savedAt', 'json']);
  raw.appendRow([savedAt, JSON.stringify(state)]);
}

function loadAll_() {
  var sh = getSheet_('raw_state', ['savedAt', 'json']);
  var last = sh.getLastRow();
  if (last < 2) return {};
  var json = sh.getRange(last, 2).getValue();
  try { return JSON.parse(json || '{}'); } catch (err) { return {}; }
}
