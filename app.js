const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
function localISO(date = new Date()){
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
const todayISO = () => localISO(new Date());
const days = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
const reasons = ['Lupa','Capek','Malas','Waktu tidak cocok','Target terlalu berat','Kegiatan mendadak','Lingkungan tidak mendukung','Mood jelek'];
const RITME_API_URL = window.RITME_API_URL || '/api/ritme';

const initialState = {
  identity: '',
  profile: { name:'', campus:'', mode:'Mahasiswa aktif' },
  dailyGoals: [],
  schedules: [],
  anchors: [],
  habits: [],
  checkins: [],
  chat: [],
  settings: { endpoint: '', lastSync: '', lastStatus: 'Lokal', notifications: { enabled:false, morning:false, night:false, habit:false } }
};
let state = loadState();
let currentFailHabit = null;
let selectedReason = '';
let aiThinking = false;
let coachRequestToken = 0;

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

function getDateNDaysAgo(n){
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - n);
  return d;
}
function fmtDateISO(d){ return localISO(d); }
function normalizeDate(value){
  if(!value) return '';
  if(typeof value === 'string'){
    const m = value.match(/\d{4}-\d{2}-\d{2}/);
    if(m) return m[0];
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value).slice(0,10) : localISO(d);
}
function normalizeStatus(status){
  const s = String(status || '').toLowerCase();
  if(['done','selesai','success','berhasil','complete','completed'].includes(s)) return 'done';
  if(['partial','sebagian','half'].includes(s)) return 'partial';
  if(['fail','failed','gagal','tidak terlaksana'].includes(s)) return 'fail';
  return s;
}
function dayShortFromISO(iso){
  const [y,m,d] = String(iso).split('-').map(Number);
  const dt = new Date(y, (m||1)-1, d||1);
  return ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][dt.getDay()];
}
function todayGoals(){
  return (state.dailyGoals || []).filter(g => g.date === todayISO());
}
function anchorText(a){
  if(!a) return '';
  if(a.activity) return `${a.relation || 'Setelah'} ${a.activity}`;
  return a.trigger || a.routine || '';
}
function scheduleText(sc){
  if(!sc) return '';
  const time = sc.start && sc.end ? `${sc.start}–${sc.end}` : (sc.block || 'Fleksibel');
  return `${sc.name} (${sc.day || 'Fleksibel'} • ${time})`;
}
function allAnchorOptions(){
  const fromAnchors = (state.anchors || []).map(a => ({ value: anchorText(a), label: `${anchorText(a)} — ${a.routine || 'anchor'}` }));
  const fromSchedules = (state.schedules || []).map(sc => ({ value: sc.name, label: `${sc.name} — jadwal ${sc.block || sc.start || 'fleksibel'}` }));
  return [...fromAnchors, ...fromSchedules];
}
function normalizeActionText(text){
  return String(text || '').toLowerCase();
}

function habitFormula(h){
  if(h.formula) return h.formula;
  const anchor = h.anchor || (h.anchorRelation && h.anchorActivity ? `${h.anchorRelation} ${h.anchorActivity}` : 'momen yang cocok');
  const place = h.place || 'tempat yang mudah dijangkau';
  const target = h.target || 'versi kecil';
  return `${anchor}, aku akan ${h.name} ${target} di ${place}.`;
}
function habitDetailChips(h){
  return [
    h.anchor ? `Kegiatan: ${h.anchor}` : '',
    h.microTrigger ? `Micro trigger: ${h.microTrigger}` : '',
    h.triggerDetail && !h.microTrigger ? `Pemicu: ${h.triggerDetail}` : '',
    h.place ? `Tempat: ${h.place}` : '',
    h.duration ? `Durasi: ${h.duration}` : '',
    h.reminderBlock ? `Reminder: ${h.reminderBlock}` : '',
    h.confidence ? `Kecocokan: ${h.confidence}` : ''
  ].filter(Boolean);
}
function habitLawCards(h){
  const rows = [
    ['Terlihat', h.obvious],
    ['Menarik', h.attractive],
    ['Mudah', h.easy],
    ['Memuaskan', h.satisfying],
    ['Identitas', h.identity]
  ].filter(x=>x[1]);
  if(!rows.length) return '';
  return `<div class="habit-laws">${rows.map(([k,v])=>`<div><b>${safe(k)}</b><span>${safe(v)}</span></div>`).join('')}</div>`;
}

