const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
const todayISO = () => new Date().toISOString().slice(0,10);
const days = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
const reasons = ['Lupa','Capek','Malas','Waktu tidak cocok','Target terlalu berat','Kegiatan mendadak','Lingkungan tidak mendukung','Mood jelek'];
const RITME_API_URL = window.RITME_API_URL || '/api/ritme';

const initialState = {
  identity: '',
  schedules: [],
  anchors: [],
  habits: [],
  checkins: [],
  chat: [],
  settings: { endpoint: '', lastSync: '', lastStatus: 'Lokal' }
};
let state = loadState();
let currentFailHabit = null;
let selectedReason = '';
let aiThinking = false;

function loadState(){
  try {
    const raw = JSON.parse(localStorage.getItem('ritme-state-full')) || structuredClone(initialState);
    return { ...structuredClone(initialState), ...raw, settings: { ...initialState.settings, ...(raw.settings || {}) } };
  } catch { return structuredClone(initialState); }
}
function saveState(opts = {}){
  localStorage.setItem('ritme-state-full', JSON.stringify(state));
  renderAll();
  if(opts.sync !== false) scheduleSync();
}
function id(){ return Math.random().toString(36).slice(2,10); }
function safe(text){ return String(text ?? '').replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s])); }

let syncTimer;
function scheduleSync(){
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncAll(false), 900);
}
async function apiCall(action, payload = {}, opts = {}){
  const timeoutMs = opts.timeoutMs || (action && String(action).toLowerCase().includes('ai') ? 18000 : 12000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try{
    const body = JSON.stringify({ action, payload, clientTime: new Date().toISOString() });
    const res = await fetch(RITME_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok:false, message:text || 'Response bukan JSON.' }; }
    if(!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  }catch(err){
    if(err && err.name === 'AbortError') throw new Error('AI terlalu lama merespons. Mode lokal dipakai dulu.');
    throw err;
  }finally{
    clearTimeout(timer);
  }
}

function friendlyAIError(err){
  const msg = String(err && err.message ? err.message : err || '').toLowerCase();
  if(msg.includes('429') || msg.includes('too many requests')) return 'AI online sedang terlalu ramai/kena limit. Aku pakai mode lokal dulu ya. Coba lagi beberapa menit lagi.';
  if(msg.includes('abort') || msg.includes('terlalu lama') || msg.includes('timeout')) return 'AI online terlalu lama merespons. Aku pakai mode lokal dulu supaya kamu tetap bisa lanjut.';
  if(msg.includes('failed to fetch') || msg.includes('network')) return 'Koneksi ke backend belum stabil. Aku pakai mode lokal dulu.';
  return 'AI online belum bisa dipanggil. Aku pakai mode lokal dulu.';
}

async function syncAll(showAlert = true){
  try {
    const result = await apiCall('saveAll', { state: exportableState() });
    if(!result.ok) throw new Error(result.error || result.message || 'Sync gagal.');
    state.settings.lastSync = new Date().toISOString();
    state.settings.lastStatus = 'Tersinkron';
    localStorage.setItem('ritme-state-full', JSON.stringify(state));
    updateSyncStatus();
    if(showAlert) alert('Sync berhasil ke Google Sheets.');
  } catch(err){
    state.settings.lastStatus = 'Sync gagal';
    localStorage.setItem('ritme-state-full', JSON.stringify(state));
    updateSyncStatus();
    if(showAlert) alert('Sync online gagal. Data tetap tersimpan lokal. Cek environment variable Vercel/APPS_SCRIPT_URL kalau kamu ingin sync ke Google Sheets.');
  }
}
function exportableState(){
  const { settings, ...data } = state;
  return data;
}
function updateSyncStatus(){
  $('#syncStatus').textContent = state.settings.lastStatus || 'Vercel API';
  $('#syncDesc').textContent = state.settings.lastSync
    ? `Auto-sync aktif. Last sync: ${new Date(state.settings.lastSync).toLocaleString('id-ID')}`
    : 'Auto-sync lewat Vercel API. Jika offline/gagal, data tetap aman di browser.';
}


function completionForHabit(habitId){
  const recent = state.checkins.filter(c => c.habitId === habitId).slice(-7);
  const done = recent.filter(c => c.status === 'done').length;
  const partial = recent.filter(c => c.status === 'partial').length;
  return Math.round(((done + partial * .5) / 7) * 100);
}
function habitStatus(score){
  if(score >= 70) return ['Stabil','good'];
  if(score >= 40) return ['Mulai terbentuk','warn'];
  return ['Perlu revisi','bad'];
}
function totalScore(){
  if(!state.habits.length) return 0;
  return Math.round(state.habits.reduce((a,h)=>a+completionForHabit(h.id),0)/state.habits.length);
}
function bestStreak(){
  let best = 0;
  state.habits.forEach(h => {
    let streak = 0;
    state.checkins.filter(c=>c.habitId===h.id).forEach(c => {
      if(c.status === 'done') streak++; else streak = 0;
      best = Math.max(best, streak);
    });
  });
  return best;
}
function getStableWeak(){
  if(!state.habits.length) return ['-','-'];
  const ranked = state.habits.map(h=>({name:h.name, score: completionForHabit(h.id)})).sort((a,b)=>b.score-a.score);
  return [ranked[0]?.name || '-', ranked[ranked.length-1]?.name || '-'];
}
function failureCounts(){
  const counts = {};
  state.checkins.filter(c=>c.status==='fail').forEach(c => { counts[c.reason || 'Lainnya'] = (counts[c.reason || 'Lainnya']||0)+1; });
  return counts;
}

function renderAll(){
  renderDashboard(); renderRhythm(); renderPlan(); renderCheckin(); renderInsight(); renderChat(); updateSyncStatus();
}
function renderDashboard(){
  $('#todayLabel').textContent = new Date().toLocaleDateString('id-ID',{weekday:'long', day:'numeric', month:'long'});
  const score = totalScore();
  $('#scoreText').textContent = score; $('#ringText').textContent = score + '%'; $('.ring').style.setProperty('--value', score);
  $('#scoreDesc').textContent = score >= 70 ? 'Ritmemu mulai stabil. Pertahankan beban habit.' : score >= 40 ? 'Ritme mulai terbentuk. Jangan tambah habit dulu.' : 'Fokus ke habit kecil dan realistis.';
  $('#activeHabitCount').textContent = state.habits.length;
  $('#bestStreak').textContent = bestStreak();
  const [stable, weak] = getStableWeak(); $('#stableHabit').textContent = stable; $('#weakHabit').textContent = weak;

  const insight = generateInsight();
  $('#aiInsightTitle').textContent = insight.title; $('#aiInsightBody').textContent = insight.body;

  const progress = $('#habitProgressList');
  if(!state.habits.length) progress.className = 'progress-list empty-state', progress.textContent = 'Belum ada habit aktif.';
  else {
    progress.className = 'progress-list';
    progress.innerHTML = state.habits.map(h=>{
      const s = completionForHabit(h.id); const [label, cls] = habitStatus(s);
      return `<div class="progress-row"><div class="progress-top"><strong>${safe(h.name)}</strong><span class="status ${cls}">${label}</span></div><div class="bar-track"><div class="bar-fill" style="width:${s}%"></div></div><small class="muted">${s}% • ${safe(h.target)} • ${safe(h.anchor || 'Belum ditempel')}</small></div>`;
    }).join('');
  }

  const timeline = $('#timelineList');
  const items = [...state.schedules.map(s=>({time:s.start, title:s.name, sub:`${s.start}–${s.end} • ${s.energy}`})), ...state.habits.map(h=>({time:guessTime(h.anchor), title:h.name, sub:`${h.target} • ${h.anchor || 'belum ada anchor'}`}))].sort((a,b)=>a.time.localeCompare(b.time));
  if(!items.length) timeline.className = 'timeline empty-state', timeline.textContent = 'Belum ada jadwal.';
  else { timeline.className = 'timeline'; timeline.innerHTML = items.map(i=>`<div class="timeline-item"><span class="muted">${safe(i.time)}</span><div class="timeline-dot"><strong>${safe(i.title)}</strong><small class="muted">${safe(i.sub)}</small></div></div>`).join(''); }
  renderHeatmap();
}
function guessTime(anchor=''){
  const a = anchor.toLowerCase();
  if(a.includes('subuh')||a.includes('bangun')) return '05:30';
  if(a.includes('mandi')) return '06:30';
  if(a.includes('makan siang')) return '13:00';
  if(a.includes('maghrib')) return '18:30';
  if(a.includes('isya')) return '20:00';
  if(a.includes('tidur')) return '22:30';
  return '12:00';
}
function renderHeatmap(){
  const box = $('#heatmap');
  if(!state.habits.length || !state.checkins.length){ box.className='heatmap empty-state'; box.textContent='Belum ada check-in.'; return; }
  box.className='heatmap';
  box.innerHTML = `<div class="heat-row"><span></span>${days.map(d=>`<small class="muted">${d}</small>`).join('')}</div>` + state.habits.map(h=>{
    const cells = Array.from({length:7}).map((_,idx)=>{
      const c = state.checkins.filter(x=>x.habitId===h.id).slice(-7)[idx];
      return `<div class="heat-cell ${c?.status || ''}" title="${c?.status || 'kosong'}"></div>`;
    }).join('');
    return `<div class="heat-row"><strong>${safe(h.name)}</strong>${cells}</div>`;
  }).join('');
}
function energyValue(level){
  return level === 'tinggi' ? 82 : level === 'sedang' ? 58 : 34;
}
function energyClass(val){ return val >= 70 ? 'high' : val >= 50 ? 'mid' : 'low'; }
function energyStatus(val){ return val >= 70 ? 'Energi tinggi' : val >= 50 ? 'Energi sedang' : 'Energi rendah'; }
function energyNote(label, val){
  if(val >= 70) return label === 'Pagi' ? 'Cocok untuk habit berat: hafalan, belajar fokus, olahraga.' : 'Cocok untuk pekerjaan yang butuh fokus.';
  if(val >= 50) return 'Cocok untuk habit sedang: baca, review, journaling ringan.';
  return 'Cocok untuk habit kecil saja: 2 menit, checklist, atau persiapan besok.';
}
function periodFromTime(t){
  const h = Number(String(t || '00:00').slice(0,2));
  if(h < 11) return 'Pagi';
  if(h < 15) return 'Siang';
  if(h < 19) return 'Sore';
  return 'Malam';
}
function buildEnergyMap(){
  const base = { Pagi:[80], Siang:[45], Sore:[62], Malam:[38] };
  state.schedules.forEach(s => {
    const period = periodFromTime(s.start);
    base[period].push(energyValue(s.energy));
  });
  return Object.entries(base).map(([label, vals]) => [label, Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)]);
}
function renderRhythm(){
  $('#scheduleList').innerHTML = state.schedules.map(s=>`<div class="item"><div><strong>${safe(s.name)}</strong><br><small class="muted">${safe(s.day)} • ${safe(s.start)}–${safe(s.end)} • energi ${safe(s.energy)}</small></div><button class="ghost-btn" onclick="deleteSchedule('${s.id}')">Hapus</button></div>`).join('') || '<div class="empty-state">Belum ada jadwal.</div>';
  $('#anchorList').innerHTML = state.anchors.map(a=>`<span class="anchor">${safe(a.trigger)} → ${safe(a.routine)} <button onclick="deleteAnchor('${a.id}')">×</button></span>`).join('') || '<div class="empty-state">Belum ada anchor.</div>';
  const energyMap = buildEnergyMap();
  $('#energyBars').innerHTML = energyMap.map(([label,val])=>{
    const cls = energyClass(val);
    return `<div class="energy-card ${cls}"><strong>${label}<span class="energy-score">${val}%</span></strong><div class="bar-track"><div class="bar-fill" style="width:${val}%"></div></div><small class="muted energy-note">${energyStatus(val)}. ${energyNote(label,val)}</small></div>`;
  }).join('');
}
function renderPlan(){
  $('#identityBox').textContent = state.identity || 'Belum ada identitas utama.';
  const list = $('#habitPlanList');
  if(!state.habits.length){ list.className='plan-grid empty-state'; list.textContent='Belum ada habit. Tambahkan habit baru dulu.'; return; }
  list.className='plan-grid';
  list.innerHTML = state.habits.map(h=>`<article class="habit-card"><h4>${safe(h.name)}</h4><p class="muted">${safe(h.target)}</p><div class="habit-meta"><span class="chip">${safe(h.category)}</span><span class="chip">${safe(h.difficulty)}</span><span class="chip">${safe(h.frequency)}x/minggu</span></div><p><strong>Anchor:</strong> ${safe(h.anchor || 'Belum ditempel')}</p><p class="muted">${safe(h.reason || 'Jalankan AI Fitting untuk menyusun habit ini.')}</p><button class="ghost-btn" onclick="deleteHabit('${h.id}')">Hapus</button></article>`).join('');
}
function renderCheckin(){
  const list = $('#checkinList');
  if(!state.habits.length){ list.className='checkin-list empty-state'; list.textContent='Belum ada habit aktif untuk hari ini.'; return; }
  list.className='checkin-list';
  list.innerHTML = state.habits.map(h=>{
    const c = state.checkins.find(x=>x.habitId===h.id && x.date===todayISO());
    return `<article class="check-card"><h4>${safe(h.name)}</h4><p class="muted">${safe(h.anchor || 'Belum ada anchor')} • ${safe(h.target)}</p><span class="status ${c?.status==='done'?'good':c?.status==='partial'?'warn':c?.status==='fail'?'bad':''}">${c ? labelStatus(c.status) : 'Belum check-in'}</span><div class="check-actions"><button class="done-btn" onclick="checkHabit('${h.id}','done')">Selesai</button><button class="partial-btn" onclick="checkHabit('${h.id}','partial')">Sebagian</button><button class="fail-btn" onclick="openFail('${h.id}')">Tidak terlaksana</button></div></article>`;
  }).join('');
}
function labelStatus(s){ return s==='done'?'Selesai':s==='partial'?'Sebagian':s==='fail'?'Tidak terlaksana':'Tunda'; }
function renderInsight(){
  const counts = failureCounts(); const total = Object.values(counts).reduce((a,b)=>a+b,0);
  const chart = $('#failureChart');
  if(!total){ chart.className='failure-chart empty-state'; chart.textContent='Belum ada data gagal.'; }
  else { chart.className='failure-chart'; chart.innerHTML = Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([r,c])=>`<div class="failure-row"><strong>${safe(r)}</strong><div class="bar-track"><div class="bar-fill" style="width:${Math.round(c/total*100)}%"></div></div><small>${c}</small></div>`).join(''); }
  const recs = generateRecommendations();
  $('#recommendationList').innerHTML = recs.map(r=>`<div class="recommend">${safe(r)}</div>`).join('');
}
function renderChat(){
  const box = $('#chatBox');
  const intro = '<div class="msg ai">Aku bisa bantu menyusun, mendiagnosis, dan merevisi habitmu. Aku akan memakai AI online lewat Vercel API (Groq atau Gemini, sesuai setting). Kalau AI online gagal, aku tetap bisa bantu dengan mode lokal.</div>';
  const messages = state.chat.length ? state.chat.map(m=>`<div class="msg ${m.role}">${safe(m.text)}</div>`).join('') : intro;
  const thinking = aiThinking ? '<div class="msg ai thinking"><span>AI sedang berpikir</span><span class="typing-dots"><i></i><i></i><i></i></span></div>' : '';
  box.innerHTML = messages + thinking;
  box.scrollTop = box.scrollHeight;
}
function generateInsight(){
  const counts = failureCounts(); const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  if(top) return {title:`Pola ditemukan: ${top[0]}`, body:`Alasan gagal paling sering adalah ${top[0].toLowerCase()}. Revisi terbaik: kecilkan target, pindahkan waktu, atau ganti anchor.`};
  if(state.habits.length) return {title:'Sistem mulai terbentuk', body:'Jalankan check-in beberapa hari agar pola berhasil/gagal mulai terlihat.'};
  return {title:'Belum ada pola', body:'Isi ritme hidup dan habit plan dulu agar AI bisa membaca polanya.'};
}
function generateRecommendations(){
  const counts = failureCounts(); const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  const recs = [];
  const weak = getStableWeak()[1];
  if(weak !== '-') recs.push(`Fokus benahi ${weak}. Jangan tambah habit baru dulu sebelum habit ini stabil.`);
  if(top?.[0] === 'Capek') recs.push('Pindahkan habit berat ke pagi/sore. Malam cukup habit ringan seperti jurnal atau baca 2 halaman.');
  if(top?.[0] === 'Lupa') recs.push('Tempelkan habit ke anchor yang pasti terjadi, misalnya setelah Subuh, setelah mandi, atau sebelum tidur.');
  if(top?.[0] === 'Target terlalu berat') recs.push('Turunkan target ke versi mini selama 7 hari agar ritmenya hidup dulu.');
  if(!recs.length) recs.push('Mulai dari 3 habit inti dulu. Ukur 7 hari, baru tambah beban.');
  return recs;
}

