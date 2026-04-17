// ════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════
const MONTHS_PT    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const STORAGE_KEY  = 'fw_v3';

const NOW       = new Date();
const TODAY_KEY = mkKey(NOW.getFullYear(), NOW.getMonth());

// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
let state = {
  savings:         0,
  months:          {},
  startMonth:      TODAY_KEY,
  theme:           'light',
  goals:           [],
  onboardingDone:  false,
  notifEnabled:    false,
};

let activeMonth  = TODAY_KEY;
let savAction    = 'add';
let selCat       = 'moradia';
let selSubcat    = '';
let activeFilter = 'current';
let acBlurTimer  = null;

// ════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════
function mkKey(y, m) { return y + '-' + String(m + 1).padStart(2, '0'); }
function parseKey(k) { const [y,m] = k.split('-').map(Number); return {year:y, month:m-1}; }
function isToday()   { return activeMonth === TODAY_KEY; }
function fmt(n)      { return 'R$ '+(n||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}); }
function fmtF(n)     { return 'R$ '+(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function daysInMonth(y, m) { return new Date(y, m+1, 0).getDate(); }

function activeData() {
  if (!state.months[activeMonth]) state.months[activeMonth] = {income:0,extras:[],bills:[],savingsContrib:0};
  if (state.months[activeMonth].savingsContrib === undefined) state.months[activeMonth].savingsContrib = 0;
  return state.months[activeMonth];
}
function totalRenda(d) { return (d.income||0) + (d.extras||[]).reduce((s,e) => s+e.amount, 0); }
function totalBills(d) { return (d.bills||[]).reduce((s,b) => s+b.amount, 0); }
function saldoLivre(d) { return totalRenda(d) - totalBills(d) - (d.savingsContrib||0); }

function keyToDate(k) { const {year,month} = parseKey(k); return new Date(year, month, 1); }
function compareKeys(a, b) { return keyToDate(a) - keyToDate(b); }

// ════════════════════════════════════════════════
//  STORAGE
// ════════════════════════════════════════════════
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Try new key first, fall back to old key for migration
    const old = !raw ? localStorage.getItem('fw10') : null;
    const d = raw ? JSON.parse(raw) : (old ? JSON.parse(old) : null);
    if (d) {
      state = {
        savings:        d.savings        || 0,
        months:         d.months         || {},
        startMonth:     d.startMonth     || TODAY_KEY,
        theme:          d.theme          || 'light',
        goals:          d.goals          || [],
        onboardingDone: d.onboardingDone || false,
        notifEnabled:   d.notifEnabled   || false,
      };
      // Migrate: ensure savingsContrib exists in all months
      Object.values(state.months).forEach(m => {
        if (m.savingsContrib === undefined) m.savingsContrib = 0;
      });
    } else {
      state.startMonth = TODAY_KEY;
      save();
    }
  } catch(e) {}
}

// ════════════════════════════════════════════════
//  THEME
// ════════════════════════════════════════════════
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const icon = document.getElementById('themeIcon');
  if (t === 'dark') {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
}
function toggleTheme() { state.theme = state.theme==='light'?'dark':'light'; applyTheme(state.theme); save(); }

