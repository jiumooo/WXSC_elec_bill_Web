/* WXSC_elec_bill_Web · 页面控制器
 * 隔离性说明：
 *   1. 页面没有任何后端会话；每次查询只带上「你自己这次填/存的房间参数」。
 *   2. 查询结果只活在当前标签页的内存里，不写 localStorage、不写任何共享缓存。
 *   3. localStorage 仅保存三项本机偏好：房间设置、通道设置、备注名；都没有别人能读到。
 *   4. 因此多人同时打开、各查各的房间时，彼此的请求与结果完全独立。
 */
import * as api from './api.js';
import { downloadMarkdown, downloadExcel, viewTable, fileName, VIEWS } from './export.js';

const KEY = {
  cfg: 'wxsc.elec.cfg.v1',
  channel: 'wxsc.elec.channel.v1',
  notes: 'wxsc.elec.notes.v1.',
  recent: 'wxsc.elec.recent.v1',
  range: 'wxsc.elec.range.v1',
  guide: 'wxsc.elec.guide.v1',
  enroll: 'wxsc.elec.enroll.v1',
};

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 隐私模式忽略 */ }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch (e) { /* 忽略 */ }
  },
};

const S = {
  cfg: { loudongNo: '', roomNo: '', xiaoquId: api.DEFAULT_XIAOQU, datasource: api.DEFAULT_DATASOURCE },
  room: null,
  balance: null,
  all: [],
  items: [],
  summary: [],
  notes: {},
  range: { start: '', end: '', label: '全部' },
  tab: 'summary',
  person: '',
  fetchedAt: '',
  loading: false,
};

let toastTimer = 0;
function toast(msg, ms = 2600) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), ms);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* 取数失败时打开「中转通道」抽屉并聚焦中转地址，省掉用户自己翻设置 */
function revealChannel(err) {
  const msg = String((err && err.message) || err || '');
  const isNetwork = /网络请求失败|Failed to fetch|NetworkError|Load failed|CORS/i.test(msg);
  if (!isNetwork) return;
  openDrawer('channel');
  const mode = $('in-mode');
  if (mode && api.getChannel().mode === 'direct') mode.value = 'relay';
  const relay = $('in-relay');
  const field = relay && relay.closest ? relay.closest('.field') : null;
  if (field) field.hidden = false;
  if (relay && relay.focus) setTimeout(() => relay.focus(), 260);
}

function fixed(v, digits = 2) {
  return num(v).toFixed(digits);
}

function roomDesc() {
  return S.room ? api.describeRoom(S.room) : '未设置房间';
}

function notesKey() {
  if (!S.room) return KEY.notes + 'none';
  return KEY.notes + 'r' + S.room.loudongId + '_' + S.room.roomId;
}

function loadNotes() {
  const saved = store.get(notesKey(), {});
  S.notes = saved && typeof saved === 'object' ? saved : {};
}

function saveNotes() {
  store.set(notesKey(), S.notes);
}

/* ------------------------------------------------------------------ 顶部状态 */
function setChip(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'chip' + (id === 'chip-room' ? ' chip-room' : '') + (cls ? ' ' + cls : '');
}

function renderChips() {
  const ch = api.getChannel();
  const label = (api.CHANNELS[ch.mode] || api.CHANNELS.direct).label;
  setChip('chip-version', 'v' + api.APP_VERSION, '');
  const needRelay = ch.mode === 'direct' && /\.github\.io$/i.test(location.hostname);
  const tag = $('channel-tag');
  if (tag) {
    tag.textContent = needRelay ? label + ' · 线上需中转' : label;
    tag.className = 'tag' + (ch.mode === 'demo' || needRelay ? ' warn' : ch.mode === 'relay' ? ' ok' : '');
  }
  const note = $('channel-note');
  if (note) {
    note.textContent = ch.mode === 'demo'
      ? '当前：示例数据（不会请求学校接口，仅用于预览界面）'
      : ch.mode === 'relay'
        ? '当前：经由中转 ' + (ch.relayBase || '（地址为空）') + (ch.relayMode === 'query' ? '（公共代理模式）' : '')
        : needRelay
          ? '当前：直连 pay.wxstc.cn —— GitHub Pages 上会被浏览器拦，请点上面的「自动检测可用中转」，或填一个中转地址'
          : '当前：直连 pay.wxstc.cn（需要同源部署或反向代理）';
  }
}

/* ------------------------------------------------------------------ 余额 */
function renderBalance() {
  const tag = $('room-tag');
  if (tag) tag.textContent = S.room ? roomDesc() : '—';
  const b = S.balance;
  const left = $('stat-left');
  const used = $('stat-used');
  const buy = $('stat-buy');
  const ratio = $('stat-ratio');
  const note = $('balance-note');
  if (!b) {
    if (left) left.innerHTML = '—<small>度</small>';
    if (used) used.innerHTML = '—<small>度</small>';
    if (buy) buy.innerHTML = '—<small>度</small>';
    if (ratio) ratio.innerHTML = '—<small>%</small>';
    if (note) note.textContent = S.room ? '还没有取到余额，点右上角「刷新余额」重试。' : '先设置楼栋号和房间号，然后就能看到实时余额。';
    return;
  }
  const pct = b.buy > 0 ? (b.used / b.buy) * 100 : 0;
  const cls = pct >= 95 ? 'bad' : pct >= 80 ? 'warn' : 'ok';
  if (left) {
    left.className = 'v ' + (b.left <= 5 ? 'bad' : b.left <= 20 ? 'warn' : 'ok');
    left.innerHTML = fixed(b.left) + '<small>度</small>';
  }
  if (used) { used.className = 'v'; used.innerHTML = fixed(b.used) + '<small>度</small>'; }
  if (buy) { buy.className = 'v'; buy.innerHTML = fixed(b.buy) + '<small>度</small>'; }
  if (ratio) { ratio.className = 'v ' + cls; ratio.innerHTML = fixed(pct, 1) + '<small>%</small>'; }
  if (note) {
    const at = b.at ? new Date(b.at).toLocaleString('zh-CN', { hour12: false }) : '';
    note.textContent = (b.left < 0 ? '注意：已用电量已超过购电量，余额为负。' : '') +
      (at ? '余额更新于 ' + at + '。' : '');
  }
}