function addCheckin(habitId, status, reason='', note=''){
  const existing = state.checkins.findIndex(c=>c.habitId===habitId && c.date===todayISO());
  const row = { id:id(), habitId, date:todayISO(), status, reason, note, createdAt:new Date().toISOString() };
  if(existing >= 0) state.checkins[existing] = { ...state.checkins[existing], ...row };
  else state.checkins.push(row);
  saveState();
}
function checkHabit(habitId,status){ addCheckin(habitId,status); }
function openFail(habitId){
  currentFailHabit = habitId; selectedReason='';
  $('#reasonGrid').innerHTML = reasons.map(r=>`<button class="reason-btn" data-reason="${safe(r)}">${safe(r)}</button>`).join('');
  $('#failNote').value=''; $('#failModal').classList.remove('hidden');
}
function closeFail(){ $('#failModal').classList.add('hidden'); }
function deleteSchedule(item){ state.schedules = state.schedules.filter(x=>x.id!==item); saveState(); }
function deleteAnchor(item){ state.anchors = state.anchors.filter(x=>x.id!==item); saveState(); }
function deleteHabit(item){ state.habits = state.habits.filter(x=>x.id!==item); state.checkins = state.checkins.filter(x=>x.habitId!==item); saveState(); }

async function runAIFitting(){
  if(!state.habits.length) return alert('Tambahkan habit dulu.');
  try{
    $('#fitBtn').textContent = 'Meminta AI...';
    const result = await apiCall('aiHabitFitting', { state: exportableState() }, { timeoutMs: 22000 });
    if(!result.ok) throw new Error(result.error || 'AI gagal.');
    applyAIPlan(result.data?.plans || result.plans || []);
    state.chat.push({role:'ai', text: result.data?.summary || result.summary || 'AI sudah menyusun habit ke ritme hidupmu.'});
    saveState();
    return;
  }catch(err){
    state.chat.push({role:'ai', text: friendlyAIError(err)});
    localFit();
  }finally{
    $('#fitBtn').textContent = 'Jalankan AI Fitting';
  }
}

