/* 由 tools/bundle.mjs 生成，请勿直接编辑。
   源码：assets/{xlsx,api,export,app}.js —— 改完跑 node tools/bundle.mjs 重新生成。 */
/* ---- assets/xlsx.js ---- */
/* ==========================================================================
 * 极简 XLSX 生成器（零依赖）
 * 用 ZIP(store) + SpreadsheetML 直接拼出一个 Excel 能打开的 .xlsx
 * ========================================================================== */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

function zipStore(files) {
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = enc.encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + data.length;
  });

  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + cdSize + end.length;
  const out = new Uint8Array(total);
  let at = 0;
  chunks.forEach((c) => { out.set(c, at); at += c.length; });
  central.forEach((c) => { out.set(c, at); at += c.length; });
  out.set(end, at);
  return out;
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function colName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* 样式索引：0 默认 / 1 表头 / 2 文本+边框 / 3 数字 0.00 / 4 百分比 / 5 标题 / 6 居中 */ 
const STYLE = { DEFAULT: 0, HEAD: 1, TEXT: 2, NUM: 3, PCT: 4, TITLE: 5, CENTER: 6, INT: 7 };

function cellXml(cell, ref) {
  if (cell == null) return '';
  if (typeof cell === 'object' && cell.t === 'skip') return '';
  const obj = typeof cell === 'object' ? cell : { v: cell };
  const s = obj.s == null ? STYLE.DEFAULT : obj.s;
  const v = obj.v;
  if (v == null || v === '') return '<c r="' + ref + '" s="' + s + '"/>';
  if (obj.t === 'n' || (typeof v === 'number' && isFinite(v) && obj.t !== 's')) {
    return '<c r="' + ref + '" s="' + s + '"><v>' + Number(v) + '</v></c>';
  }
  return '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' +
    xmlEscape(v) + '</t></is></c>';
}

function sheetXml(sheet) {
  const rows = sheet.rows || [];
  const maxCols = rows.reduce((a, r) => Math.max(a, r.length), 1);
  const cols = (sheet.cols || []).map((w, i) =>
    '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('');

  const body = rows.map((row, ri) => {
    const height = sheet.rowHeights && sheet.rowHeights[ri];
    const cells = row.map((cell, ci) => cellXml(cell, colName(ci) + (ri + 1))).join('');
    return '<row r="' + (ri + 1) + '"' + (height ? ' ht="' + height + '" customHeight="1"' : '') + '>' + cells + '</row>';
  }).join('');

  const freezeRow = sheet.freeze || 0;
  const pane = freezeRow
    ? '<pane ySplit="' + freezeRow + '" topLeftCell="A' + (freezeRow + 1) +
      '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A' + (freezeRow + 1) + '" sqref="A' + (freezeRow + 1) + '"/>'
    : '';

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<dimension ref="A1:' + colName(maxCols - 1) + Math.max(rows.length, 1) + '"/>' +
    '<sheetViews><sheetView workbookViewId="0" tabSelected="' + (sheet.active ? 1 : 0) + '">' + pane + '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    (cols ? '<cols>' + cols + '</cols>' : '') +
    '<sheetData>' + body + '</sheetData>' +
    '</worksheet>';
}

const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>' +
  '<fonts count="4">' +
  '<font><sz val="11"/><color rgb="FF1F2328"/><name val="Microsoft YaHei"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/><family val="2"/></font>' +
  '<font><b/><sz val="15"/><color rgb="FF1F2328"/><name val="Microsoft YaHei"/><family val="2"/></font>' +
  '<font><sz val="10"/><color rgb="FF6B7280"/><name val="Microsoft YaHei"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1F6FEB"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FFD0D7DE"/></left><right style="thin"><color rgb="FFD0D7DE"/></right>' +
  '<top style="thin"><color rgb="FFD0D7DE"/></top><bottom style="thin"><color rgb="FFD0D7DE"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="8">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>' +
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';
function buildXlsx(sheets) {
  const files = [];

  const overrides = sheets.map((_, i) =>
    '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
    '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('');

  files.push({
    name: '[Content_Types].xml',
    data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      overrides +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>'),
  });

  files.push({
    name: '_rels/.rels',
    data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'),
  });

  files.push({
    name: 'xl/workbook.xml',
    data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) =>
        '<sheet name="' + xmlEscape(s.name || ('Sheet' + (i + 1))) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
      '</sheets></workbook>'),
  });

  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) =>
        '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>'),
  });

  files.push({ name: 'xl/styles.xml', data: enc.encode(STYLES_XML) });

  sheets.forEach((sheet, i) => {
    files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc.encode(sheetXml(sheet)) });
  });

  return zipStore(files);
}

/* ---- assets/api.js ---- */
/* ==========================================================================
 * WXSC_elec_bill_Web · 数据层
 * 纯浏览器实现：RSA(512/PKCS#1 v1.5) 分段加密 + MD5 签名 + 房间解析 + 记录汇总
 * 不依赖任何第三方库，也不依赖任何后端会话 —— 每次请求都自带完整的房间参数，
 * 因此多人同时使用、各自查询自己的房间时互不影响。
 * ========================================================================== */
const APP_VERSION = '1.2.2';

/* ------------------------------------------------------------------ 常量 */
const APPID = 'AABBCC01';
const APPSECRET = '5F10C0339BA54972A4B7599754BB919D';
const UPSTREAM = 'https://pay.wxstc.cn/grdp-ele-third-unite';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MicroMessenger/7.0.20 MiniProgramEnv/Windows';

/* 512-bit RSA 密钥：公钥用于加密上传参数，私钥用于解密响应（与小程序一致） */
const N_HEX = 'b69025851ca63e61247cb95cb97b1a04a1a3ef09f2c7385125f710a12d57f93d0e22fc24055ea4db8fff96b2fb1f4d865a5b71b7012647e9cb04422d1bfd7deb';
const D_HEX = '1a35172dc4af18c559378e64813beac03f74091ca47d74d8315b06481cfa440d018e7e71401d25c5b1b1e9906099d2eea045a3aa542565e9d90e655e02466001';
const E_EXP = 65537n;
const MOD = BigInt('0x' + N_HEX);
const PRIV = BigInt('0x' + D_HEX);
const BLOCK = 64;          // 512 bit
const STEP = BLOCK - 11;   // PKCS#1 v1.5 单块可承载的明文长度
const DEFAULT_XIAOQU = '1';
const DEFAULT_DATASOURCE = 'cg1_1';