async function requestNotifications(){
  if(!('Notification' in window)) return alert('Browser ini belum mendukung notifikasi PWA.');
  const permission = await Notification.requestPermission();
  if(permission === 'granted'){
    state.settings.notifications = { ...(state.settings.notifications||{}), enabled:true, morning:true, night:true, habit:true };
    saveState({sync:false});
    new Notification('Ritme aktif', { body:'Notifikasi aktif. Ritme akan mengingatkan tujuan pagi dan check-in malam saat app terbuka/aktif.' });
  } else {
    alert('Notifikasi belum diizinkan. Kamu bisa mengaktifkannya nanti dari pengaturan browser.');
  }
}
function sendLocalNotification(title, body){
  try{
    if(!state.settings?.notifications?.enabled) return;
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, { body });
  }catch(e){}
}
let notificationTickerStarted = false;
function startNotificationTicker(){
  if(notificationTickerStarted) return;
  notificationTickerStarted = true;
  let lastMorning='', lastNight='';
  setInterval(()=>{
    const now = new Date();
    const key = todayISO();
    const h = now.getHours();
    const m = now.getMinutes();
    if(state.settings?.notifications?.morning && h===7 && m<5 && lastMorning!==key){
      lastMorning=key;
      sendLocalNotification('Tujuan hari ini', 'Tulis 1–3 tujuan kecil agar harimu lebih terarah.');
    }
    if(state.settings?.notifications?.night && h===21 && m<5 && lastNight!==key){
      lastNight=key;
      sendLocalNotification('Check-in Ritme', 'Cek sebentar habit hari ini: selesai, sebagian, atau belum terlaksana.');
    }
  }, 60000);
}

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


