// 把 data/meta.json + 每栋 index.json 合成一个 data/index.json，
// 页面首屏只需要 1 个请求（GitHub Pages 对突发并发请求会 403 限流）。
//
// 用法：node tools/build-index.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DATA = join(ROOT, 'data');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

async function main() {
  const meta = await readJson(join(DATA, 'meta.json'));
  const loudongs = [];
  for (const l of meta.loudongs) {
    const idx = await readJson(join(DATA, 'loudong', String(l.no), 'index.json'));
    loudongs.push({
      no: l.no,
      name: l.name || idx.name || '',
      rooms: idx.rooms.map((r) => [r.short, r.records || 0]),
    });
  }
  const out = {
    version: meta.version,
    cutoff: meta.cutoff,
    timezone: meta.timezone || 'Asia/Shanghai',
    xiaoquId: meta.xiaoquId,
    datasource: meta.datasource,
    rooms: meta.rooms,
    records: meta.records,
    loudongs,
  };
  const file = join(DATA, 'index.json');
  await writeFile(file, JSON.stringify(out), 'utf8');
  const bytes = Buffer.byteLength(JSON.stringify(out));
  console.log(`[index] 楼栋 ${loudongs.length} 房间 ${loudongs.reduce((s, x) => s + x.rooms.length, 0)} 记录 ${out.records} 截止 ${out.cutoff} ${(bytes / 1024).toFixed(1)}KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
