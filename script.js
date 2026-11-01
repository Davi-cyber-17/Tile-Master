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
// Cada face é um SVG com viewBox fixo (100x130, mesma proporção da peça).
// Tudo é desenhado dentro de uma área segura (margem de 14), então nada sai da peça.
const FONT = `font-family="'Noto Sans CJK SC','Noto Sans SC','PingFang SC','Microsoft YaHei','SimHei',sans-serif" font-weight="700" text-anchor="middle"`;
const glyph = (ch, y, size, color) =>
  `<text x="50" y="${y + size * .36}" font-size="${size}" fill="${color}" ${FONT}>${ch}</text>`;
const svgFace = (inner, color) =>
  `<svg class="face" viewBox="0 0 100 130" preserveAspectRatio="xMidYMid meet" style="color:${color}">${inner}</svg>`;

const DOTS = {
  1: [[50, 65]],
  2: [[50, 40], [50, 90]],
  3: [[28, 36], [50, 66], [72, 96]],
  4: [[32, 42], [68, 42], [32, 88], [68, 88]],
  5: [[32, 38], [68, 38], [50, 65], [32, 92], [68, 92]],
  6: [[32, 36], [68, 36], [32, 66], [68, 66], [32, 96], [68, 96]],
  7: [[26, 34], [50, 34], [74, 34], [32, 70], [68, 70], [32, 98], [68, 98]],
  8: [[34, 30], [66, 30], [34, 54], [66, 54], [34, 78], [66, 78], [34, 102], [66, 102]],
  9: [[26, 36], [50, 36], [74, 36], [26, 66], [50, 66], [74, 66], [26, 96], [50, 96], [74, 96]]
};
const BAM_ROWS = { 2: [1, 1], 3: [1, 2], 4: [2, 2], 5: [2, 1, 2], 6: [3, 3], 7: [1, 3, 3], 8: [4, 4], 9: [3, 3, 3] };

function dotsSVG(n) {
  const r = n === 1 ? 19 : n === 8 ? 8.5 : 9.5, sw = n === 1 ? 4.5 : 3;
  return DOTS[n].map(([x, y], i) => {
    const c = PIP_COLORS[i % 3];
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" fill-opacity=".18" stroke="${c}" stroke-width="${sw}"/>`;
  }).join('');
}

function bambooSVG(n) {
  if (n === 1) return `<rect x="42" y="20" width="16" height="90" rx="6" fill="#5dff9a"/>`;
  const rows = BAM_ROWS[n], R = rows.length, gap = 8;
  const h = Math.min(42, (96 - (R - 1) * gap) / R);
  const total = R * h + (R - 1) * gap;
  const top = 65 - total / 2;
  const w = 10;
  let i = 0, out = '';
  rows.forEach((k, ri) => {
    const sp = k === 4 ? 18 : 22;
    for (let j = 0; j < k; j++, i++) {
      const x = 50 + (j - (k - 1) / 2) * sp - w / 2;
      const c = n > 1 && i % 5 === 2 ? '#ff4f8b' : '#5dff9a';
      out += `<rect x="${x}" y="${top + ri * (h + gap)}" width="${w}" height="${h}" rx="4" fill="${c}"/>`;
    }
  });
  return out;
}

function faceHTML(t) {
  if (t < 9) return svgFace(glyph(NUMS[t], 40, 40, '#e8f6ff') + glyph('萬', 88, 44, '#ff4f8b'), '#ff4f8b');
  if (t < 18) return svgFace(dotsSVG(t - 8), '#29d9ff');
  if (t < 27) return svgFace(bambooSVG(t - 17), '#5dff9a');
  if (t < 31) return svgFace(glyph('東南西北'[t - 27], 65, 62, '#29d9ff'), '#29d9ff');
  if (t === 31) return svgFace(glyph('中', 65, 62, '#ff4f8b'), '#ff4f8b');
  if (t === 32) return svgFace(glyph('發', 65, 62, '#5dff9a'), '#5dff9a');
  return svgFace(`<rect x="19" y="21" width="62" height="88" rx="4" fill="none" stroke="#29d9ff" stroke-width="3.5"/>`, '#29d9ff');
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
