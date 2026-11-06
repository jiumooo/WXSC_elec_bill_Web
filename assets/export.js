/* ==========================================================================
 * 导出：Markdown / Excel（1.1.0：按「当前选中的那张表」导出）
 * 输入是「一次查询的快照」，与页面上展示的数据完全一致，
 * 不存在二次请求，因此并发查询不会互相污染导出内容。
 *
 * snapshot = { roomDesc, label, items, notes, view, person }
 *   view: 'summary' | 'detail' | 'person' | 'all'（缺省 all = 汇总 + 明细）
 * ========================================================================== */
import { buildXlsx, STYLE } from './xlsx.js';
import { summarize, sumAmount } from './api.js';

export const VIEWS = {
  summary: { name: '每人汇总', title: '每人充值汇总', file: '每人汇总' },
  detail: { name: '充值明细', title: '充值明细（按时间倒序）', file: '充值明细' },
  person: { name: '个人充值', title: '个人充值记录', file: '个人充值' },
};

export function safeName(text, fallback = 'export') {
  const out = String(text == null ? '' : text)
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return out || fallback;
}

export function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

export function fileName(roomDesc, label, ext, view) {
  const v = view && VIEWS[view] ? VIEWS[view].file + '-' : '';
  return '充值台账-' + safeName(roomDesc, '房间') + '-' + v + rangeToken(label) + '-' + stamp() + '.' + ext;
}

/** 文件名里的范围：只保留日期部分，压缩成 2022-01-01~2026-11-07 这种短标签 */
export function rangeToken(label) {
  const raw = String(label == null ? '' : label).trim();
  if (!raw || raw === '全部') return '全部';
  const parts = raw.split('~').map((s) => s.trim());
  if (parts.length === 2) {
    const d = (s, edge) => {
      const m = /\d{4}-\d{2}-\d{2}/.exec(s);
      if (m) return m[0];
      return edge === 'start' ? s : s;
    };
    const a = d(parts[0], 'start');
    const b = d(parts[1], 'end');
    return safeName(a + '~' + b, '范围');
  }
  return safeName(raw.replace(/\s+/g, ''), '范围');
}

/* 每个视图对应的数据表：供导出与页面预览共用，保证「预览即导出」 */
export function viewTable(snapshot) {
  const { roomDesc, label, items = [], notes = {}, view = 'all', person = '' } = snapshot;
  const summary = summarize(items, notes);
  const total = sumAmount(items);
  const meta = { roomDesc, label, items, summary, total };

  if (view === 'summary') {
    return Object.assign(meta, {
      key: 'summary',
      title: '每人充值汇总',
      head: ['#', '备注（本机）', '账号', '笔数', '金额(元)', '占比', '首次充值', '最近充值'],
      align: ['idx', 'text', 'text', 'num', 'num', 'num', 'text', 'text'],
      rows: summary.map((r, i) => [i + 1, r.label || '', r.buyer, r.count, r.amount, r.ratio, r.first, r.last]),
      foot: ['', '合计', '', items.length, total, 100, '', ''],
      unit: { 3: 'int', 4: '元', 5: '%' },
    });
  }

  if (view === 'person') {
    const rows = items.filter((r) => r.buyer === person);
    const sum = rows.reduce((a, r) => a + (Number(r.amt) || 0), 0);
    return Object.assign(meta, {
      key: 'person',
      title: '个人充值记录',
      head: ['#', '充值时间', '金额(元)', '记录号', '外部订单号'],
      align: ['idx', 'text', 'num', 'text', 'text'],
      rows: rows.map((r, i) => [i + 1, r.time, r.amt, r.recNo, r.outNo]),
      foot: ['', '合计', sum, rows.length + ' 笔', ''],
      unit: { 2: '元' },
      note: '账号 ' + (person || '—') + (notes[person] ? '（' + notes[person] + '）' : ''),
      count: rows.length,
    });
  }

  // detail
  return Object.assign(meta, {
    key: 'detail',
    title: '充值明细（按时间倒序）',
    head: ['#', '充值时间', '金额(元)', '备注（本机）', '账号', '记录号', '外部订单号'],
    align: ['idx', 'text', 'num', 'text', 'text', 'text', 'text'],
    rows: items.map((r, i) => [i + 1, r.time, r.amt, notes[r.buyer] || '', r.buyer, r.recNo, r.outNo]),
    foot: null,
    unit: { 2: '元' },
  });
}

