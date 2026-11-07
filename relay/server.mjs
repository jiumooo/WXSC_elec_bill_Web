#!/usr/bin/env node
/**
 * WXSC_elec_bill_Web · 本地中转 + 静态服务（零依赖，Node 18+）
 * ---------------------------------------------------------------
 * 一条命令就能在本地跑通整条链路：
 *
 *   node relay/server.mjs
 *   # 打开 http://127.0.0.1:8787/
 *
 * 它同时做两件事：
 *   1. 把仓库根目录当成静态站点发布（等同 GitHub Pages 的效果）；
 *   2. 把 /grdp-ele-third-unite/* 原样转发到学校接口，并补上 CORS 头。
 *
 * 页面里的用法：把「取数方式」选成「自建中转」，中转地址填 http://127.0.0.1:8787
 * （或者直接访问 http://127.0.0.1:8787/?relay=http://127.0.0.1:8787）。
 *
 * 与 Cloudflare Worker 版本一致：无状态、不落盘、不记录请求/响应体。
 */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const UPSTREAM = (process.env.UPSTREAM_HOST || 'https://pay.wxstc.cn').replace(/\/+$/, '');
const PREFIX = '/grdp-ele-third-unite';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, body) {
  cors(res);
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

async function proxy(req, res, url) {
  const target = UPSTREAM + url.pathname + url.search;
  const headers = {};
  for (const name of ['content-type', 'accept', 'accept-language']) {
    const value = req.headers[name];
    if (value) headers[name] = value;
  }
  if (!headers['content-type'] && req.method !== 'GET') {
    headers['content-type'] = 'application/json;charset=UTF-8';
  }

  const chunks = [];
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const chunk of req) chunks.push(chunk);
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  let upstream;
  try {
    upstream = await fetch(target, { method: req.method, headers, body, redirect: 'follow' });
  } catch (err) {
    sendJson(res, 502, { ok: false, error: 'upstream unreachable', detail: String(err && err.message || err) });
    return 502;
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  cors(res);
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': buf.length,
  });
  res.end(buf);
  return upstream.status;
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
    sendJson(res, 403, { ok: false, error: 'forbidden' });
    return 403;
  }
  let info;
  try {
    info = await stat(file);
  } catch (err) {
    sendJson(res, 404, { ok: false, error: 'not found', path: rel });
    return 404;
  }
  if (info.isDirectory()) {
    res.writeHead(302, { Location: rel.replace(/\/?$/, '/') + 'index.html' });
    res.end();
    return 302;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') { res.end(); return 200; }
  await new Promise((resolve) => {
    const stream = createReadStream(file);
    stream.on('error', () => { res.end(); resolve(); });
    stream.on('end', resolve);
    stream.pipe(res);
  });
  return 200;
}

const server = http.createServer(async (req, res) => {
  // Chrome 把 "//?a=1"（协议相对写法）当路径送过来时 new URL 会抛 Invalid URL，这里先归一
  const rawUrl = String(req.url || '/').replace(/^\/{2,}(?=[?#])/, '/').replace(/^\/{2,}/, '/');
  const url = new URL(rawUrl, 'http://' + (req.headers.host || HOST + ':' + PORT));
  let status = 200;
  try {
    if (req.method === 'OPTIONS') {
      cors(res);
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === '/health') {
      sendJson(res, 200, { ok: true, service: 'WXSC_elec_bill_Web relay (local)', version: '1.2.4', upstream: UPSTREAM });
      return;
    }
    if (url.pathname.startsWith(PREFIX)) {
      status = await proxy(req, res, url);
    } else {
      status = await serveStatic(req, res, url);
    }
  } catch (err) {
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: String(err && err.message || err) });
    status = 500;
  }
  // 只记一行方法/路径/状态，绝不打印请求体
  console.log(req.method + ' ' + url.pathname + ' ' + status);
});

server.listen(PORT, HOST, () => {
  console.log('WXSC_elec_bill_Web');
  console.log('  静态站点  http://' + HOST + ':' + PORT + '/');
  console.log('  中转地址  http://' + HOST + ':' + PORT + '  （上游 ' + UPSTREAM + '）');
  console.log('  一键开页  http://' + HOST + ':' + PORT + '/?relay=' + encodeURIComponent('http://' + HOST + ':' + PORT));
});
