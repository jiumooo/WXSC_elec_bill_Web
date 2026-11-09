/**
 * 历史数据抓取脚本（Node 18+，零依赖）
 *
 *   node tools/crawl.mjs                 # 增量抓取（默认）：只重写真正变化的房间文件
 *   node tools/crawl.mjs --full          # 忽略本地已有流水，全部重新拉取（首次/修数据用）
 *   node tools/crawl.mjs --loudong 3     # 只抓 3 号楼
 *   node tools/crawl.mjs --limit 20      # 只抓 20 个房间（调试用）
 *   node tools/crawl.mjs --concurrency 6 # 并发数（默认 5）
 *   node tools/crawl.mjs --probe 20      # 增量探测条数（默认 20）
 *
 * ── 为什么这样切分文件（2026-11-10 优化）─────────────────────────────
 * GitHub 上每个文件是一个 blob，内容差一个字节就要重新上传。旧结构把两样
 * “每天都在变”的东西写进了每个房间文件：
 *   · cutoff（抓取时间戳）
 *   · balance（用电量每天涨、余额每天降）
 * 于是每天 2035 个文件全部作废，一次推送要传 34MB / 34 分钟。
 *
 * 现在按“变化的频率”重新分层：
 *   data/meta.json                        每天变（1 个）
 *   data/index.json                       每天变（1 个，tools/build-index.mjs 生成）
 *   data/loudong/<no>/balance.json        每天变（12 个，只装余额）
 *   data/loudong/<no>/index.json          该楼有房间新增记录时才变
 *   data/loudong/<no>/room-<房号>.json    只有该房间新增充值才变
 *
 * 日更上传量从 2049 个文件降到 15 +（当天有新增的房间数）。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import * as api from '../assets/api.js';

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes('--' + name);
const argOf = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const LIMIT = Number(argOf('limit', '0')) || 0;
const ONLY_LOUDONG = Number(argOf('loudong', '0')) || 0;
const CONCURRENCY = Number(argOf('concurrency', '5')) || 5;
const PROBE = Number(argOf('probe', '20')) || 20;
const FULL = hasFlag('full');
const OUT = argOf('out', path.resolve(process.cwd(), 'data'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 余额统一保留 4 位小数：避免浮点抖动让文件每天都“看起来变了” */
const round4 = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
};

function stamp(date) {
  // 统一用北京时间，避免在 GitHub runner（UTC）里抓出来的截止时间比本地慢 8 小时
  const p = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, x) => { acc[x.type] = x.value; return acc; }, {});
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}

function shortName(fullRoom, loudongNo) {
  const digits = String(loudongNo == null ? '' : loudongNo).replace(/[^0-9]/g, '');
  return digits && String(fullRoom).startsWith(digits) ? String(fullRoom).slice(digits.length) : String(fullRoom);
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value), 'utf8');
}

async function readTextSafe(file) {
  try { return await fs.readFile(file, 'utf8'); } catch { return null; }
}

async function readJsonSafe(file) {
  const t = await readTextSafe(file);
  if (t == null) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/** 内容一模一样就不碰文件：mtime 不变，git 也不会认为它变了 */
async function writeIfChanged(file, value) {
  const text = JSON.stringify(value);
  const prev = await readTextSafe(file);
  if (prev === text) return false;
  await fs.writeFile(file, text, 'utf8');
  return true;
}

async function retry(fn, times = 3, wait = 700) {
  let last;
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await sleep(wait * (i + 1));
    }
  }
  throw last;
}

/** 把一条流水压成写入磁盘的形状（字段固定，保证内容稳定） */
const slim = (r) => ({
  time: r.time,
  amt: r.amt,
  buyer: String(r.buyer == null ? '' : r.buyer),
  recNo: r.recNo,
  outNo: r.outNo,
});