/* ------------------------------------------------------------------ 数据渲染 */
function metaHtml() {
  if (!S.room) return '还没有查询结果。';
  const total = S.items.reduce((a, r) => a + num(r.amt), 0);
  const people = S.summary.length;
  if (!S.all.length) return '还没有查询结果。';
  return '范围 <b>' + esc(S.range.label) + '</b> · <b>' + S.items.length + '</b> 笔 · 合计 <b>' +
    fixed(total) + '</b> 元 · <b>' + people + '</b> 个账号' +
    (S.fetchedAt ? ' · 记录拉取于 ' + esc(S.fetchedAt) : '');
}

function renderSummary() {
  const box = $('pane-summary');
  if (!box) return;
  if (!S.summary.length) {
    box.innerHTML = '<div class="empty">' +
      (S.all.length ? '这个时间范围内没有充值记录，换个范围试试。' : '设置房间后点「查询」，这里会列出每位充值账号的累计金额。') +
      '</div>';
    return;
  }
  const total = S.items.reduce((a, r) => a + num(r.amt), 0);
  const rows = S.summary.map((r, i) =>
    '<tr>' +
    '<td class="idx">' + (i + 1) + '</td>' +
    '<td><input class="note-in" data-buyer="' + esc(r.buyer) + '" value="' + esc(r.label || '') +
    '" title="给这个账号加备注（只存在本机，导出时带上）" aria-label="给 ' + esc(r.buyer) + ' 加备注"></td>' +
    '<td>' + esc(r.buyer) + '</td>' +
    '<td class="num">' + r.count + '</td>' +
    '<td class="num">' + fixed(r.amount) + '</td>' +
    '<td class="num">' + fixed(r.ratio, 1) + '%</td>' +
    '<td>' + esc(r.first) + '</td>' +
    '<td>' + esc(r.last) + '</td>' +
    '</tr>').join('');
  box.innerHTML = '<div class="scroll"><table><thead><tr>' +
    '<th class="idx">#</th><th title="只写入本机 localStorage，不会上传">备注（本机）</th><th>账号</th><th class="num">笔数</th>' +
    '<th class="num">金额(元)</th><th class="num">占比</th><th>首次充值</th><th>最近充值</th>' +
    '</tr></thead><tbody>' + rows + '</tbody><tfoot class="tfoot"><tr>' +
    '<td></td><td>合计</td><td></td><td class="num">' + S.items.length + '</td>' +
    '<td class="num">' + fixed(total) + '</td><td class="num">100.0%</td><td></td><td></td>' +
    '</tr></tfoot></table></div>';
}

function renderDetail() {
  const box = $('pane-detail');
  if (!box) return;
  if (!S.items.length) {
    box.innerHTML = '<div class="empty">' + (S.all.length ? '这个时间范围内没有充值记录。' : '还没有查询结果。') + '</div>';
    return;
  }
  const rows = S.items.map((r, i) =>
    '<tr>' +
    '<td class="idx">' + (i + 1) + '</td>' +
    '<td>' + esc(r.time) + '</td>' +
    '<td class="num">' + fixed(r.amt) + '</td>' +
    '<td>' + esc(S.notes[r.buyer] || '') + '</td>' +
    '<td>' + esc(r.buyer) + '</td>' +
    '<td>' + esc(r.recNo) + '</td>' +
    '<td>' + esc(r.outNo) + '</td>' +
    '</tr>').join('');
  box.innerHTML = '<div class="scroll"><table><thead><tr>' +
    '<th class="idx">#</th><th>充值时间</th><th class="num">金额(元)</th><th title="只写入本机 localStorage，不会上传">备注（本机）</th>' +
    '<th>账号</th><th>记录号</th><th>外部订单号</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderPerson() {
  const sel = $('in-person');
  const body = $('person-body');
  if (!sel || !body) return;
  const prev = S.person || sel.value;
  if (!S.summary.length) {
    sel.innerHTML = '';
    body.innerHTML = '<div class="empty">' + (S.all.length ? '这个时间范围内没有充值记录。' : '还没有查询结果。') + '</div>';
    return;
  }
  if (!prev || !S.summary.some((r) => r.buyer === prev)) S.person = S.summary[0].buyer;
  else S.person = prev;
  sel.innerHTML = S.summary.map((r) =>
    '<option value="' + esc(r.buyer) + '"' + (r.buyer === S.person ? ' selected' : '') + '>' +
    esc(r.buyer) + (S.notes[r.buyer] ? '（' + esc(S.notes[r.buyer]) + '）' : '') +
    ' · ' + fixed(r.amount) + ' 元</option>').join('');
  const rows = S.items.filter((r) => r.buyer === S.person);
  const sum = rows.reduce((a, r) => a + num(r.amt), 0);
  const head = '<div class="person-head">账号 <b>' + esc(S.person) + '</b>' +
    (S.notes[S.person] ? ' · 备注 <b>' + esc(S.notes[S.person]) + '</b>' : '') +
    ' · 共 <b>' + rows.length + '</b> 笔 · 合计 <b>' + fixed(sum) + '</b> 元</div>';
  // 该账号在本房间全部记录里的占比，帮助识别是不是同一台空调/同一批人共用一个账号
  const allOfRoom = S.all.filter((r) => r.buyer === S.person).length;
  const extra = allOfRoom > rows.length
    ? '<div class="person-head">该账号在本房间全部记录中共 ' + allOfRoom + ' 笔，当前范围显示 ' + rows.length + ' 笔。</div>'
    : '';
  const table = rows.length
    ? '<div class="scroll"><table><thead><tr><th class="idx">#</th><th>充值时间</th>' +
      '<th class="num">金额(元)</th><th>记录号</th><th>外部订单号</th></tr></thead><tbody>' +
      rows.map((r, i) => '<tr><td class="idx">' + (i + 1) + '</td><td>' + esc(r.time) +
        '</td><td class="num">' + fixed(r.amt) + '</td><td>' + esc(r.recNo) +
        '</td><td>' + esc(r.outNo) + '</td></tr>').join('') +
      '</tbody></table></div>'
    : '<div class="empty">这个账号在当前范围内没有记录。</div>';
  body.innerHTML = head + extra + table;
}

