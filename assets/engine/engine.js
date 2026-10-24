/*!
 * LedgerEngine —— 档案台账规则引擎
 * 与 Python CLI 版 (ALC-v0.4.0 / ALB-v0.2.0) 口径一致，可独立在浏览器或 Node 中运行。
 * 无第三方依赖：只操作「纯数据模型」，Excel 读写由调用方注入。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LedgerEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ENGINE_DOC_NO = 'ENG-v1.0.0';

  /* ======================== 规则常量 ======================== */

  var FILE_FIXED = ['项目代号', '项目排序号', '所属部门', '归档部门', '全宗号', '归档人',
    '存放地点', '数字化', '实体归档情况', '全宗名称', '立档单位名称'];

  var FILE_UNIFORM = ['分类号', '分类名称', '保管期限', '保管期限代码', '归档日期'];

  var JUAN_FIXED = ['项目排序号', '项目代号', '所属部门', '编制单位', '立卷单位', '立卷人',
    '检查人', '归档部门', '全宗号', '归档人', '归档份数', '存放地点', '数字化',
    '装订方法', '实体归档情况', '全宗名称', '立档单位名称'];

  var JUAN_UNIFORM = ['分类号', '分类名称', '编制日期', '立卷日期', '检查日期',
    '保管期限', '保管期限代码', '归档日期'];

  var ALIASES = {
    '文件题名': ['文件题名', '文件提名', '题名', '文件标题'],
    '卷内序号': ['卷内序号', '件号'],
    '文件页数': ['文件页数', '页数', '总页数'],
    '文字页数': ['文字页数'],
    '图纸页数': ['图纸页数'],
    '所属卷号': ['所属卷号', '卷号'],
    '案卷题名': ['案卷题名', '案卷提名'],
    '档案号': ['档号']
  };

  var DEFAULT_PROJECT_TITLE = '巴彦淖尔乌拉特前旗苏计沙地200万千瓦光伏治沙基地项目';

  var RULE_CATALOG = [
    ['F1', '文件台账', '固定值列一致性', 'ERROR', '项目代号、项目排序号、所属部门、归档部门、全宗号、归档人、存放地点、数字化、实体归档情况、全宗名称、立档单位名称，必须与模板基准一致且本本内唯一。'],
    ['F2', '文件台账', '单本内一致性', 'ERROR', '分类号、分类名称、保管期限、保管期限代码、归档日期，在单本台账内必须完全相同。'],
    ['F3', '文件台账', '文件档号 = 所属卷号 + 卷内序号', 'ERROR', '文件档号须为「所属卷号-三位卷内序号」且全表唯一。'],
    ['F4', '文件台账', '卷内序号连续性', 'ERROR', '同一卷号下卷内序号应从 001 起连续递增。'],
    ['F5', '文件台账', '文件日期为8位数字', 'ERROR', '文件日期必须是 8 位数字合法日期；允许为空（记提示不判错）。'],
    ['F6', '文件台账', '年度取文件日期前四位', 'ERROR', '年度必须等于文件日期前四位；日期为空时年度可空。'],
    ['F7', '文件台账', '文件页数 = 文字页数 + 图纸页数', 'ERROR', '三项均不得为空，且等式必须成立。'],
    ['F8', '文件台账', '图纸类文件页数提醒', 'WARN', '题名含「图纸」「原理图」需人工复核图纸页数。'],
    ['F9', '文件台账', '文件题名格式', 'ERROR', '题名须以项目全称开头，无首尾空格换行，施工标段须为「施工X标」。'],
    ['F10', '文件台账', 'PDF文件名 = 文件档号 + 文件题名', 'ERROR', 'PDF 文件名须为档号+题名直接相连，一字不差。'],
    ['F11', '文件台账', 'PDF 实际页数 = 文件页数', 'ERROR', 'PDF 实际页数须等于台账中的文件页数。'],
    ['F12', '文件台账', '日期/编号为空（允许项）', 'INFO', '部分文件本身没有文件日期或文件编号，为空属正常，仅作记录。'],

    ['J1', '案卷台账', '固定值列一致性', 'ERROR', '17 个固定值列必须与模板基准一致且本本内唯一。'],
    ['J2', '案卷台账', '单本内一致性', 'ERROR', '分类号、分类名称、编制日期、立卷日期、检查日期、保管期限、保管期限代码、归档日期，在单本内必须完全相同。'],
    ['J3', '案卷台账', '案卷档号格式与唯一性', 'ERROR', '案卷档号 = 全宗号-KJG码-项目代号-分类号-三位案卷号，全表唯一。'],
    ['J4', '案卷台账', '案卷号为连续流水号', 'ERROR', '案卷号唯一、不跳号；不要求从 1 开始。'],
    ['J5', '案卷台账', '四日期须为倒推工作日链', 'ERROR', '归档=锚点；检查=归档前一工作日；立卷=检查前一工作日；编制=立卷前一工作日。'],
    ['J8', '案卷台账', '归档日期应取当日', 'WARN', '归档日期应为执行归档的当日，不一致时提醒复核。'],
    ['J6', '案卷台账', '正副本数', 'WARN', '正副本数一般情况下应为 1。'],
    ['J7', '案卷台账', '可疑案卷的脊背宽度复核', 'WARN', '只对可疑案卷提醒：件数离群、单据类型离群、子阵覆盖不全、页数与脊背宽度不匹配。'],
    ['J9', '案卷台账', '可疑案卷扫描概览', 'INFO', '记录本次扫描了多少卷、命中几个可疑卷。'],

    ['X1', '联动', '两本台账归档日期必须相同', 'ERROR', '文件台账与案卷台账的归档日期必须完全一致。'],
    ['X2', '联动', '案卷年度 = 卷内文件最晚年度', 'ERROR', '案卷年度须取该卷所有文件中文件日期最晚的那一年。'],
    ['X3', '联动', '文件卷号在案卷台账中存在', 'WARN', '文件台账的所属卷号应能在案卷台账中找到对应案卷。'],
    ['X4', '联动', '无法联动校验的案卷', 'INFO', '无对应文件或卷内全无日期的案卷，仅作记录。']
  ];

  var RULE_MAP = {};
  RULE_CATALOG.forEach(function (r) { RULE_MAP[r[0]] = { id: r[0], ledger: r[1], title: r[2], sev: r[3], desc: r[4] }; });

  var SEV_LABEL = { ERROR: '错误', WARN: '提醒', INFO: '提示' };

  /* ======================== 基础工具 ======================== */

  function cellVal(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') {
      if (v instanceof Date) return v;
      if (Array.isArray(v.richText)) return v.richText.map(function (t) { return t.text; }).join('');
      if ('result' in v) return cellVal(v.result);
      if ('text' in v) return v.text;
      if ('error' in v) return null;
    }
    return v;
  }

  function s(v) {
    v = cellVal(v);
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return String(v);
      return String(v);
    }
    if (v instanceof Date) return fmtDateNum(v);
    return String(v).trim();
  }

  function fmtDateNum(d) {
    return '' + d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
  }

  function isBlank(v) {
    v = cellVal(v);
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }

  function toInt(v) {
    v = cellVal(v);
    if (v === null || v === undefined || typeof v === 'boolean') return null;
    if (typeof v === 'number') return Number.isInteger(v) ? v : null;
    var t = String(v).trim();
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?\d+\.0+$/.test(t)) return parseInt(t, 10);
    return null;
  }

  function parseYmd(n) {
    var t = String(n);
    return new Date(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8));
  }

  function toYmd(v) {
    v = cellVal(v);
    if (isBlank(v)) return { ymd: null, err: null };
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return { ymd: null, err: '非法日期对象' };
      return { ymd: parseInt(fmtDateNum(v), 10), err: null };
    }
    if (typeof v === 'number') {
      if (!Number.isInteger(v)) return { ymd: null, err: '不是整数日期：' + v };
      var st = String(v);
      if (!/^\d{8}$/.test(st)) {
        // Excel 序列号日期
        if (v > 20000 && v < 80000) {
          var dt = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
          return { ymd: parseInt(fmtDateNum(dt), 10), err: null };
        }
        return { ymd: null, err: '不是8位数字（' + v + '）' };
      }
      var d = parseYmd(v);
      if (isNaN(d.getTime()) || +fmtDateNum(d) !== v) return { ymd: null, err: '不是合法日期（' + v + '）' };
      return { ymd: v, err: null };
    }
    var t = String(v).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) {
      var p = t.split('-');
      t = p[0] + String(+p[1]).padStart(2, '0') + String(+p[2]).padStart(2, '0');
    }
    if (!/^\d{8}$/.test(t)) return { ymd: null, err: '不是8位阿拉伯数字（' + t + '）' };
    var dd = parseYmd(t);
    if (isNaN(dd.getTime()) || +fmtDateNum(dd) !== +t) return { ymd: null, err: '不是合法日期（' + t + '）' };
    return { ymd: +t, err: null };
  }

  function todayYmd() { return parseInt(fmtDateNum(new Date()), 10); }

  function weekday(d) { return d.getDay(); }

  function prevWorkday(d) {
    var cur = new Date(d.getTime() - 86400000);
    while (weekday(cur) === 0 || weekday(cur) === 6) cur = new Date(cur.getTime() - 86400000);
    return cur;
  }

  function lastWorkdayOnOrBefore(d) {
    var cur = new Date(d.getTime());
    while (weekday(cur) === 0 || weekday(cur) === 6) cur = new Date(cur.getTime() - 86400000);
    return cur;
  }

  function dateChain(anchorYmd) {
    var gd = parseYmd(anchorYmd);
    var jc = prevWorkday(gd), lj = prevWorkday(jc), bz = prevWorkday(lj);
    return {
      '编制日期': parseInt(fmtDateNum(bz), 10),
      '立卷日期': parseInt(fmtDateNum(lj), 10),
      '检查日期': parseInt(fmtDateNum(jc), 10),
      '归档日期': +anchorYmd
    };
  }

  var CN_WEEK = '日一二三四五六';
  function fmtDate(n) {
    if (!n) return '—';
    var d = parseYmd(n);
    return n + '（' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' 周' + CN_WEEK[weekday(d)] + '）';
  }

  /* ======================== 表格模型 ======================== */

  function makeSheet(header, rows, label) {
    var idx = {}, i;
    for (i = 0; i < header.length; i++) {
      if (header[i] && !(header[i] in idx)) idx[header[i]] = i;
    }
    return { label: label, header: header, index: idx, rows: rows || [] };
  }

  function sheetHas(sh, name) {
    if (name in sh.index) return true;
    var al = ALIASES[name] || [];
    for (var i = 0; i < al.length; i++) if (al[i] in sh.index) return true;
    return false;
  }

  function colOf(sh, name) {
    if (name in sh.index) return sh.index[name];
    var al = ALIASES[name] || [];
    for (var i = 0; i < al.length; i++) if (al[i] in sh.index) return al[i];
    return null;
  }

  function get(sh, row, name) {
    var c = colOf(sh, name);
    if (c === null) return null;
    return row[name] !== undefined ? row[name] : null;
  }

  function distinct(sh, name) {
    var map = new Map(), c = colOf(sh, name);
    if (c === null) return map;
    sh.rows.forEach(function (r) {
      var v = get(sh, r, name);
      if (isBlank(v)) return;
      var k = s(v);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r.__row);
    });
    return map;
  }

  function blankRows(sh, name) {
    if (colOf(sh, name) === null) return [];
    return sh.rows.filter(function (r) { return isBlank(get(sh, r, name)); }).map(function (r) { return r.__row; });
  }

  /* ======================== 报告 ======================== */

  function Report() { this.items = []; }
  Report.prototype.add = function (rule, msg, opt) {
    opt = opt || {};
    this.items.push({ rule: rule, msg: msg, row: opt.row == null ? null : opt.row,
      col: opt.col || null, cur: opt.cur == null ? null : String(opt.cur),
      exp: opt.exp == null ? null : String(opt.exp) });
  };
  Report.prototype.sev = function (rule) { return RULE_MAP[rule].sev; };
  Report.prototype.count = function (sev) {
    return this.items.filter(function (f) { return RULE_MAP[f.rule].sev === sev; }).length;
  };
  Report.prototype.byRule = function () {
    var g = new Map();
    this.items.forEach(function (f) { (g.get(f.rule) || g.set(f.rule, []).get(f.rule)).push(f); });
    return g;
  };

  /* ======================== 通用列检查 ======================== */

  function checkUniformColumn(sh, rep, ruleId, name, baseValue, kind) {
    kind = kind || '固定值';
    if (!sheetHas(sh, name)) {
      rep.add(ruleId, '缺少' + kind + '列「' + name + '」', { col: name });
      return;
    }
    var dist = distinct(sh, name);
    if (dist.size === 0) {
      rep.add(ruleId, kind + '列「' + name + '」整列为空', { col: name, cur: '全空', exp: '需填写' });
      return;
    }
    if (dist.size > 1) {
      var parts = [];
      Array.from(dist.entries()).slice(0, 6).forEach(function (e) {
        parts.push(e[0] + '(' + e[1].length + '行·首行' + e[1][0] + ')');
      });
      rep.add(ruleId, kind + '列「' + name + '」出现 ' + dist.size + ' 个不同值',
        { col: name, cur: parts.join('；'), exp: '全表唯一' });
    }
    if (baseValue !== undefined && baseValue !== null && baseValue !== '') {
      dist.forEach(function (rows, v) {
        if (v !== String(baseValue)) {
          rep.add(ruleId, kind + '列「' + name + '」与模板基准不一致',
            { row: rows[0], col: name, cur: v, exp: baseValue });
        }
      });
    }
  }

  /* ======================== 文件台账检查 ======================== */

  function checkFileLedger(sh, rep, ctx) {
    var baseline = ctx.baseline || {};
    var projectTitle = ctx.projectTitle || DEFAULT_PROJECT_TITLE;
    if (!sh.rows.length) {
      rep.add('F1', '文件台账没有任何数据行', { cur: '0 行', exp: '至少 1 行' });
      return {};
    }

    var baseFile = baseline.file || {};
    FILE_FIXED.forEach(function (n) { checkUniformColumn(sh, rep, 'F1', n, baseFile[n], '固定值'); });
    FILE_UNIFORM.forEach(function (n) { checkUniformColumn(sh, rep, 'F2', n, null, '一致性'); });

    /* --- F3 文件档号 --- */
    var parsed = [], badDh = [];
    sh.rows.forEach(function (r) {
      var dh = s(get(sh, r, '文件档号'));
      if (!dh) { rep.add('F3', '文件档号为空', { row: r.__row, col: '文件档号' }); return; }
      var m = /^(.+)-(\d{3})$/.exec(dh);
      if (!m) {
        badDh.push(r.__row);
        rep.add('F3', '文件档号格式异常，末段应为3位卷内序号',
          { row: r.__row, col: '文件档号', cur: dh, exp: '<所属卷号>-<3位序号>' });
        return;
      }
      parsed.push({ row: r.__row, dh: dh, vol: m[1], seq: parseInt(m[2], 10), rec: r });
    });

    var cnt = new Map();
    parsed.forEach(function (p) { cnt.set(p.dh, (cnt.get(p.dh) || 0) + 1); });
    cnt.forEach(function (n, dh) {
      if (n > 1) {
        var rows = parsed.filter(function (p) { return p.dh === dh; }).map(function (p) { return p.row; });
        rep.add('F3', '文件档号重复 ' + n + ' 次', { row: rows[0], col: '文件档号', cur: dh, exp: '全表唯一' });
        rows.slice(1).forEach(function (rw) {
          rep.add('F3', '与上一行文件档号重复', { row: rw, col: '文件档号', cur: dh });
        });
      }
    });

    parsed.forEach(function (p) {
      var cv = get(sh, p.rec, '所属卷号'), cs = get(sh, p.rec, '卷内序号');
      if (!isBlank(cv) && s(cv) !== p.vol) {
        rep.add('F3', '所属卷号与文件档号拆解结果不符', { row: p.row, col: '所属卷号', cur: s(cv), exp: p.vol });
      }
      if (!isBlank(cs)) {
        var iv = toInt(cs);
        if (iv === null || iv !== p.seq) {
          rep.add('F3', '卷内序号与文件档号末段不符', { row: p.row, col: '卷内序号', cur: s(cs), exp: String(p.seq).padStart(3, '0') });
        }
      }
    });

    /* --- F4 卷内序号连续 --- */
    var vols = new Map();
    parsed.forEach(function (p) {
      if (!vols.has(p.vol)) vols.set(p.vol, []);
      vols.get(p.vol).push([p.seq, p.row]);
    });
    vols.forEach(function (items, vol) {
      var seqs = items.map(function (x) { return x[0]; }).sort(function (a, b) { return a - b; });
      var bad = false, i;
      for (i = 0; i < seqs.length; i++) if (seqs[i] !== i + 1) { bad = true; break; }
      if (!bad) return;
      var set = new Set(seqs), missing = [], dup = [], seen = new Set();
      for (i = 1; i <= seqs.length; i++) if (!set.has(i)) missing.push(i);
      seqs.forEach(function (q) { if (seen.has(q)) dup.push(q); seen.add(q); });
      var parts = [];
      if (missing.length) parts.push('缺 ' + missing.slice(0, 10).map(pad3).join(','));
      if (dup.length) parts.push('重号 ' + Array.from(new Set(dup)).slice(0, 10).map(pad3).join(','));
      rep.add('F4', '卷 ' + vol + ' 的卷内序号不连续（共 ' + seqs.length + ' 件）',
        { row: items[0][1], col: '卷内序号', cur: parts.join('；'), exp: '001 起连续递增' });
    });

    /* --- F5/F6 日期与年度 --- */
    var volAll = new Map();
    if (!sheetHas(sh, '文件日期')) rep.add('F5', '缺少列「文件日期」', { col: '文件日期' });
    if (!sheetHas(sh, '年度')) rep.add('F6', '缺少列「年度」', { col: '年度' });

    sh.rows.forEach(function (r) {
      var raw = get(sh, r, '文件日期');
      var dh = s(get(sh, r, '文件档号'));
      var m = /^(.+)-(\d{3})$/.exec(dh);
      var vol = m ? m[1] : null;
      if (vol) { if (!volAll.has(vol)) volAll.set(vol, []); volAll.get(vol).push([r.__row, null]); }

      if (isBlank(raw)) {
        rep.add('F12', '文件日期为空（该文件本身无日期，属允许项）', { row: r.__row, col: '文件日期', cur: '(空)', exp: '可为空' });
        var yr0 = get(sh, r, '年度');
        if (!isBlank(yr0)) rep.add('F12', '文件日期为空但填了年度，请确认是否笔误', { row: r.__row, col: '年度', cur: s(yr0), exp: '留空' });
        return;
      }
      var res = toYmd(raw);
      if (res.err) {
        rep.add('F5', '文件日期不合法：' + res.err, { row: r.__row, col: '文件日期', cur: s(raw) });
        return;
      }
      var y = Math.floor(res.ymd / 10000);
      if (vol) {
        var arr = volAll.get(vol);
        arr[arr.length - 1][1] = y;
      }
      var yr = toInt(get(sh, r, '年度'));
      if (yr === null) rep.add('F6', '年度为空（文件日期已有值，年度应取前四位）', { row: r.__row, col: '年度', cur: '(空)', exp: y });
      else if (yr !== y) rep.add('F6', '年度与文件日期前四位不符', { row: r.__row, col: '年度', cur: yr, exp: y });
    });

    if (sheetHas(sh, '文件编号')) {
      var bl = blankRows(sh, '文件编号');
      if (bl.length) {
        rep.add('F12', '文件编号有 ' + bl.length + ' 行为空（该文件本身无编号，属允许项）',
          { col: '文件编号', cur: bl.length + ' 行为空（如第 ' + bl.slice(0, 8).join('、') + (bl.length > 8 ? '…' : '') + ' 行）', exp: '可为空' });
      }
    }

    /* --- F7 页数 --- */
    ['文件页数', '文字页数', '图纸页数'].forEach(function (n) {
      if (!sheetHas(sh, n)) rep.add('F7', '缺少列「' + n + '」', { col: n });
    });
    sh.rows.forEach(function (r) {
      var tot = toInt(get(sh, r, '文件页数')), txt = toInt(get(sh, r, '文字页数')), dwg = toInt(get(sh, r, '图纸页数'));
      if (tot === null || txt === null || dwg === null) {
        rep.add('F7', '页数三项存在空值或非数字', {
          row: r.__row, col: '文件页数',
          cur: '文件页数=' + (s(get(sh, r, '文件页数')) || '(空)') + ' / 文字=' + (s(get(sh, r, '文字页数')) || '(空)') + ' / 图纸=' + (s(get(sh, r, '图纸页数')) || '(空)'),
          exp: '三项均需填写数字'
        });
        return;
      }
      if (tot !== txt + dwg) {
        rep.add('F7', '文件页数 ≠ 文字页数 + 图纸页数', {
          row: r.__row, col: '文件页数', cur: tot + ' ≠ ' + txt + '+' + dwg + '=' + (txt + dwg), exp: txt + dwg
        });
      }
    });

    /* --- F8 图纸提醒 --- */
    sh.rows.forEach(function (r) {
      var t = s(get(sh, r, '文件题名'));
      if (t.indexOf('图纸') >= 0 || t.indexOf('原理图') >= 0) {
        var d = toInt(get(sh, r, '图纸页数'));
        rep.add('F8', '题名含「图纸」/「原理图」，请复核图纸页数',
          { row: r.__row, col: '图纸页数', cur: d === null ? '(空)' : d, exp: '按实际图纸张数填写' });
      }
    });

    /* --- F9 题名格式 --- */
    sh.rows.forEach(function (r) {
      var raw = get(sh, r, '文件题名'), t = s(raw);
      if (!t) { rep.add('F9', '文件题名为空', { row: r.__row, col: '文件题名' }); return; }
      if (typeof raw === 'string' && (raw !== raw.trim() || raw.indexOf('\n') >= 0)) {
        rep.add('F9', '文件题名含首尾空格或换行', { row: r.__row, col: '文件题名', cur: JSON.stringify(raw) });
      }
      if (t.indexOf('  ') >= 0) rep.add('F9', '文件题名含连续空格', { row: r.__row, col: '文件题名', cur: t.slice(0, 60) });
      if (t.indexOf(projectTitle) !== 0) {
        rep.add('F9', '文件题名未以项目全称开头', { row: r.__row, col: '文件题名', cur: t.slice(0, 60), exp: projectTitle + '…' });
      } else {
        var rest = t.slice(projectTitle.length);
        if (rest.indexOf('施工') >= 0 && !/施工[^标]{0,12}标/.test(rest)) {
          rep.add('F9', '出现「施工」但紧邻文字不是「施工X标」结构', { row: r.__row, col: '文件题名', cur: rest.slice(0, 40), exp: '施工（一/二/三…）标' });
        }
      }
    });

    /* --- F10/F11 PDF --- */
    var pdfInfo = { enabled: false, matched: 0, missing: 0, pageMismatch: 0, orphan: [] };
    if (ctx.pdfIndex) {
      pdfInfo.enabled = true;
      var used = new Set();
      sh.rows.forEach(function (r) {
        var dh = s(get(sh, r, '文件档号')), t = s(get(sh, r, '文件题名'));
        if (!dh || !t) return;
        var key = dh + t;
        var hit = ctx.pdfIndex.get(key);
        if (!hit) {
          pdfInfo.missing++;
          var near = [];
          ctx.pdfIndex.forEach(function (v, k) { if (k.indexOf(dh) === 0) near.push(k); });
          rep.add('F10', '未找到对应 PDF（文件名应为 档号+题名，一字不差）',
            { row: r.__row, col: '文件题名', cur: key.slice(0, 80), exp: near.length ? ('最相近: ' + near[0].slice(0, 40) + '…') : '目录中无同档号 PDF' });
          return;
        }
        used.add(key);
        pdfInfo.matched++;
        var total = toInt(get(sh, r, '文件页数'));
        if (hit.pages == null) rep.add('F11', 'PDF 页数解析失败', { row: r.__row, col: '文件页数', cur: hit.name });
        else if (total !== null && hit.pages !== total) {
          pdfInfo.pageMismatch++;
          rep.add('F11', 'PDF 实际页数与文件页数不符', { row: r.__row, col: '文件页数', cur: 'PDF=' + hit.pages + ' 页 / 台账=' + total + ' 页', exp: total });
        }
      });
      ctx.pdfIndex.forEach(function (v, k) { if (!used.has(k)) pdfInfo.orphan.push(k); });
      if (pdfInfo.orphan.length) {
        rep.add('F10', 'PDF 目录中有 ' + pdfInfo.orphan.length + ' 个文件未被台账引用',
          { cur: pdfInfo.orphan.slice(0, 5).join('；') + (pdfInfo.orphan.length > 5 ? '…' : '') });
      }
    }

    var dateByVol = new Map();
    volAll.forEach(function (items, vol) {
      var dated = items.filter(function (x) { return x[1] !== null; }).map(function (x) { return [x[1], x[0]]; });
      if (dated.length) dateByVol.set(vol, dated);
    });

    return {
      rows: sh.rows.length,
      vols: Array.from(vols.keys()),
      volAll: volAll,
      dateByVol: dateByVol,
      volTitles: (function () {
        var m = new Map();
        sh.rows.forEach(function (r) {
          var dh = s(get(sh, r, '文件档号'));
          var mm = /^(.+)-(\d{3})$/.exec(dh);
          if (!mm) return;
          if (!m.has(mm[1])) m.set(mm[1], []);
          m.get(mm[1]).push([r.__row, s(get(sh, r, '文件题名')), toInt(get(sh, r, '文件页数')) || 0]);
        });
        return m;
      })(),
      pdf: pdfInfo,
      archiveDates: distinct(sh, '归档日期')
    };
  }

  function pad3(n) { return String(n).padStart(3, '0'); }

  /* ======================== 案卷台账检查 ======================== */

  function checkJuanLedger(sh, rep, ctx) {
    var baseline = ctx.baseline || {};
    if (!sh.rows.length) {
      rep.add('J1', '案卷台账没有任何数据行', { cur: '0 行', exp: '至少 1 行' });
      return {};
    }

    var baseJuan = baseline.juan || {};
    JUAN_FIXED.forEach(function (n) { checkUniformColumn(sh, rep, 'J1', n, baseJuan[n], '固定值'); });
    JUAN_UNIFORM.forEach(function (n) { checkUniformColumn(sh, rep, 'J2', n, null, '一致性'); });

    /* --- J3 案卷档号 --- */
    var parsed = [];
    sh.rows.forEach(function (r) {
      var dan = s(get(sh, r, '案卷档号'));
      if (!dan) { rep.add('J3', '案卷档号为空', { row: r.__row, col: '案卷档号' }); return; }
      var seg = dan.split('-');
      if (seg.length !== 5) {
        rep.add('J3', '案卷档号应为5段结构', { row: r.__row, col: '案卷档号', cur: dan, exp: '全宗号-KJG码-项目代号-分类号-3位案卷号' });
        return;
      }
      [[0, '全宗号'], [2, '项目代号'], [3, '分类号']].forEach(function (p) {
        var want = s(get(sh, r, p[1]));
        if (want && seg[p[0]] !== want) {
          rep.add('J3', '案卷档号第' + (p[0] + 1) + '段与「' + p[1] + '」不符', { row: r.__row, col: '案卷档号', cur: seg[p[0]], exp: want });
        }
      });
      var jh = toInt(get(sh, r, '案卷号'));
      if (jh === null) {
        rep.add('J3', '案卷号为空或非数字', { row: r.__row, col: '案卷号', cur: s(get(sh, r, '案卷号')) });
      } else if (seg[4] !== pad3(jh)) {
        rep.add('J3', '案卷档号末段与案卷号不符', { row: r.__row, col: '案卷档号', cur: seg[4], exp: pad3(jh) });
      }
      parsed.push({ row: r.__row, dan: dan, kjg: seg[1], jh: jh, rec: r });
    });

    var dmap = new Map();
    parsed.forEach(function (p) { dmap.set(p.dan, (dmap.get(p.dan) || 0) + 1); });
    dmap.forEach(function (n, dan) {
      if (n > 1) {
        var rows = parsed.filter(function (p) { return p.dan === dan; }).map(function (p) { return p.row; });
        rep.add('J3', '案卷档号重复 ' + n + ' 次', { row: rows[0], col: '案卷档号', cur: dan, exp: '全表唯一' });
        rows.slice(1).forEach(function (rw) { rep.add('J3', '与上一行案卷档号重复', { row: rw, col: '案卷档号', cur: dan }); });
      }
    });
    var kjg = new Set(parsed.map(function (p) { return p.kjg; }).filter(Boolean));
    if (kjg.size > 1) {
      rep.add('J3', '案卷档号第二段出现 ' + kjg.size + ' 个值', { col: '案卷档号', cur: Array.from(kjg).sort().slice(0, 6).join('、'), exp: '全表唯一' });
    }

    /* --- J4 案卷号流水 --- */
    var nums = parsed.filter(function (p) { return p.jh !== null; });
    if (nums.length) {
      var seq = nums.map(function (p) { return p.jh; }).sort(function (a, b) { return a - b; });
      var dupMap = new Map();
      seq.forEach(function (v) { dupMap.set(v, (dupMap.get(v) || 0) + 1); });
      dupMap.forEach(function (n, k) {
        if (n > 1) {
          var rows = nums.filter(function (p) { return p.jh === k; }).map(function (p) { return p.row; });
          rep.add('J4', '案卷号重复（=' + k + '）', { row: rows[0], col: '案卷号', cur: rows.join('、'), exp: '唯一' });
        }
      });
      var lo = seq[0], hi = seq[seq.length - 1], have = new Set(seq), missing = [];
      for (var i = lo; i <= hi; i++) if (!have.has(i)) missing.push(i);
      if (missing.length) {
        rep.add('J4', '案卷号流水不连续（本本范围 ' + lo + '–' + hi + '）', { col: '案卷号', cur: '缺 ' + missing.slice(0, 20).join('、'), exp: '范围内无缺号' });
      }
    }

    /* --- J5 四日期倒推链 / J8 归档当日 --- */
    var anchorToday = parseInt(fmtDateNum(lastWorkdayOnOrBefore(new Date())), 10);
    var realToday = todayYmd();
    sh.rows.forEach(function (r) {
      var got = {}, bad = false;
      ['编制日期', '立卷日期', '检查日期', '归档日期'].forEach(function (cn) {
        var res = toYmd(get(sh, r, cn));
        if (res.err) { rep.add('J5', cn + '不合法：' + res.err, { row: r.__row, col: cn, cur: s(get(sh, r, cn)) }); bad = true; }
        got[cn] = res.ymd;
      });
      if (bad) return;
      var want = dateChain(got['归档日期']);
      ['编制日期', '立卷日期', '检查日期'].forEach(function (cn) {
        if (got[cn] !== want[cn]) {
          rep.add('J5', cn + '应为归档日往前逐个工作日倒推的结果', {
            row: r.__row, col: cn, cur: fmtDate(got[cn]),
            exp: fmtDate(want[cn]) + '（由归档 ' + fmtDate(got['归档日期']) + ' 倒推）'
          });
        }
      });
      if (got['归档日期'] !== anchorToday) {
        rep.add('J8', '归档日期不是当日，请确认为补录历史还是应改成今天', {
          row: r.__row, col: '归档日期', cur: fmtDate(got['归档日期']),
          exp: fmtDate(anchorToday) + (anchorToday !== realToday ? '（今天为休息日，取最近工作日）' : '（今天）')
        });
      }
    });

    /* --- J6 正副本数 --- */
    if (sheetHas(sh, '正副本数')) {
      sh.rows.forEach(function (r) {
        var v = toInt(get(sh, r, '正副本数'));
        if (v === null) rep.add('J6', '正副本数为空或非数字', { row: r.__row, col: '正副本数', cur: s(get(sh, r, '正副本数')), exp: 1 });
        else if (v !== 1) rep.add('J6', '正副本数不是 1', { row: r.__row, col: '正副本数', cur: v, exp: 1 });
      });
    }

    var volRow = new Map(), yearByVol = new Map(), spine = new Map();
    sh.rows.forEach(function (r) {
      var dan = s(get(sh, r, '案卷档号'));
      if (!dan) return;
      volRow.set(dan, r.__row);
      yearByVol.set(dan, [sheetHas(sh, '年度') ? toInt(get(sh, r, '年度')) : null, r.__row]);
      spine.set(dan, s(get(sh, r, '脊背宽度')));
    });

    return {
      rows: sh.rows.length,
      vols: parsed.map(function (p) { return p.dan; }),
      yearByVol: yearByVol, volRow: volRow, spine: spine,
      archiveDates: distinct(sh, '归档日期')
    };
  }

  /* ======================== 跨台账联动 ======================== */

  function checkCross(fi, ji, rep) {
    var fd = fi.archiveDates || new Map(), jd = ji.archiveDates || new Map();
    if (!fd.size) rep.add('X1', '文件台账归档日期全为空，无法联动校验', { cur: '(空)', exp: '8位日期' });
    else if (!jd.size) rep.add('X1', '案卷台账归档日期全为空，无法联动校验', { cur: '(空)', exp: '8位日期' });
    else if (fd.size === 1 && jd.size === 1) {
      var fv = Array.from(fd.keys())[0], jv = Array.from(jd.keys())[0];
      if (fv !== jv) rep.add('X1', '两本台账的归档日期不相同', { col: '归档日期', cur: '文件台账=' + fv + ' / 案卷台账=' + jv, exp: '两者一致' });
    } else {
      rep.add('X1', '归档日期存在多个值，无法确定比对基准', { col: '归档日期', cur: '文件台账 ' + fd.size + ' 个值 / 案卷台账 ' + jd.size + ' 个值', exp: '各本内部唯一' });
    }

    var volAll = fi.volAll || new Map(), dateByVol = fi.dateByVol || new Map();
    if (!volAll.size) { rep.add('X2', '文件台账无可识别的卷号，无法联动校验年度', { cur: '(空)', exp: '—' }); return; }

    ji.yearByVol.forEach(function (v, vol) {
      var y = v[0], rowNo = v[1];
      if (!volAll.has(vol)) {
        rep.add('X4', '案卷 ' + vol + ' 在文件台账中无对应文件，年度无法校验', { row: rowNo, col: '年度', cur: '年度=' + (y === null ? '(空)' : y), exp: '—' });
        return;
      }
      var items = dateByVol.get(vol);
      if (!items) {
        rep.add('X4', '案卷 ' + vol + ' 的卷内文件全都没有日期，年度无法校验', { row: rowNo, col: '年度', cur: '年度=' + (y === null ? '(空)' : y), exp: '—' });
        return;
      }
      var best = items[0];
      items.forEach(function (it) { if (it[0] > best[0]) best = it; });
      if (y === null) rep.add('X2', '案卷年度为空', { row: rowNo, col: '年度', cur: '(空)', exp: best[0] });
      else if (y !== best[0]) rep.add('X2', '案卷年度应取卷内文件最晚年份', { row: rowNo, col: '年度', cur: y, exp: best[0] + '（来自文件台账第 ' + best[1] + ' 行）' });
    });

    var juanVols = new Set(ji.vols || []);
    if (juanVols.size) {
      dateByVol.forEach(function (items, vol) {
        if (!juanVols.has(vol)) {
          rep.add('X3', '文件台账的所属卷号在案卷台账中不存在', { row: items[0][1], col: '所属卷号', cur: vol, exp: '应存在于案卷台账' });
        }
      });
    }
  }

  /* ======================== 可疑案卷 ======================== */

  var DOC_TYPES = ['例行检验报告', '出厂测试报告', '点检检查表', '出厂检验报告', '出厂试验报告',
    '试验报告', '检验报告', '检测报告', '检测单', '试验单', '合格证', '保修卡', '说明书',
    '技术协议', '装箱单', '报价单', '发票', '原理图', '图纸', '清单', '鉴定书', '证书', '用户手册', '证明'];

  function docTypeOf(title) {
    for (var i = 0; i < DOC_TYPES.length; i++) if (title.indexOf(DOC_TYPES[i]) >= 0) return DOC_TYPES[i];
    return null;
  }
  function subarraysOf(title) {
    var out = new Set(), m, re = /(\d{1,3})\s*子阵/g;
    while ((m = re.exec(title))) out.add(m[1].padStart(3, '0'));
    return out;
  }

  function checkSuspicious(fi, ji, rep, opts) {
    opts = opts || {};
    var volTitles = fi.volTitles || new Map();
    var volRow = ji.volRow || new Map(), spine = ji.spine || new Map();
    if (!volTitles.size) { rep.add('J9', '文件台账无可识别的卷号，跳过可疑案卷扫描', { cur: '—', exp: '—' }); return; }

    var targets = Array.from(volTitles.keys()).filter(function (v) { return !volRow.size || volRow.has(v); });
    if (!targets.length) { rep.add('J9', '文件台账中的卷号与案卷台账无一对应，跳过可疑案卷扫描', { cur: '—', exp: '—' }); return; }

    var clsOf = {}, byCls = new Map();
    targets.forEach(function (v) {
      var seg = v.split('-');
      var cls = seg.length >= 4 ? seg[3] : '?';
      clsOf[v] = cls;
      if (!byCls.has(cls)) byCls.set(cls, []);
      byCls.get(cls).push(v);
    });

    var suspects = new Map();
    function mark(v, why) { if (!suspects.has(v)) suspects.set(v, []); suspects.get(v).push(why); }

    byCls.forEach(function (vols) {
      // A 件数离群
      if (vols.length >= 3) {
        var counts = vols.map(function (v) { return volTitles.get(v).length; }).sort(function (a, b) { return a - b; });
        var median = counts[Math.floor(counts.length / 2)];
        if (median >= 4) {
          vols.forEach(function (v) {
            var c = volTitles.get(v).length;
            if (c < median * 0.6) mark(v, '件数仅 ' + c + ' 件，同类 ' + vols.length + ' 卷中位数 ' + median + ' 件');
          });
        }
      }
      // C 子阵覆盖
      var subOf = new Map(), covered = [];
      vols.forEach(function (v) {
        var st = new Set();
        volTitles.get(v).forEach(function (it) { subarraysOf(it[1]).forEach(function (x) { st.add(x); }); });
        subOf.set(v, st);
        if (st.size) covered.push(v);
      });
      if (covered.length >= 2) {
        var typical = new Set();
        covered.forEach(function (v) { if (subOf.get(v).size >= 2) subOf.get(v).forEach(function (x) { typical.add(x); }); });
        if (typical.size >= 2) {
          covered.forEach(function (v) {
            var mine = subOf.get(v);
            if (mine.size && mine.size < typical.size) {
              var miss = Array.from(typical).filter(function (x) { return !mine.has(x); });
              if (miss.length) mark(v, '只覆盖子阵 ' + Array.from(mine).sort().join('、') + '，同类普遍覆盖 ' + Array.from(typical).sort().join('、'));
            }
          });
        }
      }
    });

    // B 单据类型离群
    targets.forEach(function (v) {
      var items = volTitles.get(v), n = items.length;
      if (n < 5) return;
      var counter = new Map();
      items.forEach(function (it) {
        var t = docTypeOf(it[1]);
        if (t) counter.set(t, (counter.get(t) || 0) + 1);
      });
      counter.forEach(function (c, t) {
        if (c <= 2 && c / n <= 0.25) {
          var rows = items.filter(function (it) { return docTypeOf(it[1]) === t; }).map(function (it) { return it[0]; });
          mark(v, '卷内 ' + n + ' 件中有 ' + c + ' 件属「' + t + '」（第 ' + rows.slice(0, 5).join('、') + ' 行），与其余单据类型明显不同');
        }
      });
    });

    // D 页数与脊背宽度不匹配（新增）：按「每毫米承载页数」比较同类卷
    if (opts.checkSpineThickness !== false) {
      byCls.forEach(function (vols) {
        if (vols.length < 2) return;
        var pv = vols.map(function (v) {
          var pages = volTitles.get(v).reduce(function (a, it) { return a + (it[2] || 0); }, 0);
          var sp = parseFloat(spine.get(v));
          return { vol: v, pages: pages, spine: isNaN(sp) ? null : sp };
        }).filter(function (x) { return x.spine > 0 && x.pages > 0; });
        if (pv.length < 2) return;

        pv.forEach(function (x) { x.density = x.pages / x.spine; });
        var best = pv[0];
        pv.forEach(function (x) { if (x.density > best.density) best = x; });

        pv.forEach(function (x) {
          if (x === best) return;
          // 同类中最「厚」的那卷：每毫米承载页数明显偏低，说明脊背宽度给大了
          if (best.density / x.density >= 3) {
            mark(x.vol, '卷内共 ' + x.pages + ' 页、脊背 ' + x.spine + 'mm（每毫米仅 ' +
              x.density.toFixed(2) + ' 页），而 ' + best.vol.slice(-3) + ' 卷 ' +
              best.pages + ' 页也是 ' + best.spine + 'mm（每毫米 ' + best.density.toFixed(2) +
              ' 页），厚度与页数明显不匹配');
          }
        });
      });
    }

    suspects.forEach(function (whys, v) {
      rep.add('J7', '可疑案卷，请复核脊背宽度：' + Array.from(new Set(whys)).join('；'), {
        row: volRow.get(v) || null, col: '脊背宽度', cur: spine.get(v) || '(空)', exp: '按实际卷皮厚度复核'
      });
    });
    if (suspects.size) rep.add('J9', '已扫描 ' + targets.length + ' 个案卷，命中 ' + suspects.size + ' 个可疑卷', { cur: '—', exp: '—' });
    else rep.add('J9', '已扫描 ' + targets.length + ' 个案卷（件数 / 单据类型 / 子阵覆盖 / 页数-脊背 四个维度），未发现可疑卷', { cur: '—', exp: '—' });
  }

  /* ======================== 对外检查入口 ======================== */

  function check(fileSheet, juanSheet, ctx) {
    ctx = ctx || {};
    var rep = new Report();
    var fi = null, ji = null;
    if (fileSheet) fi = checkFileLedger(fileSheet, rep, ctx);
    if (juanSheet) ji = checkJuanLedger(juanSheet, rep, ctx);
    if (fi && ji) { checkCross(fi, ji, rep); checkSuspicious(fi, ji, rep, ctx); }
    return {
      items: rep.items,
      errors: rep.count('ERROR'),
      warns: rep.count('WARN'),
      infos: rep.count('INFO')
    };
  }

  /* ======================== 台账生成 ======================== */

  var GEN_ALIASES = {
    '案卷档号': ['案卷档号', '档号', '卷号'],
    '案卷题名': ['案卷题名', '案卷提名', '卷题名'],
    '脊背宽度': ['脊背宽度', '卷脊宽度', '脊背'],
    '文件题名': ['文件题名', '文件提名', '题名', '文件名称'],
    '文件编号': ['文件编号', '编号', '文号'],
    '文件日期': ['文件日期', '日期', '成文日期'],
    '责任者': ['责任者', '责任人', '作者'],
    '页数': ['页数', '文件页数', '总页数'],
    '图纸页数': ['图纸页数'],
    '文字页数': ['文字页数'],
    '分类名称': ['分类名称'],
    '保管期限': ['保管期限'],
    '保管期限代码': ['保管期限代码'],
    '厂家': ['厂家', '厂商'],
    '施工标段': ['施工标段', '施工标'],
    '子阵': ['子阵', '台号']
  };

  function composeTitle(raw, projectTitle, changjia, shigong, zizhen) {
    var t = String(raw || '').trim();
    if (t.indexOf(projectTitle) === 0) return t;
    var parts = [projectTitle];
    if (changjia) parts.push(String(changjia).trim());
    if (shigong) {
      var g = String(shigong).trim();
      if (g.indexOf('施工') !== 0) g = '施工' + g;
      if (!/标$/.test(g)) g += '标';
      parts.push(g);
    }
    if (zizhen) {
      var z = String(zizhen).trim();
      if (/^\d{1,3}$/.test(z)) z = String(+z).padStart(3, '0') + '子阵';
      else if (/^\d{1,3}子阵$/.test(z)) z = String(+z.replace('子阵', '')).padStart(3, '0') + '子阵';
      parts.push(z);
    }
    parts.push(t);
    return parts.join('');
  }

  function buildLedgers(records, opts) {
    opts = opts || {};
    var baseline = opts.baseline || {};
    var catMap = opts.categoryMap || {};
    var projectTitle = opts.projectTitle || DEFAULT_PROJECT_TITLE;
    var anchor = opts.anchor || parseInt(fmtDateNum(lastWorkdayOnOrBefore(new Date())), 10);
    var chain = dateChain(anchor);
    var baseF = baseline.file || {}, baseJ = baseline.juan || {};
    var errors = [], warns = [];

    /* 归组 */
    var vols = new Map();
    records.forEach(function (rec, i) {
      var dan = s(rec['案卷档号']);
      if (!dan) { errors.push('第 ' + (i + 2) + ' 行：案卷档号为空，无法归卷'); return; }
      if (!vols.has(dan)) vols.set(dan, []);
      vols.get(dan).push(rec);
    });
    if (!records.length) errors.push('清单没有任何数据行');

    function firstNonBlank(items, f) {
      for (var i = 0; i < items.length; i++) if (!isBlank(items[i][f])) return s(items[i][f]);
      return '';
    }

    var fileRows = [], juanRows = [], volMeta = [];
    vols.forEach(function (items, dan) {
      var seg = dan.split('-');
      if (seg.length !== 5) { errors.push('案卷档号「' + dan + '」不是 5 段结构（全宗号-KJG码-项目代号-分类号-3位案卷号）'); return; }
      var cls = seg[3], jh = toInt(seg[4]);
      if (jh === null) { errors.push('案卷档号「' + dan + '」末段不是数字'); return; }
      if (seg[4] !== pad3(jh)) warns.push('案卷档号「' + dan + '」末段不是 3 位补零（建议 ' + pad3(jh) + '）');

      var meta = catMap[cls] || {};
      var cname = firstNonBlank(items, '分类名称') || s(meta['分类名称']);
      var keep = firstNonBlank(items, '保管期限') || s(meta['保管期限']);
      var kcode = firstNonBlank(items, '保管期限代码') || s(meta['保管期限代码']);
      if (!cname) errors.push('分类号「' + cls + '」未在分类映射表中收录，且清单未提供分类名称');
      if (!keep || !kcode) warns.push('分类号「' + cls + '」的保管期限/代码未收录，已留空');

      var title = firstNonBlank(items, '案卷题名');
      if (!title) errors.push('案卷「' + dan + '」缺少案卷题名');
      var spine = firstNonBlank(items, '脊背宽度');
      if (!spine) warns.push('案卷「' + dan + '」未提供脊背宽度，已留空');

      var files = [];
      items.forEach(function (rec) {
        var rawT = s(rec['文件题名']);
        if (!rawT) { errors.push('第 ' + (rec.__line || '?') + ' 行：文件题名为空'); return; }
        var fullT = composeTitle(rawT, projectTitle, s(rec['厂家']), s(rec['施工标段']), s(rec['子阵']));
        var yres = toYmd(rec['文件日期']);
        if (yres.err) errors.push('第 ' + (rec.__line || '?') + ' 行：文件日期 ' + yres.err);
        var page = toInt(rec['页数']);
        if (page === null) { errors.push('第 ' + (rec.__line || '?') + ' 行：页数为空或非数字'); page = 0; }
        var dwg = toInt(rec['图纸页数']); dwg = dwg === null ? 0 : dwg;
        var txt = toInt(rec['文字页数']); txt = txt === null ? page - dwg : txt;
        if (txt + dwg !== page) { warns.push('第 ' + (rec.__line || '?') + ' 行：文字+图纸 ≠ 页数，已按 页数-图纸 重算'); txt = page - dwg; }
        if (txt < 0) { errors.push('第 ' + (rec.__line || '?') + ' 行：图纸页数大于页数'); txt = 0; }
        files.push({
          seq: files.length + 1, dh: dan + '-' + pad3(files.length + 1),
          title: fullT, no: s(rec['文件编号']), ymd: yres.ymd,
          year: yres.ymd ? Math.floor(yres.ymd / 10000) : null,
          owner: s(rec['责任者']), pages: page, txt: txt, dwg: dwg
        });
      });
      if (!files.length) { errors.push('案卷「' + dan + '」没有任何有效文件'); return; }

      var years = files.map(function (f) { return f.year; }).filter(function (y) { return y !== null; });
      volMeta.push({ dan: dan, seg: seg, cls: cls, jh: jh, cname: cname, keep: keep, kcode: kcode, title: title, spine: spine, year: years.length ? Math.max.apply(null, years) : null, files: files });
    });

    if (errors.length) return { errors: errors, warns: warns, fileRows: [], juanRows: [], volumes: [], chain: chain, anchor: anchor };

    volMeta.forEach(function (v) {
      var seg = v.seg;
      var clsNum = toInt(v.cls); var clsVal = clsNum === null ? v.cls : clsNum;
      v.files.forEach(function (f) {
        fileRows.push({
          '项目代号': baseF['项目代号'] || seg[2], '项目排序号': baseF['项目排序号'] || '01',
          '所属卷号': v.dan, '卷内序号': f.seq, '文件档号': f.dh, '文件题名': f.title,
          '文件编号': f.no, '责任者': f.owner, '文件日期': f.ymd, '分类号': clsVal,
          '分类名称': v.cname, '年度': f.year, '所属部门': baseF['所属部门'],
          '保管期限': v.keep, '保管期限代码': v.kcode,
          '文件页数': f.pages, '文字页数': f.txt, '图纸页数': f.dwg,
          '归档部门': baseF['归档部门'], '全宗号': baseF['全宗号'], '归档人': baseF['归档人'],
          '归档日期': chain['归档日期'], '归档份数': '1', '存放地点': baseF['存放地点'],
          '数字化': baseF['数字化'], '实体归档情况': baseF['实体归档情况'],
          '全宗名称': baseF['全宗名称'], '立档单位名称': baseF['立档单位名称'],
          '案卷档号': v.dan, '__cls': String(clsVal)
        });
      });
      juanRows.push({
        '项目排序号': baseJ['项目排序号'] || '01', '项目代号': baseJ['项目代号'] || seg[2],
        '分类号': clsVal, '案卷号': v.jh, '案卷档号': v.dan, '案卷题名': v.title,
        '分类名称': v.cname, '所属部门': baseJ['所属部门'], '编制单位': baseJ['编制单位'],
        '编制日期': chain['编制日期'], '立卷单位': baseJ['立卷单位'], '立卷人': baseJ['立卷人'],
        '立卷日期': chain['立卷日期'], '检查人': baseJ['检查人'], '检查日期': chain['检查日期'],
        '归档部门': baseJ['归档部门'], '保管期限': v.keep, '年度': v.year,
        '保管期限代码': v.kcode, '全宗号': baseJ['全宗号'], '归档人': baseJ['归档人'],
        '归档日期': chain['归档日期'], '归档份数': baseJ['归档份数'] || '1',
        '脊背宽度': v.spine, '存放地点': baseJ['存放地点'], '数字化': baseJ['数字化'],
        '装订方法': baseJ['装订方法'], '实体归档情况': baseJ['实体归档情况'],
        '全宗名称': baseJ['全宗名称'], '立档单位名称': baseJ['立档单位名称'],
        '正副本数': 1, '__cls': String(clsVal)
      });
    });

    return { errors: errors, warns: warns, fileRows: fileRows, juanRows: juanRows, volumes: volMeta, chain: chain, anchor: anchor };
  }

  /* ======================== PDF 页数估算 ======================== */

  function countPdfPages(buffer) {
    try {
      var bytes = new Uint8Array(buffer);
      var text = '';
      var CHUNK = 65536;
      for (var i = 0; i < bytes.length; i += CHUNK) {
        text += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
      }
      var count = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
      if (count > 0) return count;
      var c2 = (text.match(/\/Count\s+(\d+)/g) || []).map(function (m) { return parseInt(m.replace(/[^\d]/g, ''), 10); });
      if (c2.length) return Math.max.apply(null, c2);
      return null;
    } catch (e) { return null; }
  }

  return {
    ENGINE_DOC_NO: ENGINE_DOC_NO,
    RULE_CATALOG: RULE_CATALOG, RULE_MAP: RULE_MAP, SEV_LABEL: SEV_LABEL,
    FILE_FIXED: FILE_FIXED, FILE_UNIFORM: FILE_UNIFORM,
    JUAN_FIXED: JUAN_FIXED, JUAN_UNIFORM: JUAN_UNIFORM,
    DEFAULT_PROJECT_TITLE: DEFAULT_PROJECT_TITLE,
    makeSheet: makeSheet, cellVal: cellVal,
    s: s, isBlank: isBlank, toInt: toInt, toYmd: toYmd,
    fmtDate: fmtDate, dateChain: dateChain, fmtDateNum: fmtDateNum,
    todayYmd: todayYmd, lastWorkdayOnOrBefore: lastWorkdayOnOrBefore,
    check: check, buildLedgers: buildLedgers, composeTitle: composeTitle,
    countPdfPages: countPdfPages, pad3: pad3
  };
});