async function main() {
  api.setChannel({ mode: 'direct' });
  const started = Date.now();
  console.log('[crawl] 拉取房间清单…');
  const rooms = await retry(() => api.allRooms(api.DEFAULT_XIAOQU, api.DEFAULT_DATASOURCE, { force: true }), 3, 1200);
  console.log('[crawl] 房间总数', rooms.length, FULL ? '· 全量模式' : '· 增量模式');

  const groups = new Map();
  for (const r of rooms) {
    const no = api.loudongNumber(r.loudong);
    if (!no) continue;
    if (!groups.has(no)) groups.set(no, { no, name: r.loudong, rooms: [] });
    groups.get(no).rooms.push(r);
  }

  await ensureDir(OUT);
  await ensureDir(path.join(OUT, 'loudong'));

  const loudongMeta = [];
  let totalRecords = 0;
  let done = 0;
  let written = 0;
  let skipped = 0;
  let reused = 0;
  const startedAt = new Date();
  const cutoff = stamp(startedAt);
  const balanceByLoudong = new Map();
  const indexByLoudong = new Map();
  const queue = [];

  for (const g of [...groups.values()].sort((a, b) => a.no - b.no)) {
    if (ONLY_LOUDONG && g.no !== ONLY_LOUDONG) continue;
    g.rooms.sort((a, b) => String(a.room).localeCompare(String(b.room), 'en', { numeric: true }));
    for (const room of g.rooms) queue.push({ g, room });
  }
  const target = LIMIT ? queue.slice(0, LIMIT) : queue;
  console.log('[crawl] 计划抓取房间数', target.length, '并发', CONCURRENCY, '探测条数', PROBE);

  async function handleOne(item) {
    const { g, room } = item;
    const short = shortName(room.room, g.no);
    const dir = path.join(OUT, 'loudong', String(g.no));
    await ensureDir(dir);
    const file = path.join(dir, 'room-' + short + '.json');
    const prev = await readJsonSafe(file);

    let balance = null;
    let items = [];
    let error = null;

    try {
      const resolved = {
        xiaoquId: api.DEFAULT_XIAOQU,
        datasource: api.DEFAULT_DATASOURCE,
        loudongId: room.loudongId,
        roomId: room.roomId,
        loudongName: g.name,
        roomName: room.room,
      };
      balance = await retry(() => api.queryRoom(resolved), 3, 800);

      const prevItems = prev && Array.isArray(prev.items) ? prev.items : null;
      const newestPrev = prevItems && prevItems.length ? String(prevItems[0].recNo || '') : '';

      if (!FULL && prevItems && newestPrev) {
        // 增量探测：只取最新 PROBE 条，首条 recNo 和本地一致就认为没有新增
        let probe = null;
        try {
          probe = await retry(() => api.fetchRecharge(resolved, PROBE), 2, 600);
        } catch {
          probe = null;
        }
        if (probe && probe.length && String(probe[0].recNo || '') === newestPrev) {
          items = prevItems.map(slim);
          reused += 1;
        } else {
          items = await retry(() => api.fetchRecharge(resolved, 800), 3, 800);
        }
      } else {
        items = await retry(() => api.fetchRecharge(resolved, 800), 3, 800);
      }
    } catch (err) {
      error = String((err && err.message) || err);
      if (prev && Array.isArray(prev.items)) items = prev.items.map(slim);
    }

    const persons = api.summarize(items, {}).map((p) => ({ buyer: p.buyer, count: p.count, amount: p.amount }));
    // 注意：这里不再写 cutoff / balance —— 它们让每个房间文件每天都在变
    const payload = {
      room: room.room,
      short,
      name: g.name + ' ' + short + ' 室',
      loudongNo: g.no,
      loudongId: room.loudongId,
      roomId: room.roomId,
      records: items.length,
      amount: Number(items.reduce((a, r) => a + (Number(r.amt) || 0), 0).toFixed(2)),
      persons,
      items,
    };
    if (error) payload.error = error;
    if (await writeIfChanged(file, payload)) written += 1;
    else skipped += 1;

    if (!indexByLoudong.has(g.no)) indexByLoudong.set(g.no, []);
    indexByLoudong.get(g.no).push({
      short,
      room: room.room,
      roomId: room.roomId,
      records: payload.records,
      amount: payload.amount,
      ...(error ? { error } : {}),
    });

    if (balance) {
      if (!balanceByLoudong.has(g.no)) balanceByLoudong.set(g.no, new Map());
      balanceByLoudong.get(g.no).set(short, {
        used: round4(balance.used),
        buy: round4(balance.buy),
        left: round4(balance.left),
      });
    }

    totalRecords += payload.records;
    done += 1;
    if (done % 25 === 0 || done === target.length) {
      const per = (Date.now() - started) / Math.max(done, 1);
      const left = Math.round((per * (target.length - done)) / 1000);
      console.log('[crawl]', done + '/' + target.length, '记录', totalRecords,
        '复用', reused, '写入', written, '剩余约', left + 's');
    }
  }

  let cursor = 0;
  async function worker() {
    while (cursor < target.length) {
      const item = target[cursor++];
      try {
        await handleOne(item);
      } catch (err) {
        console.error('[crawl] 房间失败', item.g.no, item.room.room, String((err && err.message) || err));
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  for (const g of [...groups.values()].sort((a, b) => a.no - b.no)) {
    const list = indexByLoudong.get(g.no) || [];
    if (!list.length) continue;
    const dir = path.join(OUT, 'loudong', String(g.no));
    list.sort((a, b) => Number(a.short) - Number(b.short) || String(a.short).localeCompare(String(b.short)));

    // 楼层索引：不带 cutoff，只在房间笔数/金额变化时才会变
    await writeIfChanged(path.join(dir, 'index.json'), { no: g.no, name: g.name, rooms: list });

    // 余额快照单独一个文件：每天都变，但只有 12 个
    const balMap = balanceByLoudong.get(g.no) || new Map();
    const balRooms = {};
    [...balMap.keys()].sort((a, b) => Number(a) - Number(b)).forEach((k) => { balRooms[k] = balMap.get(k); });
    await writeIfChanged(path.join(dir, 'balance.json'), {
      version: 1,
      cutoff,
      rooms: balRooms,
    });

    loudongMeta.push({
      no: g.no,
      name: g.name,
      rooms: list.length,
      records: list.reduce((a, x) => a + (x.records || 0), 0),
    });
  }

  // 局部抓取（--loudong N / --limit N）时，把结果合并进已有 meta，别把其它楼栋抹掉
  let mergedLoudongs = loudongMeta;
  const prevMeta = await readJsonSafe(path.join(OUT, 'meta.json'));
  if ((ONLY_LOUDONG || LIMIT) && prevMeta && Array.isArray(prevMeta.loudongs)) {
    const map = new Map(prevMeta.loudongs.map((l) => [l.no, l]));
    loudongMeta.forEach((l) => map.set(l.no, l));
    mergedLoudongs = [...map.values()].sort((a, b) => a.no - b.no);
  }
  const mergedRooms = mergedLoudongs.reduce((a, x) => a + x.rooms, 0);
  const mergedRecords = mergedLoudongs.reduce((a, x) => a + (x.records || 0), 0);

  await writeJson(path.join(OUT, 'meta.json'), {
    version: 1,
    cutoff,
    timezone: 'Asia/Shanghai',
    generatedAt: new Date().toISOString(),
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
    xiaoquId: api.DEFAULT_XIAOQU,
    datasource: api.DEFAULT_DATASOURCE,
    rooms: mergedRooms,
    records: mergedRecords,
    loudongs: mergedLoudongs,
  });

  console.log('[crawl] 完成：楼栋', mergedLoudongs.length, '房间', mergedRooms, '记录', mergedRecords);
  console.log('[crawl] 房间文件：写入', written, '未变', skipped, '（其中复用本地流水', reused, '间）');
  console.log('[crawl] 单次变更文件数 ≈', written + loudongMeta.length * 2 + 2, '（含 index/balance/meta）');
}

main().catch((err) => {
  console.error('[crawl] 失败', err);
  process.exit(1);
});