function renderData() {
  const meta = $('data-meta');
  if (meta) meta.innerHTML = metaHtml();
  renderSummary();
  renderDetail();
  renderPerson();
  const qhint = $('q-hint');
  if (qhint) {
    qhint.textContent = api.getChannel().mode === 'demo'
      ? '当前是示例数据通道，记录为本地生成，仅用于预览界面与导出格式。'
      : '导出的是当前这次查询的结果，不会再请求一次接口。';
  }
}

/* ------------------------------------------------------------------ 查询 */
function rangeFromInputs() {
  const start = api.toApiTime($('in-start').value);
  const end = api.toApiTime($('in-end').value);
  S.range = { start, end, label: api.rangeLabel(start, end) };
  const tag = $('q-tag');
  if (tag) tag.textContent = S.range.label === '全部' ? '全部' : S.range.label;
}

function applyItems() {
  S.items = api.filterItems(S.all, S.range.start, S.range.end);
  S.summary = api.summarize(S.items, S.notes);
  renderData();
}

function setRange(kind) {
  const r = api.quickRange(kind);
  $('in-start').value = r.start;
  $('in-end').value = r.end;
  rangeFromInputs();
  store.set(KEY.range, kind);
  applyItems();
}

async function loadBalance(options = {}) {
  if (!S.room) { toast('先设置房间'); return; }
  const btn = $('btn-refresh-room');
  if (btn) { btn.disabled = true; btn.textContent = '刷新中…'; }
  try {
    S.balance = await api.queryRoom(S.room, options);
    renderBalance();
    if (options.silent !== true) toast('余额已更新');
  } catch (err) {
    S.balance = null;
    renderBalance();
    toast('取余额失败：' + (err && err.message ? err.message : err), 4200);
    revealChannel(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '刷新余额'; }
  }
}

async function runQuery(options = {}) {
  if (!S.room) { toast('先设置房间'); return; }
  const btn = $('btn-query');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>查询中'; }
  try {
    if (options.refetch || !S.all.length) {
      S.all = await api.fetchRecharge(S.room, 800);
      S.fetchedAt = new Date().toLocaleString('zh-CN', { hour12: false });
    }
    rangeFromInputs();
    applyItems();
    if (!S.all.length) toast('这个房间还没有充值记录');
    else toast('共 ' + S.items.length + ' 笔，' + S.summary.length + ' 个账号', 2000);
  } catch (err) {
    toast('查询失败：' + (err && err.message ? err.message : err), 4600);
    revealChannel(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '查询'; }
  }
}

/* ------------------------------------------------------------------ 房间 */
function readRoomInputs() {
  const cfg = {
    loudongNo: String($('in-loudong').value || '').trim(),
    roomNo: String($('in-room').value || '').trim(),
    xiaoquId: String($('in-xiaoqu').value || '').trim() || api.DEFAULT_XIAOQU,
    datasource: String($('in-datasource').value || '').trim() || api.DEFAULT_DATASOURCE,
  };
  return cfg;
}

function fillRoomInputs(cfg) {
  $('in-loudong').value = cfg.loudongNo || '';
  $('in-room').value = cfg.roomNo || '';
  $('in-xiaoqu').value = cfg.xiaoquId || api.DEFAULT_XIAOQU;
  $('in-datasource').value = cfg.datasource || api.DEFAULT_DATASOURCE;
}

function recentRooms() {
  const list = store.get(KEY.recent, []);
  return Array.isArray(list) ? list.filter((x) => x && x.loudongNo && x.roomNo).slice(0, 8) : [];
}

function pushRecent(cfg) {
  const list = recentRooms().filter((x) => !(x.loudongNo === cfg.loudongNo && x.roomNo === cfg.roomNo &&
    x.xiaoquId === cfg.xiaoquId && x.datasource === cfg.datasource));
  list.unshift({ loudongNo: cfg.loudongNo, roomNo: cfg.roomNo, xiaoquId: cfg.xiaoquId, datasource: cfg.datasource });
  store.set(KEY.recent, list.slice(0, 8));
  renderRecent();
}

function renderRecent() {
  const wrap = $('recent-rooms');
  const box = $('recent-list');
  if (!wrap || !box) return;
  const list = recentRooms();
  if (!list.length) { wrap.hidden = true; box.innerHTML = ''; return; }
  wrap.hidden = false;
  box.innerHTML = list.map((x) =>
    '<button class="recent-item" type="button" data-loudong="' + esc(x.loudongNo) +
    '" data-room="' + esc(x.roomNo) + '" data-xiaoqu="' + esc(x.xiaoquId) +
    '" data-datasource="' + esc(x.datasource) + '">' + esc(x.loudongNo) + ' 号楼 ' +
    esc(x.roomNo) + ' 室</button>').join('');
}

async function saveRoom(event) {
  if (event) event.preventDefault();
  const cfg = readRoomInputs();
  if (!cfg.loudongNo || !cfg.roomNo) { toast('楼栋号和房间号都要填'); return; }
  const btn = $('btn-save-room');
  if (btn) { btn.disabled = true; btn.textContent = '解析中…'; }
  try {
    S.all = [];
    S.items = [];
    S.summary = [];
    S.room = await api.resolveRoom(cfg);
    S.cfg = cfg;
    store.set(KEY.cfg, cfg);
    pushRecent(cfg);
    loadNotes();
    renderChips();
    renderBalance();
    renderData();
    toast('已定位 ' + roomDesc(), 2200);
    await Promise.all([loadBalance({ silent: true }), runQuery({ refetch: true })]);
  } catch (err) {
    S.room = null;
    renderChips();
    renderBalance();
    toast(err && err.message ? err.message : String(err), 5200);
    revealChannel(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '保存并重新解析'; }
  }
}

/* ------------------------------------------------------------------ 可用房间 */
let roomRows = [];

function shortRoomName(full, ln) {
  const s = String(full == null ? '' : full);
  return ln && s.indexOf(ln) === 0 ? s.slice(ln.length) : s;
}