function applyAIPlan(plans){
  if(!Array.isArray(plans) || !plans.length) { localFit(); return; }
  state.habits = state.habits.map(h => {
    const p = plans.find(x => String(x.habitId||'') === h.id || String(x.habit||'').toLowerCase() === h.name.toLowerCase());
    if(!p) return h;
    return { ...h, anchor: p.anchor || h.anchor, target: p.target || h.target, reason: p.reason || h.reason };
  });
}
function localFit(){
  const anchors = state.anchors.length ? state.anchors : [
    {trigger:'Setelah Subuh', routine:'duduk sebentar'},
    {trigger:'Setelah mandi', routine:'bersiap'},
    {trigger:'Setelah Isya', routine:'waktu malam'},
    {trigger:'Sebelum tidur', routine:'menutup hari'}
  ];
  state.habits = state.habits.map((h,idx)=>{
    const name = h.name.toLowerCase();
    let pick = anchors[idx % anchors.length];
    if(name.includes('tilawah') || name.includes('hafal') || name.includes('qur')) pick = anchors.find(a=>a.trigger.toLowerCase().includes('subuh')) || pick;
    if(name.includes('olahraga') || name.includes('stretch')) pick = anchors.find(a=>a.trigger.toLowerCase().includes('mandi')) || pick;
    if(name.includes('belajar') || name.includes('baca')) pick = anchors.find(a=>a.trigger.toLowerCase().includes('isya')) || pick;
    if(name.includes('jurnal') || name.includes('tidur')) pick = anchors.find(a=>a.trigger.toLowerCase().includes('tidur')) || pick;
    return { ...h, anchor: pick.trigger, reason: `Cocok ditempel ke ${pick.trigger} karena rutinitas ini sudah ada dan lebih mudah dijadikan pemicu.` };
  });
  state.chat.push({role:'ai', text:'Aku sudah menyusun habit memakai simulasi lokal. Hubungkan Apps Script untuk memakai Gemini Flash asli.'});
  saveState();
}
async function askCoach(message){
  if(aiThinking) return;
  if(!message || !String(message).trim()) return;
  state.chat.push({role:'user', text:message});
  aiThinking = true;
  renderChat();
  const setCoachLoading = (loading) => {
    const btn = $('#coachForm button[type="submit"]');
    if(btn){ btn.disabled = loading; btn.textContent = loading ? 'Memproses...' : 'Kirim'; }
  };
  setCoachLoading(true);
  try{
    const result = await apiCall('aiCoach', { message, state: exportableState() }, { timeoutMs: 20000 });
    if(!result.ok) throw new Error(result.error || 'AI gagal.');
    aiThinking = false;
    state.chat.push({role:'ai', text: result.data?.answer || result.answer || 'AI sudah merespons.'});
    setCoachLoading(false);
    saveState();
    return;
  }catch(err){
    aiThinking = false;
    state.chat.push({role:'ai', text: friendlyAIError(err)});
  }
  await new Promise(resolve => setTimeout(resolve, 450));
  const insight = generateInsight(); const recs = generateRecommendations().join(' ');
  state.chat.push({role:'ai', text:`${insight.body} Rekomendasi: ${recs}`});
  setCoachLoading(false);
  saveState();
}

