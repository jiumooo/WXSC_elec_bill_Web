// Deno Deploy / Deno 本地 版中转（与 relay/worker.js 行为一致）
// 用法一（本地）：deno run --allow-net relay/deno.ts        → http://127.0.0.1:8788
// 用法二（线上）：把本文件粘到 https://dash.deno.com 新建的 Playground，Save & Deploy，
//                得到 https://<name>.deno.dev，填进页面「中转通道」即可。
const UPSTREAM = Deno.env.get('UPSTREAM_HOST') || 'pay.wxstc.cn';
const PREFIX = '/grdp-ele-third-unite';
const PASS_HEADERS = ['content-type', 'accept', 'accept-language', 'content-length'];
const PORT = Number(Deno.env.get('PORT') || 8788);

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, accept, accept-language',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const info = () => ({
  ok: true,
  service: 'wxsc-elec-relay (deno)',
  version: '1.2.0',
  upstream: 'https://' + UPSTREAM,
  note: '无状态转发：不记录、不存储任何请求与结果；多人同时用也互不影响。',
});

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('origin') || '';
  const headers = cors(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (url.pathname === '/' || url.pathname === '/health') {
    return new Response(JSON.stringify(info()), {
      headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
    });
  }
  if (!url.pathname.startsWith(PREFIX)) {
    return new Response('not found', { status: 404, headers });
  }

  const target = `https://${UPSTREAM}${url.pathname}${url.search}`;
  const fwd = new Headers();
  for (const h of PASS_HEADERS) {
    const v = req.headers.get(h);
    if (v) fwd.set(h, v);
  }
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: fwd,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
    });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: { ...headers, 'content-type': upstream.headers.get('content-type') || 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 502,
      headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
    });
  }
}

if (import.meta.main) {
  Deno.serve({ port: PORT, hostname: '0.0.0.0' }, handle);
}
export default handle;