/* ------------------------------------------------------------------ 基础工具 */
function utf8Encode(text) {
  return new TextEncoder().encode(text);
}
function utf8Decode(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

function b64Encode(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

function b64Decode(text) {
  const s = atob(String(text).replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function biFromBytes(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex ? BigInt('0x' + hex) : 0n;
}

function bytesFromBi(value, len) {
  let hex = value.toString(16);
  if (hex.length > len * 2) hex = hex.slice(-len * 2);
  hex = hex.padStart(len * 2, '0');
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function modPow(base, exp, mod) {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

/* ------------------------------------------------------------------ MD5 */
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = (() => {
  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  return k;
})();

function rotl(x, s) {
  return ((x << s) | (x >>> (32 - s))) >>> 0;
}
function md5(bytes) {
  const len = bytes.length;
  const padLen = ((len + 8) >>> 6 << 6) + 64;
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  const bits = len * 8;
  view.setUint32(padLen - 8, bits >>> 0, true);
  view.setUint32(padLen - 4, Math.floor(bits / 4294967296), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const m = new Uint32Array(16);
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(off + i * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const tmp = d;
      d = c;
      c = b;
      b = (b + rotl((a + f + MD5_K[i] + m[g]) >>> 0, MD5_S[i])) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  let out = '';
  [a0, b0, c0, d0].forEach((v) => {
    for (let i = 0; i < 4; i++) out += ((v >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
  });
  return out;
}

/* ------------------------------------------------------------------ RSA */
function rsaEncryptBlock(chunk) {
  const psLen = BLOCK - 3 - chunk.length;
  const em = new Uint8Array(BLOCK);
  em[0] = 0x00;
  em[1] = 0x02;
  for (let i = 0; i < psLen; i++) {
    let v = 0;
    while (v === 0) v = Math.floor(Math.random() * 256);
    em[2 + i] = v;
  }
  em[2 + psLen] = 0x00;
  em.set(chunk, 3 + psLen);
  return bytesFromBi(modPow(biFromBytes(em), E_EXP, MOD), BLOCK);
}

function rsaDecryptBlock(block) {
  const em = bytesFromBi(modPow(biFromBytes(block), PRIV, MOD), BLOCK);
  if (em[0] !== 0x00 || em[1] !== 0x02) throw new Error('响应解密失败（填充错误）');
  let i = 2;
  while (i < em.length && em[i] !== 0x00) i++;
  if (i >= em.length) throw new Error('响应解密失败（分隔符缺失）');
  return em.subarray(i + 1);
}

function rsaEncryptLong(bytes) {
  const parts = [];
  let total = 0;
  for (let i = 0; i < bytes.length; i += STEP) {
    const block = rsaEncryptBlock(bytes.subarray(i, Math.min(i + STEP, bytes.length)));
    parts.push(block);
    total += block.length;
  }
  const all = new Uint8Array(total);
  let at = 0;
  parts.forEach((p) => { all.set(p, at); at += p.length; });
  return b64Encode(all);
}

function rsaDecryptLong(text) {
  const ct = b64Decode(text);
  const parts = [];
  let total = 0;
  for (let i = 0; i + BLOCK <= ct.length; i += BLOCK) {
    const plain = rsaDecryptBlock(ct.subarray(i, i + BLOCK));
    parts.push(plain);
    total += plain.length;
  }
  const all = new Uint8Array(total);
  let at = 0;
  parts.forEach((p) => { all.set(p, at); at += p.length; });
  return utf8Decode(all);
}

/* ------------------------------------------------------------------ 通道 */
/**
 * 通道实现了三种取数方式，互不影响：
 *   direct —— 浏览器直连（同源部署/反向代理下可用）
 *   relay  —— 自建中转（Cloudflare Worker / 本地 Node 中转，仓库内含）
 *   demo   —— 示例数据（仅用于预览界面，页面上会明确标注）
 */
const CHANNELS = {
  direct: { id: 'direct', label: '直连' },
  relay: { id: 'relay', label: '中转' },
  history: { id: 'history', label: '历史数据（免查询）' },
};
function normalizeMode(value) {
  const v = String(value == null ? '' : value).trim();
  if (v === 'history' || v === 'demo') return 'history';
  if (v === 'relay') return 'relay';
  return 'direct';
}

/* 中转有两种接法：
 *   prefix —— 自建中转（Worker / Node），把 /grdp-ele-third-unite/... 原样转发，推荐
 *   query  —— 公共 CORS 代理，把「完整上游地址」编码后拼在 ?url= 后面 */
function normalizeRelayMode(value) {
  return value === 'query' ? 'query' : 'prefix';
}
function normalizeRelayBase(value) {
  return String(value == null ? '' : value).trim().replace(/\/+$/, '');
}

/** 把上游路径拼成实际请求地址（probe 与正式请求共用同一套规则） */
function relayUrl(base, mode, path) {
  const b = normalizeRelayBase(base);
  if (!b) throw new Error('还没填写中转地址');
  const full = UPSTREAM + path;
  return normalizeRelayMode(mode) === 'query'
    ? b + encodeURIComponent(full)
    : b + '/grdp-ele-third-unite' + path;
}

/* 默认就用历史数据：GitHub Pages 上不依赖任何中转，打开即可查 */
let channel = { mode: 'history', relayBase: '', relayMode: 'prefix' };
function getChannel() {
  return { ...channel };
}
function setChannel(next) {
  channel = {
    mode: normalizeMode(next && next.mode),
    relayBase: normalizeRelayBase(next && next.relayBase),
    relayMode: normalizeRelayMode(next && next.relayMode),
  };
  roomsCache.clear();
  return getChannel();
}

function endpoint(path) {
  if (channel.mode === 'relay') return relayUrl(channel.relayBase, channel.relayMode, path);
  return UPSTREAM + path;
}

/* 公共 CORS 代理：2026-11 实测大量站点只剩 GET 能力或要求 key，
 * 这里只留两个偶尔可用的兜底项，能否成功由「自动检测」当场判断。 */
const PUBLIC_RELAYS = [
  { url: 'https://api.allorigins.win/raw?url=', mode: 'query', label: 'allorigins（公共代理，时好时坏）' },
  { url: 'https://api.codetabs.com/v1/proxy?quest=', mode: 'query', label: 'codetabs（公共代理，时好时坏）' },
];

/* 中转清单：relay/endpoints.json 由仓库维护，用户也可以自己加一条进去
 * （PR 或在页面里填地址后会记在本机）。检测时所有人同时并发实测，谁通用谁。 */
let registryCache = null;
function loadRelayRegistry(force) {
  if (registryCache && !force) return Promise.resolve(registryCache);
  return fetch('relay/endpoints.json', { cache: force ? 'no-store' : 'force-cache' })
    .then((r) => (r.ok ? r.json() : { endpoints: [] }))
    .then((data) => {
      const list = Array.isArray(data && data.endpoints) ? data.endpoints : [];
      registryCache = list.filter((x) => x && x.url).map((x) => ({
        url: normalizeRelayBase(x.url),
        mode: normalizeRelayMode(x.mode),
        label: String(x.label || x.url),
        note: String(x.note || ''),
      }));
      return registryCache;
    })
    .catch(() => { registryCache = []; return registryCache; });
}

function sortKeys(obj) {
  const out = {};
  Object.keys(obj).sort().forEach((k) => { out[k] = obj[k]; });
  return out;
}

/** 构造带签名的请求体（导出以便本地/命令行测试中转） */
function signBody(payload) {
  const biz = rsaEncryptLong(utf8Encode(JSON.stringify(payload)));
  const ts = Date.now();
  const rid = BigInt(String(Math.floor(Math.random() * 900) + 100) + String(ts)).toString(16);
  const body = {
    appid: APPID,
    biz_data: biz,
    biz_encryption: 'RSA',
    biz_type: 0,
    requestid: rid,
    sign_type: 'MD5',
    timestamp: ts,
    version: 'V3.0',
  };
  body.sign = md5(utf8Encode(JSON.stringify(sortKeys(body)) + APPSECRET)).toUpperCase();
  return body;
}

async function post(path, payload, options = {}) {
  const body = signBody(payload);

  const url = options.endpoint || endpoint(path);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8', Accept: '*/*' },
      body: JSON.stringify(body),
      signal: options.signal,
      cache: 'no-store',
      mode: 'cors',
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new Error('网络请求失败：' + (err && err.message ? err.message : err) +
      '。若在 GitHub Pages 上使用，请先把「数据通道」切到自建中转（见页面底部说明）。');
  }
  if (!response.ok) throw new Error('接口返回 HTTP ' + response.status);
  const text = await response.text();
  let res;
  try {
    res = JSON.parse(text);
  } catch (e) {
    throw new Error('接口返回的不是 JSON：' + text.slice(0, 120));
  }
  if (typeof res.data === 'string' && res.data) {
    try {
      res.decoded = JSON.parse(rsaDecryptLong(res.data));
    } catch (e) {
      throw new Error('解密响应失败：' + e.message);
    }
  }
  return res;
}

/* ------------------------------------------------------------------ 中转探测 */
/**
 * 探测一个中转地址是否真能用：直接请求一次房间列表并尝试解密。
 * 不读写全局通道状态（请求地址由参数显式给出），因此可以并发探测多个候选。
 * 返回 { ok:true, ms, rooms }，失败时抛出带原因的错误。
 */
async function probeRelay(relayBase, relayMode = 'prefix', options = {}) {
  const base = normalizeRelayBase(relayBase);
  if (!/^https?:\/\//i.test(base)) throw new Error('地址要以 http:// 或 https:// 开头');
  const t0 = Date.now();
  const path = '/api/school/ele/third/room/list';
  const url = relayUrl(base, relayMode, path);
  const res = await post(path, {
    xiaoquId: DEFAULT_XIAOQU,
    datasource: DEFAULT_DATASOURCE,
    servicecode: '0826',
  }, { ...options, endpoint: url });
  const rows = Array.isArray(res.decoded) ? res.decoded : [];
  if (!rows.length) {
    throw new Error('通道能连上，但没拿到房间列表（' + JSON.stringify(res).slice(0, 120) + '）');
  }
  return { ok: true, ms: Date.now() - t0, rooms: rows.length };
}

/* ------------------------------------------------------------------ 房间列表 */
const ROOM_TTL = 60 * 60 * 1000;
const roomsCache = new Map();

/* ------------------------------------------------------------------ 历史数据（离线，仓库里预先抓好的真实数据）
 * 目录结构：
 *   data/meta.json                          截止时间、楼栋清单、总量
 *   data/loudong/<楼栋号>/index.json         该楼房间清单
 *   data/loudong/<楼栋号>/room-<房号>.json   单房间余额 + 逐笔记录 + 按人汇总
 * 页面在「历史数据」通道下只读这些文件，不发任何请求，所以人人可用、互不影响。
 */
const HISTORY_DIR = 'data/';
function shortRoomCode(fullRoom, loudongName) {
  const d = String(loudongName == null ? '' : loudongName).replace(/[^0-9]/g, '');
  const s = String(fullRoom == null ? '' : fullRoom);
  return d && s.startsWith(d) ? s.slice(d.length) : s;
}

let metaCache = null;

// GitHub Pages 对同一 IP 的突发并发请求会短暂 403（CDN 限流），这里做退避重试
async function fetchJsonRetry(path, tries = 3) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(path, { cache: 'force-cache' });
      if (r.ok) return r.json();
      lastErr = new Error('读不到 ' + path + '（HTTP ' + r.status + '）');
      if (![403, 408, 425, 429, 500, 502, 503, 504].includes(r.status)) throw lastErr;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((ok) => setTimeout(ok, 220 * Math.pow(2, i)));
  }
  throw lastErr || new Error('读不到 ' + path);
}

// data/index.json 是 meta + 每栋房间清单的合并文件：首屏只发 1 个请求，避开 Pages 限流
let indexCache = null;
async function historyIndex(force) {
  if (indexCache && !force) return indexCache;
  try {
    const data = await fetchJsonRetry(HISTORY_DIR + 'index.json');
    indexCache = data;
    return data;
  } catch (e) {
    indexCache = null;
    throw e;
  }
}
async function historyMeta(force) {
  if (metaCache && !force) return Promise.resolve(metaCache);
  let data = null;
  try {
    const idx = await historyIndex(force);
    data = {
      version: idx.version,
      cutoff: idx.cutoff,
      timezone: idx.timezone,
      xiaoquId: idx.xiaoquId,
      datasource: idx.datasource,
      rooms: idx.rooms,
      records: idx.records,
      loudongs: (idx.loudongs || []).map((l) => ({
        no: l.no,
        name: l.name,
        rooms: l.rooms.length,
        records: l.rooms.reduce((s, r) => s + (r[1] || 0), 0),
      })),
    };
    metaCache = data;
    return data;
  } catch {}
  data = await fetchJsonRetry(HISTORY_DIR + 'meta.json');
  if (!data) throw new Error('历史数据缺失（data/meta.json 读不到）');
  metaCache = data;
  return data;
}

const loudongCache = new Map();
async function historyLoudong(no, force) {
  const key = String(no);
  if (loudongCache.has(key) && !force) return loudongCache.get(key);
  try {
    const idx = await historyIndex(force);
    const hit = (idx.loudongs || []).find((l) => String(l.no) === key);
    if (hit) {
      const data = {
        no: hit.no,
        name: hit.name,
        cutoff: idx.cutoff,
        rooms: (hit.rooms || []).map(([short, records]) => ({
          short,
          room: key + short,
          roomId: key + short,
          records,
        })),
      };
      loudongCache.set(key, data);
      return data;
    }
  } catch {}
  const data = await fetchJsonRetry(HISTORY_DIR + 'loudong/' + key + '/index.json');
  if (!data) throw new Error('历史数据里没有「' + key + ' 号楼」');
  loudongCache.set(key, data);
  return data;
}
function historyRoomFile(loudongNo, short) {
  const url = HISTORY_DIR + 'loudong/' + loudongNo + '/room-' + short + '.json';
  return fetchJsonRetry(url).catch(() => {
    throw new Error('历史数据里没有 ' + loudongNo + ' 号楼 ' + short + ' 室（' + url + '）');
  });
}

/** 历史数据模式下的“房间清单”，结构与真实接口一致 */
async function historyRooms() {
  const meta = await historyMeta();
  const lists = await Promise.all(meta.loudongs.map((l) => historyLoudong(l.no)));
  const rows = [];
  lists.forEach((list) => {
    (list.rooms || []).forEach((r) => {
      rows.push({
        loudongId: String(list.no),
        loudong: list.name,
        roomId: r.roomId,
        room: r.room,
        short: r.short,
        records: r.records,
      });
    });
  });
  return rows;
}

/** 楼栋下拉：历史模式读 meta，实时模式从房间清单聚合 */
async function loudongOptions(options = {}) {
  if (channel.mode === 'history') {
    const meta = await historyMeta();
    return meta.loudongs.map((l) => ({ no: l.no, name: l.name, rooms: l.rooms, records: l.records }));
  }
  const rows = await allRooms(options.xiaoquId, options.datasource, options);
  const map = new Map();
  rows.forEach((r) => {
    const no = loudongNumber(r.loudong);
    if (!no) return;
    if (!map.has(no)) map.set(no, { no, name: r.loudong, rooms: 0, records: null });
    const item = map.get(no);
    if (/^\d{2,}$/.test(shortRoomCode(r.room, r.loudong))) item.rooms += 1;
  });
  return [...map.values()].sort((a, b) => a.no - b.no);
}

/** 房间下拉：必须先选楼栋 */
async function roomOptions(loudongNo, options = {}) {
  const no = String(loudongNo == null ? '' : loudongNo).replace(/[^0-9]/g, '');
  if (!no) return [];
  if (channel.mode === 'history') {
    const list = await historyLoudong(no);
    return (list.rooms || [])
      .filter((r) => /^\d{2,}$/.test(r.short))
      .map((r) => ({ short: r.short, room: r.room, roomId: r.roomId, records: r.records, left: r.left }));
  }
  const rows = await allRooms(options.xiaoquId, options.datasource, options);
  return rows
    .filter((r) => loudongNumber(r.loudong) === parseInt(no, 10))
    .map((r) => ({ short: shortRoomCode(r.room, r.loudong), room: r.room, roomId: r.roomId }))
    .filter((r) => /^\d{2,}$/.test(r.short))
    .sort((a, b) => Number(a.short) - Number(b.short));
}
function allRooms(xiaoquId = DEFAULT_XIAOQU, datasource = DEFAULT_DATASOURCE, options = {}) {
  const key = xiaoquId + '|' + datasource;
  const hit = roomsCache.get(key);
  if (hit && !options.force && Date.now() - hit.ts < ROOM_TTL) return hit.promise;
  if (channel.mode === 'history') {
    const promise = historyRooms();
    roomsCache.set(key, { ts: Date.now(), promise });
    return promise;
  }
  const promise = post('/api/school/ele/third/room/list', {
    xiaoquId: String(xiaoquId),
    datasource: datasource,
    servicecode: '0826',
  }, options).then((res) => {
    const data = Array.isArray(res.decoded) ? res.decoded : [];
    return data
      .filter((x) => x && x.loudongId && x.roomId)
      .map((x) => ({
        loudongId: String(x.loudongId).trim(),
        loudong: String(x.loudong == null ? '' : x.loudong).trim(),
        roomId: String(x.roomId).trim(),
        room: String(x.room == null ? '' : x.room).trim(),
      }));
  }).catch((err) => {
    roomsCache.delete(key);
    throw err;
  });
  roomsCache.set(key, { ts: Date.now(), promise });
  return promise;
}

const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function digits(text) {
  const s = String(text == null ? '' : text).trim();
  let out = '';
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (out) break;
  }
  return out;
}
function loudongNumber(name) {
  let t = String(name == null ? '' : name).replace(/\s+/g, '');
  ['号楼', '号', '栋', '楼'].forEach((suf) => {
    if (t.endsWith(suf)) t = t.slice(0, -suf.length);
  });
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (t === '十') return 10;
  if (t.length === 2 && t[0] === '十') return 10 + (CN_DIGIT[t[1]] || 0);
  if (t.length === 2 && t[1] === '十') return (CN_DIGIT[t[0]] || 0) * 10;
  if (t.length === 1) return CN_DIGIT[t] || null;
  return null;
}

/**
 * 把「3号楼 / 101室」解析成接口需要的 ID。
 * 解析失败时抛出带可选楼栋/房间示例的错误，方便用户自行修正。
 */
async function resolveRoom(cfg, options = {}) {
  const xiaoquId = String(cfg.xiaoquId || DEFAULT_XIAOQU).trim() || DEFAULT_XIAOQU;
  const datasource = String(cfg.datasource || DEFAULT_DATASOURCE).trim() || DEFAULT_DATASOURCE;
  const base = { xiaoquId, datasource };
  const ln = digits(cfg.loudongNo);
  const rn = digits(cfg.roomNo);
  if (!ln || !rn) throw new Error('楼栋号和房间号都要填数字，例如 楼栋=3、房间=101（表示 3 号楼 101 室）');

  const rows = await allRooms(xiaoquId, datasource, options);
  const want = parseInt(ln, 10);
  // 历史数据的楼栋名是中文（「三号楼」），loudongNumber 取不到数字，所以再用 loudongId 兜一层
  const cand = rows.filter((r) => loudongNumber(r.loudong) === want || String(r.loudongId) === ln);
  if (!cand.length) {
    const names = Array.from(new Set(rows.map((r) => r.loudong))).sort();
    throw new Error('找不到「' + ln + ' 号楼」。可选楼栋：' + names.join('、'));
  }
  const loudongId = cand[0].loudongId;
  const loudongName = cand[0].loudong;
  const full = ln + rn;
  let hit = rows.filter((r) => r.loudongId === loudongId && r.room === full);
  if (!hit.length) hit = rows.filter((r) => r.loudongId === loudongId && r.room === rn);
  if (!hit.length) {
    const sample = cand.map((r) => r.room).sort().slice(0, 8);
    throw new Error('在「' + loudongName + '」里找不到房间「' + rn + '」（按 ' + rn + ' 室 解析成 ' + full + '）。该楼房间示例：' + sample.join('、'));
  }
  return {
    xiaoquId,
    datasource,
    loudongId,
    roomId: hit[0].roomId,
    loudongName,
    roomName: hit[0].room,
    loudongNo: ln,
    roomNo: rn,
  };
}
function describeRoom(room) {
  if (room && room.loudongName) {
    const rn = room.roomName || '';
    const short = rn.startsWith(digits(room.loudongName)) ? rn.slice(digits(room.loudongName).length) : rn;
    return room.loudongName + ' ' + short + ' 室';
  }
  if (room) return '楼栋 ' + (room.loudongId || '-') + ' / 房间 ' + (room.roomId || '-');
  return '未设置';
}

/* ------------------------------------------------------------------ 查询 */
async function queryRoom(room, options = {}) {
  if (channel.mode === 'history') {
    const no = String(room.loudongNo || loudongNumber(room.loudongName) || room.loudongId || '');
    const short = room.roomNo || shortRoomCode(room.roomName, room.loudongName);
    const file = await historyRoomFile(no, short);
    if (!file.balance) throw new Error('历史数据里这一间没有余额快照');
    return {
      xiaoqu: '历史数据',
      used: Number(file.balance.used) || 0,
      buy: Number(file.balance.buy) || 0,
      left: Number(file.balance.left) || 0,
      at: file.balance.at || file.cutoff,
      history: true,
      cutoff: file.cutoff,
    };
  }
  const res = await post('/api/school/ele/third/room/get', {
    xiaoquId: room.xiaoquId,
    datasource: room.datasource,
    loudongId: room.loudongId,
    roomId: room.roomId,
  }, options);
  const d = res.decoded;
  if (!d) throw new Error('接口未返回可用数据：' + JSON.stringify(res).slice(0, 200));
  const used = Number(d.elecUsed) || 0;
  const buy = Number(d.elecBuy) || 0;
  return {
    xiaoqu: d.xiaoqu,
    used,
    buy,
    left: buy - used,
    at: new Date().toISOString(),
  };
}
async function fetchRecharge(room, size = 800, options = {}) {
  if (channel.mode === 'history') {
    const no = String(room.loudongNo || loudongNumber(room.loudongName) || room.loudongId || '');
    const short = room.roomNo || shortRoomCode(room.roomName, room.loudongName);
    const file = await historyRoomFile(no, short);
    return (file.items || []).slice(0, size).map((r) => ({
      time: r.time,
      amt: r.amt,
      buyer: String(r.buyer == null ? '' : r.buyer),
      recNo: r.recNo,
      outNo: r.outNo,
      room: file.room,
      loudong: file.name,
      history: true,
    }));
  }
  const res = await post('/api/school/ele/third/recharge/list', {
    xiaoquId: room.xiaoquId,
    datasource: room.datasource,
    loudongId: room.loudongId,
    roomId: room.roomId,
    pageNum: 1,
    page: 1,
    limit: size,
    pageSize: size,
    servicecode: '0826',
  }, options);
  const data = res.decoded;
  if (!Array.isArray(data)) throw new Error('充值接口未返回列表：' + JSON.stringify(res).slice(0, 200));
  const rows = data.map((x) => ({
    time: String(x.trantime == null ? '' : x.trantime).trim(),
    amt: Math.round((Number(x.tranamt) || 0) * 100) / 100,
    buyer: String(x.buyerId == null ? '' : x.buyerId).trim(),
    recNo: String(x.recNo == null ? '' : x.recNo).trim(),
    outNo: String(x.outNo == null ? '' : x.outNo).trim(),
    room: String(x.room == null ? '' : x.room).trim(),
    loudong: String(x.loudong == null ? '' : x.loudong).trim(),
  }));
  rows.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
  return rows;
}

/* ------------------------------------------------------------------ 时间范围 */
function pad2(n) { return String(n).padStart(2, '0'); }
function toLocalInput(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
    'T' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());
}
function toApiTime(value) {
  if (!value) return '';
  const v = String(value).trim().replace('T', ' ');
  return v.length === 16 ? v + ':00' : v;
}

/** 快捷范围：本月 / 近30天 / 全部 / 今年 */
function quickRange(kind, now = new Date()) {
  if (kind === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return { start: toLocalInput(s), end: toLocalInput(now), label: '本月' };
  }
  if (kind === '30d') {
    const s = new Date(now.getTime() - 29 * 86400000);
    s.setHours(0, 0, 0, 0);
    return { start: toLocalInput(s), end: toLocalInput(now), label: '近 30 天' };
  }
  if (kind === 'year') {
    const s = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    return { start: toLocalInput(s), end: toLocalInput(now), label: '今年' };
  }
  return { start: '', end: '', label: '全部' };
}

/** 入学年份 → 查询开始时间（按 9 月 1 日入学算，即该年 09-01 00:00:00；若还没到就用当前时刻） */
function yearStart(year, now = new Date()) {
  const y = Number(year);
  const yy = Number.isFinite(y) && y >= 2000 && y <= 2100 ? Math.trunc(y) : now.getFullYear();
  const sep = new Date(yy, 8, 1, 0, 0, 0); // 9 月 1 日 00:00:00（本地时区）
  const start = sep.getTime() > now.getTime() ? now : sep;
  return {
    start: toLocalInput(start),
    end: toLocalInput(now),
    label: yy + ' 年 9 月起',
    year: yy,
  };
}
function rangeLabel(start, end) {
  if (start && end) return start + ' ~ ' + end;
  if (start) return start + ' 起';
  if (end) return '截至 ' + end;
  return '全部';
}
function filterItems(items, start, end) {
  if (!start && !end) return items.slice();
  const s = start ? new Date(start.replace(' ', 'T')).getTime() : null;
  const e = end ? new Date(end.replace(' ', 'T')).getTime() : null;
  return items.filter((r) => {
    const t = new Date(String(r.time).replace(' ', 'T')).getTime();
    if (Number.isNaN(t)) return false;
    if (s != null && t < s) return false;
    if (e != null && t > e) return false;
    return true;
  });
}

/* ------------------------------------------------------------------ 汇总 */
function summarize(items, notes = {}) {
  const agg = new Map();
  items.forEach((r) => {
    const key = r.buyer || '未知';
    let row = agg.get(key);
    if (!row) {
      row = { buyer: key, count: 0, amount: 0, first: r.time, last: r.time };
      agg.set(key, row);
    }
    row.count += 1;
    row.amount += r.amt;
    if (r.time < row.first) row.first = r.time;
    if (r.time > row.last) row.last = r.time;
  });
  const total = Array.from(agg.values()).reduce((a, r) => a + r.amount, 0) || 1;
  return Array.from(agg.values())
    .map((r) => ({
      buyer: r.buyer,
      label: notes[r.buyer] || '',
      count: r.count,
      amount: Math.round(r.amount * 100) / 100,
      ratio: Math.round((r.amount * 1000) / total) / 10,
      first: r.first,
      last: r.last,
    }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count);
}
function sumAmount(items) {
  return Math.round(items.reduce((a, r) => a + (Number(r.amt) || 0), 0) * 100) / 100;
}


/* api 命名空间（app.js 里用 api.xxx） */
const api = { utf8Encode, utf8Decode, md5, normalizeMode, normalizeRelayMode, normalizeRelayBase, relayUrl, getChannel, setChannel, loadRelayRegistry, signBody, probeRelay, shortRoomCode, historyIndex, historyMeta, historyLoudong, historyRoomFile, loudongOptions, roomOptions, allRooms, loudongNumber, resolveRoom, describeRoom, queryRoom, fetchRecharge, toLocalInput, toApiTime, quickRange, yearStart, rangeLabel, filterItems, summarize, sumAmount, APP_VERSION, UPSTREAM, DEFAULT_XIAOQU, DEFAULT_DATASOURCE, CHANNELS, PUBLIC_RELAYS };

/* ---- assets/export.js ---- */
/* ==========================================================================
 * 导出：Markdown / Excel（1.1.0：按「当前选中的那张表」导出）
 * 输入是「一次查询的快照」，与页面上展示的数据完全一致，
 * 不存在二次请求，因此并发查询不会互相污染导出内容。
 *
 * snapshot = { roomDesc, label, items, notes, view, person }
 *   view: 'summary' | 'detail' | 'person' | 'all'（缺省 all = 汇总 + 明细）
 * ========================================================================== */
const VIEWS = {
  summary: { name: '每人汇总', title: '每人充值汇总', file: '每人汇总' },
  detail: { name: '充值明细', title: '充值明细（按时间倒序）', file: '充值明细' },
  person: { name: '个人充值', title: '个人充值记录', file: '个人充值' },
};
function safeName(text, fallback = 'export') {
  const out = String(text == null ? '' : text)
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return out || fallback;
}
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
function fileName(roomDesc, label, ext, view) {
  const v = view && VIEWS[view] ? VIEWS[view].file + '-' : '';
  return '充值台账-' + safeName(roomDesc, '房间') + '-' + v + rangeToken(label) + '-' + stamp() + '.' + ext;
}

/** 文件名里的范围：只保留日期部分，压缩成 2022-01-01~2026-11-07 这种短标签 */
function rangeToken(label) {
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
function viewTable(snapshot) {
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
function buildMarkdown(snapshot) {
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
function buildExcel(snapshot) {
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
function download(bytes, filename, mime) {
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
function downloadMarkdown(snapshot) {
  const text = buildMarkdown(snapshot);
  download(new Blob([text], { type: 'text/markdown;charset=utf-8' }),
    fileName(snapshot.roomDesc, snapshot.label, 'md', snapshot.view), 'text/markdown;charset=utf-8');
}
function downloadExcel(snapshot) {
  const bytes = buildExcel(snapshot);
  download(bytes, fileName(snapshot.roomDesc, snapshot.label, 'xlsx', snapshot.view),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ---- assets/app.js ---- */
/* WXSC_elec_bill_Web · 页面控制器
 * 隔离性说明：
 *   1. 页面没有任何后端会话；每次查询只带上「你自己这次填/存的房间参数」。
 *   2. 查询结果只活在当前标签页的内存里，不写 localStorage、不写任何共享缓存。
 *   3. localStorage 仅保存三项本机偏好：房间设置、通道设置、备注名；都没有别人能读到。
 *   4. 因此多人同时打开、各查各的房间时，彼此的请求与结果完全独立。
 */


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
  cutoff: '',
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
    tag.textContent = needRelay ? label + ' · 线上需中转'
      : ch.mode === 'history' ? '历史数据 · 截至 ' + (S.cutoff || '—')
        : label;
    tag.className = 'tag' + (needRelay ? ' warn' : ch.mode === 'history' ? '' : ch.mode === 'relay' ? ' ok' : '');
  }
  const note = $('channel-note');
  if (note) {
    note.textContent = ch.mode === 'history'
      ? '当前：历史数据（离线快照，截至 ' + (S.cutoff || '—') + '，不发任何请求，人人可用）'
      : ch.mode === 'relay'
        ? '当前：经由中转 ' + (ch.relayBase || '（地址为空）') + (ch.relayMode === 'query' ? '（公共代理模式）' : '')
        : needRelay
          ? '当前：直连 pay.wxstc.cn —— GitHub Pages 上会被浏览器拦，请点上面的「自动检测可用中转」，或直接切到历史数据'
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
    (api.getChannel().mode === 'history'
      ? ' · 数据截至 ' + esc(S.cutoff || '—') + '（离线快照）'
      : (S.fetchedAt ? ' · 记录拉取于 ' + esc(S.fetchedAt) : ''));
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
    qhint.textContent = api.getChannel().mode === 'history'
      ? '当前是历史数据（离线快照，截至 ' + (S.cutoff || '—') + '），导出不会再请求任何接口。'
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
  const l = $('in-loudong');
  const r = $('in-room');
  const lno = String((cfg && cfg.loudongNo) || '');
  const rno = String((cfg && cfg.roomNo) || '');
  if (l) {
    if (lno && !Array.from(l.options).some((o) => o.value === lno)) {
      l.insertAdjacentHTML('beforeend', '<option value="' + esc(lno) + '">' + esc(lno) + ' 号楼</option>');
    }
    l.value = lno;
  }
  if (r) {
    if (rno && !Array.from(r.options).some((o) => o.value === rno)) {
      r.insertAdjacentHTML('beforeend', '<option value="' + esc(rno) + '">' + esc(rno) + ' 室</option>');
    }
    r.value = rno;
  }
  $('in-xiaoqu').value = (cfg && cfg.xiaoquId) || api.DEFAULT_XIAOQU;
  $('in-datasource').value = (cfg && cfg.datasource) || api.DEFAULT_DATASOURCE;
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

/* ------------------------------------------------------------------ 楼栋 / 房间 下拉（先选楼栋，再选房间） */
let loudongList = [];

function roomScope() {
  return {
    xiaoquId: String($('in-xiaoqu').value || '').trim() || api.DEFAULT_XIAOQU,
    datasource: String($('in-datasource').value || '').trim() || api.DEFAULT_DATASOURCE,
  };
}

function resetRoomView() {
  S.room = null;
  S.balance = null;
  S.all = [];
  S.items = [];
  S.summary = [];
  S.person = '';
  S.fetchedAt = '';
  renderChips();
  renderBalance();
  renderData();
}

async function loadLoudongSelect(force) {
  const sel = $('in-loudong');
  const btn = $('btn-room-list');
  const note = $('room-list-note');
  if (!sel) return;
  if (btn) { btn.disabled = true; btn.textContent = '读取中…'; }
  try {
    const scope = roomScope();
    loudongList = await api.loudongOptions({ ...scope, force: !!force });
    const keep = sel.value;
    sel.innerHTML = '<option value="">请选择楼栋</option>' + loudongList.map((l) =>
      '<option value="' + esc(l.no) + '">' + esc(l.name) + '（' + l.rooms + ' 间）</option>').join('');
    const want = keep || (S.cfg && S.cfg.loudongNo) || '';
    if (want && loudongList.some((l) => String(l.no) === String(want))) sel.value = String(want);
    if (note) {
      note.textContent = '共 ' + loudongList.length + ' 个楼栋 · 先选楼栋，再选房间' +
        (api.getChannel().mode === 'history' ? '（历史数据）' : '');
    }
    await loadRoomSelect();
  } catch (err) {
    if (note) note.textContent = '楼栋列表读取失败：' + ((err && err.message) || err);
    toast('读取楼栋失败：' + ((err && err.message) || err), 5000);
    revealChannel(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '刷新房间列表'; }
  }
}

async function loadRoomSelect() {
  const sel = $('in-room');
  const note = $('room-list-note');
  const lno = String($('in-loudong').value || '').trim();
  if (!sel) return;
  if (!lno) {
    sel.innerHTML = '<option value="">请先选楼栋</option>';
    sel.disabled = true;
    if (note) note.textContent = '先选楼栋，房间列表会按楼栋自动匹配';
    return;
  }
  sel.disabled = true;
  sel.innerHTML = '<option value="">读取中…</option>';
  try {
    const scope = roomScope();
    const rows = await api.roomOptions(lno, scope);
    const keep = S.cfg && String(S.cfg.loudongNo) === lno ? String(S.cfg.roomNo) : '';
    sel.innerHTML = '<option value="">请选择房间</option>' + rows.map((r) =>
      '<option value="' + esc(r.short) + '">' + esc(r.short) + ' 室</option>').join('');
    sel.disabled = false;
    const name = (loudongList.find((l) => String(l.no) === lno) || {}).name || (lno + ' 号楼');
    if (note) note.textContent = name + ' · 共 ' + rows.length + ' 间可选';
    if (keep && rows.some((r) => String(r.short) === keep)) sel.value = keep;
  } catch (err) {
    sel.innerHTML = '<option value="">读取失败</option>';
    toast('读取房间失败：' + ((err && err.message) || err), 5000);
    revealChannel(err);
  }
}

/* ------------------------------------------------------------------ 中转检测 */
let relayList = [];
let registryEndpoints = [];

function relayCandidates() {
  const seen = new Set();
  const out = [];
  const add = (url, label, mode, hint) => {
    const u = api.normalizeRelayBase(url);
    if (!u) return;
    const m = api.normalizeRelayMode(mode);
    const key = m + '|' + u;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: u, label, mode: m, hint: hint || '', state: 'idle', ms: 0, rooms: 0, note: '' });
  };
  const ch = api.getChannel();
  const saved = store.get(KEY.channel, null);
  add(($('in-relay') || {}).value, '输入框里填的地址', ch.relayMode);
  if (saved && saved.relayBase) add(saved.relayBase, '上次保存的地址', saved.relayMode);
  let q = '';
  try { q = new URLSearchParams(location.search).get('relay') || ''; } catch (e) { q = ''; }
  if (q) add(q, '链接参数 ?relay=', 'prefix');
  if (!/(^|\.)github\.io$/i.test(location.hostname)) add(location.origin, '本站同源（反向代理）', 'prefix');
  add('http://127.0.0.1:8787', '本机中转 127.0.0.1:8787', 'prefix', '在仓库目录跑 node relay/server.mjs');
  add('http://localhost:8787', '本机中转 localhost:8787', 'prefix', '同上');
  registryEndpoints.forEach((x) => add(x.url, x.label, x.mode, x.note));
  api.PUBLIC_RELAYS.forEach((x) => add(x.url, x.label, x.mode));
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
        ? '不可用 · ' + esc((c.note || '').slice(0, 110)) + (c.hint ? ' · ' + esc(c.hint) : '')
        : c.state === 'testing' ? '检测中…' : (c.hint ? esc(c.hint) : '未检测');
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
  if (!registryEndpoints.length) {
    try { registryEndpoints = await api.loadRelayRegistry(); } catch {}
  }
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
      : '检测完成：没有可用地址 —— 公共代理 2026 年起基本只支持 GET，靠不住。点「直接用历史数据」照样能查，或者跑一条 node 命令自建中转（见下面两步）';
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
  if (ch.mode === 'history') {
    el.textContent = '当前：历史数据（离线快照，截至 ' + (S.cutoff || '—') + '）—— 不用中转、不用联网查询，人人可用';
  } else if (ch.mode === 'relay') {
    el.textContent = '当前：中转 ' + (ch.relayBase || '（未填）') +
      (ch.relayMode === 'query' ? '（公共代理模式）' : '');
  } else el.textContent = '当前：直连 pay.wxstc.cn —— 需要同源部署；在 Pages 上会被 CORS 拦，请改用中转或历史数据';
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
  if (note) note.textContent = '正在读取楼栋列表…';
  box.innerHTML = '<div class="empty"><span class="spin"></span>读取中…</div>';
  try {
    G.loudongs = await api.loudongOptions(roomScope());
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
    box.innerHTML = '<div class="empty">没有可选的楼栋。</div>';
    return;
  }
  if (note) note.textContent = '共 ' + G.loudongs.length + ' 个楼栋 · 点一下继续';
  box.innerHTML = G.loudongs.map((x) =>
    '<button class="room-item" type="button" data-gloudong="' + x.no + '">' + esc(x.name) +
    ' <span class="mini">' + x.rooms + ' 间</span></button>').join('');
}

async function guidePickLoudong(n) {
  G.loudong = String(n);
  const box = $('guide-room');
  const note = $('guide-room-note');
  if (note) note.textContent = G.loudong + ' 号楼 · 正在匹配房间…';
  try {
    const rows = await api.roomOptions(G.loudong, roomScope());
    const name = (G.loudongs.find((l) => String(l.no) === G.loudong) || {}).name || (G.loudong + ' 号楼');
    if (note) note.textContent = name + ' · 共 ' + rows.length + ' 间 · 点房间号完成引导';
    if (box) {
      box.innerHTML = rows.length
        ? rows.map((r) => '<button class="room-item" type="button" data-groom="' + esc(r.short) + '">' +
            esc(r.short) + ' 室</button>').join('')
        : '<div class="empty">这个楼栋下没有可选房间。</div>';
    }
  } catch (err) {
    if (note) note.textContent = '房间读取失败：' + ((err && err.message) || err);
    revealChannel(err);
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
  const l = $('in-loudong');
  if (l) {
    if (G.loudong && !Array.from(l.options).some((o) => o.value === String(G.loudong))) {
      l.insertAdjacentHTML('beforeend', '<option value="' + esc(G.loudong) + '">' + esc(G.loudong) + ' 号楼</option>');
    }
    l.value = String(G.loudong || '');
  }
  guideClose(true);
  // 按楼栋把房间下拉填满，否则 select 里没有这个 option，值会被丢掉
  await loadRoomSelect();
  const r = $('in-room');
  if (r) {
    const want = String(roomNo || '');
    if (want && !Array.from(r.options).some((o) => o.value === want)) {
      r.insertAdjacentHTML('beforeend', '<option value="' + esc(want) + '">' + esc(want) + ' 室</option>');
    }
    r.value = want;
  }
  toast('引导完成，正在查 ' + G.loudong + ' 号楼 ' + roomNo + ' 室', 3000);
  await saveRoom();
}

function guideNext() {
  if (G.step === 1) {
    const ch = api.getChannel();
    const needRelay = ch.mode === 'direct' && /\.github\.io$/i.test(location.hostname);
    if (needRelay) {
      toast('先选一个可用的中转，或点「直接用历史数据」继续', 4200);
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
        ? '按 9 月 1 日入学算：查询开始时间 ' + r.start.replace('T', ' ') + '，结束时间 ' + r.end.replace('T', ' ')
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
      const saved = api.setChannel({ mode: 'history', relayBase: '' });
      store.set(KEY.channel, saved);
      renderChips();
      renderChannelNote();
      loadChannelInputs();
      const note = $('guide-detect-note');
      if (note) note.textContent = '已切到历史数据（离线，截至 ' + (S.cutoff || '—') + '），点「下一步」继续';
      G.loudongs = [];
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

  // 可用房间（楼栋下拉 → 房间下拉）
  const btnRooms = $('btn-room-list');
  if (btnRooms) btnRooms.addEventListener('click', () => loadLoudongSelect(true));

  $('in-loudong').addEventListener('change', () => {
    resetRoomView();
    loadRoomSelect();
  });
  $('in-room').addEventListener('change', () => {
    if (String($('in-room').value || '').trim()) saveRoom();
  });

  // 中转自动检测
  const btnDetect = $('btn-detect-relay');
  if (btnDetect) btnDetect.addEventListener('click', detectRelays);
  const btnHistory = $('btn-use-history');
  if (btnHistory) {
    btnHistory.addEventListener('click', async () => {
      const saved = api.setChannel({ mode: 'history', relayBase: '' });
      store.set(KEY.channel, saved);
      loadChannelInputs();
      renderChips();
      S.cutoff = (await api.historyMeta().catch(() => null) || {}).cutoff || S.cutoff;
      renderChannelNote();
      renderData();
      await loadLoudongSelect(true);
      toast('已切到历史数据（离线，截至 ' + (S.cutoff || '—') + '）', 3200);
    });
  }
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
      mode: qMode ? api.normalizeMode(qMode) : (qRelay ? 'relay' : 'direct'),
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

  // 历史数据截止时间（读合并索引 data/index.json；GitHub Pages 对并发请求会 403，所以只发这一个）
  const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  later(() => { api.loadRelayRegistry().then((list) => { registryEndpoints = list; }).catch(() => {}); });
  api.historyMeta().then((m) => {
    S.cutoff = m.cutoff || '';
    renderChips();
    renderChannelNote();
    renderData();
  }).catch(() => { /* 没有历史数据就只显示实时通道 */ });

  // 预填楼栋下拉（失败不打扰用户，点「刷新房间列表」可重试）
  if (api.getChannel().mode !== 'direct') loadLoudongSelect(false);

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
