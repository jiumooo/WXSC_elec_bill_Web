/* ==========================================================================
 * 导出：Markdown / Excel
 * 输入是「一次查询的快照」，与页面上展示的数据完全一致，
 * 不存在二次请求，因此并发查询不会互相污染导出内容。
 * ========================================================================== */
import { buildXlsx, STYLE } from './xlsx.js';
import { summarize, sumAmount } from './api.js';

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

export function fileName(roomDesc, label, ext) {
  return '充值台账-' + safeName(roomDesc, '房间') + '-' + safeName(label, '全部') + '-' + stamp() + '.' + ext;
}

export function buildMarkdown(snapshot) {
  const { roomDesc, label, items, notes = {} } = snapshot;
  const summary = summarize(items, notes);
  const total = sumAmount(items);
  const lines = [];

  lines.push('# 电费充值台账 · ' + roomDesc);
  lines.push('');
  lines.push('| 项目 | 值 |');
  lines.push('| --- | --- |');
  lines.push('| 房间 | ' + roomDesc + ' |');
  lines.push('| 时间范围 | ' + label + ' |');
  lines.push('| 笔数 | ' + items.length + ' |');
  lines.push('| 合计金额 | ' + total.toFixed(2) + ' 元 |');
  lines.push('| 涉及人数 | ' + summary.length + ' |');
  if (items.length) {
    const times = items.map((r) => r.time).sort();
    lines.push('| 时间跨度 | ' + times[0] + ' ~ ' + times[times.length - 1] + ' |');
  }
  lines.push('| 导出时间 | ' + new Date().toLocaleString('zh-CN', { hour12: false }) + ' |');
  lines.push('');
  lines.push('## 一、每人充值汇总');
  lines.push('');
  lines.push('| # | 备注 | 账号 | 笔数 | 金额(元) | 占比 | 首次充值 | 最近充值 |');
  lines.push('| ---: | --- | --- | ---: | ---: | ---: | --- | --- |');
  summary.forEach((r, i) => {
    lines.push('| ' + (i + 1) + ' | ' + (r.label || '') + ' | `' + r.buyer + '` | ' + r.count +
      ' | ' + r.amount.toFixed(2) + ' | ' + r.ratio.toFixed(1) + '% | ' + r.first + ' | ' + r.last + ' |');
  });
  lines.push('| | **合计** | | **' + items.length + '** | **' + total.toFixed(2) + '** | 100% | | |');
  lines.push('');
  lines.push('## 二、充值明细（按时间倒序）');
  lines.push('');
  lines.push('| # | 充值时间 | 金额(元) | 备注 | 账号 | 记录号 | 外部订单号 |');
  lines.push('| ---: | --- | ---: | --- | --- | --- | --- |');
  items.forEach((r, i) => {
    lines.push('| ' + (i + 1) + ' | ' + r.time + ' | ' + r.amt.toFixed(2) + ' | ' + (notes[r.buyer] || '') +
      ' | `' + r.buyer + '` | ' + r.recNo + ' | ' + r.outNo + ' |');
  });
  lines.push('');
  return lines.join('\n');
}

export function buildExcel(snapshot) {
  const { roomDesc, label, items, notes = {} } = snapshot;
  const summary = summarize(items, notes);
  const total = sumAmount(items);

  const summaryRows = [[
    { v: '#', s: STYLE.HEAD },
    { v: '备注', s: STYLE.HEAD },
    { v: '账号', s: STYLE.HEAD },
    { v: '笔数', s: STYLE.HEAD },
    { v: '金额(元)', s: STYLE.HEAD },
    { v: '占比', s: STYLE.HEAD },
    { v: '首次充值', s: STYLE.HEAD },
    { v: '最近充值', s: STYLE.HEAD },
  ]];

  summary.forEach((r, i) => {
    summaryRows.push([
      { v: i + 1, t: 'n', s: STYLE.CENTER },
      { v: r.label || '', s: STYLE.TEXT },
      { v: r.buyer, s: STYLE.TEXT },
      { v: r.count, t: 'n', s: STYLE.NUM },
      { v: r.amount, t: 'n', s: STYLE.NUM },
      { v: (Number(r.ratio) || 0) / 100, t: 'n', s: STYLE.PCT },
      { v: r.first, s: STYLE.TEXT },
      { v: r.last, s: STYLE.TEXT },
    ]);
  });
  summaryRows.push([
    { v: '合计', s: STYLE.TEXT },
    { v: '', s: STYLE.TEXT },
    { v: '', s: STYLE.TEXT },
    { v: items.length, t: 'n', s: STYLE.NUM },
    { v: total, t: 'n', s: STYLE.NUM },
    { v: 1, t: 'n', s: STYLE.PCT },
    { v: '', s: STYLE.TEXT },
    { v: '', s: STYLE.TEXT },
  ]);

  const detailRows = [[
    { v: '序号', s: STYLE.HEAD },
    { v: '充值时间', s: STYLE.HEAD },
    { v: '金额(元)', s: STYLE.HEAD },
    { v: '备注', s: STYLE.HEAD },
    { v: '账号', s: STYLE.HEAD },
    { v: '记录号', s: STYLE.HEAD },
    { v: '外部订单号', s: STYLE.HEAD },
  ]];
  items.forEach((r, i) => {
    detailRows.push([
      { v: i + 1, t: 'n', s: STYLE.CENTER },
      { v: r.time, s: STYLE.TEXT },
      { v: r.amt, t: 'n', s: STYLE.NUM },
      { v: notes[r.buyer] || '', s: STYLE.TEXT },
      { v: r.buyer, s: STYLE.TEXT },
      { v: r.recNo, s: STYLE.TEXT },
      { v: r.outNo, s: STYLE.TEXT },
    ]);
  });

  const infoRows = [
    [{ v: '项目', s: STYLE.HEAD }, { v: '值', s: STYLE.HEAD }],
    [{ v: '房间', s: STYLE.TEXT }, { v: roomDesc, s: STYLE.TEXT }],
    [{ v: '时间范围', s: STYLE.TEXT }, { v: label, s: STYLE.TEXT }],
    [{ v: '笔数', s: STYLE.TEXT }, { v: items.length, t: 'n', s: STYLE.NUM }],
    [{ v: '合计金额(元)', s: STYLE.TEXT }, { v: total, t: 'n', s: STYLE.NUM }],
    [{ v: '涉及人数', s: STYLE.TEXT }, { v: summary.length, t: 'n', s: STYLE.NUM }],
    [{ v: '导出时间', s: STYLE.TEXT }, { v: new Date().toLocaleString('zh-CN', { hour12: false }), s: STYLE.TEXT }],
  ];

  return buildXlsx([
    { name: '每人汇总', rows: summaryRows, cols: [6, 16, 14, 8, 12, 10, 22, 22], freeze: 1, active: true },
    { name: '充值明细', rows: detailRows, cols: [7, 21, 12, 14, 14, 12, 16], freeze: 1 },
    { name: '信息', rows: infoRows, cols: [16, 34], freeze: 1 },
  ]);
}

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
    fileName(snapshot.roomDesc, snapshot.label, 'md'), 'text/markdown;charset=utf-8');
}

export function downloadExcel(snapshot) {
  const bytes = buildExcel(snapshot);
  download(bytes, fileName(snapshot.roomDesc, snapshot.label, 'xlsx'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
