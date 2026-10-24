#!/usr/bin/env node
/**
 * 一键发布到 GitHub
 * ------------------------------------------------------------
 * 做的事：建仓库（如果还没有）→ 推送代码 → 打标签 → 建 Release → 上传 zip
 *
 * 用法（三种任选）：
 *   1. 双击  scripts/上传到GitHub.bat   （会提示粘贴 token）
 *   2. node scripts/publish-to-github.js
 *   3. node scripts/publish-to-github.js --token ghp_xxx --repo ledger-studio
 *
 * token 只在本机内存里用一次，推送完成后会自动从 .git/config 里清掉。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const tls = require('tls');
const { URL } = require('url');
const { execFileSync } = require('child_process');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
const VERSION = CFG.version;
const DOC_NO = CFG.docNo;
const TAG = 'v' + VERSION;

// 常见本地代理端口，按顺序探测，第一个能连上 GitHub 的就用
const PROXY_PORTS = ['7897', '7890', '10809', '10808', '1080', '8889'];

const C = {
  ok: '\x1b[32m', warn: '\x1b[33m', err: '\x1b[31m',
  dim: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m'
};
const say = (s) => console.log(s);
const ok = (s) => console.log(C.ok + '  ✓ ' + C.x + s);
const warn = (s) => console.log(C.warn + '  ! ' + C.x + s);
const fail = (s) => console.log(C.err + '  ✗ ' + C.x + s);
const step = (n, s) => console.log('\n' + C.b + '[' + n + '] ' + s + C.x);

/* ---------------- 参数 ---------------- */

function parseArgs(argv) {
  const a = { token: '', repo: 'ledger-studio', proxy: 'auto', noProxy: false, zip: '', keepRelease: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--token') a.token = argv[++i] || '';
    else if (k === '--repo') a.repo = argv[++i] || 'ledger-studio';
    else if (k === '--proxy') a.proxy = argv[++i] || 'auto';
    else if (k === '--no-proxy') a.noProxy = true;
    else if (k === '--zip') a.zip = argv[++i] || '';
    else if (k === '--keep-release') a.keepRelease = true;
  }
  return a;
}

/* ---------------- 带代理的 HTTPS ---------------- */

function connectViaProxy(proxyUrl, host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = new URL(proxyUrl);
    const req = http.request({
      host: p.hostname,
      port: p.port || 80,
      method: 'CONNECT',
      path: host + ':' + port,
      headers: { Host: host + ':' + port },
      timeout: timeoutMs || 15000
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        reject(new Error('代理拒绝连接（HTTP ' + res.statusCode + '），请确认代理软件已开启'));
        return;
      }
      resolve(socket);
    });
    req.on('error', (e) => reject(new Error('连不上代理 ' + proxyUrl + '：' + e.message)));
    req.on('timeout', () => req.destroy(new Error('代理连接超时')));
    req.end();
  });
}

/** 依次试探常见本地代理端口，返回第一个能连上 github.com 的；都不行返回 ''（直连） */
async function detectProxy() {
  for (const port of PROXY_PORTS) {
    const url = 'http://127.0.0.1:' + port;
    try {
      const sock = await connectViaProxy(url, 'github.com', 443, 2500);
      sock.destroy();
      return url;
    } catch (e) { /* 换下一个 */ }
  }
  return '';
}

function tlsViaProxy(proxyUrl, host) {
  return connectViaProxy(proxyUrl, host, 443).then((raw) => new Promise((resolve, reject) => {
    const s = tls.connect({ socket: raw, servername: host }, () => resolve(s));
    s.on('error', (e) => reject(new Error('TLS 握手失败：' + e.message)));
  }));
}

/**
 * 通用请求。proxy 为空则直连。
 * @returns {Promise<{status:number, body:string, raw:Buffer}>}
 */
