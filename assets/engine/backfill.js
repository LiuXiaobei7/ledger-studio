/*!
 * Backfill —— PDF 源补录（实验）
 * 从 PDF 文字层推测「文件编号」「文件日期」，补进台账的缺失或错位字段。
 *
 * 设计取向：宁可少补，也不乱补。低置信度一律只提示不自动填。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Backfill = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DOC_NO = 'BFILL-v1.0.0';

  /* ======================== 文本归一化 ======================== */

  function normText(t) {
    if (!t) return '';
    var s = String(t);
    // 全角数字/字母/符号 -> 半角
    s = s.replace(/[\uFF10-\uFF19]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    s = s.replace(/[\uFF21-\uFF3A\uFF41-\uFF5A]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    s = s.replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    s = s.replace(/[\u3000]/g, ' ');
    return s.replace(/[ \t]+/g, ' ');
  }

  function compact(t) { return String(t || '').replace(/\s+/g, ''); }

  /* ======================== 日期推测 ======================== */

  var DATE_KW_BEFORE = ['签发', '出厂', '检验', '试验', '发行', '报告', '出具', '检测', '日期', '有效期', '生产'];
  var DATE_KW_AFTER = ['日期', '日', '年', '月'];

  function validYmd(y, m, d) {
    y = +y; m = +m; d = +d;
    if (y < 1990 || y > 2100) return false;
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  /**
   * 从文本里找 8 位日期候选。
   * 返回 [{ymd, evidence, score, count}]，按 score 降序。
   */
  function guessDate(text) {
    var raw = normText(text);
    var flat = compact(raw);
    var hits = new Map();

    function note(ymd, idx, ev, bonus) {
      if (!hits.has(ymd)) hits.set(ymd, { ymd: ymd, score: 0, count: 0, evidence: ev, pos: idx });
      var h = hits.get(ymd);
      h.count++;
      h.score += 1 + (bonus || 0);
      if (idx < h.pos) { h.pos = idx; h.evidence = String(ev).replace(/\s+/g, ' ').trim(); }
    }

    // 形式一：连续 8 位（前后不能再接数字）
    var re1 = /(?<!\d)(19\d{2}|20\d{2})(\d{2})(\d{2})(?!\d)/g, m;
    while ((m = re1.exec(flat))) {
      if (!validYmd(m[1], m[2], m[3])) continue;
      var around = flat.slice(Math.max(0, m.index - 12), m.index);
      var bonus = 0;
      DATE_KW_BEFORE.forEach(function (k) { if (around.indexOf(k) >= 0) bonus += 1.5; });
      note(+m[0], m.index, around + '【' + m[0] + '】', bonus);
    }

    // 形式二：带分隔符 2025-03-25 / 2025.3.25 / 2025/3/25 / 2025年3月25日
    var re2 = /(?<!\d)(19\d{2}|20\d{2})\s*[.\-\/年]\s*(\d{1,2})\s*[.\-\/月]\s*(\d{1,2})\s*日?/g;
    while ((m = re2.exec(raw))) {
      if (!validYmd(m[1], m[2], m[3])) continue;
      var ymd2 = +((+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]));
      var around2 = raw.slice(Math.max(0, m.index - 12), m.index);
      var bonus2 = 1;
      DATE_KW_BEFORE.forEach(function (k) { if (around2.indexOf(k) >= 0) bonus2 += 1.5; });
      note(ymd2, m.index, around2 + '【' + m[0] + '】', bonus2);
    }

    // 形式三：中文 二〇二五年三月二十五日
    var re3 = /([一二三四五六七八九〇零]{4})年([一二三四五六七八九十]{1,3})月([一二三四五六七八九十]{1,3})日/g;
    while ((m = re3.exec(raw))) {
      var y = cnYear(m[1]), mo = cnNum(m[2]), d = cnNum(m[3]);
      if (!validYmd(y, mo, d)) continue;
      var ymd3 = y * 10000 + mo * 100 + d;
      note(ymd3, m.index, '【' + m[0] + '】', 1.5);
    }

    var arr = Array.from(hits.values());
    arr.forEach(function (x) { x.evidence = String(x.evidence || '').replace(/\s+/g, ' ').trim(); });
    arr.sort(function (a, b) { return b.score - a.score || a.pos - b.pos; });
    return arr;
  }

  function cnYear(s) {
    var map = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    var out = '';
    for (var i = 0; i < s.length; i++) out += map[s[i]] !== undefined ? map[s[i]] : '';
    return parseInt(out, 10);
  }
  function cnNum(s) {
    var map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
    if (s.length === 1) return map[s] || 0;
    if (s[0] === '十') return 10 + (map[s[1]] || 0);
    if (s[1] === '十') return (map[s[0]] || 0) * 10 + (s[2] ? map[s[2]] || 0 : 0);
    return map[s] || 0;
  }

  /* ======================== 编号推测 ======================== */

  var NO_KW = ['编号', '证号', '序号', '批号', 'No', 'NO', 'No.', 'NO.', 'NO:', '代码', '型号', '产品编号', '出厂编号', '证书编号'];

  function looksLikeDate(tok) {
    if (!/^\d{8}$/.test(tok)) return false;
    return validYmd(tok.slice(0, 4), tok.slice(4, 6), tok.slice(6, 8));
  }

  function looksLikeArchiveNo(tok) {
    return /^(D\d{4}|KJG|A\d{3})/i.test(tok) || /-\d{3}-\d{3}$/.test(tok);
  }

  /**
   * 从文本里找「文件编号」候选。
   * knownPrefixes: 同一台账里已有编号的前缀集合，命中可加分（同厂家系列）
   */
  function guessDocNo(text, knownPrefixes) {
    var raw = normText(text);
    var flat = compact(raw);
    var hits = new Map();

    function note(tok, idx, ev, bonus) {
      if (!tok) return;
      if (looksLikeDate(tok)) return;          // 8位日期不当作编号
      if (looksLikeArchiveNo(tok)) return;     // 档号不当作编号
      if (/^\d{4,6}$/.test(tok)) return;       // 纯短数字多半是页码/序号
      if (!hits.has(tok)) hits.set(tok, { value: tok, score: 0, count: 0, evidence: ev, pos: idx });
      var h = hits.get(tok);
      h.count++;
      h.score += 1 + (bonus || 0);
      if (idx < h.pos) { h.pos = idx; h.evidence = String(ev).replace(/\s+/g, ' ').trim(); }
    }

    // 形式一：关键词邻接（最强信号）
    var kwRe = new RegExp('(?:' + ['编号', '证号', '批号', '代码', '产品编号', '出厂编号', '证书编号', 'No\\.?', 'NO\\.?', 'NO:'].join('|') +
      ')\\s*[:：]?\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/]{4,29})', 'gi'), m;
    while ((m = kwRe.exec(raw))) {
      var around = raw.slice(Math.max(0, m.index - 8), m.index + 4);
      note(m[1].replace(/[-\/]+$/, ''), m.index, around + '【' + m[1] + '】', 3);
    }

    // 形式二：字母+数字混合 token（如 TKG711510002）
    var re2 = /(?<![A-Za-z0-9])((?=[A-Za-z0-9\-\/]*[A-Za-z])(?=[A-Za-z0-9\-\/]*\d)[A-Za-z0-9\-\/]{6,29})(?![A-Za-z0-9])/g;
    while ((m = re2.exec(flat))) {
      var tok = m[1];
      if (!/\d{4,}/.test(tok)) continue;
      if (looksLikeArchiveNo(tok)) continue;
      note(tok, m.index, '文中出现【' + tok + '】', 1.5);
    }

    // 形式三：长纯数字（>=10 位，避开日期和页码）
    var re3 = /(?<!\d)(\d{10,20})(?!\d)/g;
    while ((m = re3.exec(flat))) {
      note(m[1], m.index, '文中出现【' + m[1] + '】', 0.5);
    }

    // 同系列前缀加分
    if (knownPrefixes && knownPrefixes.length) {
      hits.forEach(function (h) {
        knownPrefixes.forEach(function (p) {
          if (p && h.value.indexOf(p) === 0) h.score += 2.5;
        });
      });
    }

    var arr = Array.from(hits.values());
    arr.forEach(function (x) { x.evidence = String(x.evidence || '').replace(/\s+/g, ' ').trim(); });
    arr.sort(function (a, b) { return b.score - a.score || a.pos - b.pos; });
    return arr;
  }

  function prefixOf(no) {
    var m = /^([A-Za-z]{2,6})/.exec(no || '');
    return m ? m[1] : (/^\d{6,}/.test(no || '') ? String(no).slice(0, 6) : '');
  }

  /* ======================== PDF 文本提取 ======================== */

  var pdfjsReady = null;

  function loadPdfjs(workerUrl, cMapUrl) {
    if (pdfjsReady) return pdfjsReady;
    pdfjsReady = new Promise(function (resolve, reject) {
      if (typeof pdfjsLib === 'undefined') return reject(new Error('pdf.js 未加载'));
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      } catch (e) { /* ignore */ }
      resolve(pdfjsLib);
    });
    return pdfjsReady;
  }

  /**
   * 提取 PDF 前 maxPages 页的文字。
   * 返回 { text, pages, hasTextLayer }
   */
  async function extractPdfText(file, opts) {
    opts = opts || {};
    var lib = await loadPdfjs(opts.workerUrl || 'assets/vendor/pdf.worker.min.js');
    var buf = await file.arrayBuffer();
    var doc = await lib.getDocument({
      data: new Uint8Array(buf),
      cMapUrl: opts.cMapUrl || 'assets/vendor/cmaps/',
      cMapPacked: true,
      disableFontFace: true,
      useWorkerFetch: false,
      isEvalSupported: false
    }).promise;

    var maxPages = Math.min(doc.numPages, opts.maxPages || 3);
    var parts = [];
    for (var i = 1; i <= maxPages; i++) {
      var page = await doc.getPage(i);
      var tc = await page.getTextContent();
      var s = tc.items.map(function (it) { return it.str; }).join('');
      parts.push(s);
      page.cleanup();
    }
    var text = parts.join('\n');
    try { doc.destroy(); } catch (e) { /* ignore */ }
    return {
      pages: doc.numPages,
      text: text,
      hasTextLayer: compact(text).length >= 10
    };
  }

  /* ======================== PDF 与台账行的匹配 ======================== */

  function baseName(p) {
    return String(p).replace(/^.*[\\\/]/, '').replace(/\.pdf$/i, '');
  }

  function normalizeKey(s) {
    return compact(normText(s)).replace(/[（(]/g, '(').replace(/[）)]/g, ')');
  }

  /**
   * 为一行台账找对应 PDF。
   * index: Map<归一化文件名, entry>
   */
  function matchPdf(row, index, projectTitle) {
    var dh = compact(row['文件档号'] || '');
    var title = compact(row['文件题名'] || '');
    if (!dh) return null;

    // 1) 档号 + 题名 精确
    var exact = normalizeKey(dh + (row['文件题名'] || ''));
    if (index.has(exact)) return { entry: index.get(exact), how: '档号+题名精确匹配' };

    // 2) 文件名以档号开头
    var byDh = null;
    index.forEach(function (v, k) {
      if (byDh) return;
      if (k.indexOf(normalizeKey(dh)) === 0) byDh = v;
    });
    if (byDh) return { entry: byDh, how: '档号前缀匹配' };

    // 3) 题名核心片段包含
    var core = title;
    if (projectTitle && core.indexOf(compact(projectTitle)) === 0) core = core.slice(compact(projectTitle).length);
    if (core.length >= 8) {
      var probe = normalizeKey(core.slice(0, 12));
      var byTitle = null;
      index.forEach(function (v, k) {
        if (byTitle) return;
        if (k.indexOf(probe) >= 0) byTitle = v;
      });
      if (byTitle) return { entry: byTitle, how: '题名片段匹配' };
    }
    return null;
  }

  /* ======================== 主流程 ======================== */

  function conf(score) {
    if (score >= 4) return '高';
    if (score >= 3) return '中';
    return '低';
  }

  /**
   * 分析一整本台账。
   * rows: 引擎 sheet 的行（含 __row、文件档号、文件题名、文件编号、文件日期）
   * 返回 { items:[...], stats:{...} }
   */
  async function analyze(pdfEntries, rows, opts) {
    opts = opts || {};
    var projectTitle = opts.projectTitle || '';
    var maxPages = opts.maxPages || 3;
    var minConfidence = opts.minConfidence || '中';
    var onProgress = opts.onProgress || function () {};

    // 文件名索引
    var index = new Map();
    pdfEntries.forEach(function (e) {
      index.set(normalizeKey(baseName(e.path || e.name)), e);
    });

    // 已有编号前缀（同系列识别用）
    var knownPrefixes = [];
    rows.forEach(function (r) {
      var v = String(r['文件编号'] || '').trim();
      if (v) {
        var p = prefixOf(v);
        if (p && knownPrefixes.indexOf(p) < 0) knownPrefixes.push(p);
      }
    });

    var items = [];
    var stats = { total: rows.length, needDate: 0, needNo: 0, matchedPdf: 0,
      noTextLayer: 0, filledDate: 0, filledNo: 0, lowConfidence: 0, pdfMissing: 0 };

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var noVal = String(r['文件编号'] || '').trim();
      var dateVal = r['文件日期'];
      var needNo = !noVal;
      var needDate = (dateVal === null || dateVal === undefined || dateVal === '');

      // 错位检测：日期格里放的不是日期 / 编号格里放的是日期
      var misDate = false, misNo = false;
      if (!needDate && !/^\d{8}$/.test(String(dateVal).trim())) misDate = true;
      if (noVal && looksLikeDate(noVal)) misNo = true;

      if (!needNo && !needDate && !misDate && !misNo) continue;
      if (needNo) stats.needNo++;
      if (needDate) stats.needDate++;

      var hit = matchPdf(r, index, projectTitle);
      if (!hit) {
        stats.pdfMissing++;
        items.push({
          row: r.__row, dh: r['文件档号'], title: r['文件题名'],
          pdf: null, error: '未找到对应 PDF',
          fields: [],
          needs: { no: needNo, date: needDate, misDate: misDate, misNo: misNo }
        });
        continue;
      }
      stats.matchedPdf++;

      onProgress({ done: i + 1, total: rows.length, name: hit.entry.name });

      var extracted;
      try {
        extracted = await extractPdfText(hit.entry.file, {
          maxPages: maxPages, workerUrl: opts.workerUrl, cMapUrl: opts.cMapUrl
        });
      } catch (e) {
        items.push({
          row: r.__row, dh: r['文件档号'], title: r['文件题名'],
          pdf: hit.entry.name, how: hit.how, error: 'PDF 解析失败：' + e.message,
          fields: [], needs: { no: needNo, date: needDate, misDate: misDate, misNo: misNo }
        });
        continue;
      }

      if (!extracted.hasTextLayer) {
        stats.noTextLayer++;
        items.push({
          row: r.__row, dh: r['文件档号'], title: r['文件题名'],
          pdf: hit.entry.name, how: hit.how, error: 'PDF 无文字层（可能是扫描件），无法提取',
          fields: [], needs: { no: needNo, date: needDate, misDate: misDate, misNo: misNo }
        });
        continue;
      }

      var fields = [];

      if (needDate || misDate) {
        var dc = guessDate(extracted.text);
        if (dc.length) {
          var top = dc[0];
          fields.push({
            field: '文件日期',
            old: needDate ? '' : String(dateVal),
            value: top.ymd,
            confidence: conf(top.score),
            evidence: top.evidence,
            note: misDate ? '原值不是 8 位日期，建议替换' : ''
          });
          if (conf(top.score) !== '低') stats.filledDate++;
        }
      }

      if (needNo || misNo) {
        var nc = guessDocNo(extracted.text, knownPrefixes);
        if (nc.length) {
          var topN = nc[0];
          fields.push({
            field: '文件编号',
            old: noVal,
            value: topN.value,
            confidence: conf(topN.score),
            evidence: topN.evidence,
            note: misNo ? '原值是 8 位日期，疑似与文件日期错位' : '',
            alternatives: nc.slice(1, 3).map(function (x) { return x.value; })
          });
          if (conf(topN.score) !== '低') stats.filledNo++;
        }
      }

      fields.forEach(function (f) { if (f.confidence === '低') stats.lowConfidence++; });
      if (!fields.length) {
        items.push({
          row: r.__row, dh: r['文件档号'], title: r['文件题名'],
          pdf: hit.entry.name, how: hit.how,
          error: '文字层里没找到可信的编号或日期',
          fields: [], needs: { no: needNo, date: needDate, misDate: misDate, misNo: misNo }
        });
        continue;
      }
      items.push({
        row: r.__row, dh: r['文件档号'], title: r['文件题名'],
        pdf: hit.entry.name, how: hit.how, pages: extracted.pages,
        fields: fields, needs: { no: needNo, date: needDate, misDate: misDate, misNo: misNo }
      });
    }

    return { items: items, stats: stats };
  }

  /* ======================== 补录结论汇总 ======================== */

  function summarize(result, minConfidence) {
    var min = minConfidence || '中';
    var rank = { '高': 3, '中': 2, '低': 1 };
    var accept = [], review = [];
    result.items.forEach(function (it) {
      it.fields.forEach(function (f, idx) {
        var rec = { row: it.row, field: f.field, value: f.value, old: f.old,
          confidence: f.confidence, evidence: f.evidence, _ref: it, _idx: idx };
        if (rank[f.confidence] >= rank[min]) accept.push(rec);
        else review.push(rec);
      });
    });
    return { accept: accept, review: review };
  }

  return {
    DOC_NO: DOC_NO,
    normText: normText,
    guessDate: guessDate,
    guessDocNo: guessDocNo,
    prefixOf: prefixOf,
    extractPdfText: extractPdfText,
    matchPdf: matchPdf,
    baseName: baseName,
    normalizeKey: normalizeKey,
    analyze: analyze,
    summarize: summarize
  };
});