// ════════════════════════════════════════════════
//  VALID MONTHS
// ════════════════════════════════════════════════
function getValidMonths() {
  const start = keyToDate(state.startMonth);
  const end   = keyToDate(TODAY_KEY);
  const keys  = [];
  let cur = new Date(start);
  while (cur <= end) {
    keys.push(mkKey(cur.getFullYear(), cur.getMonth()));
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys.reverse();
}

// ════════════════════════════════════════════════
//  CATEGORIES + SUBCATEGORIES
// ════════════════════════════════════════════════
const CATS = [
  {id:'moradia',      label:'Moradia',      color:'#2563eb', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'},
  {id:'alimentacao',  label:'Alimentação',  color:'#f97316', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>'},
  {id:'transporte',   label:'Transporte',   color:'#a855f7', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>'},
  {id:'saude',        label:'Saúde',        color:'#10b981', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'},
  {id:'lazer',        label:'Lazer',        color:'#ec4899', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'},
  {id:'educacao',     label:'Educação',     color:'#eab308', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'},
  {id:'tecnologia',   label:'Tecnologia',   color:'#06b6d4', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>'},
  {id:'streaming',    label:'Streaming',    color:'#8b5cf6', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>'},
  {id:'contasfixas',  label:'Contas Fixas', color:'#f59e0b', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'},
  {id:'investimentos',label:'Investimentos',color:'#14b8a6', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>'},
  {id:'academia',     label:'Academia',     color:'#ef4444', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M6 8H5a4 4 0 0 0 0 8h1"/><line x1="6" y1="12" x2="18" y2="12"/></svg>'},
  {id:'poupanca',     label:'Poupança',     color:'#0ea5e9', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'},
  {id:'outros',       label:'Outros',       color:'#64748b', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>'},
];

const SUBCATS = {
  moradia:       ['Aluguel','Energia','Água','Internet','Condomínio','IPTU','Gás','Seguro Casa'],
  alimentacao:   ['Mercado','Restaurante','Delivery','Lanche','Padaria','Doce','Salgado','Bebidas'],
  transporte:    ['Uber / 99','Combustível','Ônibus / Metro','Manutenção','Estacionamento','Pedágio','IPVA','Seguro Auto'],
  saude:         ['Plano de Saúde','Consulta','Remédio','Exame','Dentista','Psicólogo','Farmácia'],
  lazer:         ['Cinema','Viagem','Bar / Balada','Eventos','Jogos','Parque','Shows','Hobbies'],
  educacao:      ['Faculdade','Curso Online','Livros','Material Escolar','Idiomas','Certificação'],
  tecnologia:    ['Celular','Computador','Acessório','Software / App','Reparo','Plano Celular'],
  streaming:     ['Netflix','Spotify','Amazon Prime','Disney+','YouTube Premium','Max','Deezer','Apple TV'],
  contasfixas:   ['Energia','Água','Gás','Internet','Plano Celular','Aluguel','Condomínio','Seguro'],
  investimentos: ['Poupança','Tesouro Direto','Ações','CDB / LCI','Fundos','Criptomoedas','Previdência'],
  academia:      ['Mensalidade Academia','Personal Trainer','Suplementos','Equipamentos','Aula Online'],
  poupanca:      ['Meta de Emergência','Viagem','Imóvel','Educação','Aposentadoria','Outros'],
  outros:        ['Presente','Doação','Pets','Cosméticos','Roupas','Calçados','Casa / Decoração','Assinatura'],
};

function getCat(id) { return CATS.find(c => c.id === id) || CATS.at(-1); }

// ── Build category grid ──────────────────────
function buildCats() {
  document.getElementById('catGrid').innerHTML = CATS.map(c => {
    const isSel = c.id === selCat;
    return `<div class="cat-opt${isSel?' sel':''}" onclick="selCatFn('${c.id}')"
      style="${isSel?'border-color:'+c.color+';background:'+c.color+'22':''}">
      <span style="color:${c.color}">${c.svg}</span>
      <span class="cat-lbl">${c.label.length>8?c.label.slice(0,7)+'…':c.label}</span>
    </div>`;
  }).join('');
}

// ── Select category → auto-fill name + show subcats ──────
function selCatFn(id) {
  selCat = id;
  selSubcat = '';
  buildCats();
  buildSubcats();
  // Only auto-fill name if the current name is blank or was a previous auto-fill
  const nameEl = document.getElementById('fName');
  if (!nameEl.dataset.userTyped || nameEl.dataset.userTyped === '0') {
    nameEl.value = '';
    nameEl.placeholder = 'Selecione uma subcategoria ou digite…';
  }
}

// ── Build subcategory chips ──────────────────────────────
function buildSubcats() {
  const chips = SUBCATS[selCat] || [];
  const sec   = document.getElementById('subcatSection');
  const wrap  = document.getElementById('subcatChips');
  if (!chips.length) { sec.style.display = 'none'; return; }

  const c = getCat(selCat);
  wrap.innerHTML = chips.map(chip => {
    const isSel = chip === selSubcat;
    return `<button class="subcat-chip${isSel?' sel':''}" onclick="selSubcatFn('${chip}')"
      style="${isSel?'background:'+c.color+'18;border-color:'+c.color+';color:'+c.color:''}">${chip}</button>`;
  }).join('');
  sec.style.display = 'block';
}

// ── Select subcategory → auto-fill name ──────────────────
function selSubcatFn(name) {
  selSubcat = name;
  buildSubcats();
  const nameEl = document.getElementById('fName');
  nameEl.value = name;
  nameEl.dataset.userTyped = '0';
  // Try to fill amount from history
  const suggestion = findBestSuggestion(name);
  if (suggestion) {
    const amtEl = document.getElementById('fAmount');
    const dueEl = document.getElementById('fDue');
    if (!amtEl.value) amtEl.value = suggestion.amount;
    if (!dueEl.value && suggestion.due) dueEl.value = suggestion.due;
  }
  closeAcDropdown();
}

// ════════════════════════════════════════════════
//  SMART SUGGESTION ENGINE (learns from history)
// ════════════════════════════════════════════════
function getAllBillHistory() {
  const bills = [];
  Object.entries(state.months).forEach(([key, m]) => {
    (m.bills||[]).forEach(b => bills.push({...b, monthKey: key}));
  });
  return bills;
}

function findBestSuggestion(name) {
  if (!name) return null;
  const norm = name.toLowerCase().trim();
  const history = getAllBillHistory();
  // Find most recent match
  const matches = history.filter(b => b.name.toLowerCase().includes(norm) || norm.includes(b.name.toLowerCase()));
  if (!matches.length) return null;
  matches.sort((a, b) => b.id - a.id); // most recent first
  return matches[0];
}

function getSmartSuggestions(query) {
  if (!query || query.length < 2) return [];
  const norm = query.toLowerCase().trim();
  const history = getAllBillHistory();

  // Frequency + recency scoring
  const seen = {};
  history.forEach(b => {
    const key = b.name.toLowerCase();
    if (!key.includes(norm) && !norm.includes(key.slice(0,3))) return;
    if (!seen[b.name]) seen[b.name] = {name:b.name, amount:b.amount, cat:b.cat, subcat:b.subcat||'', due:b.due, count:0, lastId:0};
    seen[b.name].count++;
    if (b.id > seen[b.name].lastId) { seen[b.name].lastId = b.id; seen[b.name].amount = b.amount; seen[b.name].due = b.due; }
  });

  return Object.values(seen)
    .filter(s => s.name.toLowerCase().includes(norm))
    .sort((a,b) => b.count - a.count || b.lastId - a.lastId)
    .slice(0, 6);
}

// ── Autocomplete UI ──────────────────────────────────────
function onNameInput(val) {
  const nameEl = document.getElementById('fName');
  nameEl.dataset.userTyped = val ? '1' : '0';
  renderAcDropdown(val);
}

function onNameFocus() {
  const val = document.getElementById('fName').value;
  if (val.length >= 2) renderAcDropdown(val);
}

function onNameBlur() {
  // Delay so click on suggestion registers first
  acBlurTimer = setTimeout(closeAcDropdown, 180);
}

function renderAcDropdown(query) {
  const dd = document.getElementById('acDropdown');
  const suggestions = getSmartSuggestions(query);
  if (!suggestions.length) { dd.classList.remove('open'); return; }

  dd.innerHTML = suggestions.map(s => {
    const c = getCat(s.cat);
    return `<div class="ac-item" onmousedown="applyAcSuggestion('${escQ(s.name)}','${s.cat}','${escQ(s.subcat||'')}',${s.amount||0},${s.due||0})">
      <div class="ac-item-icon" style="background:${c.color}18"><span style="color:${c.color}">${c.svg}</span></div>
      <div class="ac-item-info">
        <div class="ac-item-name">${s.name}</div>
        <div class="ac-item-sub">${c.label}${s.subcat?' · '+s.subcat:''} · ${s.count}× usado</div>
      </div>
      <div class="ac-item-amt">${fmtF(s.amount)}</div>
    </div>`;
  }).join('') + `<div class="ac-hint">⚡ Baseado no seu histórico</div>`;

  dd.classList.add('open');
}

function applyAcSuggestion(name, cat, subcat, amount, due) {
  clearTimeout(acBlurTimer);
  const nameEl = document.getElementById('fName');
  nameEl.value = name;
  nameEl.dataset.userTyped = '0';
  selCat    = cat;
  selSubcat = subcat;
  buildCats();
  buildSubcats();
  if (amount) document.getElementById('fAmount').value = amount;
  if (due)    document.getElementById('fDue').value    = due;
  closeAcDropdown();
}

function closeAcDropdown() { document.getElementById('acDropdown').classList.remove('open'); }
function escQ(s) { return s.replace(/'/g,"&#39;"); }

// ════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════
function goTo(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  if (page === 'analise')   renderAnalise();
  if (page === 'historico') renderHistorico();
  if (page === 'metas')     renderGoals();
}

function shiftMonth(dir) {
  const {year, month} = parseKey(activeMonth);
  const d   = new Date(year, month + dir, 1);
  const max = keyToDate(TODAY_KEY);
  const min = keyToDate(state.startMonth);
  if (d > max) { showToast('Ainda estamos neste mês! 😄'); return; }
  if (d < min) { showToast('Antes do seu início de uso.'); return; }
  activeMonth = mkKey(d.getFullYear(), d.getMonth());
  renderAll();
}

function switchToMonth(key) {
  activeMonth = key;
  renderAll();
  goTo('dashboard', document.querySelectorAll('.nav-btn')[0]);
}

function jumpToToday() {
  activeMonth = TODAY_KEY;
  renderAll();
  showToast('Voltou para o mês atual!');
}

function setFilter(f) {
  activeFilter = f;
  document.getElementById('filterCurr').classList.toggle('active', f === 'current');
  document.getElementById('filterHist').classList.toggle('active', f === 'history');
  if (f === 'current') { activeMonth = TODAY_KEY; renderAll(); }
  else goTo('historico', document.querySelectorAll('.nav-btn')[3]);
}

// ════════════════════════════════════════════════
//  FEEDBACK / SMART MESSAGES
// ════════════════════════════════════════════════
function showFeedback() {
  const banner     = document.getElementById('feedbackBanner');
  const validMonths = getValidMonths();
  const isFirstMonth = validMonths.length === 1;
  const d = activeData();
  const total = totalBills(d);

  let type = 'info', emoji = '👋', text = '';

  if (isFirstMonth && isToday()) {
    type='info'; emoji='🎉';
    text = 'Bem-vindo ao FinWise! Registre sua renda e contas para começar o controle financeiro.';
  } else if (validMonths.length > 1 && isToday()) {
    const prevKey  = validMonths[1];
    const prevD    = state.months[prevKey];
    if (prevD) {
      const prevTotal = totalBills(prevD);
      if (prevTotal > 0 && total >= 0) {
        const diff = ((total - prevTotal) / prevTotal) * 100;
        if (diff < -5)       { type='success'; emoji='📉'; text=`Ótimo! Você gastou ${Math.abs(Math.round(diff))}% a menos em relação ao mês passado.`; }
        else if (diff > 5)   { type='warn';    emoji='📈'; text=`Atenção: seus gastos aumentaram ${Math.round(diff)}% em relação ao mês passado.`; }
        else                 { type='info';    emoji='📊'; text='Seus gastos estão estáveis em relação ao mês passado (variação < 5%).'; }
      }
    }
  } else if (!isToday()) { banner.style.display='none'; return; }

  if (!text) { banner.style.display='none'; return; }
  banner.className = `feedback-banner ${type}`;
  banner.innerHTML = `<span class="fb-emoji">${emoji}</span><span class="fb-text">${text}</span>`;
  banner.style.display = 'flex';
}

// ════════════════════════════════════════════════
//  MONTH PROGRESS
// ════════════════════════════════════════════════
function renderMonthProgress() {
  const {year, month} = parseKey(activeMonth);
  const total = daysInMonth(year, month);
  let elapsed, pct;
  if (isToday()) {
    elapsed = NOW.getDate();
    pct = Math.round((elapsed / total) * 100);
    document.getElementById('mprogTitle').textContent = 'Progresso do Mês';
    document.getElementById('mprogSub').textContent   = `Você está no dia ${elapsed} de ${total} — ${100-pct}% do mês ainda pela frente.`;
  } else {
    pct = 100; elapsed = total;
    document.getElementById('mprogTitle').textContent = MONTHS_PT[month] + ' ' + year;
    document.getElementById('mprogSub').textContent   = `Mês encerrado — ${total} dias no total.`;
  }
  document.getElementById('mprogPct').textContent  = pct + '%';
  document.getElementById('mprogFill').style.width = pct + '%';
}

// ════════════════════════════════════════════════
//  MODALS: NOVA CONTA
// ════════════════════════════════════════════════
function openModal() {
  if (!isToday()) { showToast('Mês passado: dados apenas leitura.', 'err'); return; }
  selSubcat = '';
  document.getElementById('modalOv').classList.add('open');
  buildCats();
  buildSubcats();
  // Reset name field state
  const nameEl = document.getElementById('fName');
  nameEl.dataset.userTyped = '0';
  setTimeout(() => nameEl.focus(), 80);
}

function closeModal() {
  document.getElementById('modalOv').classList.remove('open');
  ['fName','fAmount','fDue'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fName').dataset.userTyped = '0';
  selSubcat = '';
  closeAcDropdown();
}

// ════════════════════════════════════════════════
//  MODALS: ENTRADA EXTRA
// ════════════════════════════════════════════════
function openExtraModal() {
  if (!isToday()) { showToast('Mês passado: dados apenas leitura.', 'err'); return; }
  document.getElementById('modalExtra').classList.add('open');
  setTimeout(() => document.getElementById('extraName').focus(), 50);
}
function closeExtraModal() {
  document.getElementById('modalExtra').classList.remove('open');
  ['extraName','extraAmount'].forEach(id => document.getElementById(id).value = '');
}

// ════════════════════════════════════════════════
//  MODALS: POUPANÇA (com integração de saldo)
// ════════════════════════════════════════════════
function openSavingsModal(action) {
  savAction = action;
  const isAdd = action === 'add';
  document.getElementById('savModalTitle').textContent   = isAdd ? '💰 Depositar na Poupança' : '💸 Retirar da Poupança';
  document.getElementById('savModalLabel').textContent   = isAdd ? 'Valor a depositar (R$)'   : 'Valor a retirar (R$)';
  document.getElementById('savModalBtn').textContent     = isAdd ? 'Confirmar Depósito'        : 'Confirmar Retirada';
  document.getElementById('savModalBalance').textContent = fmtF(state.savings || 0);

  const flowInfo = document.getElementById('savFlowInfo');
  const balRow   = document.getElementById('savBalRow');
  if (isAdd) {
    const d     = state.months[TODAY_KEY] || {income:0,extras:[],bills:[],savingsContrib:0};
    const avail = saldoLivre(d);
    document.getElementById('savAvailAmt').textContent = fmtF(Math.max(avail, 0));
    document.getElementById('savFlowText').innerHTML   = `Ao depositar, o valor será <strong>descontado do saldo disponível do mês atual</strong>, simulando uma transferência real de dinheiro.`;
    flowInfo.style.display = 'flex';
    balRow.style.display   = 'flex';
  } else {
    document.getElementById('savFlowText').innerHTML = 'O valor será retirado da poupança e ficará disponível para uso.';
    flowInfo.style.display = 'flex';
    balRow.style.display   = 'none';
  }

  document.getElementById('savingsAmount').value = '';
  document.getElementById('modalSavings').classList.add('open');
  setTimeout(() => document.getElementById('savingsAmount').focus(), 50);
}
function closeSavingsModal() { document.getElementById('modalSavings').classList.remove('open'); }

function confirmSavings() {
  const v = parseFloat(document.getElementById('savingsAmount').value);
  if (!v || v <= 0) { showToast('Informe um valor válido.', 'err'); return; }

  if (savAction === 'add') {
    // Check if there's enough balance in current month
    const todayData = state.months[TODAY_KEY] || {income:0,extras:[],bills:[],savingsContrib:0};
    if (!state.months[TODAY_KEY]) state.months[TODAY_KEY] = todayData;
    if (todayData.savingsContrib === undefined) todayData.savingsContrib = 0;
    const avail = saldoLivre(todayData);
    if (v > avail && avail >= 0) {
      showToast(`Saldo disponível insuficiente (${fmtF(avail)}).`, 'err'); return;
    }
    state.savings = (state.savings||0) + v;
    todayData.savingsContrib = (todayData.savingsContrib||0) + v;
    showToast('+ ' + fmtF(v) + ' depositado na poupança! 🎉');
  } else {
    if (v > (state.savings||0)) { showToast('Saldo insuficiente na poupança.', 'err'); return; }
    state.savings = (state.savings||0) - v;
    // On withdrawal, add back to current month's available balance
    const todayData = state.months[TODAY_KEY];
    if (todayData && (todayData.savingsContrib||0) > 0) {
      todayData.savingsContrib = Math.max(0, (todayData.savingsContrib||0) - v);
    }
    showToast('- ' + fmtF(v) + ' retirado da poupança.');
  }
  save(); closeSavingsModal(); renderAll();
}

// Close overlay on backdrop click or Escape
// We must also clear any inline display style so the overlay doesn't remain
// as a z-index:200 click-blocker after its .open class is removed
// (showOnboarding sets style.display='flex' inline; CSS alone can't override it)
function closeOverlay(o) {
  o.classList.remove('open');
  o.style.display = 'none';
}

document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) closeOverlay(o); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.overlay').forEach(o => closeOverlay(o));
  if (e.key === 'Enter' && document.getElementById('modalOv').classList.contains('open')) addBill();
});

// ════════════════════════════════════════════════
//  BILL CRUD
// ════════════════════════════════════════════════
function addBill() {
  const name = document.getElementById('fName').value.trim();
  const amt  = parseFloat(document.getElementById('fAmount').value);
  const due  = parseInt(document.getElementById('fDue').value);
  if (!name)          { showToast('Informe o nome da conta.', 'err'); return; }
  if (!amt || amt<=0) { showToast('Informe um valor válido.', 'err'); return; }
  const d = activeData();
  d.bills.push({id:Date.now(), name, amount:amt, due:due||null, cat:selCat, subcat:selSubcat||'', paid:false});
  save(); closeModal(); renderAll();
  showToast('Conta registrada! ✓');
}

function togglePaid(id) {
  const d = activeData();
  const b = d.bills.find(b => b.id === id);
  if (b) { b.paid = !b.paid; save(); renderAll(); triggerHaptic(b.paid ? 'medium' : 'light'); }
}
function delBill(id) {
  const d = activeData();
  d.bills = d.bills.filter(b => b.id !== id);
  save(); renderAll(); showToast('Conta removida.', 'err');
}

// ════════════════════════════════════════════════
//  EXTRA CRUD
// ════════════════════════════════════════════════
function addExtra() {
  const name = document.getElementById('extraName').value.trim();
  const amt  = parseFloat(document.getElementById('extraAmount').value);
  if (!name)          { showToast('Informe a origem.', 'err'); return; }
  if (!amt || amt<=0) { showToast('Informe um valor válido.', 'err'); return; }
  const d = activeData();
  if (!d.extras) d.extras = [];
  d.extras.push({id:Date.now(), name, amount:amt});
  save(); closeExtraModal(); renderAll();
  showToast('Entrada extra adicionada! ✓');
}
function delExtra(id) {
  const d = activeData();
  d.extras = (d.extras||[]).filter(e => e.id !== id);
  save(); renderAll();
}

function onIncome(v) {
  if (!isToday()) return;
  activeData().income = parseFloat(v) || 0;
  save(); renderAll();
}

// ════════════════════════════════════════════════
//  BILL HTML
// ════════════════════════════════════════════════
function billHTML(b, compact, ro) {
  const c  = getCat(b.cat);
  const pc = b.paid ? ' paid' : '';
  const sub = b.subcat ? `${b.subcat} · ` : '';
  return `<div class="bill-item" style="border-left:3px solid ${b.paid?'var(--green)':c.color}">
    <div class="bill-icon" style="background:${c.color}18"><span style="color:${c.color}">${c.svg}</span></div>
    <div class="bill-info">
      <div class="bill-name${pc}">${b.name}</div>
      <div class="bill-meta">${sub}${c.label}${b.due?' · Dia '+b.due:''} · <span class="badge ${b.paid?'badge-paid':'badge-pending'}">${b.paid?'✓ Pago':'Pendente'}</span></div>
    </div>
    <div class="bill-amount${pc}">${fmtF(b.amount)}</div>
    ${!ro?`<div class="bill-actions">
      <button class="icon-btn ck-btn${b.paid?' paid':''}" onclick="togglePaid(${b.id})" title="${b.paid?'Marcar pendente':'Marcar como pago'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      ${!compact?`<button class="icon-btn dl-btn" onclick="delBill(${b.id})" title="Remover">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>`:''}
    </div>`:''}
  </div>`;
}

function emptyHTML() {
  return `<div class="empty-state">
    <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
    <h3>Nenhuma conta registrada</h3>
    <p>Clique em "Adicionar" para registrar suas despesas.</p>
    ${isToday()?'<button class="btn btn-primary btn-sm" onclick="openModal()">+ Adicionar conta</button>':''}
  </div>`;
}

// ════════════════════════════════════════════════
//  RENDER ALL
// ════════════════════════════════════════════════
function renderAll() {
  updateTopbar();
  updateTimeline();
  renderDash();
  renderBills();
  renderMonthProgress();
  showFeedback();
  const ap = document.querySelector('.page.active');
  if (ap && ap.id === 'page-analise')   renderAnalise();
  if (ap && ap.id === 'page-historico') renderHistorico();
}

// ════════════════════════════════════════════════
//  TOPBAR
// ════════════════════════════════════════════════
function updateTopbar() {
  const {year, month} = parseKey(activeMonth);
  document.getElementById('barMonthName').textContent = MONTHS_PT[month] + ' ' + year;
  const badge = document.getElementById('barBadge');
  const cur   = isToday();
  badge.textContent = cur ? 'Mês atual' : 'Mês passado';
  badge.className   = 'tb-badge' + (cur ? '' : ' past');
  document.getElementById('readonlyNotice').style.display = cur ? 'none' : 'flex';
  const inc = document.getElementById('incomeField');
  inc.disabled      = !cur;
  inc.style.opacity = cur ? '1' : '.65';
  inc.style.cursor  = cur ? '' : 'not-allowed';
  ['btnNovaConta','btnAddConta','btnAddExtra'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.style.opacity       = cur ? '1' : '.45';
    el.style.pointerEvents = cur ? '' : 'none';
  });
}

// ════════════════════════════════════════════════
//  TIMELINE
// ════════════════════════════════════════════════
function hasData(key) {
  const d = state.months[key];
  return d && (d.income || (d.bills||[]).length || (d.extras||[]).length);
}
function updateTimeline() {
  const keys = getValidMonths();
  document.getElementById('timelineList').innerHTML = keys.map((key, idx) => {
    const {year, month} = parseKey(key);
    const isAct  = key === activeMonth;
    const isCurr = key === TODAY_KEY;
    const hd     = hasData(key);
    const flag   = isCurr ? '<span class="tl-flag">Hoje</span>' : '';
    const line   = idx < keys.length-1 ? '<div class="tl-line"></div>' : '';
    return `<button class="tl-item${isAct?' active':''}${hd?' has-data':''}" onclick="switchToMonth('${key}')">
        <div class="tl-dot"></div>
        <span class="tl-name">${MONTHS_SHORT[month]} ${year}</span>
        ${flag}
      </button>${line}`;
  }).join('');
}

// ════════════════════════════════════════════════
//  RENDER DASHBOARD
// ════════════════════════════════════════════════
function renderDash() {
  const d      = activeData();
  const renda  = totalRenda(d);
  const bills  = d.bills || [];
  const total  = totalBills(d);
  const savC   = d.savingsContrib || 0;
  const avail  = renda - total - savC;   // ← savings deducted from balance
  const pct    = renda > 0 ? Math.min(Math.round(((total+savC)/renda)*100), 100) : 0;
  const {year, month} = parseKey(activeMonth);

  // Available balance
  document.getElementById('availAmt').textContent = fmtF(avail);
  document.getElementById('availSub').textContent = savC > 0 ? `após despesas + ${fmtF(savC)} poupados` : 'após despesas';

  // Budget bar
  const bar = document.getElementById('budBar');
  bar.style.width = pct + '%';
  bar.className   = 'prog-fill ' + (pct>80?'fill-red':pct>60?'fill-amber':'fill-blue');
  document.getElementById('budPct').textContent = pct + '%';

  // Stats
  document.getElementById('ds-total').textContent    = fmt(total);
  document.getElementById('ds-totalSub').textContent  = bills.length + ' conta' + (bills.length !== 1 ? 's' : '');

  // Poupado no mês
  document.getElementById('ds-saved').textContent    = fmtF(savC);
  document.getElementById('ds-savedSub').textContent  = renda > 0 ? Math.round((savC/renda)*100) + '% da renda' : 'deste mês';

  if (bills.length > 0) {
    const best = bills.reduce((max,b) => b.amount>max.amount?b:max, bills[0]);
    document.getElementById('ds-best').textContent    = fmtF(best.amount);
    document.getElementById('ds-bestSub').textContent = best.name;
  } else {
    document.getElementById('ds-best').textContent    = '—';
    document.getElementById('ds-bestSub').textContent = 'sem registros';
  }

  // Savings card
  const sav = state.savings || 0;
  document.getElementById('savingsVal').textContent  = fmtF(sav);
  document.getElementById('savingsSub').textContent  = sav > 0 && renda > 0
    ? `Equivale a ${Math.round((sav/renda)*100)}% da renda`
    : sav > 0 ? 'Total guardado' : 'Comece a poupar hoje!';
  document.getElementById('savDeductInfo').style.display = savC > 0 ? 'flex' : 'none';

  // Extras
  const extras = d.extras || [];
  const el = document.getElementById('extraList');
  if (el) el.innerHTML = extras.length === 0
    ? '<div class="empty-inline">Nenhuma entrada extra registrada.</div>'
    : extras.map(e => `
        <div class="extra-row">
          <div class="extra-name">${e.name}</div>
          <div class="extra-val">+ ${fmtF(e.amount)}</div>
          ${isToday()?`<button class="icon-btn dl-btn" onclick="delExtra(${e.id})" title="Remover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>`:''}
        </div>`).join('');

  const f = document.getElementById('incomeField');
  if (document.activeElement !== f) f.value = d.income || '';

  const ro  = !isToday();
  const rec = bills.slice(-4).reverse();
  document.getElementById('recentList').innerHTML = !rec.length ? emptyHTML() : rec.map(b => billHTML(b, true, ro)).join('');
}

// ════════════════════════════════════════════════
//  RENDER BILLS
// ════════════════════════════════════════════════
function renderBills() {
  const d  = activeData();
  const ro = !isToday();
  document.getElementById('billsList').innerHTML = !(d.bills||[]).length
    ? emptyHTML()
    : d.bills.map(b => billHTML(b, false, ro)).join('');
}

// ════════════════════════════════════════════════
//  ANÁLISE — FILTER STATE
// ════════════════════════════════════════════════
let afCatFilter    = '';
let afTipoFilter   = 'all';
let afPeriodFilter = 'current';

function populateCatFilter() {
  const sel = document.getElementById('afCat');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">Todas as categorias</option>' +
    CATS.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  sel.value = prev;
}

function setAfTipo(tipo, btn) {
  afTipoFilter = tipo;
  document.querySelectorAll('.af-tog-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  applyAnaliseFilters();
}

function applyAnaliseFilters() {
  afCatFilter    = (document.getElementById('afCat')    || {}).value || '';
  afPeriodFilter = (document.getElementById('afPeriod') || {}).value || 'current';
  renderAnalise();
}

function getBillsForPeriod() {
  let bills = [];
  const validMonths = getValidMonths();
  if (afPeriodFilter === 'current') {
    bills = (activeData().bills || []).slice();
  } else if (afPeriodFilter === 'last3') {
    validMonths.slice(0, 3).forEach(k => {
      bills = bills.concat((state.months[k] || {}).bills || []);
    });
  } else if (afPeriodFilter === 'last6') {
    validMonths.slice(0, 6).forEach(k => {
      bills = bills.concat((state.months[k] || {}).bills || []);
    });
  } else if (afPeriodFilter === 'year') {
    const {year} = parseKey(activeMonth);
    validMonths.filter(k => parseKey(k).year === year).forEach(k => {
      bills = bills.concat((state.months[k] || {}).bills || []);
    });
  }
  if (afCatFilter)  bills = bills.filter(b => b.cat === afCatFilter);
  if (afTipoFilter === 'paid')    bills = bills.filter(b => b.paid);
  if (afTipoFilter === 'pending') bills = bills.filter(b => !b.paid);
  return bills;
}

// ════════════════════════════════════════════════
//  RENDER ANÁLISE (main orchestrator)
// ════════════════════════════════════════════════
function renderAnalise() {
  if (!document.getElementById('paidAmt')) return;

  populateCatFilter();

  const bills = getBillsForPeriod();
  const d     = activeData();

  // Update subtitle
  const sub = document.getElementById('analiseSub');
  if (sub) {
    const labels = {current:'Mês atual', last3:'Últimos 3 meses', last6:'Últimos 6 meses', year:'Este ano'};
    sub.textContent = (labels[afPeriodFilter] || 'Mês atual') + (afCatFilter ? ' · ' + getCat(afCatFilter).label : '');
  }

  const tot   = bills.reduce((s,b) => s+b.amount, 0);
  const paid  = bills.filter(b => b.paid).reduce((s,b) => s+b.amount, 0);
  const pp    = tot > 0 ? Math.round((paid/tot)*100) : 0;

  document.getElementById('paidAmt').textContent    = fmt(paid);
  document.getElementById('pendingAmt').textContent = fmt(tot - paid);
  document.getElementById('paidBar').style.width    = pp + '%';
  document.getElementById('paidPct').textContent    = pp + '% concluído';

  // Call all sub-renders
  renderComparisonCards();
  renderBarChart(bills);
  renderDonut(bills, d);
  renderLineChart();
  renderAutoInsights(d, bills);
}

// ════════════════════════════════════════════════
//  COMPARISON CARDS
// ════════════════════════════════════════════════
function renderComparisonCards() {
  const el = document.getElementById('compRow');
  if (!el) return;
  const validMonths = getValidMonths();
  if (validMonths.length < 2) { el.innerHTML = ''; return; }

  const currKey  = activeMonth;
  const currIdx  = validMonths.indexOf(currKey);
  const prevKey  = validMonths[currIdx + 1];
  if (!prevKey) { el.innerHTML = ''; return; }

  const curr = state.months[currKey] || {};
  const prev = state.months[prevKey] || {};

  const currTotal = totalBills(curr);
  const prevTotal = totalBills(prev);
  const diffPct   = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null;

  const currSav   = curr.savingsContrib || 0;
  const prevSav   = prev.savingsContrib || 0;
  const currRenda = totalRenda(curr);
  const prevRenda = totalRenda(prev);

  const {month: pm} = parseKey(prevKey);
  const {month: cm} = parseKey(currKey);

  function diffBadge(curr, prev, invertColor) {
    if (prev === 0) return '';
    const d = ((curr - prev) / prev) * 100;
    const up = d > 0;
    const col = invertColor ? (up ? 'var(--red)' : 'var(--green)') : (up ? 'var(--green)' : 'var(--red)');
    return `<div class="comp-diff" style="color:${col}">${up?'↑':'↓'} ${Math.abs(Math.round(d))}% vs ${MONTHS_SHORT[pm]}</div>`;
  }

  el.innerHTML = `
    <div class="comp-card card">
      <div class="comp-icon" style="background:var(--red-l);color:var(--red)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
      </div>
      <div class="comp-label">Despesas ${MONTHS_SHORT[cm]}</div>
      <div class="comp-val">${fmtF(currTotal)}</div>
      <div class="comp-prev">${MONTHS_SHORT[pm]}: ${fmtF(prevTotal)}</div>
      ${diffBadge(currTotal, prevTotal, true)}
    </div>
    <div class="comp-card card">
      <div class="comp-icon" style="background:var(--green-l);color:var(--green)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 2 17"/><polyline points="17 6 23 6 23 12"/></svg>
      </div>
      <div class="comp-label">Renda ${MONTHS_SHORT[cm]}</div>
      <div class="comp-val">${fmtF(currRenda)}</div>
      <div class="comp-prev">${MONTHS_SHORT[pm]}: ${fmtF(prevRenda)}</div>
      ${diffBadge(currRenda, prevRenda, false)}
    </div>
    <div class="comp-card card">
      <div class="comp-icon" style="background:var(--violet-l);color:var(--violet)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      </div>
      <div class="comp-label">Poupança ${MONTHS_SHORT[cm]}</div>
      <div class="comp-val">${fmtF(currSav)}</div>
      <div class="comp-prev">${MONTHS_SHORT[pm]}: ${fmtF(prevSav)}</div>
      ${currSav > prevSav && prevSav > 0 ? `<div class="comp-diff" style="color:var(--green)">↑ Guardando mais 🎉</div>` :
        currSav > 0 ? `<div class="comp-diff" style="color:var(--text3)">Continue assim!</div>` :
        `<div class="comp-diff" style="color:var(--text3)">Comece a poupar!</div>`}
    </div>
  `;
}

// ════════════════════════════════════════════════
//  BAR CHART
// ════════════════════════════════════════════════
function renderBarChart(bills) {
  const wrap = document.getElementById('barChartWrap');
  if (!wrap) return;

  const catT = {};
  bills.forEach(b => { catT[b.cat] = (catT[b.cat]||0) + b.amount; });
  const sorted = Object.entries(catT).sort((a,b) => b[1]-a[1]).slice(0, 8);

  if (!sorted.length) {
    wrap.innerHTML = '<div class="chart-empty">Nenhum dado para exibir. Adicione despesas ao mês.</div>';
    return;
  }

  const max    = sorted[0][1];
  const rowH   = 36;
  const gap    = 8;
  const labelW = 92;
  const valueW = 72;
  const W      = 460;
  const barZoneW = W - labelW - valueW - 8;
  const totalH = sorted.length * (rowH + gap) - gap + 4;

  let svg = `<svg viewBox="0 0 ${W} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">`;

  sorted.forEach(([catId, val], i) => {
    const cat  = getCat(catId);
    const barW = max > 0 ? (val / max) * barZoneW : 0;
    const y    = i * (rowH + gap);
    const midY = y + rowH / 2;
    const pct  = max > 0 ? Math.round((val/max)*100) : 0;

    // BG track
    svg += `<rect x="${labelW}" y="${y + 8}" width="${barZoneW}" height="${rowH - 16}" rx="5" fill="var(--bg2)" opacity="0.6"/>`;
    // Fill bar
    svg += `<rect x="${labelW}" y="${y + 8}" width="${Math.max(barW, 4)}" height="${rowH - 16}" rx="5" fill="${cat.color}" opacity="0.82" style="transition:width .7s cubic-bezier(.4,0,.2,1)"/>`;
    // Category label
    const lbl = cat.label.length > 10 ? cat.label.slice(0, 9) + '…' : cat.label;
    svg += `<text x="${labelW - 7}" y="${midY + 4.5}" fill="var(--text2)" font-family="system-ui" font-size="11.5" font-weight="600" text-anchor="end">${lbl}</text>`;
    // Value
    const valStr = val >= 1000 ? 'R$' + (val/1000).toFixed(1) + 'K' : fmtF(val);
    svg += `<text x="${labelW + barZoneW + 8}" y="${midY + 4.5}" fill="var(--text)" font-family="system-ui" font-size="11.5" font-weight="700">${valStr}</text>`;
  });

  svg += '</svg>';
  wrap.innerHTML = svg;
}

// ════════════════════════════════════════════════
//  DONUT CHART (refactored to accept bills param)
// ════════════════════════════════════════════════
function renderDonut(bills, d) {
  const tot  = bills.reduce((s,b) => s+b.amount, 0);
  const catT = {};
  bills.forEach(b => { catT[b.cat] = (catT[b.cat]||0) + b.amount; });
  const ents = Object.entries(catT).sort((a,b) => b[1]-a[1]);

  if (!ents.length) {
    const dsvEl = document.getElementById('donutSVG');
    const legEl = document.getElementById('legend');
    if (dsvEl) dsvEl.innerHTML = `<circle cx="74" cy="74" r="54" fill="none" stroke="var(--border2)" stroke-width="20"/>
      <text x="74" y="70" text-anchor="middle" fill="var(--text3)" font-family="system-ui" font-size="10">SEM</text>
      <text x="74" y="86" text-anchor="middle" fill="var(--text3)" font-family="system-ui" font-size="9">DADOS</text>`;
    if (legEl) legEl.innerHTML = '<p style="font-size:13px;color:var(--text3);text-align:center">Adicione contas para ver.</p>';
    return;
  }

  const R=54, CX=74, CY=74, SW=20, ci=2*Math.PI*R;
  let off=0, svg=`<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--border2)" stroke-width="${SW}"/>`;
  ents.forEach(([catId, val]) => {
    const c    = getCat(catId);
    const dash = (val/tot)*ci;
    svg += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${c.color}" stroke-width="${SW}"
      stroke-dasharray="${dash} ${ci}" stroke-dashoffset="${-off}"
      transform="rotate(-90 ${CX} ${CY})" style="transition:all .8s"/>`;
    off += dash;
  });
  svg += `<text x="${CX}" y="${CY-4}" text-anchor="middle" fill="var(--text)" font-family="system-ui" font-size="11" font-weight="800">
    R$${tot>=1000?(tot/1000).toFixed(1)+'K':Math.round(tot)}</text>
    <text x="${CX}" y="${CY+11}" text-anchor="middle" fill="var(--text3)" font-family="system-ui" font-size="9">TOTAL</text>`;

  const dsvEl = document.getElementById('donutSVG');
  if (dsvEl) dsvEl.innerHTML = svg;
  const legEl = document.getElementById('legend');
  if (legEl) legEl.innerHTML = ents.slice(0,6).map(([catId, val]) => {
    const c = getCat(catId);
    return `<div class="li"><div class="ld" style="background:${c.color}"></div>
      <div class="ln">${c.label}</div>
      <div class="lp" style="color:${c.color}">${Math.round((val/tot)*100)}%</div>
      <div class="lv">${fmtF(val)}</div></div>`;
  }).join('');
}

// ════════════════════════════════════════════════
//  LINE CHART
// ════════════════════════════════════════════════
function renderLineChart() {
  const wrap = document.getElementById('lineChartWrap');
  if (!wrap) return;

  const validMonths = getValidMonths();
  const months = validMonths.slice(0, 7).reverse();

  if (months.length < 2) {
    wrap.innerHTML = '<div class="chart-empty">Histórico insuficiente. Continue registrando seus gastos mensalmente.</div>';
    return;
  }

  const data = months.map(key => {
    const d = state.months[key] || {};
    return {
      key,
      label: MONTHS_SHORT[parseKey(key).month],
      total:  totalBills(d),
      renda:  totalRenda(d),
      saving: d.savingsContrib || 0
    };
  });

  const maxVal = Math.max(...data.map(d => Math.max(d.total, d.renda)), 100);

  const W = 540, H = 180;
  const padL = 54, padR = 16, padT = 16, padB = 38;
  const cW   = W - padL - padR;
  const cH   = H - padT - padB;
  const step = data.length > 1 ? cW / (data.length - 1) : cW;

  const toX = i => padL + i * step;
  const toY = v => padT + cH - Math.max(0, Math.min(1, v / maxVal)) * cH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">`;

  // Grid lines + Y labels
  for (let i = 0; i <= 4; i++) {
    const y   = padT + (cH / 4) * i;
    const val = maxVal * (1 - i / 4);
    const lbl = val >= 1000 ? (val/1000).toFixed(0) + 'K' : Math.round(val).toString();
    svg += `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="var(--border)" stroke-width="1" opacity="0.6"/>`;
    svg += `<text x="${padL - 5}" y="${y + 4}" fill="var(--text3)" font-family="system-ui" font-size="10" text-anchor="end">${lbl}</text>`;
  }

  // Area fill under spending line
  const areaPoints = data.map((d,i) => `${toX(i)},${toY(d.total)}`).join(' ');
  const areaPath   = `M ${toX(0)},${toY(data[0].total)} ` +
    data.slice(1).map((d,i) => `L ${toX(i+1)},${toY(d.total)}`).join(' ') +
    ` L ${toX(data.length-1)},${padT+cH} L ${padL},${padT+cH} Z`;
  svg += `<path d="${areaPath}" fill="var(--red)" opacity="0.07"/>`;

  // Renda line (green dashed)
  const rendaD = data.map((d,i) => `${i===0?'M':'L'} ${toX(i)} ${toY(d.renda)}`).join(' ');
  svg += `<path d="${rendaD}" fill="none" stroke="var(--green)" stroke-width="1.8" stroke-dasharray="5 3" opacity="0.65"/>`;

  // Expenses line (red solid)
  const totalD = data.map((d,i) => `${i===0?'M':'L'} ${toX(i)} ${toY(d.total)}`).join(' ');
  svg += `<path d="${totalD}" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

  // Points + X labels
  data.forEach((d, i) => {
    const x = toX(i), y = toY(d.total);
    svg += `<circle cx="${x}" cy="${y}" r="4" fill="var(--surface)" stroke="var(--red)" stroke-width="2.5"/>`;
    // Value label on hover area (show on top points)
    if (data.length <= 6) {
      const valStr = d.total >= 1000 ? (d.total/1000).toFixed(1)+'K' : Math.round(d.total).toString();
      svg += `<text x="${x}" y="${y - 9}" fill="var(--text2)" font-family="system-ui" font-size="10" font-weight="700" text-anchor="middle">${valStr}</text>`;
    }
    svg += `<text x="${x}" y="${H - padB + 16}" fill="var(--text3)" font-family="system-ui" font-size="11" text-anchor="middle" font-weight="600">${d.label}</text>`;
  });

  // Legend
  const legY = H - 6;
  svg += `<rect x="${padL}" y="${legY - 6}" width="14" height="3" rx="2" fill="var(--red)"/>`;
  svg += `<text x="${padL + 18}" y="${legY}" fill="var(--text3)" font-family="system-ui" font-size="10">Despesas</text>`;
  svg += `<rect x="${padL + 74}" y="${legY - 6}" width="14" height="3" rx="2" fill="var(--green)"/>`;
  svg += `<text x="${padL + 92}" y="${legY}" fill="var(--text3)" font-family="system-ui" font-size="10">Renda</text>`;

  svg += '</svg>';
  wrap.innerHTML = svg;
}

// ════════════════════════════════════════════════
//  AUTO INSIGHTS ENGINE
// ════════════════════════════════════════════════
function renderAutoInsights(d, bills) {
  const el = document.getElementById('insightsSection');
  if (!el) return;

  const renda    = totalRenda(d);
  const total    = totalBills(d);
  const savC     = d.savingsContrib || 0;
  const insights = [];

  // ── Top category
  const catT = {};
  bills.forEach(b => { catT[b.cat] = (catT[b.cat]||0) + b.amount; });
  const topCatEntry = Object.entries(catT).sort((a,b) => b[1]-a[1])[0];
  if (topCatEntry) {
    const cat = getCat(topCatEntry[0]);
    const pct = renda > 0 ? Math.round((topCatEntry[1]/renda)*100) : 0;
    insights.push({
      color: cat.color,
      icon: cat.svg,
      title: `Maior gasto: ${cat.label}`,
      text: `Você gastou ${fmtF(topCatEntry[1])} com ${cat.label} este mês${pct > 0 ? ` — ${pct}% da sua renda` : ''}.`,
      type: pct > 35 ? 'warn' : 'info'
    });
  }

  // ── Month over month comparison
  const validMonths = getValidMonths();
  const currIdx  = validMonths.indexOf(activeMonth);
  const prevKey  = validMonths[currIdx + 1];
  if (prevKey) {
    const prev      = state.months[prevKey] || {};
    const prevTotal = totalBills(prev);
    if (prevTotal > 0 && total > 0) {
      const diff    = ((total - prevTotal) / prevTotal) * 100;
      const {month} = parseKey(prevKey);
      if (Math.abs(diff) > 3) {
        insights.push({
          color: diff > 0 ? 'var(--red)' : 'var(--green)',
          icon: diff > 0
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 2 17"/><polyline points="17 6 23 6 23 12"/></svg>',
          title: diff > 0 ? `Gastos ${Math.abs(Math.round(diff))}% maiores que ${MONTHS_SHORT[month]}` : `Gastos ${Math.abs(Math.round(diff))}% menores que ${MONTHS_SHORT[month]}`,
          text: `${diff > 0 ? 'Seus gastos aumentaram' : 'Seus gastos reduziram'} de ${fmtF(prevTotal)} para ${fmtF(total)} em comparação ao mês anterior.`,
          type: diff > 0 ? 'warn' : 'success'
        });
      }
    }
  }

  // ── Savings rate
  if (renda > 0) {
    const savPct = Math.round((savC / renda) * 100);
    if (savC > 0) {
      insights.push({
        color: savPct >= 20 ? 'var(--green)' : 'var(--violet)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        title: `Taxa de poupança: ${savPct}%`,
        text: `Você guardou ${fmtF(savC)} este mês. ${savPct >= 20 ? '🎉 Excelente! Acima da meta de 20% recomendada.' : savPct >= 10 ? 'Bom progresso! Tente chegar em 20% da renda.' : `Meta sugerida: ${fmtF(renda * 0.2)} (20% da renda).`}`,
        type: savPct >= 20 ? 'success' : 'info'
      });
    } else {
      insights.push({
        color: 'var(--amber)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        title: 'Sem poupança este mês',
        text: `Você ainda não guardou dinheiro. Tente separar ao menos ${fmtF(renda * 0.1)} (10%) a ${fmtF(renda * 0.2)} (20%) da sua renda.`,
        type: 'warn'
      });
    }
  }

  // ── Budget commitment
  if (renda > 0) {
    const commitment = ((total + savC) / renda) * 100;
    if (commitment > 90) {
      insights.push({
        color: 'var(--red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        title: `${Math.round(commitment)}% da renda comprometida`,
        text: `Quase toda sua renda está alocada. Revise categorias como Lazer, Streaming ou Outros para liberar espaço no orçamento.`,
        type: 'danger'
      });
    } else if (commitment < 50 && renda > 0 && total > 0) {
      insights.push({
        color: 'var(--green)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        title: `Apenas ${Math.round(commitment)}% da renda comprometida`,
        text: `Ótima gestão financeira! Você tem ${fmtF(renda - total - savC)} livres. Considere aumentar sua poupança.`,
        type: 'success'
      });
    }
  }

  // ── Unpaid bills
  const allBills = (activeData().bills || []);
  const unpaid   = allBills.filter(b => !b.paid);
  if (unpaid.length > 0) {
    const unpaidTotal = unpaid.reduce((s,b) => s+b.amount, 0);
    const overdue     = unpaid.filter(b => b.due && b.due < new Date().getDate());
    insights.push({
      color: overdue.length > 0 ? 'var(--red)' : 'var(--amber)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      title: `${unpaid.length} conta${unpaid.length > 1 ? 's' : ''} pendente${unpaid.length > 1 ? 's' : ''} · ${fmtF(unpaidTotal)}`,
      text: overdue.length > 0
        ? `${overdue.length} conta${overdue.length > 1 ? 's' : ''} ${overdue.length > 1 ? 'estão' : 'está'} vencida${overdue.length > 1 ? 's' : ''}: ${overdue.map(b => b.name).join(', ')}.`
        : `Marque as contas como pagas conforme efetuar os pagamentos para manter o controle atualizado.`,
      type: overdue.length > 0 ? 'danger' : 'warn'
    });
  } else if (allBills.length > 0 && allBills.every(b => b.paid)) {
    insights.push({
      color: 'var(--green)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      title: 'Todas as contas pagas! 🎉',
      text: 'Parabéns! Você quitou todas as contas deste mês. Seu histórico de pagamentos está impecável.',
      type: 'success'
    });
  }

  // ── Leisure overspending
  const lazer = allBills.filter(b => b.cat === 'lazer').reduce((s,b) => s+b.amount, 0);
  if (lazer > 0 && renda > 0 && (lazer/renda) > 0.15) {
    insights.push({
      color: 'var(--amber)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
      title: `Lazer em ${Math.round((lazer/renda)*100)}% da renda`,
      text: `Você gastou ${fmtF(lazer)} com lazer este mês. O recomendado é até 15% (${fmtF(renda * 0.15)}). Considere equilibrar com necessidades.`,
      type: 'warn'
    });
  }

  if (!insights.length) {
    insights.push({
      color: 'var(--primary)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      title: 'Registre seus gastos',
      text: 'Adicione despesas do mês para receber insights personalizados sobre suas finanças e padrões de gastos.',
      type: 'info'
    });
  }

  el.innerHTML = insights.map(ins => `
    <div class="insight-card" style="border-left-color:${ins.color}">
      <div class="insight-icon" style="color:${ins.color};background:${ins.color}18">${ins.icon}</div>
      <div class="insight-content">
        <div class="insight-title">${ins.title}</div>
        <div class="insight-text">${ins.text}</div>
      </div>
    </div>
  `).join('');
}

// ════════════════════════════════════════════════
//  RENDER HISTÓRICO
// ════════════════════════════════════════════════
function renderHistorico() {
  const {year} = parseKey(activeMonth);
  document.getElementById('histSub').textContent       = 'Visão geral de ' + year;
  document.getElementById('histYearLabel').textContent  = '📅 ' + year;
  document.getElementById('histSavings').textContent    = fmtF(state.savings || 0);
  document.getElementById('histSavingsSub').textContent = state.savings > 0 ? 'Parabéns por estar poupando! 🎉' : 'Comece a poupar hoje!';

  const allValid = getValidMonths();
  const yearKeys = allValid.filter(k => parseKey(k).year === year);

  document.getElementById('historyGrid').innerHTML = yearKeys.map(key => {
    const {month}  = parseKey(key);
    const isCurr   = key === TODAY_KEY;
    const d        = state.months[key];
    const isEmpty  = !d || (!d.income && !(d.bills||[]).length && !(d.extras||[]).length);

    if (isEmpty) {
      return `<div class="hcard${isCurr?' is-current':''}" onclick="switchToMonth('${key}')">
        <span class="hcard-badge ${isCurr?'badge-curr':'badge-mpty'}">${isCurr?'Atual':'Vazio'}</span>
        <div class="hcard-month">${MONTHS_PT[month]}</div>
        <div class="hcard-year">${year}</div>
        <div class="hcard-empty">Nenhum dado registrado ainda.</div>
      </div>`;
    }

    const renda     = totalRenda(d);
    const total     = totalBills(d);
    const savC      = d.savingsContrib || 0;
    const saldo     = saldoLivre(d);
    const pct       = renda > 0 ? Math.min(Math.round(((total+savC)/renda)*100), 100) : 0;
    const saldoColor = saldo >= 0 ? 'var(--green)' : 'var(--red)';
    const barColor   = pct>80 ? 'var(--red)' : pct>60 ? 'var(--amber)' : 'var(--green)';

    return `<div class="hcard${isCurr?' is-current':''}" onclick="switchToMonth('${key}')">
      <span class="hcard-badge ${isCurr?'badge-curr':'badge-data'}">${isCurr?'Atual':'✓ Dados'}</span>
      <div class="hcard-month">${MONTHS_PT[month]}</div>
      <div class="hcard-year">${year}</div>
      <div class="hcard-row"><span>Renda</span><span>${fmt(renda)}</span></div>
      <div class="hcard-row"><span>Despesas</span><span>${fmt(total)}</span></div>
      ${savC>0?`<div class="hcard-row"><span>Poupado</span><span style="color:var(--violet)">${fmt(savC)}</span></div>`:''}
      <div class="hcard-bar"><div class="hcard-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
      <div class="hcard-bal">
        <span class="hcard-bal-label">Saldo livre</span>
        <span class="hcard-bal-val" style="color:${saldoColor}">${fmt(saldo)}</span>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════
function showToast(msg, type='ok') {
  const el  = document.createElement('div');
  el.className = 'toast';
  const col = type==='err' ? 'var(--red)' : 'var(--green)';
  const ico = type==='err'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  el.innerHTML = ico + `<span>${msg}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════
load();
applyTheme(state.theme);
buildCats();
renderAll();
initSplash();
initGoalTypeGrid();
updateNotifBtn();

// ════════════════════════════════════════════════
//  PWA — SERVICE WORKER REGISTRATION
// ════════════════════════════════════════════════
let swRegistration    = null;
let deferredInstallPrompt = null;

function initPWA() {
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service Workers not supported');
    return;
  }

  // Register service worker
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => {
        swRegistration = reg;
        console.log('[PWA] Service Worker registered. Scope:', reg.scope);

        // ── Check for waiting SW (update ready)
        if (reg.waiting) showUpdateBanner(reg.waiting);

        // ── Listen for new SW installing
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(newWorker);
            }
          });
        });
      })
      .catch(err => console.error('[PWA] Service Worker registration failed:', err));

    // ── Listen for controller change (SW activated after update)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });

    // ── Listen for messages from SW
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        showToast('Dados sincronizados! ✓');
      }
    });
  });

  // ── Handle shortcuts from manifest
  const urlParams = new URLSearchParams(window.location.search);
  const action    = urlParams.get('action');
  if (action === 'new-bill') {
    setTimeout(() => openModal(), 300);
  } else if (action === 'analise') {
    setTimeout(() => goTo('analise', document.querySelectorAll('.nav-btn')[2]), 300);
  }
}

// ── UPDATE BANNER ─────────────────────────────────
function showUpdateBanner(worker) {
  const banner  = document.getElementById('pwaUpdateBanner');
  const btn     = document.getElementById('pwaUpdateBtn');
  const closeBtn = document.getElementById('pwaUpdateClose');
  if (!banner) return;

  banner.style.display = 'flex';

  btn.addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
    banner.style.display = 'none';
  });

  closeBtn.addEventListener('click', () => {
    banner.style.display = 'none';
  });
}

// ── INSTALL PROMPT ────────────────────────────────
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;

  // Don't show if already dismissed this session
  if (sessionStorage.getItem('pwa-install-dismissed')) return;
  // Don't show if already installed (standalone mode)
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  // Delay showing the banner for a better UX moment
  setTimeout(() => showInstallBanner(), 2500);
});

function showInstallBanner() {
  const banner   = document.getElementById('pwaInstallBanner');
  const installBtn = document.getElementById('pwaInstallBtn');
  const closeBtn   = document.getElementById('pwaInstallClose');
  if (!banner || !deferredInstallPrompt) return;

  banner.style.display = 'flex';

  installBtn.addEventListener('click', async () => {
    banner.style.display = 'none';
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('FinWise instalado com sucesso! 🎉');
      deferredInstallPrompt = null;
    } else {
      sessionStorage.setItem('pwa-install-dismissed', '1');
    }
  });

  closeBtn.addEventListener('click', () => {
    banner.style.display = 'none';
    sessionStorage.setItem('pwa-install-dismissed', '1');
  });
}

// Fired when app is successfully installed
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.style.display = 'none';
  showToast('FinWise instalado! Acesse pelo seu dispositivo 🚀');
});

// ── ONLINE / OFFLINE ─────────────────────────────
function updateOnlineStatus() {
  const indicator = document.getElementById('offlineIndicator');
  const statusPill = document.querySelector('.status-pill');
  const statusDot  = document.querySelector('.status-dot');
  const statusSpan = document.querySelector('.status-pill span');

  if (!navigator.onLine) {
    if (indicator) indicator.style.display = 'flex';
    if (statusPill) statusPill.style.background = 'var(--amber-l)';
    if (statusDot)  statusDot.style.background  = 'var(--amber)';
    if (statusSpan) statusSpan.textContent       = 'Offline';
    if (statusPill) statusPill.style.color       = 'var(--amber)';
  } else {
    if (indicator) indicator.style.display = 'none';
    if (statusPill) statusPill.style.background = 'var(--green-l)';
    if (statusDot)  statusDot.style.background  = 'var(--green)';
    if (statusSpan) statusSpan.textContent       = 'Sincronizado';
    if (statusPill) statusPill.style.color       = 'var(--green)';
  }
}

window.addEventListener('online',  () => { updateOnlineStatus(); showToast('Conexão restaurada! ✓'); });
window.addEventListener('offline', () => { updateOnlineStatus(); showToast('Você está offline. Dados salvos localmente.', 'err'); });
updateOnlineStatus();

// ── THEME COLOR SYNC (updates browser chrome) ────
function syncThemeColor(theme) {
  const meta = document.getElementById('metaThemeColor');
  if (!meta) return;
  meta.content = theme === 'dark' ? '#0f0e0d' : '#2563eb';
}

// Patch toggleTheme to also sync meta theme-color
const _origToggleTheme = toggleTheme;
// Override toggleTheme to also call syncThemeColor
window.toggleTheme = function() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme(state.theme);
  syncThemeColor(state.theme);
  save();
};
syncThemeColor(state.theme);

// ── SHARE API (native share if available) ─────────
function shareReport() {
  if (!navigator.share) return false;
  const d     = activeData();
  const renda = totalRenda(d);
  const total = totalBills(d);
  const savC  = d.savingsContrib || 0;
  const {year, month} = parseKey(activeMonth);

  navigator.share({
    title: `FinWise — ${MONTHS_PT[month]} ${year}`,
    text:  `📊 Relatório ${MONTHS_PT[month]} ${year}\n💰 Renda: ${fmtF(renda)}\n💸 Despesas: ${fmtF(total)}\n🏦 Poupado: ${fmtF(savC)}\n✅ Saldo: ${fmtF(renda-total-savC)}`,
    url:   window.location.href
  }).catch(() => {});
  return true;
}

// ── INIT PWA ─────────────────────────────────────
initPWA();
// ════════════════════════════════════════════════
//  SPLASH SCREEN
// ════════════════════════════════════════════════
function initSplash() {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;

  // Only show splash if PWA standalone mode
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  if (isStandalone) {
    // Show splash for 2s then fade out
    setTimeout(() => {
      splash.classList.add('hide');
      setTimeout(() => {
        splash.style.display = 'none';
        if (!state.onboardingDone) showOnboarding();
      }, 500);
    }, 1800);
  } else {
    // On browser just hide quickly and check onboarding
    splash.style.display = 'none';
    if (!state.onboardingDone) {
      setTimeout(() => showOnboarding(), 600);
    }
  }
}

// ════════════════════════════════════════════════
//  ONBOARDING
// ════════════════════════════════════════════════
let obTheme = 'light';

function showOnboarding() {
  const ov = document.getElementById('onboardingOverlay');
  if (!ov) return;
  ov.style.display = 'flex';
  ov.classList.add('open');
  obTheme = state.theme;
  document.getElementById('ob-step-1').classList.add('active');
}

function obNext(step) {
  // Save income if on step 2
  if (step === 3) {
    const inc = parseFloat(document.getElementById('obIncome')?.value);
    if (inc > 0) {
      activeData().income = inc;
      save();
    }
  }
  // Update theme if step 3
  if (step === 4) {
    state.theme = obTheme;
    applyTheme(obTheme);
    save();
  }

  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('ob-step-' + step);
  if (el) el.classList.add('active');

  const fills = { 1: '25%', 2: '50%', 3: '75%', 4: '100%' };
  document.getElementById('obProgressFill').style.width = fills[step] || '25%';
}

function obSelectTheme(t) {
  obTheme = t;
  document.getElementById('obThemeLight').classList.toggle('sel', t === 'light');
  document.getElementById('obThemeDark').classList.toggle('sel', t === 'dark');
  // Live preview
  applyTheme(t);
}

function obFinish(enableNotif) {
  state.onboardingDone = true;
  state.theme = obTheme;
  applyTheme(obTheme);
  save();

  const ov = document.getElementById('onboardingOverlay');
  ov.classList.remove('open');
  setTimeout(() => { ov.style.display = 'none'; }, 300);

  if (enableNotif) {
    requestNotifPermission();
  }
  renderAll();
  showToast('Bem-vindo ao FinWise! 🎉');
}

// ════════════════════════════════════════════════
//  HAPTIC FEEDBACK
// ════════════════════════════════════════════════
function triggerHaptic(type = 'light') {
  if (!navigator.vibrate) return;
  const patterns = {
    light:   [15],
    medium:  [30],
    success: [20, 40, 20],
    error:   [50, 30, 50]
  };
  navigator.vibrate(patterns[type] || [15]);
}

// ════════════════════════════════════════════════
//  LOCAL NOTIFICATIONS
// ════════════════════════════════════════════════
function updateNotifBtn() {
  const btn = document.getElementById('notifBtn');
  if (!btn) return;
  const enabled = state.notifEnabled && Notification.permission === 'granted';
  btn.classList.toggle('active', enabled);

  // Check if there are upcoming bills
  const d = state.months[TODAY_KEY] || {};
  const today = NOW.getDate();
  const upcoming = (d.bills || []).filter(b => !b.paid && b.due && b.due >= today && b.due <= today + 7);
  btn.classList.toggle('has-pending', upcoming.length > 0);
}

function toggleNotifications() {
  if (!('Notification' in window)) { showToast('Notificações não suportadas neste navegador.', 'err'); return; }
  if (!state.notifEnabled || Notification.permission !== 'granted') {
    requestNotifPermission();
  } else {
    state.notifEnabled = false;
    save();
    updateNotifBtn();
    showToast('Notificações desativadas.');
  }
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    state.notifEnabled = true;
    save();
    updateNotifBtn();
    showToast('Notificações ativadas! 🔔');
    scheduleLocalNotifications();
  } else {
    showToast('Permissão de notificação negada.', 'err');
  }
}

function scheduleLocalNotifications() {
  if (Notification.permission !== 'granted') return;
  const d = state.months[TODAY_KEY] || {};
  const today = NOW.getDate();
  const upcoming = (d.bills || []).filter(b => !b.paid && b.due && b.due >= today && b.due <= today + 5);
  if (!upcoming.length) return;

  const names = upcoming.map(b => b.name).join(', ');
  const total = upcoming.reduce((s,b) => s + b.amount, 0);
  new Notification('FinWise — Contas a vencer', {
    body: `${upcoming.length} conta(s) vencem em breve: ${names}. Total: ${fmtF(total)}`,
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-72x72.png',
    tag: 'finwise-bills'
  });
}

// Check notifications on load + daily
function checkUpcomingBillsNotif() {
  if (!state.notifEnabled || Notification.permission !== 'granted') return;
  const lastCheck = localStorage.getItem('fw_notif_check');
  const today = NOW.toDateString();
  if (lastCheck === today) return;
  localStorage.setItem('fw_notif_check', today);
  scheduleLocalNotifications();
}
checkUpcomingBillsNotif();

// ════════════════════════════════════════════════
//  SWIPE GESTURES (bills)
// ════════════════════════════════════════════════
let swipeData = { el: null, startX: 0, startY: 0, id: 0, moved: false };

function attachSwipeListeners(container) {
  container.querySelectorAll('.bill-item').forEach(item => {
    if (item.dataset.swipeInit) return;
    item.dataset.swipeInit = '1';
    const idStr = item.querySelector('.ck-btn') ?.getAttribute('onclick') ?.match(/\d+/)?.[0];
    if (!idStr) return;
    const id = parseInt(idStr);

    item.addEventListener('touchstart', e => {
      swipeData = { el: item, startX: e.touches[0].clientX, startY: e.touches[0].clientY, id, moved: false };
    }, { passive: true });

    item.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - swipeData.startX;
      const dy = e.touches[0].clientY - swipeData.startY;
      if (Math.abs(dy) > 20 && !swipeData.moved) return;
      swipeData.moved = true;
      const clamp = v => Math.max(-140, Math.min(140, v));
      item.style.transform = `translateX(${clamp(dx)}px)`;
      item.classList.toggle('swipe-right-hint', dx > 30);
      item.classList.toggle('swipe-left-hint', dx < -30);
    }, { passive: true });

    item.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - swipeData.startX;
      item.style.transform = '';
      item.classList.remove('swipe-right-hint', 'swipe-left-hint');
      if (!swipeData.moved) return;
      if (dx > 70)       { togglePaid(id); }
      else if (dx < -70) { delBill(id); }
    }, { passive: true });
  });
}

// Re-attach on every render
const _origRenderBills = renderBills;
window.renderBills = function() {
  _origRenderBills();
  setTimeout(() => {
    attachSwipeListeners(document.getElementById('billsList'));
    attachSwipeListeners(document.getElementById('recentList'));
  }, 50);
};

// ════════════════════════════════════════════════
//  GOALS — DATA & TYPES
// ════════════════════════════════════════════════
const GOAL_TYPES = [
  { id: 'moto',      emoji: '🏍️', label: 'Moto',      color: '#ef4444', illusSVG: () => goalIllusMoto() },
  { id: 'carro',     emoji: '🚗', label: 'Carro',     color: '#f97316', illusSVG: () => goalIllusCarro() },
  { id: 'viagem',    emoji: '✈️', label: 'Viagem',    color: '#0ea5e9', illusSVG: () => goalIllusViagem() },
  { id: 'imovel',    emoji: '🏠', label: 'Casa',      color: '#2563eb', illusSVG: () => goalIllusImovel() },
  { id: 'eletronico',emoji: '💻', label: 'Eletrônico',color: '#8b5cf6', illusSVG: () => goalIllusEletronico() },
  { id: 'educacao',  emoji: '🎓', label: 'Educação',  color: '#10b981', illusSVG: () => goalIllusEducacao() },
  { id: 'casamento', emoji: '💍', label: 'Casamento', color: '#ec4899', illusSVG: () => goalIllusCasamento() },
  { id: 'negocio',   emoji: '🚀', label: 'Negócio',   color: '#14b8a6', illusSVG: () => goalIllusNegocio() },
  { id: 'emergencia',emoji: '🛡️', label: 'Reserva',   color: '#f59e0b', illusSVG: () => goalIllusEmergencia() },
  { id: 'outro',     emoji: '⭐', label: 'Outro',     color: '#64748b', illusSVG: () => goalIllusOutro() },
];

function getGoalType(id) { return GOAL_TYPES.find(g => g.id === id) || GOAL_TYPES.at(-1); }

// ════════════════════════════════════════════════
//  GOAL CATEGORIES (independent of goal type/icon)
// ════════════════════════════════════════════════
const GOAL_CATEGORIES = [
  { id: 'saude',      emoji: '❤️',  label: 'Saúde',       color: '#10b981' },
  { id: 'estudos',    emoji: '📚',  label: 'Estudos',     color: '#eab308' },
  { id: 'financeiro', emoji: '💰',  label: 'Financeiro',  color: '#2563eb' },
  { id: 'carreira',   emoji: '💼',  label: 'Carreira',    color: '#8b5cf6' },
  { id: 'pessoal',    emoji: '🌟',  label: 'Pessoal',     color: '#ec4899' },
  { id: 'lazer',      emoji: '🎉',  label: 'Lazer',       color: '#f97316' },
];

function getGoalCategory(id) {
  return GOAL_CATEGORIES.find(c => c.id === id) || null;
}

// State: active category filter on metas page ('' = all)
let activeGoalCatFilter = '';

function setGoalCatFilter(id) {
  activeGoalCatFilter = id;
  // Update chip UI
  document.querySelectorAll('.goal-filter-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.cat === id);
  });
  renderGoalsList();
}

// Re-render only the list (not summary counters) with current filter
function renderGoalsList() {
  const list  = document.getElementById('goalsList');
  if (!list) return;
  const goals = state.goals || [];
  const filtered = activeGoalCatFilter
    ? goals.filter(g => g.category === activeGoalCatFilter)
    : goals;

  if (!goals.length) {
    list.innerHTML = `<div class="goals-empty">
      <span class="ge-emoji">🎯</span>
      <h3>Nenhuma meta ainda</h3>
      <p>Defina seus objetivos financeiros — moto, viagem, casa — e veja como alcançá-los mês a mês.</p>
      <button class="btn btn-primary" onclick="openNewGoalModal()">+ Criar primeira meta</button>
    </div>`;
    return;
  }

  if (!filtered.length) {
    const cat = getGoalCategory(activeGoalCatFilter);
    list.innerHTML = `<div class="goals-empty">
      <span class="ge-emoji">${cat ? cat.emoji : '🔍'}</span>
      <h3>Nenhuma meta nesta categoria</h3>
      <p>Você ainda não tem metas em "${cat ? cat.label : activeGoalCatFilter}". Crie uma nova ou escolha outra categoria.</p>
      <button class="btn btn-ghost btn-sm" onclick="setGoalCatFilter('')">Ver todas as metas</button>
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(g => goalCardHTML(g)).join('');
}

// ── GOAL ILLUSTRATIONS (SVG paths for bg watermark)
function goalIllusMoto() {
  return `<svg viewBox="0 0 260 140" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="56" cy="108" rx="34" ry="34" fill="none" stroke="currentColor" stroke-width="12"/>
    <ellipse cx="56" cy="108" rx="14" ry="14"/>
    <ellipse cx="196" cy="108" rx="34" ry="34" fill="none" stroke="currentColor" stroke-width="12"/>
    <ellipse cx="196" cy="108" rx="14" ry="14"/>
    <path d="M90 108 L80 68 L130 58 L160 78 L190 78" stroke="currentColor" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M130 58 L140 40 L160 40 L165 58" stroke="currentColor" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M80 68 L68 68" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
    <ellipse cx="126" cy="68" rx="6" ry="6"/>
  </svg>`;
}
function goalIllusCarro() {
  return `<svg viewBox="0 0 260 130" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="70" width="220" height="45" rx="10" stroke-width="10"/>
    <path d="M50 70 L80 35 L180 35 L210 70" stroke-width="10" stroke-linejoin="round"/>
    <ellipse cx="68" cy="118" rx="22" ry="22" stroke-width="10"/>
    <ellipse cx="192" cy="118" rx="22" ry="22" stroke-width="10"/>
    <line x1="105" y1="35" x2="100" y2="70" stroke-width="8"/>
    <line x1="155" y1="35" x2="160" y2="70" stroke-width="8"/>
  </svg>`;
}
function goalIllusViagem() {
  return `<svg viewBox="0 0 260 140" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="130" cy="90" rx="95" ry="35" stroke-width="8"/>
    <path d="M130 55 Q170 20 200 30 Q175 50 165 70 Q145 60 130 55Z" stroke-width="7" stroke-linejoin="round"/>
    <path d="M130 55 Q90 20 60 30 Q85 50 95 70 Q115 60 130 55Z" stroke-width="7" stroke-linejoin="round"/>
    <line x1="130" y1="15" x2="130" y2="125" stroke-width="7"/>
    <ellipse cx="130" cy="90" rx="20" ry="8" stroke-width="6"/>
  </svg>`;
}
function goalIllusImovel() {
  return `<svg viewBox="0 0 240 150" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
    <polygon points="120,20 30,75 210,75" stroke-width="10" stroke-linejoin="round"/>
    <rect x="50" y="75" width="140" height="65" stroke-width="10"/>
    <rect x="90" y="95" width="35" height="45" stroke-width="8"/>
    <rect x="140" y="95" width="30" height="30" stroke-width="7"/>
  </svg>`;
}
function goalIllusEletronico() {
  return `<svg viewBox="0 0 240 160" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
    <rect x="30" y="20" width="180" height="115" rx="12" stroke-width="10"/>
    <rect x="50" y="38" width="140" height="78" rx="6" stroke-width="6"/>
    <rect x="90" y="140" width="60" height="10" rx="4" stroke-width="6"/>
    <line x1="80" y1="150" x2="160" y2="150" stroke-width="8" stroke-linecap="round"/>
  </svg>`;
}
function goalIllusEducacao() {
  return `<svg viewBox="0 0 240 150" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
    <polygon points="120,20 220,65 120,110 20,65" stroke-width="9" stroke-linejoin="round"/>
    <path d="M60 85 L60 125 Q120 145 180 125 L180 85" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="220" y1="65" x2="220" y2="110" stroke-width="9" stroke-linecap="round"/>
    <circle cx="220" cy="118" r="10" fill="currentColor" opacity=".6"/>
  </svg>`;
}
function goalIllusCasamento() {
  return `<svg viewBox="0 0 240 150" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M120 130 L40 60 Q30 30 60 30 Q85 30 120 65 Q155 30 180 30 Q210 30 200 60 Z" stroke-width="9" stroke-linejoin="round"/>
    <circle cx="75" cy="55" r="8" fill="currentColor" opacity=".4"/>
    <circle cx="165" cy="55" r="8" fill="currentColor" opacity=".4"/>
  </svg>`;
}
function goalIllusNegocio() {
  return `<svg viewBox="0 0 240 160" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M120 140 L120 40 M120 40 L80 80 M120 40 L160 80" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="120" cy="130" rx="55" ry="14" stroke-width="8"/>
    <path d="M75 115 Q60 95 75 80 Q90 65 120 70 Q150 65 165 80 Q180 95 165 115" stroke-width="7" stroke-linecap="round"/>
  </svg>`;
}
function goalIllusEmergencia() {
  return `<svg viewBox="0 0 240 160" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M120 20 L210 65 L210 115 Q210 145 120 155 Q30 145 30 115 L30 65 Z" stroke-width="9" stroke-linejoin="round"/>
    <line x1="120" y1="65" x2="120" y2="105" stroke-width="10" stroke-linecap="round"/>
    <line x1="100" y1="85" x2="140" y2="85" stroke-width="10" stroke-linecap="round"/>
  </svg>`;
}
function goalIllusOutro() {
  return `<svg viewBox="0 0 240 150" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
    <circle cx="120" cy="75" r="55" stroke-width="10"/>
    <line x1="120" y1="30" x2="120" y2="75" stroke-width="8" stroke-linecap="round"/>
    <line x1="120" y1="75" x2="150" y2="95" stroke-width="8" stroke-linecap="round"/>
    <circle cx="120" cy="110" r="6" fill="currentColor"/>
  </svg>`;
}

// ── Build goal type grid in modal
function initGoalTypeGrid() {
  const grid = document.getElementById('goalTypeGrid');
  if (!grid) return;
  let selGType = 'moto';
  grid.innerHTML = GOAL_TYPES.map(t =>
    `<button class="goal-type-opt${t.id === selGType ? ' sel' : ''}" id="gt-${t.id}" onclick="selectGoalType('${t.id}')">
      <span class="gt-emoji">${t.emoji}</span>
      <span class="gt-label">${t.label}</span>
    </button>`
  ).join('');
}

let activeGoalType = 'moto';

function selectGoalType(id) {
  activeGoalType = id;
  document.querySelectorAll('.goal-type-opt').forEach(el => el.classList.remove('sel'));
  const el = document.getElementById('gt-' + id);
  if (el) el.classList.add('sel');
  calcGoalMonthly();
}

// ── Calculate monthly installment
function calcGoalMonthly() {
  const target   = parseFloat(document.getElementById('gTarget')?.value) || 0;
  const initial  = parseFloat(document.getElementById('gInitial')?.value) || 0;
  const deadline = document.getElementById('gDeadline')?.value;
  const preview  = document.getElementById('goalCalcPreview');
  const valEl    = document.getElementById('goalCalcVal');
  const subEl    = document.getElementById('goalCalcSub');
  if (!preview) return;

  if (!target || !deadline) { preview.style.display = 'none'; return; }

  const [dy, dm] = deadline.split('-').map(Number);
  const months = (dy - NOW.getFullYear()) * 12 + (dm - NOW.getMonth() - 1);
  if (months <= 0) { preview.style.display = 'none'; return; }

  const remaining = Math.max(0, target - initial);
  const monthly = remaining / months;
  valEl.textContent  = fmtF(monthly);
  subEl.textContent  = `em ${months} mes${months !== 1 ? 'es' : ''}`;
  preview.style.display = 'flex';
}

// ── Category input state (for the "Nova Meta" modal)
let activeGoalCategoryInput = '';

function buildGoalCategoryGrid() {
  const grid = document.getElementById('goalCategoryGrid');
  if (!grid) return;
  grid.innerHTML = GOAL_CATEGORIES.map(c =>
    `<button class="goal-cat-opt${c.id === activeGoalCategoryInput ? ' sel' : ''}"
      id="gc-${c.id}" onclick="selectGoalCategory('${c.id}')"
      style="${c.id === activeGoalCategoryInput ? 'border-color:'+c.color+';background:'+c.color+'18;color:'+c.color : ''}">
      <span class="gc-emoji">${c.emoji}</span>
      <span class="gc-label">${c.label}</span>
    </button>`
  ).join('');
}

function selectGoalCategory(id) {
  // Toggle off if clicking the already-selected category
  activeGoalCategoryInput = (activeGoalCategoryInput === id) ? '' : id;
  buildGoalCategoryGrid();
}

// ── Open / close goal modal
function openNewGoalModal() {
  document.getElementById('modalNewGoal').classList.add('open');
  document.getElementById('gName').value     = '';
  document.getElementById('gTarget').value   = '';
  document.getElementById('gDeadline').value  = '';
  document.getElementById('gInitial').value   = '';
  document.getElementById('goalCalcPreview').style.display = 'none';
  activeGoalType = 'moto';
  activeGoalCategoryInput = '';
  initGoalTypeGrid();
  buildGoalCategoryGrid();
}
function closeNewGoalModal() {
  document.getElementById('modalNewGoal').classList.remove('open');
}

// ── Save new goal
function saveGoal() {
  const name    = document.getElementById('gName').value.trim();
  const target  = parseFloat(document.getElementById('gTarget').value);
  const initial = parseFloat(document.getElementById('gInitial').value) || 0;
  const deadline = document.getElementById('gDeadline').value;

  if (!name)            { showToast('Informe o nome da meta.', 'err'); return; }
  if (!target || target <= 0) { showToast('Informe um valor alvo válido.', 'err'); return; }
  if (!deadline)        { showToast('Informe o prazo da meta.', 'err'); return; }

  const [dy, dm] = deadline.split('-').map(Number);
  const months = (dy - NOW.getFullYear()) * 12 + (dm - NOW.getMonth() - 1);
  if (months <= 0)      { showToast('O prazo deve ser no futuro.', 'err'); return; }

  const monthly = (target - initial) / months;

  if (!state.goals) state.goals = [];
  state.goals.push({
    id:        Date.now(),
    type:      activeGoalType,
    category:  activeGoalCategoryInput || '',   // ← new
    name,
    target,
    saved:     initial,
    deadline,  // "YYYY-MM"
    monthly:   Math.ceil(monthly * 100) / 100,
    createdAt: TODAY_KEY
  });
  save();
  closeNewGoalModal();
  renderGoals();
  triggerHaptic('success');
  showToast('Meta criada! 🎯 Bora alcançar!');
}

// ── Delete goal
function deleteGoal(id) {
  state.goals = (state.goals || []).filter(g => g.id !== id);
  save();
  renderGoals();
  showToast('Meta removida.', 'err');
}

// ── Goal deposit modal
let activeGoalId = null;

function openGoalDepositModal(id) {
  activeGoalId = id;
  const g    = (state.goals || []).find(g => g.id === id);
  if (!g) return;
  const gt   = getGoalType(g.type);
  const pct  = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
  const rem  = Math.max(0, g.target - g.saved);

  document.getElementById('goalDepModalTitle').textContent = `${gt.emoji} Depositar em "${g.name}"`;
  document.getElementById('gdepProgressArea').innerHTML = `
    <div class="gdep-top">
      <div class="gdep-emoji">${gt.emoji}</div>
      <div>
        <div class="gdep-name">${g.name}</div>
        <div class="gdep-deadline">Meta: ${fmtF(g.target)} · Prazo: ${g.deadline?.replace('-', '/')}</div>
      </div>
    </div>
    <div class="gdep-bar-wrap">
      <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:5px">
        <span style="font-weight:700;color:var(--text)">${fmtF(g.saved)} guardados</span>
        <span style="color:var(--text3)">faltam ${fmtF(rem)}</span>
      </div>
      <div class="gdep-bar-track"><div class="gdep-bar-fill" style="width:${pct}%;background:${gt.color}"></div></div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">${pct}% concluído</div>
    </div>`;
  document.getElementById('gDepAmount').value = '';
  document.getElementById('modalGoalDeposit').classList.add('open');
  setTimeout(() => document.getElementById('gDepAmount').focus(), 80);
}
function closeGoalDepositModal() { document.getElementById('modalGoalDeposit').classList.remove('open'); }

function confirmGoalDeposit() {
  const v = parseFloat(document.getElementById('gDepAmount').value);
  if (!v || v <= 0) { showToast('Informe um valor válido.', 'err'); return; }
  const g = (state.goals || []).find(g => g.id === activeGoalId);
  if (!g) return;
  g.saved = (g.saved || 0) + v;
  save();
  closeGoalDepositModal();
  renderGoals();
  triggerHaptic('success');
  if (g.saved >= g.target) {
    showToast('🎉 Meta alcançada! Parabéns!');
  } else {
    showToast(`+${fmtF(v)} depositado! ${Math.round((g.saved/g.target)*100)}% da meta ✓`);
  }
}

// ── Render goals page
function renderGoals() {
  const goals = state.goals || [];

  // Summary counters
  const totalSaved  = goals.reduce((s,g) => s + (g.saved||0), 0);
  const totalTarget = goals.reduce((s,g) => s + (g.target||0), 0);
  document.getElementById('gsCount').textContent  = goals.length;
  document.getElementById('gsSaved').textContent  = fmt(totalSaved);
  document.getElementById('gsTarget').textContent = fmt(totalTarget);

  // Build category filter bar
  const filterBar = document.getElementById('goalFilterBar');
  if (filterBar) {
    // Count goals per category to show (only categories with goals + "Todas")
    const usedCats = new Set(goals.map(g => g.category).filter(Boolean));
    const chips = [
      `<button class="goal-filter-chip${!activeGoalCatFilter ? ' active' : ''}" data-cat="" onclick="setGoalCatFilter('')">🎯 Todas (${goals.length})</button>`,
      ...GOAL_CATEGORIES
        .filter(c => usedCats.has(c.id))
        .map(c => {
          const count = goals.filter(g => g.category === c.id).length;
          return `<button class="goal-filter-chip${activeGoalCatFilter === c.id ? ' active' : ''}" data-cat="${c.id}" onclick="setGoalCatFilter('${c.id}')">${c.emoji} ${c.label} (${count})</button>`;
        })
    ];
    filterBar.innerHTML = chips.join('');
    filterBar.style.display = usedCats.size > 0 ? 'flex' : 'none';
  }

  renderGoalsList();
}

function goalCardHTML(g) {
  const gt   = getGoalType(g.type);
  const gc   = getGoalCategory(g.category);
  const pct  = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
  const rem  = Math.max(0, g.target - g.saved);
  const done = g.saved >= g.target;

  // Deadline display
  const [dy, dm] = (g.deadline || '2025-12').split('-').map(Number);
  const monthsLeft = (dy - NOW.getFullYear()) * 12 + (dm - NOW.getMonth() - 1);
  const dlLabel = monthsLeft <= 0 ? 'Prazo encerrado'
    : monthsLeft === 1 ? '1 mês restante'
    : `${monthsLeft} meses restantes`;

  // Category badge HTML (only if a category is set)
  const catBadge = gc
    ? `<div class="goal-cat-badge" style="background:${gc.color}14;color:${gc.color};border-color:${gc.color}30">
         <span class="gc-badge-emoji">${gc.emoji}</span>${gc.label}
       </div>`
    : '';

  return `<div class="goal-card" style="--goal-color:${gt.color}">
    <!-- Background illustration -->
    <div class="goal-card-illus" style="color:${gt.color}">${gt.illusSVG()}</div>

    <div class="goal-card-top">
      <div class="goal-type-badge" style="background:${gt.color}18">${gt.emoji}</div>
      <div class="goal-title-area">
        ${catBadge}
        <div class="goal-name">${g.name}</div>
        <div class="goal-meta">${dlLabel} · Meta: ${fmtF(g.target)}</div>
      </div>
      <div class="goal-actions-top">
        <button class="icon-btn dl-btn" onclick="deleteGoal(${g.id})" title="Remover meta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>

    <div class="goal-prog-labels">
      <span class="gpl-saved">${fmtF(g.saved)} guardados</span>
      <span class="gpl-target">faltam ${done ? '✓ Atingido!' : fmtF(rem)}</span>
    </div>
    <div class="goal-prog-track">
      <div class="goal-prog-fill" style="width:${pct}%;background:${done ? 'var(--green)' : gt.color}"></div>
    </div>
    <div class="goal-prog-pct">${pct}% concluído</div>

    <div class="goal-card-footer">
      <div class="goal-monthly-info">
        <div class="goal-monthly-val" style="color:${gt.color}">${fmtF(g.monthly)}<span style="font-size:11px;font-weight:600;color:var(--text3)">/mês</span></div>
        <div class="goal-monthly-label">Parcela sugerida</div>
      </div>
      ${done
        ? `<button class="btn btn-sm" style="background:var(--green-l);color:var(--green);border:none;cursor:default">🎉 Concluída!</button>`
        : `<button class="btn btn-primary btn-sm" onclick="openGoalDepositModal(${g.id})">+ Depositar</button>`}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════
//  SHARE CARD (Canvas)
// ════════════════════════════════════════════════
function openShareCard() {
  document.getElementById('shareCardOverlay').classList.add('open');
  setTimeout(() => drawShareCard(), 60);
}

function drawShareCard() {
  const canvas = document.getElementById('shareCardCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = 540, H = 540;
  canvas.width = W; canvas.height = H;

  const d = activeData();
  const {year, month} = parseKey(activeMonth);
  const renda  = totalRenda(d);
  const total  = totalBills(d);
  const savC   = d.savingsContrib || 0;
  const avail  = renda - total - savC;
  const pct    = renda > 0 ? Math.min(100, Math.round(((total + savC) / renda) * 100)) : 0;
  const isDark = state.theme === 'dark';

  // ── Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0,   isDark ? '#0f1929' : '#1e3a5f');
  grad.addColorStop(0.5, isDark ? '#1e3a5f' : '#1d4ed8');
  grad.addColorStop(1,   isDark ? '#2563eb' : '#2563eb');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 24);
  ctx.fill();

  // ── Decorative circles
  ctx.save();
  ctx.globalAlpha = .07;
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(W - 60, 60, 130, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(40, H - 40, 100, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ── Logo / brand
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.font = 'bold 28px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('FinWise', 36, 56);

  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = '500 15px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`Relatório · ${MONTHS_PT[month]} ${year}`, 36, 82);

  // ── Month / divider
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.fillRect(36, 96, W - 72, 1);

  // ── Main balance
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText('SALDO LIVRE', 36, 134);
  ctx.letterSpacing = '0';

  ctx.fillStyle = avail >= 0 ? '#86efac' : '#fca5a5';
  ctx.font = `bold ${avail >= 1000000 ? 48 : avail >= 100000 ? 56 : 64}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.fillText(fmtF(avail), 36, 200);

  // ── Stats grid: 3 cols
  const stats = [
    { label: 'RENDA',      val: fmtF(renda),  color: '#93c5fd' },
    { label: 'DESPESAS',   val: fmtF(total),  color: '#fca5a5' },
    { label: 'POUPANÇA',   val: fmtF(savC),   color: '#c4b5fd' },
  ];
  stats.forEach((s, i) => {
    const x = 36 + i * 158;
    const y = 250;
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.beginPath(); ctx.roundRect(x, y, 146, 80, 12); ctx.fill();
    ctx.fillStyle = s.color;
    ctx.font = 'bold 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(s.val.length > 10 ? s.val.replace('R$ ', 'R$').slice(0,10) : s.val, x + 12, y + 34);
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.letterSpacing = '.8px';
    ctx.fillText(s.label, x + 12, y + 54);
    ctx.letterSpacing = '0';
  });

  // ── Progress bar
  const barY = 370, barH = 16, barX = 36, barW = W - 72;
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barH / 2); ctx.fill();
  const fillW = barW * (pct / 100);
  const barGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
  barGrad.addColorStop(0, '#60a5fa');
  barGrad.addColorStop(1, '#a78bfa');
  ctx.fillStyle = barGrad;
  ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(fillW, 12), barH, barH / 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`${pct}% da renda comprometida`, barX, barY + barH + 22);

  // ── Bills count
  const bills = d.bills || [];
  const paid  = bills.filter(b => b.paid).length;
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.font = '500 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`${paid}/${bills.length} contas pagas este mês`, 36, 440);

  // ── Savings total
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fillText(`Poupança total: ${fmtF(state.savings || 0)}`, 36, 462);

  // ── Footer
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(36, H - 52, W - 72, 1);
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.font = '500 12px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Criado com FinWise — seu controle financeiro inteligente', 36, H - 24);
}

function downloadShareCard() {
  const canvas = document.getElementById('shareCardCanvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `finwise-${activeMonth}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Imagem baixada! 📸');
}

async function shareCardNative() {
  const canvas = document.getElementById('shareCardCanvas');
  if (!canvas || !navigator.share) {
    downloadShareCard(); return;
  }
  canvas.toBlob(async blob => {
    const file = new File([blob], `finwise-${activeMonth}.png`, { type: 'image/png' });
    try {
      await navigator.share({ files: [file], title: 'FinWise — Resumo Financeiro' });
    } catch { downloadShareCard(); }
  }, 'image/png');
}

// ════════════════════════════════════════════════
//  PDF EXPORT
// ════════════════════════════════════════════════
async function exportPDF() {
  const d = activeData();
  const {year, month} = parseKey(activeMonth);
  const renda  = totalRenda(d);
  const total  = totalBills(d);
  const savC   = d.savingsContrib || 0;
  const avail  = renda - total - savC;
  const bills  = d.bills || [];
  const paid   = bills.filter(b => b.paid);
  const pend   = bills.filter(b => !b.paid);
  const isDark = state.theme === 'dark';

  // Group by category
  const catTotals = {};
  bills.forEach(b => { catTotals[b.cat] = (catTotals[b.cat]||0) + b.amount; });
  const topCats = Object.entries(catTotals).sort((a,b) => b[1]-a[1]).slice(0,6);

  const pct = renda > 0 ? Math.min(100, Math.round(((total+savC)/renda)*100)) : 0;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>FinWise — ${MONTHS_PT[month]} ${year}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#f3f0eb;color:#1a1714;padding:32px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .header{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:white;border-radius:18px;padding:28px 32px;margin-bottom:22px;position:relative;overflow:hidden}
  .header::after{content:'';position:absolute;right:-40px;top:-40px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,.06)}
  .header-brand{font-size:13px;font-weight:700;opacity:.6;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
  .header-title{font-size:28px;font-weight:800;letter-spacing:-.5px}
  .header-sub{font-size:14px;opacity:.65;margin-top:4px}
  .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px}
  .stat-card{background:white;border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .stat-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#a8a29e;margin-bottom:5px}
  .stat-val{font-size:20px;font-weight:800;letter-spacing:-.4px}
  .stat-sub{font-size:11.5px;color:#a8a29e;margin-top:3px}
  .section{background:white;border-radius:14px;padding:20px 22px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .section-title{font-size:14px;font-weight:800;color:#1a1714;margin-bottom:14px;display:flex;align-items:center;gap:8px}
  .prog-bar-bg{height:14px;background:#f3f0eb;border-radius:10px;overflow:hidden;margin-bottom:8px}
  .prog-bar-fill{height:100%;border-radius:10px;background:linear-gradient(90deg,#2563eb,#60a5fa);transition:width .5s}
  .bill-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #f3f0eb}
  .bill-row:last-child{border-bottom:none}
  .bill-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .bill-name{flex:1;font-size:13.5px;font-weight:600;color:#1a1714}
  .bill-cat{font-size:11px;color:#a8a29e}
  .bill-amt{font-size:14px;font-weight:800}
  .bill-status{font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px}
  .status-paid{background:#d1fae5;color:#059669}
  .status-pend{background:#fee2e2;color:#dc2626}
  .cat-bar-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}
  .cat-bar-label{font-size:12px;font-weight:700;width:90px;flex-shrink:0}
  .cat-bar-bg{flex:1;height:10px;background:#f3f0eb;border-radius:6px;overflow:hidden}
  .cat-bar-fill{height:100%;border-radius:6px}
  .cat-bar-val{font-size:12px;font-weight:700;color:#57534e;width:80px;text-align:right;flex-shrink:0}
  .footer{text-align:center;font-size:12px;color:#a8a29e;margin-top:24px;padding-top:16px;border-top:1px solid #e4dfd6}
  .badge-paid{color:#059669;font-weight:700;font-size:11px}
  .badge-pend{color:#dc2626;font-weight:700;font-size:11px}
  @media print{body{background:white;padding:0}.header{-webkit-print-color-adjust:exact}}
</style>
</head>
<body>
  <div class="header">
    <div class="header-brand">FinWise · Relatório Mensal</div>
    <div class="header-title">${MONTHS_PT[month]} ${year}</div>
    <div class="header-sub">Gerado em ${NOW.toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'})}</div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Renda Total</div>
      <div class="stat-val" style="color:#2563eb">${fmtF(renda)}</div>
      <div class="stat-sub">${(d.extras||[]).length} entradas extras</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Despesas</div>
      <div class="stat-val" style="color:#dc2626">${fmtF(total)}</div>
      <div class="stat-sub">${bills.length} contas</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Poupança</div>
      <div class="stat-val" style="color:#7c3aed">${fmtF(savC)}</div>
      <div class="stat-sub">${renda > 0 ? Math.round((savC/renda)*100)+'% da renda' : '—'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Saldo Livre</div>
      <div class="stat-val" style="color:${avail >= 0 ? '#059669' : '#dc2626'}">${fmtF(avail)}</div>
      <div class="stat-sub">${pct}% comprometido</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">📊 Uso do Orçamento</div>
    <div class="prog-bar-bg"><div class="prog-bar-fill" style="width:${pct}%;background:${pct>80?'#dc2626':pct>60?'#d97706':'#2563eb'}"></div></div>
    <div style="font-size:13px;color:#57534e">${pct}% da renda comprometida · ${paid.length}/${bills.length} contas pagas</div>
  </div>

  ${topCats.length ? `<div class="section">
    <div class="section-title">🏷️ Gastos por Categoria</div>
    ${topCats.map(([catId, val]) => {
      const cat = getCat(catId);
      const barPct = total > 0 ? Math.round((val/total)*100) : 0;
      return `<div class="cat-bar-row">
        <div class="cat-bar-label">${cat.label}</div>
        <div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${barPct}%;background:${cat.color}"></div></div>
        <div class="cat-bar-val">${fmtF(val)}</div>
      </div>`;
    }).join('')}
  </div>` : ''}

  ${bills.length ? `<div class="section">
    <div class="section-title">📋 Lista de Contas</div>
    ${bills.map(b => {
      const cat = getCat(b.cat);
      return `<div class="bill-row">
        <div class="bill-dot" style="background:${cat.color}"></div>
        <div>
          <div class="bill-name">${b.name}</div>
          <div class="bill-cat">${cat.label}${b.due ? ' · Dia '+b.due : ''}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="bill-amt" style="color:${b.paid?'#059669':'#1a1714'}">${fmtF(b.amount)}</div>
          <span class="bill-status ${b.paid ? 'status-paid' : 'status-pend'}">${b.paid ? '✓ Pago' : 'Pendente'}</span>
        </div>
      </div>`;
    }).join('')}
  </div>` : ''}

  ${(state.goals||[]).length ? `<div class="section">
    <div class="section-title">🎯 Metas Financeiras</div>
    ${(state.goals).map(g => {
      const gt = getGoalType(g.type);
      const gpct = g.target > 0 ? Math.min(100, Math.round((g.saved/g.target)*100)) : 0;
      return `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f3f0eb">
        <span style="font-size:20px">${gt.emoji}</span>
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:700">${g.name}</div>
          <div style="font-size:11.5px;color:#a8a29e">${fmtF(g.saved)} de ${fmtF(g.target)} · ${gpct}%</div>
        </div>
        <div style="font-size:12px;color:#2563eb;font-weight:700">${fmtF(g.monthly)}/mês</div>
      </div>`;
    }).join('')}
  </div>` : ''}

  <div class="footer">FinWise — Controle Financeiro Inteligente · ${window.location.hostname}</div>
</body>
</html>`;

  const blob   = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url    = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:none;z-index:9998;background:white';
  document.body.appendChild(iframe);
  iframe.src = url;

  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.print();
      iframe.contentWindow.onafterprint = () => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      };
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }
      }, 3000);
    }, 400);
  };
  showToast('Preparando PDF... 📄');
}