async function request(opts) {
  const url = new URL(opts.url);
  const host = url.hostname;
  const isHttps = url.protocol === 'https:';
  const body = opts.body;
  const buf = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)));

  const headers = Object.assign({
    'User-Agent': 'ledger-studio-publisher',
    'Accept': 'application/vnd.github+json',
    'Accept-Encoding': 'identity',
    'Content-Length': buf ? buf.length : 0
  }, opts.headers || {});

  let connOpts;
  if (opts.proxy) {
    if (!isHttps) throw new Error('代理模式仅支持 https');
    const socket = await tlsViaProxy(opts.proxy, host);
    connOpts = { host, port: 443, method: opts.method || 'GET', path: url.pathname + url.search,
      headers, agent: false, createConnection: () => socket };
  } else {
    connOpts = { host, port: isHttps ? 443 : 80, method: opts.method || 'GET',
      path: url.pathname + url.search, headers };
  }

  return new Promise((resolve, reject) => {
    const mod = isHttps ? https : http;
    const req = mod.request(connOpts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({ status: res.statusCode, body: raw.toString('utf8'), raw });
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('请求超时')));
    if (buf) req.write(buf);
    req.end();
  });
}

/* ---------------- GitHub API ---------------- */

function makeApi(cfg, token) {
  const base = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  return {
    async call(method, apiPath, body) {
      const r = await request({
        url: 'https://api.github.com' + apiPath,
        method, headers: base, body, proxy: cfg.proxy
      });
      let json = null;
      try { json = JSON.parse(r.body); } catch (e) { /* 可能是空 */ }
      return { status: r.status, json, text: r.body };
    },
    async upload(uploadUrl, fileBuf, fileName) {
      return request({
        url: uploadUrl + '?name=' + encodeURIComponent(fileName),
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/zip',
          'Content-Length': fileBuf.length
        },
        body: fileBuf,
        proxy: cfg.proxy
      });
    }
  };
}

/* ---------------- 工具 ---------------- */

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res((a || '').trim()); }));
}

function git(args, opts) {
  return execFileSync('git', args, Object.assign({
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }, opts || {}));
}

function hasGitRepo() {
  try { git(['rev-parse', '--git-dir']); return true; } catch (e) { return false; }
}

function findZip(cfg) {
  const cands = [
    cfg.zip,
    path.join(ROOT, 'release', 'ledger-studio-' + TAG + '.zip'),
    path.join(ROOT, '..', 'dist', 'ledger-studio-' + TAG + '.zip')
  ].filter(Boolean);
  for (const p of cands) if (fs.existsSync(p)) return p;
  return null;
}

function readChangelogSection() {
  const p = path.join(ROOT, 'CHANGELOG.md');
  if (!fs.existsSync(p)) return DOC_NO;
  const txt = fs.readFileSync(p, 'utf8');
  const idx = txt.indexOf('## ' + DOC_NO);
  if (idx < 0) return DOC_NO;
  const next = txt.indexOf('\n## ', idx + 3);
  return txt.slice(idx, next < 0 ? undefined : next).trim();
}

/* ---------------- 主流程 ---------------- */

