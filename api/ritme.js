const AI_PROVIDER = (process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'gemini')).toLowerCase();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

function json(res, status, data){
  res.status(status).setHeader('Content-Type','application/json');
  res.end(JSON.stringify(data));
}

function safeState(payload){
  return payload && payload.state ? payload.state : {};
}

function buildContext(state){
  return JSON.stringify({
    profile: state.profile || {},
    identity: state.identity || '',
    dailyGoals: state.dailyGoals || [],
    schedules: state.schedules || [],
    anchors: state.anchors || [],
    habits: state.habits || [],
    checkins: state.checkins || []
  }, null, 2).slice(0, 20000);
}

async function callGemini(prompt, system = 'Kamu adalah Ritme AI, coach habit untuk mahasiswa. Jawab praktis, ringkas, hangat, dan berbasis data user. Jangan terlalu panjang.'){
  const key = process.env.GEMINI_API_KEY;
  if(!key) throw new Error('GEMINI_API_KEY belum diisi di Vercel Environment Variables.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.65, topP: 0.9, maxOutputTokens: 1800 }
    })
  });

  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  if(!r.ok) throw new Error(data.error?.message || text || `Gemini HTTP ${r.status}`);

  return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n').trim() || 'AI belum memberi jawaban.';
}

async function callGroq(prompt, system = 'Kamu adalah Ritme AI, coach habit untuk mahasiswa. Jawab praktis, ringkas, hangat, dan berbasis data user. Jangan terlalu panjang.'){
  const key = process.env.GROQ_API_KEY;
  if(!key) throw new Error('GROQ_API_KEY belum diisi di Vercel Environment Variables.');

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      temperature: 0.65,
      top_p: 0.9,
      max_tokens: 1600,
      stream: false
    })
  });

  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  if(!r.ok) throw new Error(data.error?.message || text || `Groq HTTP ${r.status}`);
  return data.choices?.[0]?.message?.content?.trim() || 'AI belum memberi jawaban.';
}

async function callAI(prompt, system){
  if(AI_PROVIDER === 'groq') return callGroq(prompt, system);
  return callGemini(prompt, system);
}

async function forwardToAppsScript(action, payload){
  const url = process.env.APPS_SCRIPT_URL;
  if(!url) return { ok:false, warning:'APPS_SCRIPT_URL belum diisi. Data hanya tersimpan lokal di browser.' };
  const r = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ action, payload, clientTime: new Date().toISOString() })
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { ok:r.ok, message:text }; }
}

