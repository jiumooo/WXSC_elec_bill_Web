/* ==========================================================================
 * WXSC_elec_bill_Web · 数据层
 * 纯浏览器实现：RSA(512/PKCS#1 v1.5) 分段加密 + MD5 签名 + 房间解析 + 记录汇总
 * 不依赖任何第三方库，也不依赖任何后端会话 —— 每次请求都自带完整的房间参数，
 * 因此多人同时使用、各自查询自己的房间时互不影响。
 * ========================================================================== */

export const APP_VERSION = '1.0.0';

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

export const DEFAULT_XIAOQU = '1';
export const DEFAULT_DATASOURCE = 'cg1_1';

/* ------------------------------------------------------------------ 基础工具 */
export function utf8Encode(text) {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes) {
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

export function md5(bytes) {
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
export const CHANNELS = {
  direct: { id: 'direct', label: '直连' },
  relay: { id: 'relay', label: '自建中转' },
  demo: { id: 'demo', label: '示例数据' },
};

let channel = { mode: 'direct', relayBase: '' };

export function getChannel() {
  return { ...channel };
}

export function setChannel(next) {
  channel = {
    mode: next && (next.mode === 'relay' || next.mode === 'demo') ? next.mode : 'direct',
    relayBase: String((next && next.relayBase) || '').replace(/\/+$/, ''),
  };
  roomsCache.clear();
  return getChannel();
}

function endpoint(path) {
  if (channel.mode === 'relay') {
    if (!channel.relayBase) throw new Error('还没填写中转地址');
    return channel.relayBase + '/grdp-ele-third-unite' + path;
  }
  return UPSTREAM + path;
}

function sortKeys(obj) {
  const out = {};
  Object.keys(obj).sort().forEach((k) => { out[k] = obj[k]; });
  return out;
}

async function post(path, payload, options = {}) {
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

  const url = endpoint(path);
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

/* ------------------------------------------------------------------ 房间列表 */
const ROOM_TTL = 60 * 60 * 1000;
const roomsCache = new Map();

/* 示例数据：结构与真实接口完全一致，房号形如「3101」= 3 号楼 101 室 */
function demoRooms() {
  const rows = [];
  const names = ['一号楼', '二号楼', '三号楼', '四号楼', '五号楼', '六号楼'];
  names.forEach((name, bidx) => {
    for (let f = 1; f <= 6; f++) {
      for (let r = 1; r <= 12; r++) {
        const roomNo = String(f) + String(100 + r).slice(1);
        rows.push({
          loudongId: String(85 + bidx),
          loudong: name,
          roomId: String(10000 + bidx * 500 + f * 20 + r),
          room: roomNo,
        });
      }
    }
  });
  return rows;
}

function demoSeed(key) {
  let h = 2166136261;
  const s = String(key);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

function demoRoomValues(room) {
  const rnd = demoSeed('val|' + room.loudongId + '|' + room.roomId);
  const buy = Math.round((200 + rnd() * 12000) * 100) / 100;
  const used = Math.round((buy * (0.55 + rnd() * 0.44)) * 100) / 100;
  return { xiaoqu: '示例校区', used, buy, left: Math.round((buy - used) * 100) / 100, at: new Date().toISOString() };
}

function demoRecords(room) {
  const rnd = demoSeed('rec|' + room.loudongId + '|' + room.roomId);
  const buyers = [];
  const total = 40 + Math.floor(rnd() * 220);
  const count = 3 + Math.floor(rnd() * 6);
  for (let i = 0; i < count; i++) buyers.push(String(1000000000 + Math.floor(rnd() * 899999999)));
  const now = Date.now();
  const span = 1000 * 60 * 60 * 24 * 420;
  const rows = [];
  for (let i = 0; i < total; i++) {
    const t = new Date(now - Math.floor(rnd() * span));
    rows.push({
      time: t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' +
        String(t.getDate()).padStart(2, '0') + ' ' + String(t.getHours()).padStart(2, '0') + ':' +
        String(t.getMinutes()).padStart(2, '0') + ':' + String(t.getSeconds()).padStart(2, '0'),
      amt: Math.round((10 + rnd() * 190) * 100) / 100,
      buyer: buyers[Math.floor(rnd() * buyers.length)],
      recNo: 'DEMO' + String(100000 + i),
      outNo: 'OUT' + String(900000 + Math.floor(rnd() * 99999)),
      room: room.roomName,
      loudong: room.loudongName,
    });
  }
  rows.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
  return rows;
}

function demoDelay() {
  return new Promise((resolve) => setTimeout(resolve, 260));
}

export function allRooms(xiaoquId = DEFAULT_XIAOQU, datasource = DEFAULT_DATASOURCE, options = {}) {
  const key = xiaoquId + '|' + datasource;
  const hit = roomsCache.get(key);
  if (hit && !options.force && Date.now() - hit.ts < ROOM_TTL) return hit.promise;
  if (channel.mode === 'demo') {
    const promise = demoDelay().then(demoRooms);
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

export function loudongNumber(name) {
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
export async function resolveRoom(cfg, options = {}) {
  const xiaoquId = String(cfg.xiaoquId || DEFAULT_XIAOQU).trim() || DEFAULT_XIAOQU;
  const datasource = String(cfg.datasource || DEFAULT_DATASOURCE).trim() || DEFAULT_DATASOURCE;
  const base = { xiaoquId, datasource };
  const ln = digits(cfg.loudongNo);
  const rn = digits(cfg.roomNo);
  if (!ln || !rn) throw new Error('楼栋号和房间号都要填数字，例如 楼栋=3、房间=101（表示 3 号楼 101 室）');

  const rows = await allRooms(xiaoquId, datasource, options);
  const cand = rows.filter((r) => loudongNumber(r.loudong) === parseInt(ln, 10));
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

export function describeRoom(room) {
  if (room && room.loudongName) {
    const rn = room.roomName || '';
    const short = rn.startsWith(digits(room.loudongName)) ? rn.slice(digits(room.loudongName).length) : rn;
    return room.loudongName + ' ' + short + ' 室';
  }
  if (room) return '楼栋 ' + (room.loudongId || '-') + ' / 房间 ' + (room.roomId || '-');
  return '未设置';
}

/* ------------------------------------------------------------------ 查询 */
export async function queryRoom(room, options = {}) {
  if (channel.mode === 'demo') {
    await demoDelay();
    return demoRoomValues(room);
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

export async function fetchRecharge(room, size = 800, options = {}) {
  if (channel.mode === 'demo') {
    await demoDelay();
    return demoRecords(room).slice(0, size);
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

export function toLocalInput(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
    'T' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());
}

export function toApiTime(value) {
  if (!value) return '';
  const v = String(value).trim().replace('T', ' ');
  return v.length === 16 ? v + ':00' : v;
}

/** 快捷范围：本月 / 近30天 / 全部 / 今年 */
export function quickRange(kind, now = new Date()) {
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

export function rangeLabel(start, end) {
  if (start && end) return start + ' ~ ' + end;
  if (start) return start + ' 起';
  if (end) return '截至 ' + end;
  return '全部';
}

export function filterItems(items, start, end) {
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
export function summarize(items, notes = {}) {
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

export function sumAmount(items) {
  return Math.round(items.reduce((a, r) => a + (Number(r.amt) || 0), 0) * 100) / 100;
}