async function pullAll(showAlert = true){
  try{
    const result = await apiCall('loadAll', {}, { timeoutMs: 12000 });
    if(!result.ok || !result.state) throw new Error(result.error || 'Data belum tersedia di Google Sheets.');
    state = { ...structuredClone(initialState), ...result.state, settings: { ...initialState.settings, ...(state.settings || {}), lastStatus:'Data diambil' } };
    localStorage.setItem('ritme-state-full', JSON.stringify(state));
    renderAll();
    if(showAlert) alert('Data berhasil diambil dari Google Sheets.');
  }catch(err){
    if(showAlert) alert('Belum bisa ambil data dari Google Sheets. Pastikan APPS_SCRIPT_URL dan Apps Script sudah versi baru.');
  }
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
  renderDashboard(); renderRhythm(); renderPlan(); renderCheckin(); renderInsight(); renderChat(); renderProfile(); updateSyncStatus();
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

  const goals = todayGoals();
  const goalList = $('#goalList');
  if(goalList){
    if(!goals.length){ goalList.className='goal-list empty-state'; goalList.textContent='Belum ada tujuan hari ini.'; }
    else { goalList.className='goal-list'; goalList.innerHTML = goals.map(g=>`<div class="goal-item ${g.done?'done':''}"><button onclick="toggleGoal('${g.id}')" class="goal-check">${g.done?'✓':''}</button><span>${safe(g.text)}</span><button onclick="deleteGoal('${g.id}')" class="mini-x">×</button></div>`).join(''); }
  }

  const progress = $('#habitProgressList');
  if(!state.habits.length) progress.className = 'progress-list empty-state', progress.textContent = 'Belum ada habit aktif.';
  else {
    progress.className = 'progress-list';
    progress.innerHTML = state.habits.map(h=>{
      const s = completionForHabit(h.id); const [label, cls] = habitStatus(s);
      const anchor = h.anchor || (h.anchorRelation && h.anchorActivity ? `${h.anchorRelation} ${h.anchorActivity}` : 'Belum ditempel ke kegiatan');
      return `<div class="progress-row"><div class="progress-top"><strong>${safe(h.name)}</strong><span class="status ${cls}">${label}</span></div><div class="bar-track"><div class="bar-fill" style="width:${s}%"></div></div><small class="muted">${s}% • ${safe(h.target)} • ${safe(anchor)}</small></div>`;
    }).join('');
  }

  const timeline = $('#timelineList');
  const items = [
    ...state.schedules.map(s=>({time:s.start || guessTime(s.block), title:s.name, sub:`${s.day || 'Fleksibel'} • ${s.start && s.end ? s.start+'–'+s.end : (s.block || 'Tanpa jam')} • energi ${s.energy}`})),
    ...state.habits.map(h=>({time:guessTime(h.anchor || h.anchorActivity || ''), title:h.name, sub:`${h.target} • ${(h.anchor || (h.anchorRelation&&h.anchorActivity ? h.anchorRelation+' '+h.anchorActivity : 'belum ditempel'))}`}))
  ].sort((a,b)=>String(a.time).localeCompare(String(b.time)));
  if(!items.length) timeline.className = 'timeline empty-state', timeline.textContent = 'Belum ada jadwal/habit.';
  else { timeline.className = 'timeline'; timeline.innerHTML = items.map(i=>`<div class="timeline-item"><span class="muted">${safe(i.time || '—')}</span><div class="timeline-dot"><strong>${safe(i.title)}</strong><small class="muted">${safe(i.sub)}</small></div></div>`).join(''); }
  renderHeatmap();
}
function guessTime(anchor=''){
  const a = String(anchor || '').toLowerCase();
  if(a.includes('pagi')||a.includes('subuh')||a.includes('bangun')) return '05:30';
  if(a.includes('mandi')) return '06:30';
  if(a.includes('siang')||a.includes('makan siang')) return '13:00';
  if(a.includes('sore')||a.includes('maghrib')) return '18:30';
  if(a.includes('malam')||a.includes('isya')) return '20:00';
  if(a.includes('tidur')) return '22:30';
  return '—';
}
function renderHeatmap(){
  const box = $('#heatmap');
  const dates = Array.from({length:7}, (_,i)=>fmtDateISO(getDateNDaysAgo(6-i)));
  if(!state.habits.length){ box.className='heatmap empty-state'; box.textContent='Belum ada habit untuk ditampilkan.'; return; }
  box.className='heatmap';
  const checkins = (state.checkins || []).map(c => ({ ...c, _date: normalizeDate(c.date || c.createdAt), _status: normalizeStatus(c.status) }));
  box.innerHTML = `<div class="heat-row heat-head"><span></span>${dates.map(d=>`<small class="muted">${dayShortFromISO(d)}<br>${d.slice(8)}</small>`).join('')}</div>` + state.habits.map(h=>{
    const cells = dates.map(d=>{
      const c = checkins.find(x=>String(x.habitId)===String(h.id) && x._date===d);
      const cls = c ? c._status : '';
      const label = c ? labelStatus(c._status) : 'kosong';
      return `<div class="heat-cell ${cls}" title="${d}: ${label}"></div>`;
    }).join('');
    return `<div class="heat-row"><strong>${safe(h.name)}</strong>${cells}</div>`;
  }).join('') + `<div class="heat-legend"><span><i class="heat-cell done"></i>Selesai</span><span><i class="heat-cell partial"></i>Sebagian</span><span><i class="heat-cell fail"></i>Tidak terlaksana</span></div>`;
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
function periodFromTime(t, block){
  if(block && block !== 'Fleksibel') return block;
  if(!t) return 'Siang';
  const h = Number(String(t || '00:00').slice(0,2));
  if(h < 11) return 'Pagi';
  if(h < 15) return 'Siang';
  if(h < 19) return 'Sore';
  return 'Malam';
}
function buildEnergyMap(){
  const base = { Pagi:[80], Siang:[45], Sore:[62], Malam:[38] };
  state.schedules.forEach(s => {
    const period = periodFromTime(s.start, s.block);
    base[period].push(energyValue(s.energy));
  });
  return Object.entries(base).map(([label, vals]) => [label, Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)]);
}
function renderRhythm(){
  $('#scheduleList').innerHTML = state.schedules.map(s=>`<div class="item"><div><strong>${safe(s.name)}</strong><br><small class="muted">${safe(s.day || 'Fleksibel')} • ${safe(s.start && s.end ? s.start+'–'+s.end : (s.block || 'Tanpa jam'))} • energi ${safe(s.energy)}</small></div><button class="ghost-btn" onclick="deleteSchedule('${s.id}')">Hapus</button></div>`).join('') || '<div class="empty-state">Belum ada jadwal. Tidak apa-apa, kamu tetap bisa pakai anchor.</div>';
  $('#anchorList').innerHTML = state.anchors.map(a=>`<span class="anchor">${safe(anchorText(a))} → ${safe(a.routine)} <button onclick="deleteAnchor('${a.id}')">×</button></span>`).join('') || '<div class="empty-state">Belum ada anchor.</div>';
  const energyMap = buildEnergyMap();
  $('#energyBars').innerHTML = energyMap.map(([label,val])=>{
    const cls = energyClass(val);
    return `<div class="energy-card ${cls}"><strong>${label}<span class="energy-score">${val}%</span></strong><div class="bar-track"><div class="bar-fill" style="width:${val}%"></div></div><small class="muted energy-note">${energyStatus(val)}. ${energyNote(label,val)}</small></div>`;
  }).join('');
  const opt = $('#habitAnchorSelect');
  if(opt){
    const opts = allAnchorOptions();
    opt.innerHTML = `<option value="">Pilih kegiatan/anchor (opsional)</option>` + opts.map(o=>`<option value="${safe(o.value)}">${safe(o.label)}</option>`).join('');
  }
}
function renderPlan(){
  $('#identityBox').textContent = state.identity || 'Belum ada identitas utama.';
  const opt = $('#habitAnchorSelect');
  if(opt){
    const selected = opt.value;
    const opts = allAnchorOptions();
    opt.innerHTML = `<option value="">Nanti AI yang tempelkan</option>` + opts.map(o=>`<option value="${safe(o.value)}">${safe(o.label)}</option>`).join('');
    opt.value = selected;
  }
  const list = $('#habitPlanList');
  if(!state.habits.length){ list.className='plan-grid empty-state'; list.textContent='Belum ada habit. Tambahkan habit baru dulu.'; return; }
  list.className='plan-grid';
  list.innerHTML = state.habits.map(h=>{
    const anchor = h.anchor || (h.anchorRelation && h.anchorActivity ? `${h.anchorRelation} ${h.anchorActivity}` : 'Belum ditempel AI');
    const formula = habitFormula(h);
    const chips = habitDetailChips(h).map(c=>`<span class="chip">${safe(c)}</span>`).join('');
    return `<article class="habit-card enhanced-habit"><div class="habit-card-head"><h4>${safe(h.name)}</h4><span class="status ${h.formula?'good':'warn'}">${h.formula?'Siap jalan':'Perlu fitting'}</span></div><p class="formula-text">${safe(formula)}</p><div class="habit-meta"><span class="chip">${safe(h.category)}</span><span class="chip">${safe(h.difficulty)}</span><span class="chip">${safe(h.frequency)}x/minggu</span>${chips}</div><p><strong>Ditempel ke:</strong> ${safe(anchor)}</p>${h.microTrigger ? `<p><strong>Micro trigger:</strong> ${safe(h.microTrigger)}</p>` : ''}${habitLawCards(h)}<p class="muted">${safe(h.reason || 'Jalankan AI Fitting agar habit ini punya pemicu mikro, tempat, target minimum, formula, dan prinsip 4 hukum yang jelas.')}</p><div class="check-actions"><button class="ghost-btn" onclick="reviseHabit('${h.id}')">Minta revisi AI</button><button class="ghost-btn" onclick="deleteHabit('${h.id}')">Hapus</button></div></article>`;
  }).join('');
}
function renderCheckin(){
  const list = $('#checkinList');
  if(!state.habits.length){ list.className='checkin-list empty-state'; list.textContent='Belum ada habit aktif untuk hari ini.'; return; }
  list.className='checkin-list';
  list.innerHTML = state.habits.map(h=>{
    const c = state.checkins.find(x=>String(x.habitId)===String(h.id) && normalizeDate(x.date || x.createdAt)===todayISO());
    const formula = habitFormula(h);
    return `<article class="check-card"><h4>${safe(h.name)}</h4><p class="formula-text small">${safe(formula)}</p><div class="habit-meta">${habitDetailChips(h).map(x=>`<span class="chip">${safe(x)}</span>`).join('')}</div><span class="status ${c?.status==='done'?'good':c?.status==='partial'?'warn':c?.status==='fail'?'bad':''}">${c ? labelStatus(c.status) : 'Belum check-in'}</span><div class="check-actions"><button class="done-btn" onclick="checkHabit('${h.id}','done')">Selesai</button><button class="partial-btn" onclick="checkHabit('${h.id}','partial')">Sebagian</button><button class="fail-btn" onclick="openFail('${h.id}')">Tidak terlaksana</button></div></article>`;
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
  const intro = '<div class="msg ai">Aku bisa bantu memberi saran dan diagnosis. Aku tidak akan menambah/mengubah habit kecuali kamu jelas meminta dan menekan tombol Terapkan.</div>';
  const messages = state.chat.length ? state.chat.map((m,i)=>{
    const actions = Array.isArray(m.actions) && m.actions.length && !m.applied
      ? `<div class="action-suggestions"><small>${m.actions.length} aksi siap diterapkan</small><button class="primary-btn tiny-btn" onclick="applyChatAction(${i})">Terapkan</button><button class="ghost-btn tiny-btn" onclick="dismissChatAction(${i})">Abaikan</button></div>`
      : (m.applied ? '<div class="action-suggestions applied"><small>Aksi sudah diterapkan.</small></div>' : '');
    return `<div class="msg ${m.role}">${safe(m.text)}${actions}</div>`;
  }).join('') : intro;
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
  const existing = state.checkins.findIndex(c=>String(c.habitId)===String(habitId) && normalizeDate(c.date || c.createdAt)===todayISO());
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
function toggleGoal(goalId){ const g=(state.dailyGoals||[]).find(x=>x.id===goalId); if(g){ g.done=!g.done; saveState(); } }
function deleteGoal(goalId){ state.dailyGoals=(state.dailyGoals||[]).filter(g=>g.id!==goalId); saveState(); }
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
    const p = plans.find(x => String(x.habitId||'') === h.id || String(x.habit||'').toLowerCase() === h.name.toLowerCase() || String(x.name||'').toLowerCase() === h.name.toLowerCase());
    if(!p) return h;
    return {
      ...h,
      anchor: p.anchor || p.trigger || h.anchor,
      microTrigger: p.microTrigger || p.micro_trigger || p.aksiPenutup || h.microTrigger || '',
      triggerDetail: p.triggerDetail || p.detailedTrigger || p.pemicuDetail || h.triggerDetail || '',
      place: p.place || p.tempat || h.place || '',
      target: p.target || p.minimumTarget || p.targetMinimum || h.target,
      duration: p.duration || p.durasi || h.duration || '',
      formula: p.formula || p.habitFormula || h.formula || '',
      reminderBlock: p.reminderBlock || p.reminder || h.reminderBlock || '',
      identity: p.identity || p.identitas || h.identity || '',
      obvious: p.obvious || p.makeItObvious || h.obvious || '',
      attractive: p.attractive || p.makeItAttractive || h.attractive || '',
      easy: p.easy || p.makeItEasy || h.easy || '',
      satisfying: p.satisfying || p.makeItSatisfying || h.satisfying || '',
      confidence: p.confidence || p.kecocokan || h.confidence || '',
      reason: p.reason || p.alasan || h.reason
    };
  });
}
function reviseHabit(habitId){
  const h = state.habits.find(x=>x.id===habitId);
  if(!h) return;
  askCoach(`Revisi habit ini agar lebih realistis dan detail: ${h.name}. Target sekarang: ${h.target}. Anchor sekarang: ${h.anchor || 'belum ada'}. Beri aksi updateHabit untuk habitId ${h.id}.`);
}
function localFit(){
  const anchors = state.anchors.length ? state.anchors : [
    {relation:'Setelah', activity:'Subuh', trigger:'Setelah Subuh', routine:'duduk sebentar'},
    {relation:'Setelah', activity:'mandi', trigger:'Setelah mandi', routine:'bersiap'},
    {relation:'Setelah', activity:'Isya', trigger:'Setelah Isya', routine:'waktu malam'},
    {relation:'Sebelum', activity:'tidur', trigger:'Sebelum tidur', routine:'menutup hari'}
  ];
  state.habits = state.habits.map((h,idx)=>{
    const name = h.name.toLowerCase();
    let pick = anchors[idx % anchors.length];
    let place = 'kamar/meja belajar';
    let duration = '5 menit';
    let target = h.target || 'versi kecil';
    let reminderBlock = 'fleksibel';
    if(name.includes('tilawah') || name.includes('hafal') || name.includes('qur')){ pick = anchors.find(a=>anchorText(a).toLowerCase().includes('subuh')) || pick; place='kamar/masjid'; duration='5 menit'; reminderBlock='pagi'; target = target || '5 ayat'; }
    if(name.includes('olahraga') || name.includes('stretch')){ pick = anchors.find(a=>anchorText(a).toLowerCase().includes('mandi')) || pick; place='kamar'; duration='3 menit'; reminderBlock='pagi'; target = target || 'stretching 3 menit'; }
    if(name.includes('belajar') || name.includes('baca')){ pick = anchors.find(a=>anchorText(a).toLowerCase().includes('isya') || anchorText(a).toLowerCase().includes('laptop')) || pick; place='meja belajar'; duration='10–25 menit'; reminderBlock='malam'; }
    if(name.includes('jurnal') || name.includes('tidur')){ pick = anchors.find(a=>anchorText(a).toLowerCase().includes('tidur')) || pick; place='kamar'; duration='2 menit'; reminderBlock='malam'; }
    const anchor = anchorText(pick);
    const microTrigger = microTriggerForAnchor(anchor, name);
    const triggerDetail = microTrigger ? `${microTrigger}` : `${anchor}${pick.routine ? ' ketika biasanya '+pick.routine : ''}`;
    const formula = `Setelah ${triggerDetail.replace(/^setelah\s+/i,'')}, aku akan ${h.name} ${target} di ${place} selama ${duration}.`;
    return { ...h, anchor, microTrigger, triggerDetail, place, duration, target, reminderBlock, formula, identity: state.identity || 'pribadi yang lebih konsisten', obvious:`Mulai tepat setelah ${triggerDetail}.`, attractive:'Pasangkan dengan hal ringan yang disukai agar terasa lebih menyenangkan.', easy:`Mulai dari ${target}, bukan versi berat.`, satisfying:'Centang check-in setelah selesai agar terasa ada penutup.', confidence:'sedang', reason: `Cocok ditempel ke ${anchor} dengan micro trigger ${microTrigger || triggerDetail}.` };
  });
  state.chat.push({role:'ai', text:'Aku sudah menyusun habit memakai simulasi lokal. Hubungkan Vercel API untuk memakai AI online.'});
  saveState();
}

