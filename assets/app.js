/*!
 * Ledger Studio · 界面控制层
 */
(function () {
  'use strict';

  var E = LedgerEngine;
  var APP_DOC_NO = 'LST-v1.0.0';

  var state = {
    fileBuf: null, fileName: '', fileSheet: null,
    juanBuf: null, juanName: '', juanSheet: null,
    pdfIndex: null,
    result: null,
    buildFiles: []
  };

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* ---------------- 通用工具 ---------------- */

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
    }, 2200);
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

  /* ---------------- 标签页 ---------------- */

  $$('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('.tab').forEach(function (t) { t.classList.remove('active'); });
      $$('.panel').forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      $('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  /* ---------------- 上传交互 ---------------- */

  function bindDrop(dropId, inputId, nameId, key, label) {
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
      readFileBuf(file).then(function (buf) {
        if (key === 'list') {
          return readList(file, buf).then(function () {
            nameEl.textContent = file.name;
            drop.classList.add('filled');
          });
        }
        return ExcelIO.readLedger(buf, label).then(function (res) {
          if (key === 'file') {
            state.fileBuf = buf; state.fileName = file.name; state.fileSheet = res.sheet;
          } else {
            state.juanBuf = buf; state.juanName = file.name; state.juanSheet = res.sheet;
          }
          nameEl.textContent = file.name + '（' + res.sheet.rows.length + ' 行 · ' + res.sheet.header.length + ' 列）';
          drop.classList.add('filled');
          refreshCheckBtn();
        });
      }).catch(function (err) {
        nameEl.textContent = '读取失败：' + err.message;
        console.error(err);
      });
    }
  }

  function refreshCheckBtn() {
    $('btnCheck').disabled = !(state.fileSheet || state.juanSheet);
  }

  bindDrop('dropFile', 'inFile', 'nameFile', 'file', '文件台账');
  bindDrop('dropJuan', 'inJuan', 'nameJuan', 'juan', '案卷台账');
  bindDrop('dropList', 'inList', 'nameList', 'list', '要素清单');

  /* ---------------- PDF ---------------- */

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

  /* ---------------- 检查 ---------------- */

  $('btnCheck').addEventListener('click', function () {
    if (!(state.fileSheet || state.juanSheet)) return;
    var status = $('checkStatus');
    status.textContent = '检查中…';
    try {
      var ctx = {
        baseline: window.LEDGER_BASELINE,
        projectTitle: (window.LEDGER_BASELINE || {}).project_title,
        pdfIndex: $('optPdf').checked ? state.pdfIndex : null
      };
      state.result = E.check(state.fileSheet, state.juanSheet, ctx);
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
      var rules = E.RULE_CATALOG.filter(function (r) { return r[1] === ledger && groups.has(r[0]); });
      rules.forEach(function (r) {
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

  /* ---------------- 导出报告 ---------------- */

  $('btnExportMd').addEventListener('click', function () {
    var res = state.result;
    if (!res) return;
    var L = [];
    L.push('# 台账检查报告');
    L.push('');
    L.push('- 生成时间：' + new Date().toLocaleString('zh-CN'));
    L.push('- 引擎档号：' + E.ENGINE_DOC_NO + '　应用：' + APP_DOC_NO);
    L.push('- 文件台账：`' + (state.fileName || '（未提供）') + '`');
    L.push('- 案卷台账：`' + (state.juanName || '（未提供）') + '`');
    L.push('- PDF 校验：' + ($('optPdf').checked ? '已启用' : '未启用'));
    L.push('');
    L.push('## 总览');
    L.push('');
    L.push('| 级别 | 数量 |');
    L.push('| --- | --- |');
    L.push('| 🔴 错误 | ' + res.errors + ' |');
    L.push('| 🟡 提醒 | ' + res.warns + ' |');
    L.push('| 🔵 提示 | ' + res.infos + ' |');
    L.push('');
    L.push(res.errors === 0
      ? (res.warns === 0 ? '**结论：本次检查未发现问题。**' : '**结论：无硬性错误，但有需要人工确认的提醒项。**')
      : '**结论：发现 ' + res.errors + ' 项错误，需修正后再归档。**');
    L.push('');
    L.push('## 明细');
    L.push('');

    var groups = new Map();
    res.items.forEach(function (f) {
      if (!groups.has(f.rule)) groups.set(f.rule, []);
      groups.get(f.rule).push(f);
    });

    ['文件台账', '案卷台账', '联动'].forEach(function (ledger) {
      var rules = E.RULE_CATALOG.filter(function (r) { return r[1] === ledger && groups.has(r[0]); });
      if (!rules.length) return;
      L.push('### ' + ledger);
      L.push('');
      rules.forEach(function (r) {
        var items = groups.get(r[0]);
        L.push('#### ' + r[0] + ' ' + r[2] + ' （' + E.SEV_LABEL[r[3]] + ' · ' + items.length + ' 条）');
        L.push('');
        L.push('> ' + r[4]);
        L.push('');
        L.push('| 行号 | 列 | 问题 | 当前值 | 期望值 |');
        L.push('| --- | --- | --- | --- | --- |');
        items.forEach(function (f) {
          L.push('| ' + (f.row == null ? '—' : f.row) + ' | ' + (f.col || '—') + ' | ' +
            String(f.msg).replace(/\|/g, '\\|') + ' | ' +
            String(f.cur == null ? '—' : f.cur).replace(/\|/g, '\\|') + ' | ' +
            String(f.exp == null ? '—' : f.exp).replace(/\|/g, '\\|') + ' |');
        });
        L.push('');
      });
    });

    var stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    download(new Blob([L.join('\n')], { type: 'text/markdown;charset=utf-8' }), '台账检查报告-' + stamp + '.md');
  });

  /* ---------------- 下载已排版副本 ---------------- */

  function downloadFormatted(which) {
    var buf = which === 'file' ? state.fileBuf : state.juanBuf;
    var name = which === 'file' ? state.fileName : state.juanName;
    if (!buf) { toast('尚未选择该台账'); return; }
    ExcelIO.readLedger(buf, '').then(function (res) {
      var wb = res.workbook;
      var ws = wb.worksheets[0];
      var FONT = { name: '宋体', size: 11 };
      var ALIGN = { horizontal: 'center', vertical: 'middle', wrapText: true };
      var maxRow = ws.rowCount || 0, maxCol = ws.columnCount || 0;
      for (var r = 1; r <= maxRow; r++) {
        var row = ws.getRow(r);
        for (var c = 1; c <= maxCol; c++) {
          var cell = row.getCell(c);
          cell.font = FONT;
          cell.alignment = ALIGN;
          cell.numFmt = '@';
        }
        row.commit();
      }
      return wb.xlsx.writeBuffer();
    }).then(function (out) {
      var base = name.replace(/\.xlsx?$/i, '');
      download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        base + '_已检查.xlsx');
    }).catch(function (e) { toast('生成失败：' + e.message); });
  }

  $('btnDlFile').addEventListener('click', function () { downloadFormatted('file'); });
  $('btnDlJuan').addEventListener('click', function () { downloadFormatted('juan'); });

  /* ---------------- 示例台账 ---------------- */

  $('btnLoadSample').addEventListener('click', function () {
    var tf = b64ToBuf(window.LEDGER_TPL_FILE), tj = b64ToBuf(window.LEDGER_TPL_JUAN);
    Promise.all([
      ExcelIO.readLedger(tf, '文件台账'),
      ExcelIO.readLedger(tj, '案卷台账')
    ]).then(function (arr) {
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

  /* ---------------- 生成 ---------------- */

  function splitText(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) throw new Error('内容为空');
    var delim = lines[0].indexOf('\t') >= 0 ? '\t' : (lines[0].indexOf('|') >= 0 ? '|' : ',');
    function parseLine(line) {
      if (delim === '|') return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (x) { return x.trim(); });
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

  function readList(file, buf) {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    return new Promise(function (resolve, reject) {
      if (ext === 'xlsx' || ext === 'xlsm') {
        ExcelIO.readLedger(buf, '要素清单').then(function (res) {
          var header = res.sheet.header;
          var recs = res.sheet.rows.map(function (r) {
            var o = { __line: r.__row };
            header.forEach(function (h) { if (h) o[h] = r[h]; });
            return o;
          });
          paintListPreview(header, recs);
          resolve(recs);
        }).catch(reject);
      } else {
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
            resolve(recs);
          } catch (e) { reject(e); }
        };
        fr.onerror = reject;
        fr.readAsText(file, 'utf-8');
      }
    });
  }

  var pendingList = null;
  function paintListPreview(header, recs) {
    pendingList = { header: header, recs: recs };
    var preview = recs.slice(0, 6).map(function (r) {
      return header.map(function (h) { return r[h] == null ? '' : r[h]; }).join('\t');
    });
    $('taList').value = [header.join('\t')].concat(preview).join('\n');
    toast('已读取 ' + recs.length + ' 行要素');
  }

  var buildRecords = null;
  $('taList').addEventListener('input', function () { buildRecords = null; });

  function getRecords() {
    var text = $('taList').value.trim();
    if (!text) return null;
    var parsed = splitText(text);
    return parsed.rows.map(function (cells, i) {
      var o = { __line: i + 2 };
      parsed.header.forEach(function (h, j) { if (h) o[h] = cells[j]; });
      return o;
    });
  }

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
    var recs = getRecords();
    if (!recs || !recs.length) { toast('请先选择或粘贴要素清单'); return; }
    recs = recs.map(normalizeRecord);

    var anchorInput = $('inAnchor').value;
    var anchor = null;
    if (anchorInput) anchor = parseInt(anchorInput.replace(/-/g, ''), 10);

    var res = E.buildLedgers(recs, {
      baseline: window.LEDGER_BASELINE,
      categoryMap: window.LEDGER_CATEGORY_MAP,
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

    // 按分类分本
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
    if (split) sum += '<p class="tip">检测到 ' + classes.length + ' 个分类号，已按分类拆成独立台账（分类号须单本一致）。</p>';
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
      Array.prototype.forEach.call($('buildDownloads').querySelectorAll('button'), function (btn) {
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

  /* ---------------- 帮助 / 版本 ---------------- */

  $('btnHelp').addEventListener('click', function () { $('dlgHelp').showModal(); });

  $('docno').textContent = APP_DOC_NO + ' · 引擎 ' + E.ENGINE_DOC_NO;
  $('footVer').textContent = 'Ledger Studio ' + APP_DOC_NO;

  $('btnUpdate').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true; btn.textContent = '检查中…';
    var sources = [
      'https://cdn.jsdelivr.net/gh/USER/ledger-studio@main/version.json',
      'https://raw.githubusercontent.com/USER/ledger-studio/main/version.json',
      'https://gh-proxy.com/raw.githubusercontent.com/USER/ledger-studio/main/version.json'
    ];
    var tried = 0;
    function next() {
      if (tried >= sources.length) {
        btn.disabled = false; btn.textContent = '检查更新';
        toast('无法连接更新源（离线或网络受限），当前版本 ' + APP_DOC_NO);
        return;
      }
      var url = sources[tried++];
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 6000);
      fetch(url, { signal: ctrl.signal, cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (info) {
          clearTimeout(timer);
          btn.disabled = false; btn.textContent = '检查更新';
          if (info.docNo && info.docNo !== APP_DOC_NO) {
            $('envBadge').textContent = '有新版本 ' + info.docNo;
            $('envBadge').className = 'badge badge-new';
            toast('发现新版本 ' + info.docNo + '，请重新下载');
          } else {
            $('envBadge').textContent = '已是最新';
            $('envBadge').className = 'badge badge-ok';
            toast('已是最新版本 ' + APP_DOC_NO);
          }
        })
        .catch(function () { clearTimeout(timer); next(); });
    }
    next();
  });

  // 提前把模板 buffer 预热，避免首次生成卡顿
  refreshCheckBtn();

})();
