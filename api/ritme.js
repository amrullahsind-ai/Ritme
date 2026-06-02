const AI_PROVIDER = (process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'gemini')).toLowerCase();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

function json(res, status, data){
  res.status(status).setHeader('Content-Type','application/json');
  res.end(JSON.stringify(data));
}

function safeState(payload){
  return payload && payload.state ? payload.state : {};
}

function buildContext(state){
  return JSON.stringify({
    identity: state.identity || '',
    schedules: state.schedules || [],
    anchors: state.anchors || [],
    habits: state.habits || [],
    checkins: state.checkins || []
  }, null, 2).slice(0, 18000);
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
      generationConfig: { temperature: 0.7, topP: 0.9, maxOutputTokens: 1600 }
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
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 1400,
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
  if(AI_PROVIDER === 'gemini') return callGemini(prompt, system);
  throw new Error(`AI_PROVIDER tidak dikenali: ${AI_PROVIDER}. Gunakan groq atau gemini.`);
}

async function forwardToAppsScript(action, payload){
  const url = process.env.APPS_SCRIPT_URL;
  if(!url) return { ok:false, warning:'APPS_SCRIPT_URL belum diisi. Data hanya tersimpan lokal di browser.' };

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload, clientTime: new Date().toISOString() })
  });

  const text = await r.text();
  try { return JSON.parse(text); } catch { return { ok:r.ok, message:text }; }
}

function extractJSON(text){
  const m = String(text || '').match(/\[[\s\S]*\]/);
  if(!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export default async function handler(req, res){
  if(req.method === 'GET'){
    return json(res, 200, {
      ok: true,
      service: 'Ritme Student API',
      provider: AI_PROVIDER,
      model: AI_PROVIDER === 'groq' ? GROQ_MODEL : GEMINI_MODEL,
      hasGroqKey: Boolean(process.env.GROQ_API_KEY),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasAppsScriptUrl: Boolean(process.env.APPS_SCRIPT_URL)
    });
  }

  if(req.method !== 'POST') return json(res, 405, { ok:false, error:'Method not allowed' });

  try{
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { action, payload = {} } = body;

    if(action === 'ping'){
      return json(res, 200, { ok:true, service:'Ritme Student API', provider:AI_PROVIDER });
    }

    if(action === 'saveAll'){
      const result = await forwardToAppsScript('saveAll', payload);
      return json(res, 200, { ok:true, sheet: result });
    }

    if(action === 'aiCoach'){
      const state = safeState(payload);
      const answer = await callAI(
        `Data user:\n${buildContext(state)}\n\nPertanyaan user: ${payload.message}\n\nJawab sebagai AI habit coach mahasiswa. Berikan saran jelas dan bisa dilakukan hari ini.`
      );
      return json(res, 200, { ok:true, data:{ answer } });
    }

    if(action === 'weeklyReview'){
      const state = safeState(payload);
      const review = await callAI(
        `Data habit user minggu ini:\n${buildContext(state)}\n\nBuat review mingguan singkat dengan format:\n1. Ringkasan progres\n2. Habit paling stabil\n3. Habit yang perlu diperbaiki\n4. Pola alasan gagal\n5. Rekomendasi minggu depan`
      );
      return json(res, 200, { ok:true, data:{ review } });
    }

    if(action === 'aiHabitFitting'){
      const state = safeState(payload);
      const prompt = `Data user:\n${buildContext(state)}\n\nTugas: susun habit user ke jadwal/anchor paling cocok.\nJika jadwal kosong, gunakan anchor dan pola energi default mahasiswa.\nBalas dalam JSON array saja, tanpa markdown, format:\n[{"habitId":"id habit jika ada","habit":"nama habit","anchor":"anchor/waktu yang cocok","target":"target realistis","reason":"alasan singkat"}]`;
      const raw = await callAI(prompt, 'Kamu adalah AI Habit Fitting. Wajib mengembalikan JSON array valid saja, tanpa penjelasan tambahan.');
      const plans = extractJSON(raw) || [];
      return json(res, 200, { ok:true, data:{ plans, summary:`${AI_PROVIDER === 'groq' ? 'Groq' : 'Gemini'} sudah menyusun habit ke ritme hidupmu.` }, raw });
    }

    return json(res, 400, { ok:false, error:'Action tidak dikenali.' });
  }catch(err){
    return json(res, 200, { ok:false, error: err.message || String(err) });
  }
}