/* ------------------------------------------------------------------ Markdown */
function mdCell(v) {
  return String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

export function buildMarkdown(snapshot) {
  const { roomDesc, label, items = [], notes = {} } = snapshot;
  const view = snapshot.view || 'all';
  const summary = summarize(items, notes);
  const total = sumAmount(items);
  const lines = [];

  const head = (title) => {
    lines.push('# 电费充值台账 · ' + roomDesc);
    lines.push('');
    if (title) lines.push('## ' + title);
    if (title) lines.push('');
    lines.push('| 项目 | 值 |');
    lines.push('| --- | --- |');
    lines.push('| 房间 | ' + mdCell(roomDesc) + ' |');
    lines.push('| 时间范围 | ' + mdCell(label) + ' |');
    lines.push('| 笔数 | ' + items.length + ' |');
    lines.push('| 合计金额 | ' + total.toFixed(2) + ' 元 |');
    lines.push('| 涉及人数 | ' + summary.length + ' |');
    if (items.length) {
      const times = items.map((r) => r.time).sort();
      lines.push('| 时间跨度 | ' + mdCell(times[0]) + ' ~ ' + mdCell(times[times.length - 1]) + ' |');
    }
    lines.push('| 导出时间 | ' + new Date().toLocaleString('zh-CN', { hour12: false }) + ' |');
    lines.push('');
  };

  const render = (t) => {
    const fmt = (i, v) => {
      if (t.align[i] !== 'num') return mdCell(v);
      const u = t.unit && t.unit[i];
      if (u === '%') return (Number(v) || 0).toFixed(1) + '%';
      if (u === 'int') return String(Math.trunc(Number(v) || 0));
      return (Number(v) || 0).toFixed(2);
    };
    lines.push('| ' + t.head.map(mdCell).join(' | ') + ' |');
    lines.push('| ' + t.align.map((a) => (a === 'num' || a === 'idx' ? '---:' : '---')).join(' | ') + ' |');
    t.rows.forEach((row) => {
      lines.push('| ' + row.map((c, i) => (t.align[i] === 'text' && i === 2 && t.key === 'summary')
        ? '`' + mdCell(c) + '`' : fmt(i, c)).join(' | ') + ' |');
    });
    if (t.foot) lines.push('| ' + t.foot.map((c, i) => fmt(i, c)).join(' | ') + ' |');
    lines.push('');
  };

  if (view === 'all') {
    lines.push('# 电费充值台账 · ' + roomDesc);
    lines.push('');
    lines.push('| 项目 | 值 |');
    lines.push('| --- | --- |');
    lines.push('| 房间 | ' + mdCell(roomDesc) + ' |');
    lines.push('| 时间范围 | ' + mdCell(label) + ' |');
    lines.push('| 笔数 | ' + items.length + ' |');
    lines.push('| 合计金额 | ' + total.toFixed(2) + ' 元 |');
    lines.push('| 涉及人数 | ' + summary.length + ' |');
    lines.push('| 导出时间 | ' + new Date().toLocaleString('zh-CN', { hour12: false }) + ' |');
    lines.push('');
    lines.push('## 一、每人充值汇总');
    lines.push('');
    render(viewTable(Object.assign({}, snapshot, { view: 'summary' })));
    lines.push('## 二、充值明细（按时间倒序）');
    lines.push('');
    render(viewTable(Object.assign({}, snapshot, { view: 'detail' })));
    return lines.join('\n');
  }

  head('');
  if (view === 'person' && snapshot.person) {
    lines.push('当前账号：`' + mdCell(snapshot.person) + '`' + (notes[snapshot.person] ? '（' + mdCell(notes[snapshot.person]) + '）' : ''));
    lines.push('');
  }
  render(viewTable(snapshot));
  return lines.join('\n');
}

/* ------------------------------------------------------------------ Excel */
const COLS = {
  summary: [6, 18, 14, 8, 12, 10, 22, 22],
  detail: [7, 21, 12, 18, 14, 12, 16],
  person: [7, 21, 12, 12, 16],
};

function numStyle(t, col, value) {
  const u = t.unit && t.unit[col];
  if (u === '%') return { v: (Number(value) || 0) / 100, t: 'n', s: STYLE.PCT };
  if (u === 'int') return { v: Math.trunc(Number(value) || 0), t: 'n', s: STYLE.INT };
  return { v: Number(value) || 0, t: 'n', s: STYLE.NUM };
}

function sheetFor(t, name, active) {
  const rows = [t.head.map((h) => ({ v: h, s: STYLE.HEAD }))];
  t.rows.forEach((row) => {
    rows.push(row.map((c, i) => {
      const a = t.align[i];
      if (a === 'num') return numStyle(t, i, c);
      if (a === 'idx') return { v: Number(c) || 0, t: 'n', s: STYLE.CENTER };
      return { v: c == null ? '' : String(c), s: STYLE.TEXT };
    }));
  });
  if (t.foot) {
    rows.push(t.foot.map((c, i) => {
      const a = t.align[i];
      if (a === 'num') return numStyle(t, i, c);
      return { v: c == null ? '' : String(c), s: STYLE.TEXT };
    }));
  }
  return { name, rows, cols: COLS[t.key] || COLS.detail, freeze: 1, active: !!active };
}

function infoSheet(snapshot) {
  const { roomDesc, label, items = [], notes = {}, person = '' } = snapshot;
  const summary = summarize(items, notes);
  const total = sumAmount(items);
  return {
    name: '信息',
    cols: [16, 38],
    rows: [
      [{ v: '项目', s: STYLE.HEAD }, { v: '值', s: STYLE.HEAD }],
      [{ v: '房间', s: STYLE.TEXT }, { v: roomDesc, s: STYLE.TEXT }],
      [{ v: '时间范围', s: STYLE.TEXT }, { v: label, s: STYLE.TEXT }],
      [{ v: '笔数', s: STYLE.TEXT }, { v: items.length, t: 'n', s: STYLE.NUM }],
      [{ v: '合计金额(元)', s: STYLE.TEXT }, { v: total, t: 'n', s: STYLE.NUM }],
      [{ v: '涉及人数', s: STYLE.TEXT }, { v: summary.length, t: 'n', s: STYLE.NUM }],
      ...(person ? [[{ v: '当前账号', s: STYLE.TEXT }, { v: person, s: STYLE.TEXT }]] : []),
      [{ v: '导出时间', s: STYLE.TEXT }, { v: new Date().toLocaleString('zh-CN', { hour12: false }), s: STYLE.TEXT }],
    ],
  };
}

export function buildExcel(snapshot) {
  const view = snapshot.view || 'all';
  if (view === 'all') {
    return buildXlsx([
      sheetFor(viewTable(Object.assign({}, snapshot, { view: 'summary' })), '每人汇总', true),
      sheetFor(viewTable(Object.assign({}, snapshot, { view: 'detail' })), '充值明细', false),
      infoSheet(snapshot),
    ]);
  }
  const t = viewTable(snapshot);
  return buildXlsx([
    sheetFor(t, VIEWS[t.key].name, true),
    infoSheet(snapshot),
  ]);
}

/* ------------------------------------------------------------------ 下载 */
export function download(bytes, filename, mime) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadMarkdown(snapshot) {
  const text = buildMarkdown(snapshot);
  download(new Blob([text], { type: 'text/markdown;charset=utf-8' }),
    fileName(snapshot.roomDesc, snapshot.label, 'md', snapshot.view), 'text/markdown;charset=utf-8');
}

export function downloadExcel(snapshot) {
  const bytes = buildExcel(snapshot);
  download(bytes, fileName(snapshot.roomDesc, snapshot.label, 'xlsx', snapshot.view),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