async function loadRoomList(force) {
  const btn = $('btn-room-list');
  if (btn) { btn.disabled = true; btn.textContent = '读取中…'; }
  const xiaoquId = String($('in-xiaoqu').value || '').trim() || api.DEFAULT_XIAOQU;
  const datasource = String($('in-datasource').value || '').trim() || api.DEFAULT_DATASOURCE;
  try {
    roomRows = await api.allRooms(xiaoquId, datasource, force ? { force: true } : {});
    renderRoomList();
  } catch (err) {
    toast('读取房间列表失败：' + (err && err.message ? err.message : err), 5000);
    revealChannel(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '查询可用房间'; }
  }
}

function renderRoomList() {
  const wrap = $('room-list-wrap');
  const box = $('room-list');
  const note = $('room-list-note');
  if (!wrap || !box || !note) return;
  wrap.hidden = false;
  if (!roomRows.length) {
    note.textContent = '没有读到房间数据';
    box.innerHTML = '<div class="empty">接口没返回房间列表，先确认通道可用再试。</div>';
    return;
  }
  const ln = String($('in-loudong').value || '').trim();
  if (!ln) {
    const map = new Map();
    roomRows.forEach((r) => {
      const n = api.loudongNumber(r.loudong);
      if (!n) return;
      if (!map.has(n)) map.set(n, { n, name: r.loudong || (n + ' 号楼'), count: 0 });
      map.get(n).count += 1;
    });
    const items = Array.from(map.values()).sort((a, b) => a.n - b.n);
    note.textContent = '共 ' + items.length + ' 个楼栋 · 点楼栋就能看到该楼全部房间';
    box.innerHTML = items.map((x) =>
      '<button class="room-item" type="button" data-loudong="' + x.n + '">' + esc(x.name) +
      ' <span class="mini">' + x.count + ' 间</span></button>').join('');
    return;
  }
  const rows = roomRows
    .filter((r) => api.loudongNumber(r.loudong) === Number(ln))
    .map((r) => ({ id: r.roomId, short: shortRoomName(r.room, ln) }))
    .filter((r) => /^\d{2,}$/.test(r.short))
    .sort((a, b) => ((Number(a.short) || 0) - (Number(b.short) || 0)) || (a.short < b.short ? -1 : 1));
  const special = roomRows.filter((r) => api.loudongNumber(r.loudong) === Number(ln)).length - rows.length;
  note.textContent = ln + ' 号楼 · 共 ' + rows.length + ' 间 · 点房间号直接查询' +
    (special > 0 ? '（另有 ' + special + ' 间公用/备用房不支持按房间号定位）' : '');
  box.innerHTML = rows.length
    ? rows.map((r) => '<button class="room-item" type="button" data-room="' + esc(r.short) + '">' +
        esc(r.short) + '</button>').join('')
    : '<div class="empty">这个楼栋下没有房间，换个楼栋号试试。</div>';
}

async function onRoomListClick(event) {
  const btn = event.target.closest('.room-item');
  if (!btn) return;
  if (btn.dataset.loudong) {
    $('in-loudong').value = btn.dataset.loudong;
    renderRoomList();
    return;
  }
  if (btn.dataset.room) {
    $('in-room').value = btn.dataset.room;
    await saveRoom();
  }
}

/* ------------------------------------------------------------------ 中转检测 */
let relayList = [];

function relayCandidates() {
  const seen = new Set();
  const out = [];
  const add = (url, label, mode) => {
    const u = api.normalizeRelayBase(url);
    if (!u) return;
    const m = api.normalizeRelayMode(mode);
    const key = m + '|' + u;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: u, label, mode: m, state: 'idle', ms: 0, rooms: 0, note: '' });
  };
  const ch = api.getChannel();
  const saved = store.get(KEY.channel, null);
  add(($('in-relay') || {}).value, '输入框里填的地址', ch.relayMode);
  if (saved && saved.relayBase) add(saved.relayBase, '上次保存的地址', saved.relayMode);
  let q = '';
  try { q = new URLSearchParams(location.search).get('relay') || ''; } catch (e) { q = ''; }
  if (q) add(q, '链接参数 ?relay=', 'prefix');
  if (!/(^|\.)github\.io$/i.test(location.hostname)) add(location.origin, '本站同源（反向代理）', 'prefix');
  add('http://127.0.0.1:8787', '本机 Node 中转 127.0.0.1:8787', 'prefix');
  add('http://localhost:8787', '本机 Node 中转 localhost:8787', 'prefix');
  api.PUBLIC_RELAYS.forEach((x) => add(x.url, x.label + '（实测多半已失效）', x.mode));
  return out;
}

function renderRelayCandidates(list, boxId) {
  const box = $(boxId || 'relay-candidates');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = list.map((c, i) => {
    const state = c.state === 'ok' ? 'ok' : c.state === 'fail' ? 'fail' : 'idle';
    const meta = c.state === 'ok'
      ? '可用 · ' + c.ms + ' ms · 读到 ' + c.rooms + ' 个房间'
      : c.state === 'fail'
        ? '不可用 · ' + esc((c.note || '').slice(0, 110))
        : c.state === 'testing' ? '检测中…' : '未检测';
    const active = api.getChannel().mode === 'relay' &&
      api.getChannel().relayBase === c.url && api.getChannel().relayMode === c.mode;
    return '<div class="cand ' + state + (active ? ' on' : '') + '">' +
      '<div class="cand-main"><span class="cand-label">' + esc(c.label) + (active ? ' · 正在使用' : '') + '</span>' +
      '<code class="cand-url">' + esc(c.url) + '</code></div>' +
      '<div class="cand-meta">' + meta + '</div>' +
      '<button class="btn mini' + (state === 'ok' ? ' primary' : '') + '" type="button" data-pick="' + i + '"' +
      (c.state === 'testing' ? ' disabled' : '') + '>' + (state === 'ok' ? '用它查询' : '选用') + '</button>' +
      '</div>';
  }).join('');
}