function applyAIActions(actions){
  actions.forEach(a=>{
    if(!a || !a.type) return;
    if(a.type === 'addGoal' && a.text) state.dailyGoals.push({id:id(), date:todayISO(), text:a.text, done:false, createdAt:new Date().toISOString()});
    if(a.type === 'addSchedule' && a.name) state.schedules.push({id:id(), name:a.name, day:a.day||'Fleksibel', block:a.block||'Fleksibel', start:a.start||'', end:a.end||'', energy:a.energy||'sedang'});
    if(a.type === 'addHabit' && a.name) state.habits.push({id:id(), name:a.name, target:a.target||'versi kecil', category:a.category||'Belajar', difficulty:a.difficulty||'ringan', frequency:String(a.frequency||7), anchor:a.anchor||'', microTrigger:a.microTrigger||'', triggerDetail:a.triggerDetail||'', place:a.place||'', duration:a.duration||'', formula:a.formula||'', reminderBlock:a.reminderBlock||'', identity:a.identity||'', obvious:a.obvious||'', attractive:a.attractive||'', easy:a.easy||'', satisfying:a.satisfying||'', confidence:a.confidence||'', reason:a.reason||'Diusulkan AI.'});
    if((a.type === 'updateHabit' || a.type === 'reviseHabit') && (a.habitId || a.name)){
      const h = state.habits.find(x=>x.id===a.habitId || x.name.toLowerCase() === String(a.name||'').toLowerCase());
      if(h){
        Object.assign(h, {
          anchor:a.anchor || h.anchor,
          microTrigger:a.microTrigger || h.microTrigger || '',
          triggerDetail:a.triggerDetail || h.triggerDetail || '',
          place:a.place || h.place || '',
          target:a.target || h.target,
          duration:a.duration || h.duration || '',
          formula:a.formula || h.formula || '',
          identity:a.identity || h.identity || '',
          obvious:a.obvious || h.obvious || '',
          attractive:a.attractive || h.attractive || '',
          easy:a.easy || h.easy || '',
          satisfying:a.satisfying || h.satisfying || '',
          confidence:a.confidence || h.confidence || '',
          reminderBlock:a.reminderBlock || h.reminderBlock || '',
          reason:a.reason || h.reason
        });
      }
    }
  });
}
function applyLocalCommand(message){
  const text = String(message || '').trim();
  const low = text.toLowerCase();
  const actions = [];
  if(low.includes('tambahkan tujuan') || low.includes('tambah tujuan')){
    const value = text.split(':').slice(1).join(':').trim() || text.replace(/tambahkan tujuan hari ini|tambah tujuan hari ini|tambahkan tujuan|tambah tujuan/ig,'').trim();
    if(value){ state.dailyGoals.push({id:id(), date:todayISO(), text:value, done:false, createdAt:new Date().toISOString()}); actions.push(`Tujuan hari ini ditambahkan: ${value}`); }
  }
  if(low.includes('tambahkan habit') || low.includes('tambah habit')){
    let raw = text.replace(/tambahkan habit|tambah habit/ig,'').trim();
    let name = raw; let target='versi kecil'; let anchor='';
    const m = raw.match(/(.+?)\s+(setelah|sebelum|saat)\s+(.+)/i);
    if(m){ name = m[1].trim(); anchor = `${m[2][0].toUpperCase()+m[2].slice(1)} ${m[3].trim()}`; }
    if(name){
      state.habits.push({id:id(), name, target, category:'Belajar', difficulty:'ringan', frequency:'7', anchor, microTrigger:'', triggerDetail:'', place:'', duration:'', formula:'', reminderBlock:'', identity:'', obvious:'', attractive:'', easy:'', satisfying:'', confidence:'', anchorRelation:'', anchorActivity:'', reason:'Ditambahkan dari AI Coach/chat.'});
      actions.push(`Habit ditambahkan: ${name}${anchor ? ' → '+anchor : ''}`);
    }
  }
  if(low.includes('tambahkan jadwal') || low.includes('tambah jadwal')){
    const value = text.split(':').slice(1).join(':').trim() || text.replace(/tambahkan jadwal|tambah jadwal/ig,'').trim();
    if(value){ state.schedules.push({id:id(), name:value, day:'Fleksibel', block:'Fleksibel', start:'', end:'', energy:'sedang'}); actions.push(`Jadwal fleksibel ditambahkan: ${value}`); }
  }
  if(actions.length){ saveState(); }
  return actions;
}
async function askCoach(message){
  if(aiThinking) return;
  message = String(message || '').trim();
  if(!message) return;
  const token = ++coachRequestToken;
  state.chat.push({role:'user', text:message});
  const localActions = applyLocalCommand(message);
  if(localActions.length){ state.chat.push({role:'ai', text:'Aku sudah menerapkan: '+localActions.join('; ')}); saveState(); return; }
  aiThinking = true;
  renderChat();
  const setCoachLoading = (loading) => {
    const btn = $('#coachForm button[type="submit"]');
    if(btn){ btn.disabled = loading; btn.textContent = loading ? 'Memproses...' : 'Kirim'; }
  };
  setCoachLoading(true);
  try{
    const result = await apiCall('aiCoach', { message, state: exportableState() }, { timeoutMs: 24000 });
    if(token !== coachRequestToken) return;
    if(!result.ok) throw new Error(result.error || 'AI gagal.');
    const answer = result.data?.answer || result.answer || '';
    const actions = Array.isArray(result.data?.actions) ? result.data.actions : [];
    if(!answer.trim()) throw new Error('AI online merespons kosong.');
    aiThinking = false;
    state.chat.push({role:'ai', text: answer, actions, applied:false, online:true});
    if(actions.length){
      state.chat.push({role:'ai', text:'Aku menyiapkan beberapa aksi, tapi belum aku terapkan. Tekan tombol Terapkan kalau kamu setuju.', online:true});
    }
    setCoachLoading(false);
    saveState();
    return;
  }catch(err){
    if(token !== coachRequestToken) return;
    aiThinking = false;
    state.chat.push({role:'ai', text: friendlyAIError(err)});
    await new Promise(resolve => setTimeout(resolve, 250));
    const insight = generateInsight(); const recs = generateRecommendations().join(' ');
    state.chat.push({role:'ai', text:`${insight.body} Rekomendasi: ${recs}`});
    setCoachLoading(false);
    saveState();
  }
}

