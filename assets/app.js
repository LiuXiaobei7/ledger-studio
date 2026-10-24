/*!
 * Ledger Studio · 界面控制层
 * v1.1.0
 */
(function () {
  'use strict';

  var E = LedgerEngine;
  var APP_DOC_NO = 'LST-v1.1.5';
  var CFG_KEY = 'ledger-studio-cfg-v1';

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ==================================================================
   * 参数配置
   * ================================================================== */

  var cfg = null;

  function cfgDefaults() {
    var b = window.LEDGER_BASELINE || {};
    return {
      projectTitle: b.project_title || E.DEFAULT_PROJECT_TITLE,
      file: JSON.parse(JSON.stringify(b.file || {})),
      juan: JSON.parse(JSON.stringify(b.juan || {})),
      catMap: (function () {
        var src = window.LEDGER_CATEGORY_MAP || {}, out = {};
        Object.keys(src).forEach(function (k) { if (k.charAt(0) !== '_') out[k] = src[k]; });
        return JSON.parse(JSON.stringify(out));
      })()
    };
  }

  function cfgLoad() {
    cfg = cfgDefaults();
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o.projectTitle) cfg.projectTitle = o.projectTitle;
      if (o.file) Object.keys(cfg.file).forEach(function (k) { if (o.file[k] != null) cfg.file[k] = o.file[k]; });
      if (o.juan) Object.keys(cfg.juan).forEach(function (k) { if (o.juan[k] != null) cfg.juan[k] = o.juan[k]; });
      if (o.catMap && typeof o.catMap === 'object') cfg.catMap = o.catMap;
    } catch (e) { /* 配置损坏时静默回退默认 */ }
  }

  function cfgSave() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* 隐私模式忽略 */ }
  }

  function baseline() {
    return { project_title: cfg.projectTitle, file: cfg.file, juan: cfg.juan };
  }

  function renderCfg() {
    var h = '';
    Object.keys(cfg.file).forEach(function (k) {
      h += '<div class="fld"><label>' + esc(k) + '</label>' +
        '<input type="text" data-cfg="file" data-k="' + esc(k) + '" value="' + esc(cfg.file[k]) + '"></div>';
    });
    $('cfgFile').innerHTML = h;

    h = '';
    Object.keys(cfg.juan).forEach(function (k) {
      h += '<div class="fld"><label>' + esc(k) + '</label>' +
        '<input type="text" data-cfg="juan" data-k="' + esc(k) + '" value="' + esc(cfg.juan[k]) + '"></div>';
    });
    $('cfgJuan').innerHTML = h;

    $('cfgProjectTitle').value = cfg.projectTitle;
    renderCat();
  }

  function renderCat() {
    var h = '';
    Object.keys(cfg.catMap).sort().forEach(function (k) {
      var v = cfg.catMap[k] || {};
      h += '<tr>' +
        '<td><input type="text" class="c-cls" value="' + esc(k) + '"></td>' +
        '<td><input type="text" class="c-name" value="' + esc(v['分类名称'] || '') + '"></td>' +
        '<td><input type="text" class="c-keep" value="' + esc(v['保管期限'] || '') + '"></td>' +
        '<td><input type="text" class="c-code" value="' + esc(v['保管期限代码'] || '') + '"></td>' +
        '<td><button class="btn btn-ghost btn-sm" data-delcat="' + esc(k) + '">删除</button></td>' +
        '</tr>';
    });
    $('tblCat').querySelector('tbody').innerHTML = h;

    $$('#tblCat [data-delcat]').forEach(function (b) {
      b.addEventListener('click', function () {
        delete cfg.catMap[b.getAttribute('data-delcat')];
        cfgSave();
        renderCat();
      });
    });
    $$('#tblCat input').forEach(function (inp) {
      inp.addEventListener('change', readCatTable);
    });
  }

  function readCatTable() {
    var map = {};
    $$('#tblCat tbody tr').forEach(function (tr) {
      var k = tr.querySelector('.c-cls').value.trim();
      if (!k) return;
      map[k] = {
        '分类名称': tr.querySelector('.c-name').value.trim(),
        '保管期限': tr.querySelector('.c-keep').value.trim(),
        '保管期限代码': tr.querySelector('.c-code').value.trim()
      };
    });
    cfg.catMap = map;
    cfgSave();
  }

  function collectCfgInputs() {
    $$('[data-cfg]').forEach(function (i) {
      cfg[i.getAttribute('data-cfg')][i.getAttribute('data-k')] = i.value.trim();
    });
    cfg.projectTitle = $('cfgProjectTitle').value.trim() || cfg.projectTitle;
    readCatTable();
  }

  /* ==================================================================
   * 通用工具
   * ================================================================== */

  function b64ToBuf(b64) {
    var bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2400);
  }

  function download(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function readFileBuf(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = reject;
      fr.readAsArrayBuffer(file);
    });
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ==================================================================
   * 标签页
   * ================================================================== */

  var buildAlertShown = false;
  var pdfWarnShown = false;

  function switchTab(name) {
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === name); });
    $$('.panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + name); });

    // 生成页：每次启动后第一次进入时提示一次
    if (name === 'build' && !buildAlertShown) {
      buildAlertShown = true;
      $('buildAlert').classList.remove('hidden');
    }
    // PDF 页：每次点开都弹实验提示
    if (name === 'pdf' && !pdfWarnShown) {
      pdfWarnShown = true;
      $('dlgPdfWarn').showModal();
    }
    if (name === 'pdf') checkPdfEnv();
  }

  $$('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () { switchTab(tab.dataset.tab); });
  });

  /* ==================================================================
   * 公告 + 更新检查
   * ================================================================== */

  function showNotice(notice, note) {
    var warn = notice.level === 'warn';
    $('noticeLevel').textContent = warn ? '重要' : '公告';
    $('noticeLevel').className = 'pill pill-' + (warn ? 'WARN' : 'INFO');
    $('noticeTitle').textContent = notice.title || '公告';
    $('noticeDate').textContent = notice.date || '';
    $('noticeSummary').textContent = notice.summary || '';
    $('noticeItems').innerHTML = (notice.items || []).map(function (x) {
      return '<li>' + esc(x) + '</li>';
    }).join('');
    $('noticeNote').textContent = note || '';
    if (!$('dlgNotice').open) $('dlgNotice').showModal();
  }

  function cmpVer(a, b) {
    function parts(v) { return String(v || '0').replace(/^[^\d]*/, '').split('.').map(Number); }
    var x = parts(a), y = parts(b);
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var p = x[i] || 0, q = y[i] || 0;
      if (p > q) return 1;
      if (p < q) return -1;
    }
    return 0;
  }

  /* ==================================================================
   * 更新检查：多源并行竞速
   * 同时请求所有通道，谁先返回有效内容就用谁，其余立即作废。
   * 这样在 github.com 被拦的环境下不会一个接一个地等超时。
   * ================================================================== */

  var REMOTE_CACHE_KEY = 'ledger-remote-cache';

  /** GitHub API 返回的 content 是 base64，需要按 UTF-8 解码 */
  function b64ToJson(b64) {
    var bin = atob(String(b64 || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  }

  function fillUrl(tpl, R) {
    return String(tpl)
      .replace('{owner}', R.owner || '')
      .replace('{repo}', R.repo || '')
      .replace('{branch}', R.branch || 'main');
  }

  function readCache(ttl) {
    try {
      var raw = localStorage.getItem(REMOTE_CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || !c.ts || !c.data || !c.data.version) return null;
      if (Date.now() - c.ts > ttl) return null;
      return c;
    } catch (e) { return null; }
  }

  function writeCache(data, source) {
    try {
      localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify({
        ts: Date.now(), data: data, source: source
      }));
    } catch (e) { /* 隐私模式下写入会失败，忽略 */ }
  }

  /** 试一个源，成功则返回 { data, source, ms } */
  function trySource(ep, R) {
    var url = fillUrl(ep.url, R);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, R.timeoutMs || 6000);
    var t0 = Date.now();

    return fetch(url, { signal: ctrl.signal, cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (txt) {
        clearTimeout(timer);
        var data;
        if (ep.type === 'base64') {
          var wrap = JSON.parse(txt);
          data = b64ToJson(wrap.content);
        } else {
          data = JSON.parse(txt);
        }
        if (!data || !data.version) throw new Error('返回内容不是有效的 version.json');
        return { data: data, source: ep.name, ms: Date.now() - t0 };
      })
      .catch(function (e) {
        clearTimeout(timer);
        var msg = e && e.name === 'AbortError' ? '超时' : (e && e.message) || String(e);
        throw new Error(msg);
      });
  }

  /**
   * 拉取远端版本信息。
   * 策略：主通道并行竞速 → 全部失败才试兜底通道（GitHub API，有速率限制）
   * @param {boolean} force true 时跳过缓存（用户手动点检查）
   */
  function fetchRemote(force) {
    var R = window.LEDGER_REMOTE || {};

    if (!force) {
      var c = readCache(R.cacheTtlMs || 0);
      if (c) {
        return Promise.resolve({
          data: c.data, source: c.source, cached: true, fails: []
        });
      }
    }

    var eps = R.endpoints || [];
    if (!eps.length) return Promise.reject({ message: '未配置任何更新源', fails: [] });

    /** 一组源并行竞速，先返回的赢 */
    function race(list) {
      return new Promise(function (resolve, reject) {
        var pending = list.length;
        var fails = [];
        var settled = false;

        list.forEach(function (ep) {
          trySource(ep, R).then(function (ok) {
            if (settled) return;
            settled = true;
            resolve({ data: ok.data, source: ok.source, ms: ok.ms, cached: false, fails: fails.slice() });
          }).catch(function (e) {
            fails.push({ source: ep.name, error: e.message });
            if (--pending === 0 && !settled) {
              reject({ message: '这一组通道均不可达', fails: fails });
            }
          });
        });
      });
    }

    var primary = eps.filter(function (e) { return !e.fallback; });
    var backup = eps.filter(function (e) { return e.fallback; });

    function done(res) { writeCache(res.data, res.source); return res; }

    return race(primary.length ? primary : backup)
      .then(done)
      .catch(function (err1) {
        if (!primary.length || !backup.length) {
          throw { message: '所有更新源均不可达', fails: err1.fails };
        }
        // 主通道全挂，再单独试兜底通道
        return race(backup).then(done).catch(function (err2) {
          throw {
            message: '所有更新源均不可达',
            fails: err1.fails.concat(err2.fails)
          };
        });
      });
  }

  /** 把失败原因翻译成人能看懂的一句话 */
  function explainFailure(fails) {
    if (location.protocol === 'file:') {
      return '当前是直接双击打开的 HTML，浏览器禁止跨域请求，所以查不了更新。' +
        '改用 scripts/启动.bat（或 npm start）以本地服务方式打开即可。';
    }
    var all = (fails || []);
    if (all.length && all.every(function (f) { return /超时/.test(f.error); })) {
      return '所有通道都超时，可能是这台机器连不上外网，或需要在浏览器里配代理。' +
        '离线环境不影响使用，可直接用离线 zip 覆盖更新。';
    }
    return '无法连接更新源。离线环境不影响使用，可改用离线 zip 覆盖更新。';
  }

  function renderUpdate(fresh, data, meta) {
    var srcLine = meta
      ? '来源：<b>' + esc(meta.source) + '</b>' + (meta.cached ? '（本机缓存）' : '') +
        (meta.ms ? '　耗时 ' + meta.ms + ' ms' : '')
      : '';
    if ($('updSource')) $('updSource').innerHTML = srcLine;

    if (fresh) {
      $('updLevel').textContent = '有新版本';
      $('updLevel').className = 'pill pill-WARN';
      $('updTitle').textContent = data.docNo || ('v' + data.version);
      $('updSummary').innerHTML = '当前版本 <b>' + APP_DOC_NO + '</b>，最新版本 <b>' +
        esc(data.docNo || ('v' + data.version)) + '</b>（' + esc(data.releasedAt || '') + '）。' +
        (data.notes && data.notes.length ? '' : '<br><span class="muted">该版本未提供变更说明。</span>');
      $('updNotes').innerHTML = (data.notes || []).map(function (x) {
        return '<li>' + esc(x) + '</li>';
      }).join('');
      $('envBadge').textContent = '有新版本 ' + (data.docNo || ('v' + data.version));
      $('envBadge').className = 'badge badge-new';
    } else {
      $('updLevel').textContent = '已是最新';
      $('updLevel').className = 'pill pill-INFO';
      $('updTitle').textContent = '检查更新';
      $('updSummary').innerHTML = '当前版本 <b>' + APP_DOC_NO + '</b>，已是最新。';
      $('updNotes').innerHTML = '';
      $('envBadge').textContent = '已是最新';
      $('envBadge').className = 'badge badge-ok';
    }
  }

  function doUpdateCheck(silent) {
    var btn = $('btnUpdate');
    if (!silent) { btn.disabled = true; btn.textContent = '检查中…'; }

    fetchRemote(!silent).then(function (res) {
      if (!silent) { btn.disabled = false; btn.textContent = '检查更新'; }
      var data = res.data || {};
      var fresh = cmpVer(data.version, APP_DOC_NO) > 0;
      renderUpdate(fresh, data, { source: res.source, cached: res.cached, ms: res.ms });
      if (!silent) $('dlgUpdate').showModal();
    }).catch(function (err) {
      if (!silent) { btn.disabled = false; btn.textContent = '检查更新'; }
      $('envBadge').textContent = '离线';
      $('envBadge').className = 'badge badge-muted';
      if (!silent) {
        $('updLevel').textContent = '不可达';
        $('updLevel').className = 'pill pill-INFO';
        $('updTitle').textContent = '检查更新';
        $('updSummary').textContent = explainFailure(err && err.fails) +
          (err && err.message ? '（' + err.message + '）' : '');
        $('updNotes').innerHTML = ((err && err.fails) || []).map(function (f) {
          return '<li><code>' + esc(f.source) + '</code>　' + esc(f.error) + '</li>';
        }).join('');
        if ($('updSource')) $('updSource').innerHTML = '当前版本 <b>' + APP_DOC_NO + '</b>';
        $('dlgUpdate').showModal();
      }
    });
  }

  function bootNoticeAndUpdate() {
    var R = window.LEDGER_REMOTE || {};

    fetchRemote(false).then(function (res) {
      var data = res.data || {};
      var ann = data.announcement || R.fallbackAnnouncement;
      if (ann) showNotice(ann, '');

      if (cmpVer(data.version, APP_DOC_NO) > 0) {
        $('envBadge').textContent = '有新版本 ' + (data.docNo || ('v' + data.version));
        $('envBadge').className = 'badge badge-new';
      } else {
        $('envBadge').textContent = '已是最新';
        $('envBadge').className = 'badge badge-ok';
      }
    }).catch(function () {
      $('envBadge').textContent = '离线';
      $('envBadge').className = 'badge badge-muted';
      // 联网失败也要保证有公告可看
      if (R.fallbackAnnouncement) showNotice(R.fallbackAnnouncement, '当前无法联网，以下是本机内置的公告');
    });
  }

  /* ==================================================================
   * 上传交互
   * ================================================================== */

  function bindDrop(dropId, inputId, nameId, onFile) {
    var drop = $(dropId), input = $(inputId), nameEl = $(nameId);
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('hover'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('hover'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('hover');
      if (e.dataTransfer.files.length) handle(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', function () { if (input.files.length) handle(input.files[0]); });

    function handle(file) {
      Promise.resolve(onFile(file)).then(function (text) {
        nameEl.textContent = text || file.name;
        drop.classList.add('filled');
      }).catch(function (err) {
        nameEl.textContent = '读取失败：' + err.message;
        console.error(err);
      });
    }
  }

  /* ==================================================================
   * 检查台账
   * ================================================================== */

  var state = {
    fileBuf: null, fileName: '', fileSheet: null,
    juanBuf: null, juanName: '', juanSheet: null,
    pdfIndex: null, result: null
  };

  function refreshCheckBtn() {
    $('btnCheck').disabled = !(state.fileSheet || state.juanSheet);
  }

  bindDrop('dropFile', 'inFile', 'nameFile', function (file) {
    return readFileBuf(file).then(function (buf) {
      return ExcelIO.readLedger(buf, '文件台账').then(function (res) {
        state.fileBuf = buf; state.fileName = file.name; state.fileSheet = res.sheet;
        refreshCheckBtn();
        return file.name + '（' + res.sheet.rows.length + ' 行 · ' + res.sheet.header.length + ' 列）';
      });
    });
  });

  bindDrop('dropJuan', 'inJuan', 'nameJuan', function (file) {
    return readFileBuf(file).then(function (buf) {
      return ExcelIO.readLedger(buf, '案卷台账').then(function (res) {
        state.juanBuf = buf; state.juanName = file.name; state.juanSheet = res.sheet;
        refreshCheckBtn();
        return file.name + '（' + res.sheet.rows.length + ' 行 · ' + res.sheet.header.length + ' 列）';
      });
    });
  });

  $('optPdf').addEventListener('change', function () {
    $('pdfPickRow').classList.toggle('hidden', !this.checked);
    if (!this.checked) { state.pdfIndex = null; $('pdfCount').textContent = '未选择'; }
  });
  $('btnPickPdf').addEventListener('click', function () { $('inPdf').click(); });
  $('inPdf').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files);
    if (!files.length) return;
    var idx = new Map();
    var pending = files.length;
    files.forEach(function (f) {
      readFileBuf(f).then(function (buf) {
        idx.set(f.name.replace(/\.pdf$/i, ''), { name: f.name, pages: E.countPdfPages(buf) });
        if (--pending === 0) {
          state.pdfIndex = idx;
          $('pdfCount').textContent = '已选 ' + files.length + ' 个 PDF';
        }
      });
    });
  });

  $('btnCheck').addEventListener('click', function () {
    if (!(state.fileSheet || state.juanSheet)) return;
    var status = $('checkStatus');
    status.textContent = '检查中…';
    try {
      state.result = E.check(state.fileSheet, state.juanSheet, {
        baseline: baseline(),
        projectTitle: cfg.projectTitle,
        pdfIndex: $('optPdf').checked ? state.pdfIndex : null
      });
      renderResult(state.result);
      status.textContent = '已完成';
    } catch (err) {
      status.textContent = '检查出错：' + err.message;
      console.error(err);
    }
  });

  function renderResult(res) {
    $('checkResult').classList.remove('hidden');
    $('cntErr').textContent = res.errors;
    $('cntWarn').textContent = res.warns;
    $('cntInfo').textContent = res.infos;

    var v = $('verdict');
    if (res.errors === 0 && res.warns === 0) { v.textContent = '通过'; v.className = 'num verdict-ok'; }
    else if (res.errors === 0) { v.textContent = '待确认'; v.className = 'num verdict-ok'; }
    else { v.textContent = '需修正'; v.className = 'num verdict-bad'; }

    var groups = new Map();
    res.items.forEach(function (f) {
      if (!groups.has(f.rule)) groups.set(f.rule, []);
      groups.get(f.rule).push(f);
    });

    var html = '';
    ['文件台账', '案卷台账', '联动'].forEach(function (ledger) {
      E.RULE_CATALOG.filter(function (r) { return r[1] === ledger && groups.has(r[0]); }).forEach(function (r) {
        var items = groups.get(r[0]);
        html += '<div class="rule-block">';
        html += '<div class="rule-head"><span class="rid">' + r[0] + '</span><h3>' + esc(r[2]) + '</h3>';
        html += '<span class="pill pill-' + r[3] + '">' + E.SEV_LABEL[r[3]] + ' · ' + items.length + ' 条</span></div>';
        html += '<div class="rule-desc">' + esc(r[4]) + '</div>';
        html += '<table class="detail"><thead><tr><th>行号</th><th>列</th><th>问题</th><th>当前值</th><th>期望值</th></tr></thead><tbody>';
        items.slice(0, 40).forEach(function (f) {
          html += '<tr><td class="rowno">' + (f.row == null ? '—' : f.row) + '</td>' +
            '<td class="colname">' + (esc(f.col) || '—') + '</td>' +
            '<td>' + esc(f.msg) + '</td>' +
            '<td class="cur">' + (esc(f.cur) || '—') + '</td>' +
            '<td class="exp">' + (esc(f.exp) || '—') + '</td></tr>';
        });
        if (items.length > 40) {
          html += '<tr class="more-row"><td colspan="5">另有 ' + (items.length - 40) + ' 条同类问题未逐条列出</td></tr>';
        }
        html += '</tbody></table></div>';
      });
    });
    if (!html) html = '<p class="tip">本次检查未命中任何规则。</p>';
    $('ruleResults').innerHTML = html;
    $('checkResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('btnExportMd').addEventListener('click', function () {
    var res = state.result;
    if (!res) return;
    var L = [];
    L.push('# 台账检查报告', '');
    L.push('- 生成时间：' + new Date().toLocaleString('zh-CN'));
    L.push('- 引擎档号：' + E.ENGINE_DOC_NO + '　应用：' + APP_DOC_NO);
    L.push('- 文件台账：`' + (state.fileName || '（未提供）') + '`');
    L.push('- 案卷台账：`' + (state.juanName || '（未提供）') + '`');
    L.push('- PDF 校验：' + ($('optPdf').checked ? '已启用' : '未启用'), '');
    L.push('## 总览', '', '| 级别 | 数量 |', '| --- | --- |');
    L.push('| 🔴 错误 | ' + res.errors + ' |');
    L.push('| 🟡 提醒 | ' + res.warns + ' |');
    L.push('| 🔵 提示 | ' + res.infos + ' |', '');
    L.push(res.errors === 0
      ? (res.warns === 0 ? '**结论：本次检查未发现问题。**' : '**结论：无硬性错误，但有需要人工确认的提醒项。**')
      : '**结论：发现 ' + res.errors + ' 项错误，需修正后再归档。**');
    L.push('', '## 明细', '');

    var groups = new Map();
    res.items.forEach(function (f) {
      if (!groups.has(f.rule)) groups.set(f.rule, []);
      groups.get(f.rule).push(f);
    });
    ['文件台账', '案卷台账', '联动'].forEach(function (ledger) {
      var rules = E.RULE_CATALOG.filter(function (r) { return r[1] === ledger && groups.has(r[0]); });
      if (!rules.length) return;
      L.push('### ' + ledger, '');
      rules.forEach(function (r) {
        var items = groups.get(r[0]);
        L.push('#### ' + r[0] + ' ' + r[2] + ' （' + E.SEV_LABEL[r[3]] + ' · ' + items.length + ' 条）', '');
        L.push('> ' + r[4], '');
        L.push('| 行号 | 列 | 问题 | 当前值 | 期望值 |', '| --- | --- | --- | --- | --- |');
        items.forEach(function (f) {
          var p = function (x) { return String(x == null ? '—' : x).replace(/\|/g, '\\|'); };
          L.push('| ' + (f.row == null ? '—' : f.row) + ' | ' + (f.col || '—') + ' | ' + p(f.msg) + ' | ' + p(f.cur) + ' | ' + p(f.exp) + ' |');
        });
        L.push('');
      });
    });
    var stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    download(new Blob([L.join('\n')], { type: 'text/markdown;charset=utf-8' }), '台账检查报告-' + stamp + '.md');
  });

  function downloadFormatted(which) {
    var buf = which === 'file' ? state.fileBuf : state.juanBuf;
    var name = which === 'file' ? state.fileName : state.juanName;
    if (!buf) { toast('尚未选择该台账'); return; }
    ExcelIO.writeCellsBack(buf, []).then(function (out) {
      var base = name.replace(/\.xlsx?$/i, '');
      download(new Blob([out.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        base + '_已检查.xlsx');
    }).catch(function (e) { toast('生成失败：' + e.message); });
  }

  $('btnDlFile').addEventListener('click', function () { downloadFormatted('file'); });
  $('btnDlJuan').addEventListener('click', function () { downloadFormatted('juan'); });

  $('btnLoadSample').addEventListener('click', function () {
    var tf = b64ToBuf(window.LEDGER_TPL_FILE), tj = b64ToBuf(window.LEDGER_TPL_JUAN);
    Promise.all([ExcelIO.readLedger(tf, '文件台账'), ExcelIO.readLedger(tj, '案卷台账')]).then(function (arr) {
      state.fileBuf = tf; state.fileName = '示例-文件台账.xlsx'; state.fileSheet = arr[0].sheet;
      state.juanBuf = tj; state.juanName = '示例-案卷台账.xlsx'; state.juanSheet = arr[1].sheet;
      $('nameFile').textContent = '示例模板（' + arr[0].sheet.rows.length + ' 行）';
      $('nameJuan').textContent = '示例模板（' + arr[1].sheet.rows.length + ' 行）';
      $('dropFile').classList.add('filled');
      $('dropJuan').classList.add('filled');
      refreshCheckBtn();
      toast('已载入示例台账');
    });
  });

  /* ==================================================================
   * 生成台账
   * ================================================================== */

  function splitText(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) throw new Error('内容为空');
    var delim = lines[0].indexOf('\t') >= 0 ? '\t' : (lines[0].indexOf('|') >= 0 ? '|' : ',');
    function parseLine(line) {
      if (delim === '|') {
        return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (x) { return x.trim(); });
      }
      var out = [], cur = '', q = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === delim && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map(function (x) { return x.trim(); });
    }
    var header = parseLine(lines[0]);
    var rows = lines.slice(1).map(parseLine)
      .filter(function (r) { return !r.every(function (c) { return /^:?-{2,}:?$/.test(c || '-'); }); })
      .filter(function (r) { return r.some(function (c) { return c !== ''; }); });
    return { header: header, rows: rows };
  }

  var GEN_ALIAS = {
    '案卷档号': ['案卷档号', '档号', '卷号'],
    '案卷题名': ['案卷题名', '案卷提名'],
    '脊背宽度': ['脊背宽度', '脊背'],
    '文件题名': ['文件题名', '文件提名', '题名'],
    '文件编号': ['文件编号', '编号'],
    '文件日期': ['文件日期', '日期'],
    '责任者': ['责任者', '责任人'],
    '页数': ['页数', '文件页数'],
    '图纸页数': ['图纸页数'], '文字页数': ['文字页数'],
    '分类名称': ['分类名称'], '保管期限': ['保管期限'], '保管期限代码': ['保管期限代码'],
    '厂家': ['厂家'], '施工标段': ['施工标段', '施工标'], '子阵': ['子阵', '台号']
  };

  function normalizeRecord(rec) {
    var out = { __line: rec.__line };
    Object.keys(rec).forEach(function (k) {
      if (k === '__line') return;
      var std = null;
      for (var f in GEN_ALIAS) {
        if (k === f || GEN_ALIAS[f].indexOf(k) >= 0) { std = f; break; }
      }
      out[std || k] = rec[k];
    });
    return out;
  }

  bindDrop('dropList', 'inList', 'nameList', function (file) {
    return readFileBuf(file).then(function (buf) {
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      if (ext === 'xlsx' || ext === 'xlsm') {
        return ExcelIO.readLedger(buf, '要素清单').then(function (res) {
          var header = res.sheet.header;
          var recs = res.sheet.rows.map(function (r) {
            var o = { __line: r.__row };
            header.forEach(function (h) { if (h) o[h] = r[h]; });
            return o;
          });
          paintListPreview(header, recs);
          return file.name + '（' + recs.length + ' 行）';
        });
      }
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var parsed = splitText(String(fr.result).replace(/^\uFEFF/, ''));
            var recs = parsed.rows.map(function (cells, i) {
              var o = { __line: i + 2 };
              parsed.header.forEach(function (h, j) { if (h) o[h] = cells[j]; });
              return o;
            });
            paintListPreview(parsed.header, recs);
            resolve(file.name + '（' + recs.length + ' 行）');
          } catch (e) { reject(e); }
        };
        fr.onerror = reject;
        fr.readAsText(file, 'utf-8');
      });
    });
  });

  function paintListPreview(header, recs) {
    var preview = recs.slice(0, 6).map(function (r) {
      return header.map(function (h) { return r[h] == null ? '' : r[h]; }).join('\t');
    });
    $('taList').value = [header.join('\t')].concat(preview).join('\n');
    toast('已读取 ' + recs.length + ' 行要素');
  }

  $('btnFillSample').addEventListener('click', function () {
    $('taList').value = [
      '案卷档号\t案卷题名\t脊背宽度\t文件题名\t文件编号\t文件日期\t责任者\t页数',
      'D0109-KJG01-0011-916-001\t箱式变压器\t30mm\t光伏发电用变压器产品质量合格证、出厂试验报告\t11186939900001\t20250325\t宁波奥克斯智能科技股份有限公司\t3',
      '\t\t\t高压∕低压预装式变电站合格证、出厂检验报告\t11186939900002\t20250326\t宁波奥克斯智能科技股份有限公司\t3',
      'D0109-KJG01-0011-916-002\t箱式变压器\t30mm\t真空断路器合格证、检验报告、原理图\t\t20250306\t宁波奥克斯智能科技股份有限公司\t2'
    ].join('\n');
    toast('已填入示例清单');
  });

  $('btnBuild').addEventListener('click', function () {
    var text = $('taList').value.trim();
    if (!text) { toast('请先选择或粘贴要素清单'); return; }
    var parsed, recs;
    try {
      parsed = splitText(text);
      recs = parsed.rows.map(function (cells, i) {
        var o = { __line: i + 2 };
        parsed.header.forEach(function (h, j) { if (h) o[h] = cells[j]; });
        return o;
      });
    } catch (e) { toast('清单解析失败：' + e.message); return; }
    recs = recs.map(normalizeRecord);

    var anchorInput = $('inAnchor').value;
    var anchor = anchorInput ? parseInt(anchorInput.replace(/-/g, ''), 10) : null;

    var res = E.buildLedgers(recs, {
      baseline: baseline(),
      categoryMap: cfg.catMap,
      anchor: anchor
    });

    var status = $('buildStatus');
    $('buildResult').classList.remove('hidden');

    if (res.errors.length) {
      status.textContent = '清单有 ' + res.errors.length + ' 个问题，已中止';
      var h = '<h3>❌ 清单存在问题，未生成台账</h3><ul class="msg-list">';
      res.errors.forEach(function (e) { h += '<li class="msg-err">' + esc(e) + '</li>'; });
      h += '</ul>';
      if (res.warns.length) {
        h += '<h3 style="margin-top:14px">⚠️ 同时提醒</h3><ul class="msg-list">';
        res.warns.forEach(function (w) { h += '<li class="msg-warn">' + esc(w) + '</li>'; });
        h += '</ul>';
      }
      $('buildSummary').innerHTML = h;
      $('buildDownloads').innerHTML = '';
      return;
    }

    status.textContent = '已生成 ' + res.volumes.length + ' 个案卷 / ' + res.fileRows.length + ' 件文件';

    var classes = [];
    res.fileRows.forEach(function (r) { if (classes.indexOf(r.__cls) < 0) classes.push(r.__cls); });
    var split = classes.length > 1;
    var prefix = $('inPrefix').value.trim() || '导入模板';
    var jobs = [];

    if (split) {
      classes.forEach(function (cls) {
        jobs.push({
          cls: cls,
          f: res.fileRows.filter(function (r) { return r.__cls === cls; }),
          j: res.juanRows.filter(function (r) { return r.__cls === cls; }),
          fName: prefix + '-文件-' + cls + '.xlsx',
          jName: prefix + '-案卷-' + cls + '.xlsx'
        });
      });
    } else {
      jobs.push({
        cls: classes[0] || '',
        f: res.fileRows, j: res.juanRows,
        fName: prefix + '-文件台账.xlsx',
        jName: prefix + '-案卷台账.xlsx'
      });
    }

    var sum = '<h3>✅ 生成完成</h3>';
    sum += '<p class="tip">归档日期锚点：' + E.fmtDate(res.anchor) + '　日期链：编制 ' +
      res.chain['编制日期'] + ' → 立卷 ' + res.chain['立卷日期'] + ' → 检查 ' +
      res.chain['检查日期'] + ' → 归档 ' + res.chain['归档日期'] + '</p>';
    if (split) sum += '<p class="tip">检测到 ' + classes.length + ' 个分类号，已按分类拆成独立台账。</p>';
    sum += '<p class="tip" style="color:var(--warn)">生成台账为实验功能，请人工复核后再导入。</p>';
    res.volumes.forEach(function (v) {
      sum += '<div class="vol-item"><span class="dh">' + esc(v.dan) + '</span>　' +
        '<span class="meta">' + v.files.length + ' 件 · 年度 ' + (v.year || '—') +
        ' · 分类 ' + esc(v.cls) + '/' + esc(v.cname) + ' · 脊背 ' + esc(v.spine || '—') + '</span>' +
        '<div class="title">' + esc(v.title) + '</div></div>';
    });
    if (res.warns.length) {
      sum += '<h3 style="margin-top:14px">⚠️ 提醒（' + res.warns.length + '）</h3><ul class="msg-list">';
      res.warns.forEach(function (w) { sum += '<li class="msg-warn">' + esc(w) + '</li>'; });
      sum += '</ul>';
    }
    $('buildSummary').innerHTML = sum;

    var fBuf = b64ToBuf(window.LEDGER_TPL_FILE), jBuf = b64ToBuf(window.LEDGER_TPL_JUAN);
    var dl = '';
    Promise.all(jobs.map(function (job, idx) {
      return Promise.all([
        ExcelIO.writeLedger(fBuf, job.f),
        ExcelIO.writeLedger(jBuf, job.j)
      ]).then(function (outs) {
        dl += '<button class="btn btn-primary" data-job="' + idx + '" data-kind="f">下载 ' + esc(job.fName) + '</button>';
        dl += '<button class="btn btn-ghost" data-job="' + idx + '" data-kind="j">下载 ' + esc(job.jName) + '</button>';
        job.blobF = new Blob([outs[0]], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        job.blobJ = new Blob([outs[1]], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      });
    })).then(function () {
      $('buildDownloads').innerHTML = dl;
      $$('#buildDownloads button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var job = jobs[+btn.dataset.job];
          if (btn.dataset.kind === 'f') download(job.blobF, job.fName);
          else download(job.blobJ, job.jName);
        });
      });
    }).catch(function (e) {
      $('buildDownloads').innerHTML = '<span class="msg-err">生成文件失败：' + esc(e.message) + '</span>';
    });
  });

  /* ==================================================================
   * PDF 补录（实验）
   * ================================================================== */

  var bf = { entries: [], sheet: null, buffer: null, name: '', result: null, showLow: false };

  function checkPdfEnv() {
    var tip = $('pdfEnvTip');
    if (location.protocol === 'file:') {
      tip.className = 'alert alert-warn';
      tip.style.marginTop = '12px';
      tip.innerHTML = '⚠️ 当前以文件方式（file://）打开，浏览器会阻止 Web Worker，<b>PDF 文字提取不可用</b>。' +
        '请改为双击 <code>scripts/启动.bat</code> 或执行 <code>npm start</code>，通过 http://127.0.0.1 访问。';
    } else {
      tip.className = 'tip';
      tip.textContent = '提示：编号与日期一般出现在 PDF 前几页，默认只读前 3 页，可调整。';
    }
  }

  $('inPdfDir').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files).filter(function (f) { return /\.pdf$/i.test(f.name); });
    bf.entries = files.map(function (f) {
      return { name: f.name, path: f.webkitRelativePath || f.name, file: f };
    });
    $('namePdfDir').textContent = files.length ? ('已选 ' + files.length + ' 个 PDF') : '该文件夹内没有 PDF';
    $('dropPdfDir').classList.toggle('filled', files.length > 0);
    refreshBackfillBtn();
  });
  $('dropPdfDir').addEventListener('click', function () { $('inPdfDir').click(); });

  bindDrop('dropBackfill', 'inBackfill', 'nameBackfill', function (file) {
    return readFileBuf(file).then(function (buf) {
      return ExcelIO.readLedger(buf, '文件台账').then(function (res) {
        bf.buffer = buf; bf.sheet = res.sheet; bf.name = file.name;
        refreshBackfillBtn();
        return file.name + '（' + res.sheet.rows.length + ' 行）';
      });
    });
  });

  function refreshBackfillBtn() {
    $('btnBackfill').disabled = !(bf.entries.length && bf.sheet);
  }

  $('btnBackfill').addEventListener('click', function () {
    if (!(bf.entries.length && bf.sheet)) return;
    if (location.protocol === 'file:') {
      toast('请通过本地服务方式运行（启动.bat）后再使用');
      return;
    }
    var btn = this;
    btn.disabled = true;
    $('backfillStatus').textContent = '分析中…';
    $('backfillProg').classList.remove('hidden');
    $('backfillProg').value = 0;

    var maxPages = parseInt($('inMaxPages').value, 10) || 3;
    var minConf = $('inMinConf').value;

    Backfill.analyze(bf.entries, bf.sheet.rows, {
      projectTitle: cfg.projectTitle,
      maxPages: maxPages,
      minConfidence: minConf,
      workerUrl: 'assets/vendor/pdf.worker.min.js',
      cMapUrl: 'assets/vendor/cmaps/',
      onProgress: function (p) {
        $('backfillProg').value = Math.round(p.done / p.total * 100);
        $('backfillStatus').textContent = '读取 ' + p.name + '（' + p.done + '/' + p.total + '）';
      }
    }).then(function (res) {
      btn.disabled = false;
      $('backfillProg').classList.add('hidden');
      bf.result = res;
      $('backfillStatus').textContent = '完成';
      renderBackfill(res);
    }).catch(function (e) {
      btn.disabled = false;
      $('backfillProg').classList.add('hidden');
      $('backfillStatus').textContent = '失败：' + e.message;
      console.error(e);
    });
  });

  function statCard(label, num, cls) {
    return '<div class="card ' + cls + '"><span class="num">' + esc(num) + '</span>' +
      '<span class="lbl">' + esc(label) + '</span></div>';
  }

  function renderBackfill(res) {
    $('backfillResult').classList.remove('hidden');
    var s = res.stats;
    $('backfillStats').innerHTML = [
      statCard('待补日期', s.needDate, 'card-info'),
      statCard('待补编号', s.needNo, 'card-info'),
      statCard('可补录', s.filledDate + s.filledNo, 'card-verdict'),
      statCard('无文字层', s.noTextLayer, 'card-err')
    ].join('');

    var minConf = $('inMinConf').value;
    var rank = { '高': 3, '中': 2, '低': 1 };
    var rowsHtml = '';
    var acceptCount = 0;

    res.items.forEach(function (it) {
      if (it.error) {
        rowsHtml += '<tr><td class="rowno">' + it.row + '</td><td colspan="6" class="bf-err">' +
          esc(it.error) + (it.pdf ? '（' + esc(it.pdf) + '）' : '') + '</td></tr>';
        return;
      }
      it.fields.forEach(function (f) {
        var low = rank[f.confidence] < rank[minConf];
        if (low && !bf.showLow) return;
        if (!low) acceptCount++;
        rowsHtml += '<tr>' +
          '<td class="rowno">' + it.row + '</td>' +
          '<td>' + esc(it.pdf) + '</td>' +
          '<td>' + esc(f.field) + '</td>' +
          '<td class="old">' + (esc(f.old) || '（空）') + '</td>' +
          '<td class="val">' + esc(f.value) + '</td>' +
          '<td><span class="conf conf-' + f.confidence + '">' + f.confidence + '</span></td>' +
          '<td class="ev">' + esc(f.evidence) + (f.note ? '<br><b>' + esc(f.note) + '</b>' : '') + '</td>' +
          '</tr>';
      });
    });

    $('backfillTable').innerHTML = rowsHtml
      ? '<table class="bf-table"><thead><tr><th>行号</th><th>PDF</th><th>字段</th><th>原值</th><th>建议值</th><th>置信度</th><th>依据</th></tr></thead><tbody>' +
        rowsHtml + '</tbody></table>'
      : '<p class="tip">没有可补录的项。可能原因：所有行都已有编号与日期；PDF 匹配不上；或文字层里找不到可信信息。</p>';

    $('btnApplyBackfill').disabled = acceptCount === 0;
    $('btnApplyBackfill').textContent = acceptCount
      ? '应用并下载补录后的台账（' + acceptCount + ' 项）'
      : '无可应用项';
  }

  $('btnToggleLow').addEventListener('click', function () {
    bf.showLow = !bf.showLow;
    this.textContent = bf.showLow ? '隐藏低置信度项' : '显示低置信度项';
    if (bf.result) renderBackfill(bf.result);
  });

  $('btnApplyBackfill').addEventListener('click', function () {
    if (!bf.result) return;
    var minConf = $('inMinConf').value;
    var rank = { '高': 3, '中': 2, '低': 1 };
    var updates = [];
    bf.result.items.forEach(function (it) {
      if (it.error) return;
      it.fields.forEach(function (f) {
        if (rank[f.confidence] >= rank[minConf]) {
          updates.push({ row: it.row, field: f.field, value: f.value });
        }
      });
    });
    if (!updates.length) { toast('没有可应用的补录项'); return; }

    ExcelIO.writeCellsBack(bf.buffer, updates).then(function (out) {
      var base = bf.name.replace(/\.xlsx?$/i, '');
      download(new Blob([out.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        base + '_已补录.xlsx');
      toast('已补录 ' + out.applied + ' 项，请核对后使用');
    }).catch(function (e) { toast('写入失败：' + e.message); });
  });

  /* ==================================================================
   * 配置页事件
   * ================================================================== */

  $('btnSaveCfg').addEventListener('click', function () {
    collectCfgInputs();
    cfgSave();
    $('cfgHint').textContent = '已保存（本机浏览器）';
    setTimeout(function () { $('cfgHint').textContent = ''; }, 2200);
  });

  $('btnResetCfg').addEventListener('click', function () {
    if (!confirm('恢复为内置默认基准？本机保存的改动会丢失。')) return;
    cfg = cfgDefaults();
    cfgSave();
    renderCfg();
    $('cfgHint').textContent = '已恢复默认';
    setTimeout(function () { $('cfgHint').textContent = ''; }, 2200);
  });

  $('btnExportCfg').addEventListener('click', function () {
    collectCfgInputs();
    var blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '台账工作台配置.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  });

  $('btnImportCfg').addEventListener('click', function () { $('fileCfg').click(); });
  $('fileCfg').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var o = JSON.parse(String(r.result));
        if (o.projectTitle) cfg.projectTitle = o.projectTitle;
        if (o.file) cfg.file = o.file;
        if (o.juan) cfg.juan = o.juan;
        if (o.catMap) cfg.catMap = o.catMap;
        cfgSave();
        renderCfg();
        $('cfgHint').textContent = '已导入';
      } catch (e) { alert('配置文件解析失败：' + e.message); }
    };
    r.readAsText(f);
  });

  $('btnAddCat').addEventListener('click', function () {
    var k = prompt('新分类号（3 位，如 999）');
    if (!k) return;
    k = k.trim();
    readCatTable();
    cfg.catMap[k] = cfg.catMap[k] || { '分类名称': '', '保管期限': '', '保管期限代码': '' };
    cfgSave();
    renderCat();
  });

  /* ==================================================================
   * 其他
   * ================================================================== */

  $('btnCloseBuildAlert').addEventListener('click', function () {
    $('buildAlert').classList.add('hidden');
  });

  $('btnNotice').addEventListener('click', function () {
    var R = window.LEDGER_REMOTE || {};
    fetchRemote(false).then(function (res) {
      var ann = (res.data && res.data.announcement) || R.fallbackAnnouncement;
      if (ann) showNotice(ann, res.cached ? '（本机缓存）' : '');
      else toast('暂无公告');
    }).catch(function () {
      if (R.fallbackAnnouncement) showNotice(R.fallbackAnnouncement, '当前无法联网，以下是本机内置的公告');
      else toast('暂无公告');
    });
  });
  $('btnNoticeOk').addEventListener('click', function () { $('dlgNotice').close(); });
  $('btnUpdOk').addEventListener('click', function () { $('dlgUpdate').close(); });
  $('btnPdfWarnOk').addEventListener('click', function () { $('dlgPdfWarn').close(); });
  $('btnHelpOk').addEventListener('click', function () { $('dlgHelp').close(); });

  $('btnUpdate').addEventListener('click', function () { doUpdateCheck(false); });
  $('btnHelp').addEventListener('click', function () {
    $('dlgHelp').showModal();
    // 每次打开始终从顶部开始，避免上次滚到底后按键直接露出来
    $('dlgHelp').scrollTop = 0;
    requestAnimationFrame(function () { $('dlgHelp').scrollTop = 0; });
  });

  /* ---------------- 规则清单 ---------------- */

  $('ruleCount').textContent = E.RULE_CATALOG.length;
  var rt = '<table><thead><tr><th style="width:52px">规则</th><th style="width:220px">名称</th>' +
    '<th style="width:80px">级别</th><th>说明</th></tr></thead><tbody>';
  E.RULE_CATALOG.forEach(function (r) {
    rt += '<tr><td><span class="rid">' + r[0] + '</span></td><td>' + esc(r[2]) + '</td>' +
      '<td><span class="pill pill-' + r[3] + '">' + E.SEV_LABEL[r[3]] + '</span></td>' +
      '<td>' + esc(r[4]) + '</td></tr>';
  });
  rt += '</tbody></table>';
  $('ruleTable').innerHTML = rt;

  /* ==================================================================
   * 隐藏入口
   * 使用说明里的一组按键，按特定顺序触发两个隐藏效果：
   *   其一：解锁「规则清单」标签页（本次会话内有效）
   *   其二：弹出一个致意用的对话框
   * 两组序列各自独立计进度，互不干扰。
   * 触发顺序不写入文档，也不做任何屏幕提示——按对了才知道。
   * ================================================================== */

  var SECRETS = [
    {
      id: 'rules',
      seq: ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a', 'b', 'a'],
      pos: 0,
      done: function () { return rulesUnlocked; },
      fire: function () { unlockRules(); }
    },
    {
      id: 'eagle',
      seq: ['up', 'right', 'down', 'down', 'down'],
      pos: 0,
      done: function () { return false; },
      fire: function () {
        if ($('dlgHelp').open) $('dlgHelp').close();
        $('dlgEagle').showModal();
      }
    }
  ];

  var rulesUnlocked = false;

  function unlockRules(silent) {
    rulesUnlocked = true;
    $('tabRules').classList.remove('tab-hidden');
    try { sessionStorage.setItem('ledger-rules-unlocked', '1'); } catch (e) { /* 忽略 */ }
    // 静默模式（页面加载时恢复状态）只显示页签，不跳转
    if (!silent) goRules();
  }

  /** 解锁后的跳转：关掉使用说明 → 切到规则清单 → 顶部显示提示 */
  function goRules() {
    if ($('dlgHelp').open) $('dlgHelp').close();
    switchTab('rules');
    $('rulesSecret').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function konamiInput(key) {
    SECRETS.forEach(function (s) {
      if (s.done()) return;
      if (key === s.seq[s.pos]) {
        s.pos++;
      } else {
        // 失配后若该键正好是序列首位，则从第 2 位接着算
        s.pos = (key === s.seq[0]) ? 1 : 0;
      }
      if (s.pos >= s.seq.length) {
        s.pos = 0;
        s.fire();
      }
    });
  }

  $$('#konamiPad .kbtn').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      b.classList.add('pressed');
      setTimeout(function () { b.classList.remove('pressed'); }, 130);
      konamiInput(b.getAttribute('data-konami'));
    });
  });

  $('btnEagleOk').addEventListener('click', function () { $('dlgEagle').close(); });

  $('btnCloseSecret').addEventListener('click', function () {
    $('rulesSecret').classList.add('hidden');
  });

  /* ---------------- 启动 ---------------- */

  cfgLoad();
  renderCfg();
  $('docno').textContent = APP_DOC_NO + ' · 引擎 ' + E.ENGINE_DOC_NO;
  $('footVer').textContent = 'Ledger Studio ' + APP_DOC_NO;

  // 生成页是默认页，启动即显示一次提示（本次加载只显示一次）
  buildAlertShown = true;
  $('buildAlert').classList.remove('hidden');

  // 本会话内已解锁过规则清单则直接显示
  try {
    if (sessionStorage.getItem('ledger-rules-unlocked') === '1') unlockRules(true);
  } catch (e) { /* 隐私模式忽略 */ }

  bootNoticeAndUpdate();
  checkPdfEnv();

})();
