/**
 * 历史台账整理 + 迁移（幂等）
 *
 *   node tools/normalize-data.mjs
 *
 * 做两件事：
 *
 * ① 房号归一：老版本 crawl.mjs 用楼栋中文名（「三号楼」）取数字前缀，取不到就把
 *    完整编码当房号，产生 room-3101.json / short:"3101"。这里按楼栋号剥掉前缀，
 *    重命名成 room-101.json 并回写 short。
 *
 * ② 字段分层（2026-11-10 增量优化）：把「每天都在变」的字段从房间里搬出去
 *    - 删掉每个 room-*.json 里的 cutoff 与 balance
 *    - 余额汇总进 data/loudong/<no>/balance.json（12 个文件，每天变）
 *    - 每楼 index.json 去掉 cutoff，rooms 里去掉 used/buy/left
 *    这样房间文件只在「这间房新增了充值」时才变，推送到 GitHub 不必重传全部数据。
 *
 * 重复跑不会产生新的变化（balance.json 的 cutoff 取 meta.json 里的值，不是当前时间）。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const OUT = path.resolve(process.cwd(), 'data');
const LOUDONG_DIR = path.join(OUT, 'loudong');

async function readText(file) {
  try { return await fs.readFile(file, 'utf8'); } catch { return null; }
}

async function readJson(file) {
  const t = await readText(file);
  return t == null ? null : JSON.parse(t);
}

/** 只有内容真的变了才写，避免无意义的 mtime 变动 */
async function writeIfChanged(file, value) {
  const text = JSON.stringify(value);
  const prev = await readText(file);
  if (prev === text) return false;
  await fs.writeFile(file, text, 'utf8');
  return true;
}

async function main() {
  let meta = await readJson(path.join(OUT, 'meta.json'));
  const cutoff = (meta && meta.cutoff) || '';

  const dirs = (await fs.readdir(LOUDONG_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => Number(a) - Number(b));

  let renamed = 0;
  let slimmed = 0;
  let balWritten = 0;
  const loudongMeta = [];
  let totalRecords = 0;

  for (const no of dirs) {
    const dir = path.join(LOUDONG_DIR, no);
    const files = (await fs.readdir(dir)).filter((f) => /^room-.*\.json$/.test(f));
    const rooms = [];
    const balRooms = {};
    let loudongName = '';

    // 先收已在 balance.json 里的旧值，避免迁移时丢数据
    const oldBal = await readJson(path.join(dir, 'balance.json'));
    if (oldBal && oldBal.rooms) Object.assign(balRooms, oldBal.rooms);

    for (const file of files) {
      const full = path.join(dir, file);
      const data = await readJson(full);
      if (!data) continue;
      const code = String(data.room || '').trim() || file.replace(/^room-|\.json$/g, '');
      const short = code.startsWith(no) ? code.slice(String(no).length) : code;
      if (!loudongName && data.name && data.name.indexOf(' ') > 0) loudongName = data.name.split(' ')[0];

      // 迁移：把余额搬到 balance.json，把 cutoff 从房间文件里去掉
      let dirty = false;
      if (data.balance) {
        if (!balRooms[short] || data.balance.left != null) {
          balRooms[short] = {
            used: Number(data.balance.used) || 0,
            buy: Number(data.balance.buy) || 0,
            left: Number(data.balance.left) || 0,
          };
        }
        delete data.balance;
        dirty = true;
      }
      if ('cutoff' in data) { delete data.cutoff; dirty = true; }
      if (data.short !== short) { data.short = short; dirty = true; }

      const target = path.join(dir, 'room-' + short + '.json');
      if (dirty) {
        await fs.writeFile(full, JSON.stringify(data), 'utf8');
        slimmed += 1;
      }
      if (path.basename(target) !== file) {
        await fs.rename(full, target);
        renamed += 1;
      }

      rooms.push({
        short,
        room: code,
        roomId: data.roomId,
        records: data.records || 0,
        amount: data.amount || 0,
        ...(data.error ? { error: data.error } : {}),
      });
      totalRecords += data.records || 0;
    }

    if (!rooms.length) continue;
    rooms.sort((a, b) => Number(a.short) - Number(b.short) || String(a.short).localeCompare(String(b.short)));

    await writeIfChanged(path.join(dir, 'index.json'), {
      no: Number(no),
      name: loudongName || (no + ' 号楼'),
      rooms,
    });

    const keys = Object.keys(balRooms).sort((a, b) => Number(a) - Number(b));
    const sorted = {};
    keys.forEach((k) => { sorted[k] = balRooms[k]; });
    if (await writeIfChanged(path.join(dir, 'balance.json'), { version: 1, cutoff, rooms: sorted })) {
      balWritten += 1;
    }

    loudongMeta.push({
      no: Number(no),
      name: loudongName || (no + ' 号楼'),
      rooms: rooms.length,
      records: rooms.reduce((a, x) => a + (x.records || 0), 0),
    });
  }

  const next = meta || { version: 1, cutoff, xiaoquId: '1', datasource: 'cg1_1' };
  next.cutoff = cutoff;
  next.timezone = next.timezone || 'Asia/Shanghai';
  next.rooms = loudongMeta.reduce((a, x) => a + x.rooms, 0);
  next.records = totalRecords;
  next.loudongs = loudongMeta;
  next.normalizedAt = new Date().toISOString();
  await writeIfChanged(path.join(OUT, 'meta.json'), next);

  console.log('[normalize] 重命名', renamed, '迁移', slimmed, 'balance.json 写入', balWritten,
    '楼栋', loudongMeta.length, '房间', next.rooms, '记录', totalRecords, '截止', cutoff);
}

main().catch((err) => {
  console.error('[normalize] 失败', err);
  process.exit(1);
});
