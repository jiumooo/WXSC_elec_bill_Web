// 探测公共 CORS 代理是否还能转发「带 Content-Type 的 POST」
// node tools/probe-relay.mjs
import { signBody, UPSTREAM } from '../assets/api.js';

const PATH = '/api/school/ele/third/room/list';
const payload = { xiaoquId: '1', datasource: 'cg1_1', servicecode: '0826' };
const body = JSON.stringify(signBody(payload));

const CANDIDATES = [
  ['allorigins/raw', 'https://api.allorigins.win/raw?url=', 'query'],
  ['codetabs', 'https://api.codetabs.com/v1/proxy?quest=', 'query'],
  ['corsfix', 'https://proxy.corsfix.com/?', 'query'],
  ['cors.lol', 'https://api.cors.lol/?url=', 'query'],
  ['cors.eu.org', 'https://cors.eu.org/', 'prefix'],
  ['cors.workers.dev', 'https://test.cors.workers.dev/?', 'query'],
  ['thingproxy', 'https://thingproxy.freeboard.io/fetch/', 'prefix'],
  ['bridged', 'https://cors.bridged.cc/', 'prefix'],
  ['yacdn', 'https://yacdn.org/proxy/', 'prefix'],
  ['htmldriven', 'https://cors-proxy.htmldriven.com/?url=', 'query'],
  ['whateverorigin', 'https://whateverorigin.org/get?url=', 'query'],
  ['cors.redoc.ly', 'https://cors.redoc.ly/', 'prefix'],
  ['isomorphic-git', 'https://cors.isomorphic-git.org/', 'prefix'],
  ['crossorigin.me', 'https://crossorigin.me/', 'prefix'],
  ['cors.sh', 'https://proxy.cors.sh/', 'prefix'],
  ['corsproxy.io', 'https://corsproxy.io/?url=', 'query'],
];

const target = UPSTREAM + PATH;
const urlFor = (base, mode) =>
  mode === 'query' ? base + encodeURIComponent(target) : base + '/grdp-ele-third-unite' + PATH;

async function probe([name, base, mode]) {
  const url = urlFor(base, mode);
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body,
      signal: ac.signal,
    });
    const text = await res.text();
    const ms = Date.now() - started;
    let verdict;
    if (/"code"\s*:\s*200/.test(text) && /"data"\s*:\s*"[^"]{40,}"/.test(text)) verdict = 'OK 可用';
    else if (/contentType|Content-Type|请求方式|method|417/.test(text)) verdict = '坏（上游拒绝：' + text.slice(0, 60).replace(/\s+/g, ' ') + '）';
    else verdict = '坏（' + text.slice(0, 60).replace(/\s+/g, ' ') + '）';
    return { name, ms, status: res.status, verdict };
  } catch (err) {
    return { name, ms: Date.now() - started, status: 0, verdict: '坏（' + String(err.message || err).slice(0, 50) + '）' };
  } finally {
    clearTimeout(timer);
  }
}

const results = await Promise.all(CANDIDATES.map(probe));
for (const r of results) {
  console.log(`${r.verdict.startsWith('OK') ? '✅' : '❌'} ${r.name.padEnd(18)} ${String(r.status).padEnd(4)} ${String(r.ms + 'ms').padEnd(8)} ${r.verdict}`);
}
const ok = results.filter((r) => r.verdict.startsWith('OK'));
console.log(`\n可用 ${ok.length} / ${results.length}`);
