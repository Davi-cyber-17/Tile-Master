// ===== Vita Mahjong =====
const $ = id => document.getElementById(id);
const board = $('board');
const NUMS = '一二三四五六七八九';
const PIP_COLORS = ['#29d9ff', '#5dff9a', '#ff4f8b'];

let tiles = [], history = [], selected = null, score = 0, matches = 0, level = 1, busy = false;

// ---- Layout (unidades de meia peça: cada peça ocupa 2x2) ----
function buildLayout() {
  const out = [];
  const add = (rows, z, y0) => rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) out.push({ x: 6 - n + 2 * i, y: y0 + 2 * r, z });
  });
  add([3, 4, 5, 6, 5, 4, 3], 0, 0);
  add([2, 3, 4, 3, 2], 1, 2);
  add([2, 2], 2, 4);
  return out;
}

// ---- Faces das peças (34 tipos) ----
function faceHTML(t) {
  if (t < 9) return `<div class="face" style="color:#ff4f8b"><span style="color:#e8f6ff">${NUMS[t]}</span><span class="big">萬</span></div>`;
  if (t < 18) {
    const n = t - 8, c = PIP_COLORS[(t) % 3];
    let p = ''; for (let i = 0; i < n; i++) p += `<i style="color:${PIP_COLORS[i % 3]}"></i>`;
    return `<div class="face"><div class="pips p${n}">${p}</div></div>`;
  }
  if (t < 27) {
    const n = t - 17; let p = '';
    for (let i = 0; i < n; i++) p += `<i class="${n > 1 && i % 5 == 2 ? 'r' : ''}"></i>`;
    return `<div class="face"><div class="pips bam p${n}">${p}</div></div>`;
  }
  if (t < 31) return `<div class="face" style="color:#29d9ff"><span class="big">${'東南西北'[t - 27]}</span></div>`;
  if (t === 31) return `<div class="face" style="color:#ff4f8b"><span class="big">中</span></div>`;
  if (t === 32) return `<div class="face" style="color:#5dff9a"><span class="big">發</span></div>`;
  return `<div class="face white"><div class="frame"></div></div>`;
}

// ---- Regras de peça livre ----
const alive = () => tiles.filter(t => t.alive);
function isFree(t, act = alive()) {
  if (act.some(o => o.z > t.z && Math.abs(o.x - t.x) < 2 && Math.abs(o.y - t.y) < 2)) return false;
  const side = d => act.some(o => o.z === t.z && Math.abs(o.y - t.y) < 2 && (o.x - t.x) * d > 0 && (o.x - t.x) * d <= 2);
  return !side(-1) || !side(1);
}

// ---- Distribui tipos garantindo que o jogo tenha solução ----
function assign(list, pairTypes) {
  for (let tries = 0; tries < 50; tries++) {
    let act = list.slice(), pt = pairTypes.slice(), ok = true;
    while (act.length) {
      const free = act.filter(t => isFree(t, act));
      if (free.length < 2) { ok = false; break; }
      const a = free.splice(Math.floor(Math.random() * free.length), 1)[0];
      const b = free[Math.floor(Math.random() * free.length)];
      const ty = pt.pop();
      a.type = b.type = ty;
      act = act.filter(t => t !== a && t !== b);
    }
    if (ok) return;
    pairTypes.sort(() => Math.random() - .5);
  }
}

function shuffleArr(a) { return a.sort(() => Math.random() - .5); }

// ---- Renderização ----
let U, V;
function size() {
  const m = document.querySelector('main');
  const w = m.clientWidth - 16, h = m.clientHeight - 16;
  U = Math.max(8, Math.min(w / 12.6, h / (14 * 1.3 + .8), 52));
  V = U * 1.3;
}
function place(t) {
  const off = U * .16;
  const s = t.el.style;
  s.width = 2 * U + 'px'; s.height = 2 * V + 'px';
  s.left = t.x * U - t.z * off + 'px'; s.top = t.y * V - t.z * off + 'px';
  s.zIndex = t.z * 100 + t.y;
  s.fontSize = U * 1.05 + 'px';
}
function render() {
  size();
  board.innerHTML = '';
  board.style.width = 12 * U + 8 + 'px';
  board.style.height = 14 * V + 8 + 'px';
  tiles.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = faceHTML(t.type);
    el.onclick = () => clickTile(t);
    t.el = el; place(t);
    if (!t.alive) el.style.display = 'none';
    board.appendChild(el);
  });
  refresh();
}
function refresh() {
  const act = alive();
  tiles.forEach(t => t.alive && t.el.classList.toggle('blocked', !isFree(t, act)));
  $('score').textContent = score; $('level').textContent = level; $('matches').textContent = matches;
}