async function detectRelays(target) {
  const opt = target || {};
  const boxId = opt.box || 'relay-candidates';
  const noteId = opt.note || 'detect-note';
  const btnId = opt.btn || 'btn-detect-relay';
  const btn = $(btnId);
  const note = $(noteId);
  relayList = relayCandidates();
  if (!relayList.length) { toast('没有可检测的地址，先在「中转地址」里填一个'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '检测中…'; }
  if (note) note.textContent = '正在并发实测 ' + relayList.length + ' 个候选地址…';
  relayList.forEach((c) => { c.state = 'testing'; });
  renderRelayCandidates(relayList, boxId);
  await Promise.all(relayList.map(async (c) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await api.probeRelay(c.url, c.mode, { signal: ctrl.signal });
      c.state = 'ok'; c.ms = r.ms; c.rooms = r.rooms; c.note = '';
    } catch (err) {
      c.state = 'fail';
      c.note = err && err.name === 'AbortError'
        ? '超时 9 秒没响应'
        : String((err && err.message) || err).slice(0, 120);
    } finally {
      clearTimeout(timer);
      renderRelayCandidates(relayList, boxId);
    }
  }));
  const okCount = relayList.filter((c) => c.state === 'ok').length;
  if (note) {
    note.textContent = okCount
      ? '检测完成：' + okCount + ' 个可用 · 点「用它查询」，地址会记在本机'
      : '检测完成：没有可用地址 · 按上面说明自建一个中转，或在「中转地址」里手填';
  }
  renderRelayCandidates(relayList, boxId);
  if (btn) { btn.disabled = false; btn.textContent = '自动检测可用中转'; }
  toast(okCount ? '找到 ' + okCount + ' 个可用中转' : '没有检测到可用中转', 4200);
}

async function pickRelay(index) {
  const c = relayList[index];
  if (!c) return;
  const saved = api.setChannel({ mode: 'relay', relayBase: c.url, relayMode: c.mode });
  store.set(KEY.channel, saved);
  const modeSel = $('in-mode');
  if (modeSel) modeSel.value = 'relay';
  const relayInput = $('in-relay');
  if (relayInput) relayInput.value = c.url;
  const field = relayInput && relayInput.closest ? relayInput.closest('.field') : null;
  if (field) field.hidden = false;
  renderChips();
  renderChannelNote();
  renderRelayCandidates(relayList);
  if (relayList.length) renderRelayCandidates(relayList, 'guide-cands');
  const guide = $('guide');
  if (guide && !guide.hidden && G.step <= 1) {
    const note = $('guide-detect-note');
    if (note) note.textContent = '已选用：' + c.label + ' · 下一步填入学年份';
    toast('已切换到：' + c.label, 2600);
    guideGo(2);
    return;
  }
  toast('已切换到：' + c.label, 2800);
  if (S.room) await runQuery({ refetch: true });
  else toast('通道就绪，接着在「房间设置」里选楼栋和房间就能查了', 3400);
}

function renderChannelNote() {
  const el = $('channel-note');
  if (!el) return;
  const ch = api.getChannel();
  if (ch.mode === 'demo') el.textContent = '当前：示例数据（不会请求学校接口）';
  else if (ch.mode === 'relay') {
    el.textContent = '当前：中转 ' + (ch.relayBase || '（未填）') +
      (ch.relayMode === 'query' ? '（公共代理模式）' : '');
  } else el.textContent = '当前：直连 pay.wxstc.cn —— 需要同源部署；在 Pages 上会被 CORS 拦，请改用中转';
}

/* ------------------------------------------------------------------ 抽屉 */
function openDrawer(which) {
  const drawer = $('drawer');
  const scrim = $('scrim');
  if (!drawer) return;
  const room = $('panel-room');
  const chan = $('panel-channel');
  const title = $('drawer-title');
  if (room) room.hidden = which !== 'room';
  if (chan) chan.hidden = which !== 'channel';
  if (title) title.textContent = which === 'channel' ? '中转通道' : '房间设置';
  drawer.hidden = false;
  drawer.setAttribute('aria-hidden', 'false');
  if (scrim) scrim.hidden = false;
  document.body.classList.add('no-scroll');
}

function closeDrawer() {
  const drawer = $('drawer');
  const scrim = $('scrim');
  if (drawer) { drawer.hidden = true; drawer.setAttribute('aria-hidden', 'true'); }
  if (scrim) scrim.hidden = true;
  document.body.classList.remove('no-scroll');
}

/* ------------------------------------------------------------------ 导出（先预览再下载） */
let pvKind = 'xlsx';
let pvView = 'summary';

function viewForTab() {
  if (S.tab === 'person') return 'person';
  return S.tab === 'detail' ? 'detail' : 'summary';
}

function currentSnapshot(view) {
  return {
    roomDesc: roomDesc(),
    label: S.range.label,
    items: S.items,
    notes: S.notes,
    view: view || 'all',
    person: S.person,
  };
}

function guardExport() {
  if (!S.room) { toast('先设置房间'); return false; }
  if (!S.items.length) { toast('当前没有可导出的记录'); return false; }
  return true;
}

function cellText(t, col, value) {
  const a = t.align[col];
  if (a === 'num') {
    const u = t.unit && t.unit[col];
    if (u === '%') return (Number(value) || 0).toFixed(1) + '%';
    if (u === 'int') return String(Math.trunc(Number(value) || 0));
    return num(value).toFixed(2);
  }
  return String(value == null ? '' : value);
}

function previewHtml(t) {
  const limit = 200;
  const rows = t.rows.slice(0, limit);
  const head = '<div class="scroll pv-scroll"><table class="pv-table"><thead><tr>' +
    t.head.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map((row) => '<tr>' + row.map((c, i) =>
      '<td' + (t.align[i] === 'num' ? ' class="num"' : t.align[i] === 'idx' ? ' class="idx"' : '') + '>' +
      esc(cellText(t, i, c)) + '</td>').join('') + '</tr>').join('') +
    '</tbody>' + (t.foot
      ? '<tfoot class="tfoot"><tr>' + t.foot.map((c, i) =>
        '<td' + (t.align[i] === 'num' ? ' class="num"' : '') + '>' + esc(cellText(t, i, c)) + '</td>').join('') + '</tr></tfoot>'
      : '') + '</table></div>';
  const more = t.rows.length > limit
    ? '<div class="hint">预览只显示前 ' + limit + ' 条，导出文件里是全部 ' + t.rows.length + ' 条。</div>'
    : '';
  return head + more;
}

