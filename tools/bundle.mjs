// 把 4 个 ES module 打成一个普通脚本 + 把 CSS 内联进 index.html。
//
// 为什么：GitHub Pages（Fastly）会对同一 IP 的**并发**静态请求随机返回 403，
// 而 ES module 的 import 一旦有一个文件 403，整个模块图就崩（页面白屏）。
// 合成单文件后首屏只要 index.html + app.bundle.js + data/index.json 三个请求。
//
// 用法：node tools/bundle.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');

const IMPORT_RE = /^\s*import\s[\s\S]*?;\s*$/gm;
const EXPORT_LIST_RE = /^\s*export\s*\{[^}]*\}\s*;?\s*$/gm;
const EXPORT_DECL_RE = /^\s*export\s+(async\s+function|function|const|let|var|class)\s+/gm;

function collectExports(src) {
  const names = [];
  for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^\s*export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((piece) => {
      const name = piece.split(/\s+as\s+/).pop().trim();
      if (name) names.push(name);
    });
  }
  return [...new Set(names)];
}

function strip(src) {
  return src
    .replace(IMPORT_RE, '')
    .replace(EXPORT_LIST_RE, '')
    .replace(EXPORT_DECL_RE, '$1 ')
    .replace(/^\s*export\s+default\s+/gm, '');
}

function topLevelNames(src) {
  const set = new Set();
  for (const m of src.matchAll(/^(?:async\s+function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) set.add(m[1]);
  return set;
}

async function main() {
  const order = ['assets/xlsx.js', 'assets/api.js', 'assets/export.js', 'assets/app.js'];
  const sources = {};
  for (const p of order) sources[p] = await read(p);

  const apiNames = collectExports(sources['assets/api.js']);

  const seen = new Map();
  const chunks = [];
  for (const p of order) {
    const body = strip(sources[p]);
    for (const name of topLevelNames(body)) {
      if (seen.has(name)) {
        throw new Error(`顶层名冲突：${name}（${seen.get(name)} 与 ${p}），先改名再打包`);
      }
      seen.set(name, p);
    }
    chunks.push(`/* ---- ${p} ---- */\n${body.trim()}\n`);
  }

  const banner = `/* 由 tools/bundle.mjs 生成，请勿直接编辑。
   源码：assets/{xlsx,api,export,app}.js —— 改完跑 node tools/bundle.mjs 重新生成。 */`;
  const apiNs = `\n/* api 命名空间（app.js 里用 api.xxx） */\nconst api = { ${apiNames.join(', ')} };\n`;
  const bundle = [banner, ...chunks.slice(0, 2), apiNs, ...chunks.slice(2)].join('\n');

  await writeFile(join(ROOT, 'assets/app.bundle.js'), bundle, 'utf8');

  // CSS 内联进 index.html
  const css = await read('assets/style.css');
  const html = await read('index.html');
  const linkRe = /\s*<link rel="stylesheet" href="assets\/style\.css"\s*\/?>/;
  const styleTag = `\n    <style>\n${css.trim()}\n    </style>`;
  let next = linkRe.test(html) ? html.replace(linkRe, styleTag) : html;
  next = next.replace(/\s*<script type="module" src="assets\/app\.js"><\/script>/, `
    <script>
      // 单文件加载 + 失败重试（Pages 偶发 403 时最多重试 4 次）
      (function () {
        var tries = 0;
        function load() {
          var s = document.createElement('script');
          s.src = 'assets/app.bundle.js' + (tries ? '?r=' + tries : '');
          s.async = false;
          s.onerror = function () { if (++tries < 4) setTimeout(load, 400 * tries); };
          document.body.appendChild(s);
        }
        load();
      })();
    </script>`);
  await writeFile(join(ROOT, 'index.html'), next, 'utf8');

  const kb = (Buffer.byteLength(bundle) / 1024).toFixed(1);
  console.log(`[bundle] assets/app.bundle.js ${kb}KB · api 导出 ${apiNames.length} 个 · CSS 已内联`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
