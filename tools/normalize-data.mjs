/**
 * 历史台账整理：把「房间号 = 完整编码」（3101）统一成「房间号 = 该楼内的房号」（101）。
 *
 *   node tools/normalize-data.mjs
 *
 * 老版本 crawl.mjs 用楼栋名（三号楼）取数字前缀，取不到就把完整编码当成房号，
 * 于是产生 room-3101.json / short:"3101"。这个脚本会：
 *   1. 读每个楼栋目录下的 room-*.json，按楼栋号从完整编码里剥掉前缀；
 *   2. 重命名为 room-<房号>.json 并回写 short；
 *   3. 重建 index.json（rooms 里的 short 同步修正），并更新 meta.json 统计。
 * 幂等：已经整理过的目录再跑一遍不会有变化。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const OUT = path.resolve(process.cwd(), 'data');
const LOUDONG_DIR = path.join(OUT, 'loudong');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function stamp(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
    ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value), 'utf8');
}

async function main() {
  let meta = null;
  try { meta = await readJson(path.join(OUT, 'meta.json')); } catch (e) { meta = null; }
  const cutoff = (meta && meta.cutoff) || stamp(new Date());

  const dirs = (await fs.readdir(LOUDONG_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => Number(a) - Number(b));

  let renamed = 0;
  let patched = 0;
  const loudongMeta = [];
  let totalRecords = 0;

  for (const no of dirs) {
    const dir = path.join(LOUDONG_DIR, no);
    const files = (await fs.readdir(dir)).filter((f) => /^room-.*\.json$/.test(f));
    const rooms = [];
    let loudongName = '';

    for (const file of files) {
      const full = path.join(dir, file);
      const data = await readJson(full);
      const code = String(data.room || '').trim() || file.replace(/^room-|\.json$/g, '');
      const short = code.startsWith(no) ? code.slice(String(no).length) : code;
      if (!loudongName && data.name && data.name.indexOf(' ') > 0) loudongName = data.name.split(' ')[0];

      if (data.short !== short) { data.short = short; await writeJson(full, data); patched += 1; }

      const target = path.join(dir, 'room-' + short + '.json');
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
        used: data.balance ? data.balance.used : null,
        buy: data.balance ? data.balance.buy : null,
        left: data.balance ? data.balance.left : null,
        ...(data.error ? { error: data.error } : {}),
      });
      totalRecords += data.records || 0;
    }

    if (!rooms.length) continue;
    rooms.sort((a, b) => Number(a.short) - Number(b.short) || String(a.short).localeCompare(String(b.short)));
    await writeJson(path.join(dir, 'index.json'), {
      no: Number(no),
      name: loudongName || (no + ' 号楼'),
      cutoff,
      rooms,
    });
    loudongMeta.push({
      no: Number(no),
      name: loudongName || (no + ' 号楼'),
      rooms: rooms.length,
      records: rooms.reduce((a, x) => a + (x.records || 0), 0),
    });
  }

  const next = meta || { version: 1, cutoff, xiaoquId: '1', datasource: 'cg1_1' };
  next.cutoff = cutoff;
  next.rooms = loudongMeta.reduce((a, x) => a + x.rooms, 0);
  next.records = totalRecords;
  next.loudongs = loudongMeta;
  next.normalizedAt = new Date().toISOString();
  await writeJson(path.join(OUT, 'meta.json'), next);

  console.log('[normalize] 重命名', renamed, '修正', patched, '楼栋', loudongMeta.length,
    '房间', next.rooms, '记录', totalRecords, '截止', cutoff);
}

main().catch((err) => {
  console.error('[normalize] 失败', err);
  process.exit(1);
});