function applyChatAction(index){
  const msg = state.chat[index];
  if(!msg || !Array.isArray(msg.actions) || !msg.actions.length || msg.applied) return;
  applyAIActions(msg.actions);
  msg.applied = true;
  state.chat.push({role:'ai', text:'Aksi sudah diterapkan ke Ritme.'});
  saveState();
}
function dismissChatAction(index){
  const msg = state.chat[index];
  if(!msg) return;
  msg.actions = [];
  msg.applied = false;
  state.chat.push({role:'ai', text:'Oke, aksi tidak diterapkan.'});
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
  state.profile = {name:'Sevila', campus:'', mode:'Mahasiswa organisasi'};
  state.dailyGoals = [{id:id(), date:todayISO(), text:'Selesaikan 1 tugas kecil dan jaga ritme malam', done:false, createdAt:new Date().toISOString()}];
  state.schedules = [
    {id:id(), name:'Subuh & pagi', day:'Setiap hari', block:'Pagi', start:'05:00', end:'06:30', energy:'tinggi'},
    {id:id(), name:'Kuliah', day:'Senin-Jumat', block:'Siang', start:'08:00', end:'14:00', energy:'rendah'},
    {id:id(), name:'Organisasi', day:'Senin-Jumat', block:'Sore', start:'16:00', end:'18:00', energy:'sedang'},
    {id:id(), name:'Waktu malam', day:'Setiap hari', block:'Malam', start:'20:00', end:'22:30', energy:'sedang'}
  ];
  state.anchors = [
    {id:id(), relation:'Setelah', activity:'Subuh', trigger:'Setelah Subuh', routine:'duduk sebentar', type:'baik'},
    {id:id(), relation:'Setelah', activity:'mandi', trigger:'Setelah mandi', routine:'bersiap', type:'netral'},
    {id:id(), relation:'Setelah', activity:'Isya', trigger:'Setelah Isya', routine:'buka laptop', type:'netral'},
    {id:id(), relation:'Sebelum', activity:'tidur', trigger:'Sebelum tidur', routine:'cek HP', type:'buruk'}
  ];
  state.habits = [
    {id:id(), name:'Tilawah', target:'5 ayat', category:'Ibadah', difficulty:'ringan', frequency:'7', anchor:'Setelah Subuh', microTrigger:'melipat sajadah setelah sholat Subuh', triggerDetail:'setelah melipat sajadah selesai sholat Subuh', place:'kamar/masjid', duration:'5 menit', reminderBlock:'pagi', formula:'Setelah melipat sajadah selesai sholat Subuh, aku akan tilawah 5 ayat di kamar atau masjid selama 5 menit.', identity:'Muslim yang menjaga kedekatan dengan Al-Qur’an', obvious:'Sajadah menjadi tanda mulai.', attractive:'Baca dengan mushaf/aplikasi favorit.', easy:'Mulai hanya 5 ayat.', satisfying:'Centang selesai setelah baca.', confidence:'tinggi', reason:'Dekat dengan suasana ibadah pagi.'},
    {id:id(), name:'Stretching', target:'3 menit', category:'Kesehatan', difficulty:'ringan', frequency:'5', anchor:'Setelah mandi', microTrigger:'menaruh handuk setelah mandi', triggerDetail:'setelah menaruh handuk setelah mandi', place:'kamar', duration:'3 menit', reminderBlock:'pagi', formula:'Setelah menaruh handuk setelah mandi, aku akan stretching ringan 3 menit di kamar.', identity:'Orang yang merawat tubuhnya', obvious:'Handuk yang digantung menjadi tanda mulai.', attractive:'Boleh sambil putar lagu pendek.', easy:'Mulai hanya 3 menit.', satisfying:'Centang selesai setelah stretching.', confidence:'tinggi', reason:'Micro trigger-nya jelas dan tubuh sudah aktif.'},
    {id:id(), name:'Belajar fokus', target:'25 menit', category:'Belajar', difficulty:'sedang', frequency:'5', anchor:'Setelah Isya', microTrigger:'laptop menyala dan meja belajar terbuka setelah Isya', triggerDetail:'setelah laptop menyala dan meja belajar terbuka setelah Isya', place:'meja belajar', duration:'25 menit', reminderBlock:'malam', formula:'Setelah laptop menyala dan meja belajar terbuka setelah Isya, aku akan belajar fokus 25 menit di meja belajar.', identity:'Mahasiswa pembelajar', obvious:'Laptop menyala jadi tanda mulai.', attractive:'Mulai dari materi yang paling jelas dulu.', easy:'Pakai timer 25 menit.', satisfying:'Centang dan tulis 1 kalimat hasil belajar.', confidence:'sedang', reason:'Slot malam cukup tenang.'}
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
$('#pullBtn')?.addEventListener('click',()=>pullAll(true));
$('#scheduleForm').addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); state.schedules.push({id:id(), name:f.get('name'), day:f.get('day'), block:f.get('block'), start:f.get('start') || '', end:f.get('end') || '', energy:f.get('energy')}); e.target.reset(); saveState(); });
$('#anchorForm').addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); state.anchors.push({id:id(), relation:f.get('relation'), activity:f.get('activity'), trigger:`${f.get('relation')} ${f.get('activity')}`, routine:f.get('routine'), type:f.get('type')}); e.target.reset(); saveState(); });
$('#identityForm').addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); state.identity = f.get('identity') || state.identity; e.target.reset(); saveState(); });
$('#habitForm').addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); state.habits.push({id:id(), name:f.get('name'), target:f.get('target') || 'versi kecil', category:f.get('category'), difficulty:f.get('difficulty'), frequency:f.get('frequency'), anchor:'', microTrigger:'', triggerDetail:'', place:'', duration:'', formula:'', reminderBlock:'', identity:'', obvious:'', attractive:'', easy:'', satisfying:'', confidence:'', reason:'Menunggu AI Fitting untuk dibuat lebih detail.'}); e.target.reset(); saveState(); });
$('#fitBtn').addEventListener('click', runAIFitting);
$('#weeklyAI').addEventListener('click', runWeeklyAI);
$('#closeModal').addEventListener('click', closeFail);
$('#saveFail').addEventListener('click',()=>{ addCheckin(currentFailHabit,'fail',selectedReason || 'Lainnya',$('#failNote').value); closeFail(); });
$('#reasonGrid').addEventListener('click',e=>{ if(e.target.matches('.reason-btn')){ selectedReason=e.target.dataset.reason; $$('.reason-btn').forEach(b=>b.classList.remove('active')); e.target.classList.add('active'); }});

