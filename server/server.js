#!/usr/bin/env node
/**
 * Ledger Studio · 本地服务
 * 零第三方依赖，只用 Node 内置模块。默认 127.0.0.1，不对外暴露。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const APP_DIR = path.resolve(ROOT, '..');
const PKG = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));

const args = process.argv.slice(2);
const wantPort = (() => {
  const i = args.indexOf('--port');
  return i >= 0 ? parseInt(args[i + 1], 10) : (parseInt(process.env.PORT, 10) || 5178);
})();
const noOpen = args.includes('--no-open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  if (!p.startsWith(base)) return null;   // 防目录穿越
  return p;
}

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  }, headers || {}));
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  if (url === '/api/version') {
    return send(res, 200, JSON.stringify({
      name: PKG.name,
      version: PKG.version,
      docNo: PKG.docNo,
      node: process.version
    }), { 'Content-Type': MIME['.json'] });
  }

  if (url === '/api/health') {
    return send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  let rel = url === '/' ? '/index.html' : url;
  const file = safeJoin(APP_DIR, rel);
  if (!file) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });

  fs.readFile(file, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') return send(res, 404, 'Not Found: ' + rel, { 'Content-Type': 'text/plain; charset=utf-8' });
      return send(res, 500, 'Read Error', { 'Content-Type': 'text/plain' });
    }
    const ext = path.extname(file).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
});

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function listen(port, retries) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && retries > 0) {
      console.log(`端口 ${port} 被占用，尝试 ${port + 1} …`);
      return listen(port + 1, retries - 1);
    }
    console.error('启动失败：', e.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log('');
    console.log('  档案台账工作台 · Ledger Studio ' + (PKG.docNo || ('v' + PKG.version)));
    console.log('  ────────────────────────────────────');
    console.log('  已启动：' + url);
    console.log('  按 Ctrl+C 停止');
    console.log('');
    if (!noOpen) openBrowser(url);
  });
}

listen(wantPort, 10);