async function main() {
  const cfg = parseArgs(process.argv.slice(2));

  say('');
  say(C.b + '=============================================' + C.x);
  say(C.b + '  发布到 GitHub   ' + DOC_NO + '  (tag ' + TAG + ')' + C.x);
  say(C.b + '=============================================' + C.x);

  /* 0. 仓库检查 */
  step(0, '检查本地仓库');
  if (!hasGitRepo()) {
    fail('当前目录不是 git 仓库：' + ROOT);
    say('  请确认把本脚本放在 ledger-studio/scripts/ 下运行。');
    process.exit(1);
  }
  ok('本地仓库正常');

  /* 0.1 网络代理 */
  if (cfg.noProxy) {
    cfg.proxy = '';
    say('  ' + C.dim + '按参数要求直连，不使用代理' + C.x);
  } else if (cfg.proxy === 'auto') {
    process.stdout.write('  探测本地代理… ');
    cfg.proxy = await detectProxy();
    if (cfg.proxy) say(C.ok + '使用 ' + cfg.proxy + C.x);
    else say(C.warn + '未发现可用代理，将直连' + C.x);
  } else {
    say('  ' + C.dim + '使用指定代理 ' + cfg.proxy + C.x);
  }

  /* 1. token */
  step(1, '获取访问令牌');
  let token = cfg.token || process.env.GITHUB_TOKEN || '';
  const tokenFile = path.join(ROOT, '.github-token');
  if (!token && fs.existsSync(tokenFile)) {
    token = fs.readFileSync(tokenFile, 'utf8').trim();
    if (token) ok('已从 .github-token 读取');
  }
  if (!token) {
    say('');
    say('  需要一个 GitHub 访问令牌（Personal Access Token）。');
    say('  打开这个链接，点最下面的绿色按钮就能生成（权限已帮你勾好）：');
    say('  ' + C.b + 'https://github.com/settings/tokens/new?scopes=repo&description=ledger-studio' + C.x);
    say('');
    say('  ' + C.dim + '生成的令牌形如 ghp_xxxxxxxxxxxx，只显示一次，记得复制。' + C.x);
    say('');
    token = await ask('  把令牌粘到这里，回车：');
  }
  if (!token) { fail('没有令牌，无法继续'); process.exit(1); }
  if (!/^(ghp_|github_pat_)/.test(token)) {
    warn('令牌格式看起来不太对（一般以 ghp_ 或 github_pat_ 开头），仍然尝试。');
  }

  /* 2. 验证身份 */
  step(2, '验证令牌并读取账号');
  const api = makeApi(cfg, token);
  const me = await api.call('GET', '/user');
  if (me.status === 401) {
    fail('令牌无效或已过期');
    say('  请重新生成：https://github.com/settings/tokens');
    process.exit(1);
  }
  if (me.status !== 200) {
    fail('无法连接 GitHub API（HTTP ' + me.status + '）');
    say('  ' + (me.json && me.json.message ? me.json.message : me.text.slice(0, 200)));
    say('  如果是网络问题，确认代理软件已开启，或用 --proxy 指定端口。');
    process.exit(1);
  }
  const owner = me.json.login;
  ok('已登录：' + owner);

  /* 3. 仓库存在性 */
  step(3, '确认远端仓库');
  const repoPath = '/repos/' + owner + '/' + cfg.repo;
  let repo = await api.call('GET', repoPath);

  if (repo.status === 404) {
    say('  远端还没有 ' + cfg.repo + '，正在创建…');
    const created = await api.call('POST', '/user/repos', {
      name: cfg.repo,
      description: CFG.notes || 'Ledger Studio',
      private: false,
      has_issues: true,
      has_wiki: false,
      has_projects: false,
      auto_init: false
    });
    if (created.status !== 201) {
      fail('创建仓库失败（HTTP ' + created.status + '）');
      const m = created.json || {};
      if (m.message) say('  ' + m.message);
      if (created.status === 403) say('  可能是令牌没有 repo 权限，或该账号无权创建仓库。');
      process.exit(1);
    }
    ok('仓库已创建：' + created.json.html_url);
    repo = { status: 200, json: created.json };
  } else if (repo.status === 200) {
    ok('仓库已存在：' + repo.json.html_url);
    if (repo.json.private) warn('这是个私有仓库，别人看不到。需要公开请到网页改。');
  } else {
    fail('查询仓库失败（HTTP ' + repo.status + '）');
    say('  ' + ((repo.json && repo.json.message) || repo.text.slice(0, 200)));
    process.exit(1);
  }

  /* 4. 推送代码 */
  step(4, '推送代码');
  const cleanUrl = 'https://github.com/' + owner + '/' + cfg.repo + '.git';
  const authUrl = 'https://x-access-token:' + token + '@github.com/' + owner + '/' + cfg.repo + '.git';

  try { git(['remote', 'remove', 'origin']); } catch (e) { /* 没有就算了 */ }
  git(['remote', 'add', 'origin', authUrl]);

  try {
    git(['branch', '-M', 'main']);
  } catch (e) {
    warn('切换分支为 main 时出错，继续用当前分支');
  }

  say('  ' + C.dim + '正在上传，文件多的话要等一会儿…' + C.x);
  try {
    const out = git(['push', '-u', 'origin', 'main', '--force'], { stdio: ['ignore', 'pipe', 'pipe'] });
    ok('代码已推送');
    if (out && out.trim()) say('  ' + C.dim + out.trim().split('\n').slice(-2).join('\n  ') + C.x);
  } catch (e) {
    fail('推送失败');
    const msg = (e.stderr || e.message || '').toString();
    say('  ' + msg.split('\n').slice(0, 6).join('\n  '));
    if (/proxy|timed out|Could not resolve/i.test(msg)) {
      say('');
      say('  ' + C.warn + '看起来是网络问题，命令行连不上 GitHub。' + C.x);
      say('  确认代理软件已开启，然后用 --proxy 指定端口重新运行：');
      say('  node scripts/publish-to-github.js --proxy http://127.0.0.1:你的端口');
    }
    git(['remote', 'set-url', 'origin', cleanUrl]);
    process.exit(1);
  } finally {
    // 无论成败，都把 token 从 .git/config 里抹掉
    try { git(['remote', 'set-url', 'origin', cleanUrl]); } catch (e) { /* 忽略 */ }
  }

  /* 5. 打标签 */
  step(5, '打标签 ' + TAG);
  try {
    try { git(['tag', '-d', TAG]); } catch (e) { /* 不存在 */ }
    git(['tag', '-a', TAG, '-m', DOC_NO]);
    git(['push', 'origin', TAG, '--force']);
    ok('标签已推送');
  } catch (e) {
    warn('打标签失败（不影响代码，可稍后重试）：' + (e.stderr || e.message));
  }

  /* 6. Release */
  step(6, '创建 Release');
  let release = null;
  const exist = await api.call('GET', repoPath + '/releases/tags/' + TAG);

  if (exist.status === 200) {
    release = exist.json;
    if (cfg.keepRelease) {
      warn('该 Release 已存在，按参数要求保留原说明');
    } else {
      // 已存在则把 CHANGELOG 的最新内容同步过去，方便改完说明重跑一次即生效
      const patched = await api.call('PATCH', repoPath + '/releases/' + release.id, {
        name: DOC_NO,
        body: readChangelogSection()
      });
      if (patched.status === 200) {
        release = patched.json;
        ok('Release 已存在，说明已按 CHANGELOG 同步');
      } else {
        warn('同步 Release 说明失败（HTTP ' + patched.status + '），保留原说明');
      }
    }
    say('  ' + release.html_url);
  } else {
    const created = await api.call('POST', repoPath + '/releases', {
      tag_name: TAG,
      name: DOC_NO,
      body: readChangelogSection(),
      draft: false,
      prerelease: false
    });
    if (created.status === 201) {
      release = created.json;
      ok('Release 已创建');
      say('  ' + release.html_url);
    } else {
      warn('创建 Release 失败（HTTP ' + created.status + '）');
      const m = created.json || {};
      if (m.errors) m.errors.forEach((x) => say('  ' + (x.message || JSON.stringify(x))));
      else if (m.message) say('  ' + m.message);
    }
  }

  /* 7. 上传 zip 附件 */
  step(7, '上传安装包');
  const zipPath = findZip(cfg);
  if (!zipPath) {
    warn('没找到 ' + TAG + ' 对应的 zip，跳过附件');
    say('  ' + C.dim + '可以先用 --zip 指定文件，或手动拖到 Release 页面。' + C.x);
  } else if (!release) {
    warn('Release 未创建成功，无法上传附件');
  } else {
    const fileName = path.basename(zipPath);
    const sizeMB = (fs.statSync(zipPath).size / 1048576).toFixed(2);
    say('  ' + fileName + '（' + sizeMB + ' MB）正在上传…');
    const up = await api.upload(release.upload_url.replace('{?name,label}', ''),
      fs.readFileSync(zipPath), fileName);
    if (up.status === 201 || up.status === 200) {
      ok('附件已上传');
    } else if (up.status === 422) {
      warn('同名附件已存在，跳过');
    } else {
      warn('上传失败（HTTP ' + up.status + '）');
      say('  ' + up.body.slice(0, 200));
    }
  }

  /* 完成 */
  say('');
  say(C.ok + C.b + '=============================================' + C.x);
  say(C.ok + C.b + '  全部完成' + C.x);
  say('  仓库地址：' + cleanUrl.replace('.git', ''));
  say('  Release ：' + (release ? release.html_url : '（未创建）'));
  say(C.ok + C.b + '=============================================' + C.x);
  say('');
  say(C.dim + '下次改了代码，直接再跑一次这个脚本即可，会自动更新。' + C.x);
  say('');
}

main().catch((e) => {
  say('');
  fail('出错了：' + e.message);
  if (process.env.DEBUG) console.error(e);
  say('');
  process.exit(1);
});