function openPreview(kind) {
  if (!guardExport()) return;
  const view = viewForTab();
  if (view === 'person' && !S.person) { toast('先在「个人充值记录」里选一个账号'); return; }
  const snap = currentSnapshot(view);
  const t = viewTable(snap);
  pvKind = kind;
  pvView = view;
  const title = $('pv-title');
  if (title) title.textContent = (kind === 'xlsx' ? '导出 Excel · ' : '导出 Markdown · ') + (VIEWS[t.key] || {}).name;
  const meta = $('pv-meta');
  if (meta) {
    meta.innerHTML = '正在导出的表：<b>' + esc(t.title) + '</b>' +
      (t.note ? ' · ' + esc(t.note) : '') +
      ' · 房间 <b>' + esc(roomDesc()) + '</b> · 范围 <b>' + esc(S.range.label) + '</b> · 共 <b>' +
      (t.rows.length) + '</b> 条';
  }
  const body = $('pv-body');
  if (body) body.innerHTML = previewHtml(t);
  const note = $('pv-note');
  if (note) note.textContent = '确认后开始下载：' + fileName(roomDesc(), S.range.label, kind === 'xlsx' ? 'xlsx' : 'md', view);
  const ok = $('pv-ok');
  if (ok) ok.textContent = kind === 'xlsx' ? '确认导出 Excel' : '确认导出 Markdown';
  const pv = $('pv');
  if (pv) pv.hidden = false;
  document.body.classList.add('no-scroll');
}

function closePreview() {
  const pv = $('pv');
  if (pv) pv.hidden = true;
  document.body.classList.remove('no-scroll');
}

function doExport() {
  const snap = currentSnapshot(pvView);
  try {
    if (pvKind === 'xlsx') { downloadExcel(snap); toast('已导出 Excel · ' + (VIEWS[pvView] || {}).name); }
    else { downloadMarkdown(snap); toast('已导出 Markdown · ' + (VIEWS[pvView] || {}).name); }
    closePreview();
  } catch (err) {
    toast('导出失败：' + (err && err.message ? err.message : err), 4000);
  }
}

/* ------------------------------------------------------------------ 新用户引导 */
const G = { step: 1, year: '', loudong: '', rooms: [], loudongs: [] };

function guideOpen() {
  const box = $('guide');
  if (!box) return;
  box.hidden = false;
  document.body.classList.add('no-scroll');
  guideGo(1);
}

function guideClose(markDone) {
  const box = $('guide');
  if (box) box.hidden = true;
  document.body.classList.remove('no-scroll');
  if (markDone) store.set(KEY.guide, { done: 1, at: Date.now() });
}

function guideGo(step) {
  G.step = step;
  [1, 2, 3, 4].forEach((n) => {
    const el = $('gstep-' + n);
    if (el) el.hidden = n !== step;
  });
  const dots = document.querySelectorAll('#guide-dots .dot');
  dots.forEach((d, i) => d.classList.toggle('on', i === step - 1));
  const prev = $('btn-guide-prev');
  if (prev) prev.hidden = step === 1;
  const next = $('btn-guide-next');
  if (next) {
    next.hidden = step >= 3;
    next.textContent = step === 2 ? '下一步：选楼栋' : '下一步';
  }
  if (step === 2) {
    const input = $('in-enroll');
    if (input && !input.value) input.value = G.year || store.get(KEY.enroll, '') || '';
  }
  if (step === 3) loadGuideRooms();
}

async function loadGuideRooms() {
  const box = $('guide-loudong');
  const note = $('guide-loudong-note');
  if (!box) return;
  if (G.loudongs.length) { renderGuideLoudongs(); return; }
  if (note) note.textContent = '正在从缴费平台读取楼栋列表…';
  box.innerHTML = '<div class="empty"><span class="spin"></span>读取中…</div>';
  try {
    const cfg = readRoomInputs();
    const rows = await api.allRooms(cfg.xiaoquId, cfg.datasource);
    const map = new Map();
    rows.forEach((r) => {
      const n = api.loudongNumber(r.loudong);
      if (!n) return;
      if (!map.has(n)) map.set(n, { n, name: r.loudong || (n + ' 号楼'), count: 0 });
      map.get(n).count += 1;
    });
    G.rooms = rows;
    G.loudongs = Array.from(map.values()).sort((a, b) => a.n - b.n);
    renderGuideLoudongs();
  } catch (err) {
    if (note) note.textContent = '读取失败：' + (err && err.message ? err.message : err);
    box.innerHTML = '<div class="empty">没读到楼栋列表，请先回上一步确认通道可用。</div>';
    revealChannel(err);
  }
}

function renderGuideLoudongs() {
  const box = $('guide-loudong');
  const note = $('guide-loudong-note');
  if (!box) return;
  if (!G.loudongs.length) {
    note.textContent = '没有读到楼栋';
    box.innerHTML = '<div class="empty">接口没返回楼栋列表。</div>';
    return;
  }
  if (note) note.textContent = '共 ' + G.loudongs.length + ' 个楼栋 · 点一下继续';
  box.innerHTML = G.loudongs.map((x) =>
    '<button class="room-item" type="button" data-gloudong="' + x.n + '">' + esc(x.name) +
    ' <span class="mini">' + x.count + ' 间</span></button>').join('');
}

function guidePickLoudong(n) {
  G.loudong = String(n);
  const ln = Number(n);
  const rows = G.rooms
    .filter((r) => api.loudongNumber(r.loudong) === ln)
    .map((r) => ({ id: r.roomId, short: shortRoomName(r.room, G.loudong) }))
    .filter((r) => /^\d{2,}$/.test(r.short))
    .sort((a, b) => ((Number(a.short) || 0) - (Number(b.short) || 0)) || (a.short < b.short ? -1 : 1));
  const box = $('guide-room');
  const note = $('guide-room-note');
  if (note) note.textContent = G.loudong + ' 号楼 · 共 ' + rows.length + ' 间 · 点房间号完成引导';
  if (box) {
    box.innerHTML = rows.length
      ? rows.map((r) => '<button class="room-item" type="button" data-groom="' + esc(r.short) + '">' +
          esc(r.short) + '</button>').join('')
      : '<div class="empty">这个楼栋下没有可选房间。</div>';
  }
  guideGo(4);
}

function applyEnrollYear(year) {
  const r = api.yearStart(year);
  G.year = year ? String(r.year) : '';
  if (year) {
    store.set(KEY.enroll, G.year);
    $('in-start').value = r.start;
    $('in-end').value = r.end;
  } else {
    $('in-start').value = '';
    $('in-end').value = '';
  }
  rangeFromInputs();
  return r;
}