// ---- Jogo ----
function newLevel() {
  tiles = buildLayout().map(t => ({ ...t, alive: true }));
  const pool = [];
  for (let i = 0; i < 34; i++) pool.push(i, i);
  const pairs = shuffleArr(pool).slice(0, tiles.length / 2);
  assign(tiles, pairs);
  history = []; selected = null; busy = false; matches = 0;
  render();
}

function clickTile(t) {
  if (busy || !t.alive) return;
  clearHint();
  if (!isFree(t)) { toast('Peça bloqueada'); return; }
  if (selected === t) { t.el.classList.remove('sel'); selected = null; return; }
  if (!selected) { selected = t; t.el.classList.add('sel'); return; }
  if (selected.type === t.type) {
    const a = selected, b = t; selected = null;
    const pts = 10 + 5 * level;
    [a, b].forEach(x => { x.alive = false; x.el.classList.remove('sel'); x.el.classList.add('gone'); });
    score += pts; matches++; history.push({ a, b, pts });
    busy = true;
    setTimeout(() => { [a, b].forEach(x => x.el.style.display = 'none'); busy = false; refresh(); afterMove(); }, 300);
  } else {
    selected.el.classList.remove('sel'); selected = t; t.el.classList.add('sel');
  }
}

function findPair() {
  const free = alive().filter(t => isFree(t));
  for (let i = 0; i < free.length; i++)
    for (let j = i + 1; j < free.length; j++)
      if (free[i].type === free[j].type) return [free[i], free[j]];
  return null;
}

function afterMove() {
  if (!alive().length) return win();
  if (!findPair()) { toast('Sem movimentos! Embaralhando...'); setTimeout(reshuffle, 900); }
}

function reshuffle() {
  const act = alive(); if (!act.length) return;
  const count = {}; act.forEach(t => count[t.type] = (count[t.type] || 0) + 1);
  const pairs = [];
  for (const k in count) for (let i = 0; i < count[k] / 2; i++) pairs.push(+k);
  assign(act, shuffleArr(pairs));
  selected = null;
  act.forEach(t => { t.el.innerHTML = faceHTML(t.type); t.el.classList.remove('sel'); });
  refresh();
}

function clearHint() { tiles.forEach(t => t.el && t.el.classList.remove('hint')); }
function hint() {
  if (busy) return; clearHint();
  const p = findPair();
  if (p) p.forEach(t => t.el.classList.add('hint'));
}

function undo() {
  if (busy || !history.length) return;
  clearHint();
  const { a, b, pts } = history.pop();
  [a, b].forEach(t => { t.alive = true; t.el.classList.remove('gone'); t.el.style.display = ''; });
  score -= pts; matches--;
  if (selected) { selected.el.classList.remove('sel'); selected = null; }
  refresh();
}

function win() {
  $('ovTitle').textContent = 'Nível concluído!';
  $('ovText').textContent = `Pontuação: ${score}`;
  $('ovBtn').onclick = () => { $('overlay').classList.remove('show'); level++; newLevel(); };
  $('overlay').classList.add('show');
}

let tt;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 1200);
}

$('btnShuffle').onclick = () => { if (!busy) { reshuffle(); if (!findPair()) reshuffle(); } };
$('btnHint').onclick = hint;
$('btnUndo').onclick = undo;
function relayout() {
  size(); tiles.forEach(place);
  board.style.width = 12 * U + 8 + 'px'; board.style.height = 14 * V + 8 + 'px';
}
window.addEventListener('resize', relayout);
window.addEventListener('orientationchange', () => setTimeout(relayout, 200));
if (window.ResizeObserver) new ResizeObserver(relayout).observe(document.querySelector('main'));

newLevel();
