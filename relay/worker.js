/**
 * WXSC_elec_bill_Web · Cloudflare Worker 中转
 * ---------------------------------------------------------------
 * 作用：把浏览器的同源请求转发到学校缴费接口（pay.wxstc.cn），
 *      因为学校接口不返回 CORS 头，GitHub Pages 直连会被浏览器拦下。
 *
 * 设计约束（与「多用户互不影响」直接相关）：
 *   - 无状态：不写 KV / D1 / R2 / 缓存 API，不落盘、不记录请求体。
 *   - 不鉴权、不区分用户：任何请求都只做「原样转发 + 补 CORS 头」，
 *     因此 A 用户查 3-101、B 用户查 5-202 时，两个请求各走各的，互不可见。
 *   - 不注入、不改写响应体（只补响应头）。
 *
 * 部署：
 *   cd relay
 *   npx wrangler deploy
 * 然后把部署出来的地址（如 https://wxsc-elec-relay.<name>.workers.dev）
 * 填到页面「数据通道与部署说明 → 中转地址」里。
 *
 * 可选环境变量：
 *   ALLOWED_ORIGIN  只允许某个站点跨域调用（默认 *）
 *   UPSTREAM_HOST   上游主机（默认 https://pay.wxstc.cn）
 */

const DEFAULT_UPSTREAM = 'https://pay.wxstc.cn';
const PROXY_PREFIX = '/grdp-ele-third-unite';

const PASS_HEADERS = ['content-type', 'accept', 'accept-language', 'content-length'];

function corsHeaders(request, env) {
  const origin = (env && env.ALLOWED_ORIGIN) || '*';
  const reqOrigin = request.headers.get('Origin') || '';
  // 默认全放开；配了 ALLOWED_ORIGIN 时只回显白名单里的那个源
  const allow = origin === '*' ? '*' : (reqOrigin === origin ? origin : 'null');
  const headers = {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'Content-Type',
  };
  if (allow !== '*') headers['Vary'] = 'Origin';
  return headers;
}

function json(body, status, request, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        ok: true,
        service: 'WXSC_elec_bill_Web relay',
        version: '1.1.0',
        upstream: (env && env.UPSTREAM_HOST) || DEFAULT_UPSTREAM,
        note: '无状态转发，不保存任何请求或响应数据',
      }, 200, request, env);
    }

    if (!url.pathname.startsWith(PROXY_PREFIX)) {
      return json({ ok: false, error: 'unknown path', expect: PROXY_PREFIX + '/...' }, 404, request, env);
    }

    const upstreamBase = ((env && env.UPSTREAM_HOST) || DEFAULT_UPSTREAM).replace(/\/+$/, '');
    const target = upstreamBase + url.pathname + url.search;

    const headers = new Headers();
    for (const name of PASS_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has('content-type') && request.method !== 'GET') {
      headers.set('content-type', 'application/json;charset=UTF-8');
    }

    const init = {
      method: request.method,
      headers,
      redirect: 'follow',
      cache: 'no-store',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.arrayBuffer();
    }

    let res;
    try {
      res = await fetch(target, init);
    } catch (err) {
      return json({ ok: false, error: 'upstream unreachable', detail: String(err && err.message || err) },
        502, request, env);
    }

    const out = new Headers();
    const ct = res.headers.get('content-type');
    if (ct) out.set('content-type', ct);
    out.set('cache-control', 'no-store');
    Object.entries(corsHeaders(request, env)).forEach(([k, v]) => out.set(k, v));

    const body = await res.arrayBuffer();
    return new Response(body, { status: res.status, headers: out });
  },
};