async function guideFinish(roomNo) {
  const year = $('in-enroll') ? String($('in-enroll').value || '').trim() : '';
  applyEnrollYear(year);
  $('in-loudong').value = G.loudong;
  $('in-room').value = roomNo;
  guideClose(true);
  toast('引导完成，正在查 ' + G.loudong + ' 号楼 ' + roomNo + ' 室', 3000);
  await saveRoom();
}

function guideNext() {
  if (G.step === 1) {
    const ch = api.getChannel();
    const needRelay = ch.mode === 'direct' && /\.github\.io$/i.test(location.hostname);
    if (needRelay) {
      toast('先点「检测可用中转」选一个，或点「先用示例数据看看」', 4200);
      return;
    }
    guideGo(2);
    return;
  }
  if (G.step === 2) {
    const raw = String($('in-enroll').value || '').trim();
    if (raw && !/^(19|20)\d{2}$/.test(raw)) { toast('入学年份填 4 位数字，例如 2022'); return; }
    const r = applyEnrollYear(raw);
    const note = $('guide-year-note');
    if (note) {
      note.textContent = raw
        ? '查询开始时间已设为 ' + r.start.replace('T', ' ') + '，结束时间 ' + r.end.replace('T', ' ')
        : '没有填年份，按「全部」查询。';
    }
    guideGo(3);
  }
}

/* ------------------------------------------------------------------ 通道 */
function loadChannelInputs() {
  const ch = api.getChannel();
  const mode = $('in-mode');
  const relay = $('in-relay');
  if (mode) mode.value = ch.mode;
  if (relay) relay.value = ch.relayBase || '';
  if (relay) relay.closest('.field').hidden = ch.mode !== 'relay';
  renderChannelNote();
}

async function applyChannel() {
  const mode = $('in-mode').value;
  const relayBase = String($('in-relay').value || '').trim();
  if (mode === 'relay' && !/^https?:\/\//i.test(relayBase)) {
    toast('中转地址要以 http:// 或 https:// 开头');
    return;
  }
  const btn = $('btn-test-channel');
  if (btn) { btn.disabled = true; btn.textContent = '测试中…'; }
  try {
    const saved = api.setChannel({ mode, relayBase, relayMode: api.getChannel().relayMode });
    store.set(KEY.channel, saved);
    renderChips();
    renderChannelNote();
    S.all = [];
    S.items = [];
    S.summary = [];
    renderData();
    // 用一次真实房间解析来验证通道是否可用
    const probe = S.room || await api.resolveRoom({
      loudongNo: '3', roomNo: '101',
      xiaoquId: $('in-xiaoqu').value || api.DEFAULT_XIAOQU,
      datasource: $('in-datasource').value || api.DEFAULT_DATASOURCE,
    }, { force: true });
    await api.queryRoom(probe);
    toast('通道可用：' + (api.CHANNELS[saved.mode] || {}).label, 2600);
    if (S.room) await runQuery({ refetch: true });
  } catch (err) {
    toast('通道测试失败：' + (err && err.message ? err.message : err), 5200);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '保存并测试'; }
  }
}

/* ------------------------------------------------------------------ 事件 */
function switchTab(name) {
  S.tab = name;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  ['summary', 'detail', 'person'].forEach((k) => {
    const pane = $('pane-' + k);
    if (pane) pane.hidden = k !== name;
  });
}

