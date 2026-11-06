// 用 Git Data API 推送当前工作区（git 的 https/ssh 通道都不通时用）
// 带限速、断点续传（.git/api-push-cache.json 记住已上传的 blob），可反复重跑。
// node tools/api-push.mjs [--branch main] [--dry]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const REPO_DIR = process.cwd();
const OWNER = 'jiumooo';
const REPO = 'WXSC_elec_bill_Web';
const BRANCH = process.argv.includes('--branch') ? process.argv[process.argv.indexOf('--branch') + 1] : 'main';
const DRY = process.argv.includes('--dry');
const CONCURRENCY = Number(process.env.PUSH_CONCURRENCY || 2);
const GAP_MS = Number(process.env.PUSH_GAP_MS || 120);
const CACHE = path.join(REPO_DIR, '.git', 'api-push-cache.json');

const TOKEN = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gh(method, url, body) {
  let wait = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(url.startsWith('http') ? url : API + url, {
      method,
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'wxsc-api-push',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) {
      const left = Number(res.headers.get('x-ratelimit-remaining'));
      if (Number.isFinite(left) && left >= 0 && left < 200) {
        console.log('[warn] 剩余配额', left);
      }
      return res.json();
    }
    const text = await res.text();
    const retryAfter = Number(res.headers.get('retry-after'));
    const secondary = res.status === 403 && /secondary rate limit|rate limit/i.test(text);
    if (secondary || res.status === 429 || res.status >= 500) {
      wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(180000, 15000 * (attempt + 1));
      console.log('[retry]', res.status, '等待', Math.round(wait / 1000) + 's');
      await sleep(wait);
      continue;
    }
    throw new Error(method + ' ' + url + ' → ' + res.status + ' ' + text.slice(0, 400));
  }
  throw new Error(method + ' ' + url + ' → 重试仍失败');
}

async function walk(dir, out = []) {
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const it of items) {
    if (it.name === '.git' || it.name === 'node_modules' || it.name === '.wrangler') continue;
    const full = path.join(dir, it.name);
    if (it.isDirectory()) await walk(full, out);
    else if (it.isFile()) out.push(path.relative(REPO_DIR, full).split(path.sep).join('/'));
  }
  return out;
}

async function readCache() {
  try { return JSON.parse(await fs.readFile(CACHE, 'utf8')); } catch (e) { return {}; }
}

async function main() {
  const ref = await gh('GET', `/git/ref/heads/${BRANCH}`);
  const baseSha = ref.object.sha;
  const baseCommit = await gh('GET', `/git/commits/${baseSha}`);
  const baseTree = baseCommit.tree.sha;
  console.log('base', baseSha.slice(0, 8), 'tree', baseTree.slice(0, 8));

  const files = await walk(REPO_DIR);
  console.log('files to upload:', files.length);
  if (DRY) process.exit(0);

  const cache = await readCache();
  const entries = new Array(files.length);
  let done = 0;
  let reused = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const i = cursor++;
      const rel = files[i];
      let sha = cache[rel];
      if (!sha) {
        const buf = await fs.readFile(path.join(REPO_DIR, rel));
        const blob = await gh('POST', '/git/blobs', { content: buf.toString('base64'), encoding: 'base64' });
        sha = blob.sha;
        cache[rel] = sha;
        if (done % 20 === 0) await fs.writeFile(CACHE, JSON.stringify(cache), 'utf8');
        await sleep(GAP_MS);
      } else {
        reused += 1;
      }
      entries[i] = { path: rel, mode: '100644', type: 'blob', sha };
      done += 1;
      if (done % 100 === 0) {
        console.log('progress', done, '/', files.length, '(复用', reused + ')');
        await fs.writeFile(CACHE, JSON.stringify(cache), 'utf8');
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await fs.writeFile(CACHE, JSON.stringify(cache), 'utf8');

  console.log('all blobs ready, creating tree…');
  const tree = await gh('POST', '/git/trees', { base_tree: baseTree, tree: entries });
  console.log('tree', tree.sha.slice(0, 8));

  const message = await fs.readFile(path.join(REPO_DIR, '.git', 'COMMIT_MSG_120.txt'), 'utf8');
  const commit = await gh('POST', '/git/commits', { message, tree: tree.sha, parents: [baseSha] });
  console.log('commit', commit.sha);

  await gh('PATCH', `/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true });
  console.log('pushed →', commit.sha);
}

main().catch((err) => { console.error('[api-push] 失败：', err.message); process.exit(1); });
