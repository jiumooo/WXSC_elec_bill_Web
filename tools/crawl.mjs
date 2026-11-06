/**
 * 历史数据抓取脚本（Node 18+，零依赖）
 *
 *   node tools/crawl.mjs                 # 全量抓取，写入 data/
 *   node tools/crawl.mjs --limit 20      # 只抓 20 个房间（调试用）
 *   node tools/crawl.mjs --loudong 3     # 只抓 3 号楼
 *   node tools/crawl.mjs --concurrency 6 # 并发数（默认 5）
 *
 * 产物结构（页面用「历史数据」通道读取，全程不发请求）：
 *   data/meta.json                    截止时间、楼栋清单、总量
 *   data/loudong/<楼栋号>/index.json   该楼房间清单（含每间余额与笔数）
 *   data/loudong/<楼栋号>/room-<房>.json  单房间：余额 + 逐笔记录 + 按人汇总
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import * as api from '../assets/api.js';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const LIMIT = Number(argOf('limit', '0')) || 0;
const ONLY_LOUDONG = Number(argOf('loudong', '0')) || 0;
const CONCURRENCY = Number(argOf('concurrency', '5')) || 5;
const OUT = argOf('out', path.resolve(process.cwd(), 'data'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, '0');

function stamp(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
    ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());
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

async function main() {
  api.setChannel({ mode: 'direct' });
  const started = Date.now();
  console.log('[crawl] 拉取房间清单…');
  const rooms = await retry(() => api.allRooms(api.DEFAULT_XIAOQU, api.DEFAULT_DATASOURCE, { force: true }), 3, 1200);
  console.log('[crawl] 房间总数', rooms.length);

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
  const startedAt = new Date();
  const cutoff = stamp(startedAt);
  const queue = [];

  for (const g of [...groups.values()].sort((a, b) => a.no - b.no)) {
    if (ONLY_LOUDONG && g.no !== ONLY_LOUDONG) continue;
    g.rooms.sort((a, b) => String(a.room).localeCompare(String(b.room), 'en', { numeric: true }));
    for (const room of g.rooms) queue.push({ g, room });
  }
  const target = LIMIT ? queue.slice(0, LIMIT) : queue;
  console.log('[crawl] 计划抓取房间数', target.length, '并发', CONCURRENCY);

  const indexByLoudong = new Map();

  async function handleOne(item) {
    const { g, room } = item;
    const short = shortName(room.room, g.no);
    const dir = path.join(OUT, 'loudong', String(g.no));
    await ensureDir(dir);
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
      items = await retry(() => api.fetchRecharge(resolved, 800), 3, 800);
    } catch (err) {
      error = String((err && err.message) || err);
    }

    const persons = api.summarize(items, {}).map((p) => ({ buyer: p.buyer, count: p.count, amount: p.amount }));
    const payload = {
      room: room.room,
      short,
      name: g.name + ' ' + short + ' 室',
      loudongNo: g.no,
      loudongId: room.loudongId,
      roomId: room.roomId,
      cutoff,
      balance: balance ? { used: balance.used, buy: balance.buy, left: balance.left, at: balance.at } : null,
      records: items.length,
      amount: Number(items.reduce((a, r) => a + (Number(r.amt) || 0), 0).toFixed(2)),
      persons,
      items: items.map((r) => ({ time: r.time, amt: r.amt, buyer: r.buyer, recNo: r.recNo, outNo: r.outNo })),
    };
    if (error) payload.error = error;
    await writeJson(path.join(dir, 'room-' + short + '.json'), payload);

    if (!indexByLoudong.has(g.no)) indexByLoudong.set(g.no, []);
    indexByLoudong.get(g.no).push({
      short,
      room: room.room,
      roomId: room.roomId,
      records: payload.records,
      amount: payload.amount,
      used: balance ? balance.used : null,
      buy: balance ? balance.buy : null,
      left: balance ? balance.left : null,
      error: error || undefined,
    });
    totalRecords += payload.records;
    done += 1;
    if (done % 25 === 0 || done === target.length) {
      const per = (Date.now() - started) / Math.max(done, 1);
      const left = Math.round((per * (target.length - done)) / 1000);
      console.log('[crawl]', done + '/' + target.length, '记录', totalRecords, '剩余约', left + 's');
    }
  }

  let cursor = 0;
  async function worker() {
    while (cursor < target.length) {
      const item = target[cursor++];
      try {
        await handleOne(item);
      } catch (err) {
        console.error('[crawl] 房间失败', item.g.no, item.room.room, String(err && err.message || err));
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  for (const g of [...groups.values()].sort((a, b) => a.no - b.no)) {
    const list = indexByLoudong.get(g.no) || [];
    if (!list.length) continue;
    list.sort((a, b) => Number(a.short) - Number(b.short) || String(a.short).localeCompare(String(b.short)));
    await writeJson(path.join(OUT, 'loudong', String(g.no), 'index.json'), {
      no: g.no,
      name: g.name,
      cutoff,
      rooms: list,
    });
    loudongMeta.push({
      no: g.no,
      name: g.name,
      rooms: list.length,
      records: list.reduce((a, x) => a + (x.records || 0), 0),
    });
  }

  await writeJson(path.join(OUT, 'meta.json'), {
    version: 1,
    cutoff,
    generatedAt: new Date().toISOString(),
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
    xiaoquId: api.DEFAULT_XIAOQU,
    datasource: api.DEFAULT_DATASOURCE,
    rooms: loudongMeta.reduce((a, x) => a + x.rooms, 0),
    records: totalRecords,
    loudongs: loudongMeta,
  });

  console.log('[crawl] 完成：楼栋', loudongMeta.length, '房间', loudongMeta.reduce((a, x) => a + x.rooms, 0), '记录', totalRecords);
}

main().catch((err) => {
  console.error('[crawl] 失败', err);
  process.exit(1);
});