function extractJSONObject(text){
  if(!text) return null;
  let t = String(text).trim().replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```$/,'').trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if(first >= 0 && last > first) t = t.slice(first,last+1);
  try { return JSON.parse(t); } catch { return null; }
}

function extractJSON(text){
  const m = String(text || '').match(/\[[\s\S]*\]/);
  if(!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function handler(req, res){
  if(req.method === 'GET') return json(res, 200, {
    ok:true,
    service:'Ritme Student API',
    provider:AI_PROVIDER,
    model: AI_PROVIDER === 'groq' ? GROQ_MODEL : GEMINI_MODEL,
    hasGroqKey: !!process.env.GROQ_API_KEY,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    hasAppsScriptUrl: !!process.env.APPS_SCRIPT_URL
  });
  if(req.method !== 'POST') return json(res, 405, { ok:false, error:'Method not allowed' });

  try{
    const { action, payload = {} } = req.body || {};
    if(action === 'ping') return json(res, 200, { ok:true, service:'Ritme Student API', provider:AI_PROVIDER });

    if(action === 'saveAll'){
      const result = await forwardToAppsScript('saveAll', payload);
      return json(res, 200, { ok:true, sheet: result });
    }

    if(action === 'loadAll'){
      const result = await forwardToAppsScript('loadAll', payload);
      if(result && result.ok && result.state) return json(res, 200, { ok:true, state: result.state });
      return json(res, 200, { ok:false, error: result.error || result.warning || 'Belum ada data di Google Sheets.' });
    }

    if(action === 'aiCoach'){
      const state = safeState(payload);
      const prompt = `Data user:
${buildContext(state)}

Pesan user:
${payload.message}

Peranmu:
Kamu adalah AI Coach Ritme untuk mahasiswa. Jawab sebagai coach yang memberi saran, diagnosis, dan refleksi. JANGAN membuat atau mengubah data aplikasi kecuali user secara eksplisit meminta dengan kata seperti: tambahkan, buatkan, masukkan, terapkan, pindahkan, revisi, hapus, atau update.

Aturan penting:
- Kalau user hanya bertanya/minta saran/curhat, actions HARUS array kosong [].
- Kalau kamu mengusulkan perubahan, tawarkan sebagai saran, jangan otomatis dibuat.
- Kalau user eksplisit meminta perubahan, boleh sertakan actions, tetapi aplikasi tetap akan meminta user menekan tombol Terapkan.
- Saran harus mengikuti prinsip perubahan kecil: sistem > tujuan, 1% lebih baik, identitas, dan 4 hukum: obvious, attractive, easy, satisfying.
- Jangan asal mengarang detail. Jika data belum cukup, katakan bahwa ini saran sementara.

Balas JSON valid saja tanpa markdown:
{
  "answer": "jawaban ringkas, praktis, dan tidak terlalu panjang",
  "actions": [
    {"type":"addGoal","text":"..."},
    {"type":"addHabit","name":"...","target":"target kecil","category":"Belajar/Ibadah/Kesehatan/Karya/Relasi","difficulty":"ringan/sedang/berat","frequency":7,"reason":"..."},
    {"type":"addSchedule","name":"...","day":"Fleksibel","block":"Pagi/Siang/Sore/Malam/Fleksibel","energy":"tinggi/sedang/rendah"},
    {"type":"updateHabit","habitId":"...","anchor":"...","microTrigger":"...","triggerDetail":"...","place":"...","target":"...","duration":"...","formula":"...","reminderBlock":"pagi/siang/sore/malam/tanpa reminder","reason":"..."}
  ]
}`;
      const raw = await callAI(prompt, 'Kamu adalah Ritme AI Coach. Balas JSON valid saja. Jangan pakai markdown. Jangan sertakan actions kecuali user eksplisit meminta perubahan data.');
      const parsed = extractJSONObject(raw) || { answer: raw, actions: [] };
      return json(res, 200, { ok:true, data:{ answer: parsed.answer || raw, actions: parsed.actions || [] }, raw });
    }

    if(action === 'weeklyReview'){
      const state = safeState(payload);
      const review = await callAI(`Data habit user minggu ini:\n${buildContext(state)}\n\nBuat review mingguan singkat dengan format:\n1. Ringkasan progres\n2. Habit paling stabil\n3. Habit yang perlu diperbaiki\n4. Pola alasan gagal\n5. Rekomendasi minggu depan`);
      return json(res, 200, { ok:true, data:{ review } });
    }

    if(action === 'aiHabitFitting'){
      const state = safeState(payload);
      const prompt = `Data user:
${buildContext(state)}

Tugas: susun habit mentah user menjadi habit atomik yang siap dijalankan.
User hanya memasukkan habit mentah. AI yang menentukan detailnya.

Filosofi wajib:
- Atomic = kecil tetapi punya dampak besar jika diulang.
- Sistem lebih penting daripada target akhir.
- Target awal harus sangat mudah, kira-kira 1% lebih baik.
- Habit harus mendukung identitas user, bukan hanya hasil.
- Gunakan 4 hukum perubahan perilaku: make it obvious, attractive, easy, satisfying.

Aturan penting:
- Habit harus ditempel ke kegiatan nyata dan MICROMOMENT yang konkret, bukan anchor umum.
- Jangan pakai trigger umum seperti "setelah mandi" jika bisa dibuat lebih spesifik. Buat micro trigger seperti "setelah menaruh handuk", "setelah melipat sajadah", "setelah meletakkan piring", "setelah laptop menyala", "setelah menaruh HP untuk dicas".
- anchor = kegiatan besar/tempelan; microTrigger = aksi penutup kecil yang memulai habit.
- Kalau data user kurang, gunakan micro trigger umum yang masuk akal dan beri confidence sedang/rendah.
- Jangan semua kebiasaan wajib punya jam. Jam hanya dipakai kalau ada jadwal tetap.
- Formula harus berupa kalimat aksi yang jelas: Setelah [micro trigger], aku akan [habit] [target] di [tempat] selama [durasi].
- Reminder block cukup: pagi/siang/sore/malam/tanpa reminder.
- Balas dalam JSON array saja, tanpa markdown.

Format wajib:
[{
  "habitId":"id habit jika ada",
  "habit":"nama habit",
  "anchor":"kegiatan besar/tempelan",
  "microTrigger":"aksi penutup kecil yang konkret",
  "triggerDetail":"pemicu detail yang sangat spesifik",
  "place":"tempat paling masuk akal",
  "target":"target minimum yang realistis",
  "duration":"durasi awal",
  "formula":"kalimat habit siap jalan",
  "reminderBlock":"pagi/siang/sore/malam/tanpa reminder",
  "identity":"identitas yang dibangun",
  "obvious":"cara membuat pemicunya terlihat/jelas",
  "attractive":"cara membuatnya menarik/nyambung dengan hal yang disukai",
  "easy":"cara membuatnya sangat mudah dimulai",
  "satisfying":"cara membuatnya terasa memuaskan setelah selesai",
  "confidence":"tinggi/sedang/rendah",
  "reason":"alasan singkat dan jujur"
}]`;
      const raw = await callAI(prompt, 'Kamu adalah AI Habit Fitting. Wajib mengembalikan JSON array valid saja, tanpa penjelasan tambahan.');
      const plans = extractJSON(raw) || [];
      return json(res, 200, { ok:true, data:{ plans, summary:`${AI_PROVIDER === 'groq' ? 'Groq/Llama' : 'Gemini'} sudah membuat formula habit yang siap dijalankan.` }, raw });
    }

    return json(res, 400, { ok:false, error:'Action tidak dikenali.' });
  }catch(err){
    return json(res, 200, { ok:false, error: err.message || String(err) });
  }
}

module.exports = handler;
