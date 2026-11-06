// 用 Git Data API 推送当前工作区（git 的 https/ssh 通道不通时用）
//
// 思路：GitHub 的 blob sha 就是本地 `git hash-object` 的结果（内容寻址），
// 所以先读远端的递归树，凡是内容没变的文件直接复用它的 sha，只上传真正变了的文件。
// 建树按目录分层（单次 2000+ 条目会 422 request timed out）。
//
// 用法：node tools/api-push.mjs [--branch main] [--dry]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const REPO_DIR = process.cwd();
const OWNER = 'jiumooo';
const REPO = 'WXSC_elec_bill_Web';
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BRANCH = argOf('--branch', 'main');
const DRY = process.argv.includes('--dry');
const GAP_MS = Number(process.env.PUSH_GAP_MS || 150);

const TOKEN = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gh(method, url, body) {
  for (let attempt = 0; attempt < 20; attempt++) {
    let res;
    try {
      res = await fetch(url.startsWith('http') ? url : API + url, {
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
    } catch (netErr) {
      const wait = Math.min(60000, 3000 * (attempt + 1));
      console.log('[net-retry]', String(netErr.message || netErr).slice(0, 60), '等待', Math.round(wait / 1000) + 's');
      await sleep(wait);
      continue;
    }
    if (res.ok) return res.json();
    const text = await res.text();
    const retryAfter = Number(res.headers.get('retry-after'));
    const retryable = (res.status === 403 && /rate limit/i.test(text)) || res.status === 429 || res.status >= 500 || res.status === 422;
    if (retryable && attempt < 5) {
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(120000, 10000 * (attempt + 1));
      console.log('[retry]', res.status, '等待', Math.round(wait / 1000) + 's');
      await sleep(wait);
      continue;
    }
    throw new Error(method + ' ' + url + ' → ' + res.status + ' ' + text.slice(0, 300));
  }
  throw new Error(method + ' ' + url + ' → 重试仍失败');
}

async function walk(dir, out = []) {
  for (const it of await fs.readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.wrangler'].includes(it.name)) continue;
    const full = path.join(dir, it.name);
    if (it.isDirectory()) await walk(full, out);
    else if (it.isFile()) out.push(path.relative(REPO_DIR, full).split(path.sep).join('/'));
  }
  return out;
}

async function main() {
  const ref = await gh('GET', `/git/ref/heads/${BRANCH}`);
  const baseSha = ref.object.sha;
  const baseTree = await gh('GET', `/git/commits/${baseSha}`).then((c) => c.tree.sha);

  // 防止把别人的提交（比如每天自动刷新的 data 提交）覆盖掉：
  // 本地 HEAD 必须等于远端 HEAD，否则让人先 fetch + reset。
  const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_DIR, encoding: 'utf8' }).trim();
  let ahead = false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', baseSha, localHead], { cwd: REPO_DIR });
    ahead = true;
  } catch (e) {
    ahead = false;
  }
  if (localHead !== baseSha && !ahead && !process.argv.includes('--force-from-worktree')) {
    throw new Error(
      '本地 HEAD ' + localHead.slice(0, 8) + ' 与远端 ' + baseSha.slice(0, 8) +
      ' 已分叉（远端可能被自动刷新提交推进过），先执行 git fetch && git reset --hard origin/main',
    );
  }
  if (ahead && localHead !== baseSha) console.log('本地领先远端，正常推送（base ' + baseSha.slice(0, 8) + '）');

  // 远端已有内容的 sha 表
  const remote = new Map();
  const walkRemote = async (sha) => {
    const t = await gh('GET', `/git/trees/${sha}?recursive=1`);
    for (const e of t.tree) if (e.type === 'blob') remote.set(e.path, e.sha);
    return t;
  };
  const remoteTree = await walkRemote(baseTree);
  console.log('base', baseSha.slice(0, 8), '远端文件数', remote.size, remoteTree.truncated ? '(被截断)' : '');

  const files = await walk(REPO_DIR);
  console.log('本地文件数', files.length);

  const entries = new Array(files.length);
  let uploads = 0;
  let reused = 0;
  for (let i = 0; i < files.length; i++) {
    const rel = files[i];
    const localSha = execFileSync('git', ['hash-object', rel], { cwd: REPO_DIR, encoding: 'utf8' }).trim();
    let sha = localSha;
    if (remote.get(rel) !== localSha) {
      if (DRY) { console.log('[dry] 需上传', rel); uploads++; entries[i] = { path: rel, sha: localSha, dir: false }; continue; }
      const buf = await fs.readFile(path.join(REPO_DIR, rel));
      const blob = await gh('POST', '/git/blobs', { content: buf.toString('base64'), encoding: 'base64' });
      sha = blob.sha;
      if (sha !== localSha) throw new Error('blob sha 不一致：' + rel);
      uploads += 1;
      await sleep(GAP_MS);
    } else {
      reused += 1;
    }
    entries[i] = { path: rel, sha, dir: false };
  }
  console.log('复用', reused, '上传', uploads);
  if (DRY) process.exit(0);

  const byDir = new Map();
  for (const e of entries) {
    const dir = path.posix.dirname(e.path);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push({ name: path.posix.basename(e.path), sha: e.sha, dir: false });
  }
  for (const dir of Array.from(byDir.keys())) {
    let d = dir;
    while (d && d !== '.' && d !== '/') {
      d = path.posix.dirname(d);
      if (!byDir.has(d)) byDir.set(d, []);
    }
  }

  const treeCache = new Map();
  async function buildTree(dir) {
    if (treeCache.has(dir)) return treeCache.get(dir);
    const list = (byDir.get(dir) || []).slice();
    for (const d of Array.from(byDir.keys())) {
      if (d !== dir && path.posix.dirname(d) === dir) {
        list.push({ name: path.posix.basename(d), sha: await buildTree(d), dir: true });
      }
    }
    const payload = list.map((e) => ({ path: e.name, mode: e.dir ? '040000' : '100644', type: e.dir ? 'tree' : 'blob', sha: e.sha }));
    const tree = await gh('POST', '/git/trees', { tree: payload });
    treeCache.set(dir, tree.sha);
    return tree.sha;
  }

  const rootTree = await buildTree('.');
  const message = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: REPO_DIR, encoding: 'utf8' });
  const commit = await gh('POST', '/git/commits', { message, tree: rootTree, parents: [baseSha] });
  await gh('PATCH', `/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true });
  console.log('pushed →', commit.sha);
}

main().catch((err) => { console.error('[api-push] 失败：', err.message); process.exit(1); });