document.querySelector('#clearChatBtn')?.addEventListener('click',()=>{
  if(confirm('Bersihkan riwayat chat AI di perangkat ini?')){
    state.chat = [];
    coachRequestToken++;
    aiThinking = false;
    saveState({sync:false});
  }
});
$('#coachForm').addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); const msg=f.get('message'); e.target.reset(); askCoach(msg); });
$$('.quick-prompts button').forEach(b=>b.addEventListener('click',()=>askCoach(b.dataset.prompt)));
$('#goalForm')?.addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); state.dailyGoals.push({id:id(), date:todayISO(), text:f.get('goal'), done:false, createdAt:new Date().toISOString()}); e.target.reset(); saveState(); });
$('#clearGoalsBtn')?.addEventListener('click',()=>{ state.dailyGoals = (state.dailyGoals||[]).filter(g=>g.date !== todayISO()); saveState(); });
$('#profileForm')?.addEventListener('submit',e=>{ e.preventDefault(); const f=new FormData(e.target); state.profile = { name:f.get('name') || state.profile?.name || '', campus:f.get('campus') || state.profile?.campus || '', mode:f.get('mode') || state.profile?.mode || 'Mahasiswa aktif' }; e.target.reset(); saveState(); });
$('#profileBtn')?.addEventListener('click',()=>{ $$('.nav-item').forEach(b=>b.classList.remove('active')); $$('.page').forEach(p=>p.classList.remove('active-page')); $('#profile')?.classList.add('active-page'); $('#pageTitle').textContent='Profil'; closeMobileMenu(); });

document.querySelector('#exportJson')?.addEventListener('click',()=>download(`ritme-backup-${todayISO()}.json`, JSON.stringify(state,null,2)));
document.querySelector('#importJsonBtn')?.addEventListener('click',()=>$('#importJson').click());
document.querySelector('#importJson')?.addEventListener('change',async(e)=>{ const file=e.target.files[0]; if(!file) return; const text=await file.text(); state={...structuredClone(initialState), ...JSON.parse(text)}; saveState(); });
document.querySelector('#wipeLocal')?.addEventListener('click',()=>{ if(confirm('Hapus data lokal di browser ini?')){ localStorage.removeItem('ritme-state-full'); state=structuredClone(initialState); renderAll(); }});
document.querySelector('#enableNotifications')?.addEventListener('click', requestNotifications);

if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{})); }
startNotificationTicker();
renderAll();