async function runWeeklyAI(){
  try{
    const result = await apiCall('weeklyReview', { state: exportableState() }, { timeoutMs: 22000 });
    if(!result.ok) throw new Error(result.error || 'AI gagal.');
    const text = result.data?.review || result.review || 'Review mingguan selesai.';
    $('#recommendationList').innerHTML = `<div class="recommend">${safe(text)}</div>` + $('#recommendationList').innerHTML;
    state.chat.push({role:'ai', text});
    saveState();
    return;
  }catch(err){
    const fallback = friendlyAIError(err) + ' ' + generateRecommendations().join(' ');
    $('#recommendationList').innerHTML = `<div class="recommend">${safe(fallback)}</div>` + $('#recommendationList').innerHTML;
    state.chat.push({role:'ai', text:fallback});
    saveState();
  }
}


function seedData(){
  state.identity = 'Muslim produktif, pelajar disiplin, dan tubuh sehat';
  state.schedules = [
    {id:id(), name:'Subuh & pagi', day:'Setiap hari', start:'05:00', end:'06:30', energy:'tinggi'},
    {id:id(), name:'Kuliah', day:'Senin-Jumat', start:'08:00', end:'14:00', energy:'rendah'},
    {id:id(), name:'Organisasi', day:'Senin-Jumat', start:'16:00', end:'18:00', energy:'sedang'},
    {id:id(), name:'Waktu malam', day:'Setiap hari', start:'20:00', end:'22:30', energy:'sedang'}
  ];
  state.anchors = [
    {id:id(), trigger:'Setelah Subuh', routine:'duduk sebentar', type:'baik'},
    {id:id(), trigger:'Setelah mandi', routine:'bersiap', type:'netral'},
    {id:id(), trigger:'Setelah Isya', routine:'buka laptop', type:'netral'},
    {id:id(), trigger:'Sebelum tidur', routine:'cek HP', type:'buruk'}
  ];
  state.habits = [
    {id:id(), name:'Tilawah', target:'5 ayat', category:'Ibadah', difficulty:'ringan', frequency:'7', anchor:'Setelah Subuh', reason:'Dekat dengan suasana ibadah pagi.'},
    {id:id(), name:'Stretching', target:'3 menit', category:'Kesehatan', difficulty:'ringan', frequency:'5', anchor:'Setelah mandi', reason:'Tubuh sudah aktif, target kecil.'},
    {id:id(), name:'Belajar fokus', target:'25 menit', category:'Belajar', difficulty:'sedang', frequency:'5', anchor:'Setelah Isya', reason:'Slot malam cukup tenang.'}
  ];
  state.checkins = [];
  const dates = [...Array(7)].map((_,i)=>{ const d = new Date(); d.setDate(d.getDate()-(6-i)); return d.toISOString().slice(0,10); });
  state.habits.forEach((h,hi)=>dates.forEach((d,di)=>{
    const status = hi===0 ? (di===2?'partial':'done') : hi===1 ? (di%3===0?'fail':di%2===0?'partial':'done') : (di%4===0?'fail':'done');
    state.checkins.push({id:id(), habitId:h.id, date:d, status, reason: status==='fail' ? (hi===1?'Capek':'Waktu tidak cocok') : '', note:'', createdAt:new Date().toISOString()});
  }));
  saveState();
}
function download(filename, text, type='application/json'){
  const blob = new Blob([text], {type}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

// Events
function openMobileMenu(){
  $('.sidebar')?.classList.add('open');
  $('#drawerBackdrop')?.classList.add('show');
  $('#burgerBtn')?.classList.add('active');
  $('#burgerBtn')?.setAttribute('aria-expanded','true');
}
function closeMobileMenu(){
  $('.sidebar')?.classList.remove('open');
  $('#drawerBackdrop')?.classList.remove('show');
  $('#burgerBtn')?.classList.remove('active');
  $('#burgerBtn')?.setAttribute('aria-expanded','false');
}
$$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.nav-item').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  $$('.page').forEach(p=>p.classList.remove('active-page')); $('#' + btn.dataset.page).classList.add('active-page');
  $('#pageTitle').textContent = btn.textContent;
  closeMobileMenu();
}));
$('#burgerBtn')?.addEventListener('click',()=> $('.sidebar')?.classList.contains('open') ? closeMobileMenu() : openMobileMenu());
$('#drawerBackdrop')?.addEventListener('click', closeMobileMenu);
$('#mobileSyncBtn')?.addEventListener('click',()=>syncAll(true));
$('#seedBtn').addEventListener('click', seedData);
$('#resetBtn').addEventListener('click',()=>{ if(confirm('Reset semua data lokal?')){ state=structuredClone(initialState); saveState({sync:false}); }});
$('#syncBtn').addEventListener('click',()=>syncAll(true));
$('#scheduleForm').addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); state.schedules.push({id:id(), name:f.get('name'), day:f.get('day'), start:f.get('start'), end:f.get('end'), energy:f.get('energy')}); e.target.reset(); saveState(); });
$('#anchorForm').addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); state.anchors.push({id:id(), trigger:f.get('trigger'), routine:f.get('routine'), type:f.get('type')}); e.target.reset(); saveState(); });
$('#identityForm').addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); state.identity = f.get('identity') || state.identity; e.target.reset(); saveState(); });
$('#habitForm').addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); state.habits.push({id:id(), name:f.get('name'), target:f.get('target'), category:f.get('category'), difficulty:f.get('difficulty'), frequency:f.get('frequency'), anchor:'', reason:''}); e.target.reset(); saveState(); });
$('#fitBtn').addEventListener('click', runAIFitting);
$('#weeklyAI').addEventListener('click', runWeeklyAI);
$('#closeModal').addEventListener('click', closeFail);
$('#saveFail').addEventListener('click',()=>{ addCheckin(currentFailHabit,'fail',selectedReason || 'Lainnya',$('#failNote').value); closeFail(); });
$('#reasonGrid').addEventListener('click',e=>{ if(e.target.matches('.reason-btn')){ selectedReason=e.target.dataset.reason; $$('.reason-btn').forEach(b=>b.classList.remove('active')); e.target.classList.add('active'); }});
$('#coachForm').addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); const msg=f.get('message'); e.target.reset(); askCoach(msg); });
$$('.quick-prompts button').forEach(b=>b.addEventListener('click',()=>askCoach(b.dataset.prompt)));


document.querySelector('#exportJson')?.addEventListener('click',()=>download(`ritme-backup-${todayISO()}.json`, JSON.stringify(state,null,2)));
document.querySelector('#importJsonBtn')?.addEventListener('click',()=>$('#importJson').click());
document.querySelector('#importJson')?.addEventListener('change',async(e)=>{ const file=e.target.files[0]; if(!file) return; const text=await file.text(); state={...structuredClone(initialState), ...JSON.parse(text)}; saveState(); });
document.querySelector('#wipeLocal')?.addEventListener('click',()=>{ if(confirm('Hapus data lokal di browser ini?')){ localStorage.removeItem('ritme-state-full'); state=structuredClone(initialState); renderAll(); }});

if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{})); }
renderAll();
