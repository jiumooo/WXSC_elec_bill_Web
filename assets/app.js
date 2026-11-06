/* WXSC_elec_bill_Web · 页面控制器
 * 隔离性说明：
 *   1. 页面没有任何后端会话；每次查询只带上「你自己这次填/存的房间参数」。
 *   2. 查询结果只活在当前标签页的内存里，不写 localStorage、不写任何共享缓存。
 *   3. localStorage 仅保存三项本机偏好：房间设置、通道设置、备注名；都没有别人能读到。
 *   4. 因此多人同时打开、各查各的房间时，彼此的请求与结果完全独立。
 */
import * as api from './api.js';
import { downloadMarkdown, downloadExcel } from './export.js';

const KEY = {
  cfg: 'wxsc.elec.cfg.v1',
  channel: 'wxsc.elec.channel.v1',
  notes: 'wxsc.elec.notes.v1.',
  recent: 'wxsc.elec.recent.v1',
  range: 'wxsc.elec.range.v1',
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

/* 取数失败时把「数据通道」展开并聚焦中转地址，省掉用户自己翻设置 */
function revealChannel(err) {
  const msg = String((err && err.message) || err || '');
  const isNetwork = /网络请求失败|Failed to fetch|NetworkError|Load failed|CORS/i.test(msg);
  if (!isNetwork) return;
  const details = $('card-channel');
  if (details && 'open' in details) details.open = true;
  const mode = $('in-mode');
  if (mode && api.getChannel().mode === 'direct') mode.value = 'relay';
  const relay = $('in-relay');
  const field = relay && relay.closest ? relay.closest('.field') : null;
  if (field) field.hidden = false;
  if (details && details.scrollIntoView) details.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  setChip('chip-channel', '通道：' + label, ch.mode === 'demo' ? 'warn' : ch.mode === 'relay' ? 'ok' : '');
  setChip('chip-room', S.room ? roomDesc() : '未设置房间', '');
  const tag = $('channel-tag');
  if (tag) tag.textContent = label;
  const note = $('channel-note');
  if (note) {
    note.textContent = ch.mode === 'demo'
      ? '当前：示例数据（不会请求学校接口，仅用于预览界面）'
      : ch.mode === 'relay'
        ? '当前：经由自建中转 ' + (ch.relayBase || '（地址为空）')
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

/* ------------------------------------------------------------------ 导出 */
function guardExport() {
  if (!S.room) { toast('先设置房间'); return false; }
  if (!S.items.length) { toast('当前没有可导出的记录'); return false; }
  return true;
}

function snapshot() {
  return {
    roomDesc: roomDesc(),
    label: S.range.label,
    items: S.items,
    notes: S.notes,
  };
}

function exportExcel() {
  if (!guardExport()) return;
  try { downloadExcel(snapshot()); toast('已导出 Excel'); }
  catch (err) { toast('导出失败：' + (err && err.message ? err.message : err), 4000); }
}

function exportMarkdown() {
  if (!guardExport()) return;
  try { downloadMarkdown(snapshot()); toast('已导出 Markdown'); }
  catch (err) { toast('导出失败：' + (err && err.message ? err.message : err), 4000); }
}

/* ------------------------------------------------------------------ 通道 */
function loadChannelInputs() {
  const ch = api.getChannel();
  const mode = $('in-mode');
  const relay = $('in-relay');
  if (mode) mode.value = ch.mode;
  if (relay) relay.value = ch.relayBase || '';
  if (relay) relay.closest('.field').hidden = ch.mode !== 'relay';
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
    const saved = api.setChannel({ mode, relayBase });
    store.set(KEY.channel, saved);
    renderChips();
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
  $('btn-export-xlsx').addEventListener('click', exportExcel);
  $('btn-export-md').addEventListener('click', exportMarkdown);

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
}

/* ------------------------------------------------------------------ 启动 */
function boot() {
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

  // 有存过的房间就自动恢复，省掉每次手填
  if (S.cfg.loudongNo && S.cfg.roomNo) {
    saveRoom();
  }
}

boot();