function bind() {
  $('form-room').addEventListener('submit', saveRoom);

  $('form-query').addEventListener('submit', (e) => {
    e.preventDefault();
    rangeFromInputs();
    applyItems();
  });

  document.querySelectorAll('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => setRange(btn.dataset.range));
  });

  $('btn-refresh-room').addEventListener('click', () => loadBalance());
  $('btn-query').addEventListener('click', () => runQuery({ refetch: false }));
  $('btn-export-xlsx').addEventListener('click', () => openPreview('xlsx'));
  $('btn-export-md').addEventListener('click', () => openPreview('md'));

  // 抽屉：房间设置 / 中转通道
  const openRoom = $('btn-open-room');
  if (openRoom) openRoom.addEventListener('click', () => openDrawer('room'));
  const openChan = $('btn-open-channel');
  if (openChan) openChan.addEventListener('click', () => openDrawer('channel'));
  const closeBtn = $('btn-close-drawer');
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  const scrim = $('scrim');
  if (scrim) scrim.addEventListener('click', closeDrawer);

  // 导出预览
  const pvOk = $('pv-ok');
  if (pvOk) pvOk.addEventListener('click', doExport);
  const pvCancel = $('pv-cancel');
  if (pvCancel) pvCancel.addEventListener('click', closePreview);
  const pvClose = $('pv-close');
  if (pvClose) pvClose.addEventListener('click', closePreview);

  // 引导
  const gDetect = $('guide-detect');
  if (gDetect) gDetect.addEventListener('click', () => detectRelays({ box: 'guide-cands', note: 'guide-detect-note', btn: 'guide-detect' }));
  const gDemo = $('guide-demo');
  if (gDemo) {
    gDemo.addEventListener('click', () => {
      const saved = api.setChannel({ mode: 'demo', relayBase: '' });
      store.set(KEY.channel, saved);
      renderChips();
      const note = $('guide-detect-note');
      if (note) note.textContent = '已切到示例数据（只看界面），点「下一步」继续';
      guideGo(2);
    });
  }
  const gNext = $('btn-guide-next');
  if (gNext) gNext.addEventListener('click', guideNext);
  const gPrev = $('btn-guide-prev');
  if (gPrev) gPrev.addEventListener('click', () => guideGo(Math.max(1, G.step - 1)));
  const gSkip = $('btn-guide-skip');
  if (gSkip) gSkip.addEventListener('click', () => { guideClose(true); toast('已跳过引导，可随时在页面底部点「重新查看使用引导」'); });
  const gLoudong = $('guide-loudong');
  if (gLoudong) {
    gLoudong.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-gloudong]');
      if (btn) guidePickLoudong(btn.dataset.gloudong);
    });
  }
  const gRoom = $('guide-room');
  if (gRoom) {
    gRoom.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-groom]');
      if (btn) guideFinish(btn.dataset.groom);
    });
  }
  const gCands = $('guide-cands');
  if (gCands) {
    gCands.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick]');
      if (btn) pickRelay(Number(btn.dataset.pick));
    });
  }
  const reopen = $('btn-open-guide');
  if (reopen) reopen.addEventListener('click', (e) => { if (e) e.preventDefault(); G.loudongs = []; G.rooms = []; guideOpen(); });

  const btnClear = $('btn-clear-local');
  if (btnClear) {
    btnClear.addEventListener('click', (e) => {
      if (e) e.preventDefault();
      try {
        Object.keys(localStorage).forEach((k) => {
          if (k.indexOf('wxsc.elec.') === 0) localStorage.removeItem(k);
        });
      } catch (err) { /* 隐私模式忽略 */ }
      S.notes = {};
      renderData();
      toast('已清除本机设置与备注');
    });
  }

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $('in-person').addEventListener('change', (e) => {
    S.person = e.target.value;
    renderPerson();
  });

  // 备注：输入即存本机，仅影响显示与导出
  let noteTimer = 0;
  $('pane-summary').addEventListener('input', (e) => {
    const input = e.target.closest('.note-in');
    if (!input) return;
    const buyer = input.dataset.buyer;
    const text = input.value.trim();
    if (text) S.notes[buyer] = text;
    else delete S.notes[buyer];
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      saveNotes();
      S.summary = api.summarize(S.items, S.notes);
      renderDetail();
      renderPerson();
    }, 220);
  });

  $('recent-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.recent-item');
    if (!btn) return;
    $('in-loudong').value = btn.dataset.loudong;
    $('in-room').value = btn.dataset.room;
    $('in-xiaoqu').value = btn.dataset.xiaoqu;
    $('in-datasource').value = btn.dataset.datasource;
    saveRoom();
  });

  $('in-mode').addEventListener('change', () => {
    const field = $('in-relay').closest('.field');
    if (field) field.hidden = $('in-mode').value !== 'relay';
  });
  $('btn-test-channel').addEventListener('click', applyChannel);

  // 可用房间
  const btnRooms = $('btn-room-list');
  if (btnRooms) btnRooms.addEventListener('click', () => loadRoomList(false));
  const roomBox = $('room-list');
  if (roomBox) roomBox.addEventListener('click', onRoomListClick);
  const closeRooms = $('btn-room-list-close');
  if (closeRooms) closeRooms.addEventListener('click', () => { $('room-list-wrap').hidden = true; });

  // 改了楼栋号，若房间列表已展开就按新楼栋重排（不额外发请求）
  let ldTimer = 0;
  $('in-loudong').addEventListener('input', () => {
    const wrap = $('room-list-wrap');
    if (!wrap || wrap.hidden || !roomRows.length) return;
    clearTimeout(ldTimer);
    ldTimer = setTimeout(renderRoomList, 200);
  });

  // 中转自动检测
  const btnDetect = $('btn-detect-relay');
  if (btnDetect) btnDetect.addEventListener('click', detectRelays);
  const candBox = $('relay-candidates');
  if (candBox) {
    candBox.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick]');
      if (btn) pickRelay(Number(btn.dataset.pick));
    });
  }

  // 一键复制 Worker 源码
  const btnCopy = $('btn-copy-worker');
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      try {
        const res = await fetch('relay/worker.js', { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const code = await res.text();
        await navigator.clipboard.writeText(code);
        btnCopy.textContent = '已复制，粘贴到 Cloudflare 编辑器';
        setTimeout(() => { btnCopy.textContent = '复制 Worker 代码'; }, 2600);
        toast('Worker 代码已复制');
      } catch (err) {
        toast('复制失败：' + err.message + '（可直接打开 relay/worker.js 复制）');
      }
    });
  }
}

/* ------------------------------------------------------------------ 启动 */
async function boot() {
  const params = new URLSearchParams(location.search);
  const qRelay = params.get('relay');
  const qMode = params.get('mode');
  if (qRelay || qMode) {
    const saved = api.setChannel({
      mode: qMode === 'demo' || qMode === 'direct' ? qMode : (qRelay ? 'relay' : 'direct'),
      relayBase: qRelay || '',
    });
    store.set(KEY.channel, saved);
  }

  const qLoudong = params.get('loudong') || params.get('l');
  const qRoom = params.get('room') || params.get('r');
  if (qLoudong && qRoom) store.set(KEY.cfg, {
    loudongNo: String(qLoudong).trim(),
    roomNo: String(qRoom).trim(),
    xiaoquId: String(params.get('xiaoqu') || api.DEFAULT_XIAOQU),
    datasource: String(params.get('datasource') || api.DEFAULT_DATASOURCE),
  });

  const savedCfg = store.get(KEY.cfg, null);
  if (savedCfg && typeof savedCfg === 'object') {
    S.cfg = {
      loudongNo: String(savedCfg.loudongNo || ''),
      roomNo: String(savedCfg.roomNo || ''),
      xiaoquId: String(savedCfg.xiaoquId || api.DEFAULT_XIAOQU),
      datasource: String(savedCfg.datasource || api.DEFAULT_DATASOURCE),
    };
  }
  fillRoomInputs(S.cfg);

  const savedCh = store.get(KEY.channel, null);
  if (savedCh && typeof savedCh === 'object') api.setChannel(savedCh);
  loadChannelInputs();
  renderChips();

  const qRange = params.get('range');
  if (qRange) store.set(KEY.range, qRange);

  const kind = store.get(KEY.range, 'month');
  const initial = api.quickRange(typeof kind === 'string' ? kind : 'month');
  $('in-start').value = initial.start;
  $('in-end').value = initial.end;
  rangeFromInputs();

  bind();
  renderRecent();
  switchTab('summary');
  renderBalance();
  renderData();

  const done = store.get(KEY.guide, null);
  const forced = params.get('guide') === '1';
  const hidden = params.get('guide') === '0';
  const hasRoom = !!(S.cfg.loudongNo && S.cfg.roomNo);

  // 有存过的房间就自动恢复，省掉每次手填
  if (hasRoom) await saveRoom();

  // 新用户（没有房间设置、也没看完引导）默认弹出引导
  if (forced || (!hidden && !(done && done.done))) guideOpen();
}

boot();
