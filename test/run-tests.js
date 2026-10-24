#!/usr/bin/env node
/**
 * 规则引擎自测
 * 运行：node test/run-tests.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const E = require('../assets/engine/engine.js');
const ExcelJS = require('../assets/vendor/exceljs.min.js');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = loadData('LEDGER_BASELINE');
const CATMAP = loadData('LEDGER_CATEGORY_MAP');

function loadData(key) {
  const src = fs.readFileSync(path.join(ROOT, 'assets/engine/data.js'), 'utf8');
  const m = new RegExp('window\\.' + key + '\\s*=\\s*([\\s\\S]*?);\\s*\\nwindow\\.').exec(src + '\nwindow.__END__');
  if (!m) throw new Error('无法解析 ' + key);
  return JSON.parse(m[1]);
}

/* ---------- 简易断言 ---------- */
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { fail++; failures.push(name); console.log('  \x1b[31m✗\x1b[0m ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(a, b, name) { ok(a === b, name, '期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a)); }

/* ---------- 读取 xlsx 为引擎 sheet ---------- */
async function loadSheet(file, label) {
  const wb = new ExcelJS.Workbook();
  const buf = fs.readFileSync(file);
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const ws = wb.worksheets[0];
  const header = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { header[col - 1] = E.s(c.value); });
  while (header.length && header[header.length - 1] === '') header.pop();
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
    if (rowNo === 1) return;
    const vals = {}; let any = false;
    for (let i = 0; i < header.length; i++) {
      if (!header[i]) continue;
      const v = E.cellVal(row.getCell(i + 1).value);
      vals[header[i]] = v;
      if (!E.isBlank(v)) any = true;
    }
    if (any) { vals.__row = rowNo; rows.push(vals); }
  });
  return E.makeSheet(header, rows, label);
}

(async function main() {
  console.log('\n\x1b[1m档案台账工作台 · 引擎自测\x1b[0m  ' + E.ENGINE_DOC_NO + '\n');

  /* ---------- 1. 日期倒推链 ---------- */
  console.log('\x1b[1m[1] 日期倒推链\x1b[0m');
  const c1 = E.dateChain(20261023);   // 周五
  eq(c1['归档日期'], 20261023, '归档=锚点');
  eq(c1['检查日期'], 20261022, '周五锚点 → 检查=周四');
  eq(c1['立卷日期'], 20261021, '立卷=周三');
  eq(c1['编制日期'], 20261020, '编制=周二');

  const c2 = E.dateChain(20261026);   // 周一
  eq(c2['检查日期'], 20261023, '周一锚点 → 检查跳过周末到上周五');
  eq(c2['立卷日期'], 20261022, '立卷=上周四');
  eq(c2['编制日期'], 20261021, '编制=上周三');

  const c3 = E.dateChain(20261025);   // 周日
  eq(c3['检查日期'], 20261023, '周日锚点 → 检查=上周五');

  /* ---------- 2. 题名拼装 ---------- */
  console.log('\n\x1b[1m[2] 题名拼装\x1b[0m');
  const PRE = E.DEFAULT_PROJECT_TITLE;
  eq(E.composeTitle('合格证', PRE, '', '三标', '1'), PRE + '施工三标001子阵合格证', '补全项目全称+施工标段+子阵');
  eq(E.composeTitle('合格证', PRE, '某厂家', '', ''), PRE + '某厂家合格证', '补全厂家');
  eq(E.composeTitle(PRE + '已完整题名', PRE, '某厂家', '三标', '1'), PRE + '已完整题名', '已带前缀则原样返回');

  /* ---------- 3. 真实台账检查 ---------- */
  console.log('\n\x1b[1m[3] 检查真实台账（samples/）\x1b[0m');
  const fileSheet = await loadSheet(path.join(ROOT, 'samples/导入模板-文件台账.xlsx'), '文件台账');
  const juanSheet = await loadSheet(path.join(ROOT, 'samples/导入模板-案卷台账.xlsx'), '案卷台账');
  ok(fileSheet.rows.length > 0, '文件台账读到 ' + fileSheet.rows.length + ' 行');
  ok(juanSheet.rows.length > 0, '案卷台账读到 ' + juanSheet.rows.length + ' 行');

  const ctx = { baseline: BASELINE, projectTitle: BASELINE.project_title };
  const r1 = E.check(fileSheet, juanSheet, ctx);
  eq(r1.errors, 0, '真实台账：0 错误');
  ok(r1.warns >= 0, '真实台账：' + r1.warns + ' 条提醒');
  ok(r1.infos > 0, '真实台账：有 ' + r1.infos + ' 条提示（允许项）');
  // 该样本三卷脊背都是 50mm，但页数 20 / 394 / 511，应被「页数-脊背」维度识别
  const j7 = r1.items.filter(i => i.rule === 'J7');
  ok(j7.length >= 1, '页数-脊背不匹配被识别为可疑卷（' + j7.length + ' 条）');
  ok(j7.every(i => /每毫米/.test(i.msg)), '可疑卷提醒写明了判定依据');

  /* ---------- 4. 注入缺陷能检出 ---------- */
  console.log('\n\x1b[1m[4] 缺陷检出能力\x1b[0m');
  const broken = JSON.parse(JSON.stringify(fileSheet));
  broken.rows[0]['文件页数'] = 999;               // F7 页数不等式
  broken.rows[1]['文件档号'] = broken.rows[0]['文件档号'];  // F3 档号重复
  broken.rows[2]['年度'] = 1999;                  // F6 年度不符
  const r2 = E.check(broken, null, ctx);
  ok(r2.errors >= 3, '注入 3 处缺陷 → 检出 ' + r2.errors + ' 个错误');
  const ids = new Set(r2.items.map(i => i.rule));
  ok(ids.has('F7'), '检出 F7 页数等式');
  ok(ids.has('F3'), '检出 F3 档号重复');
  ok(ids.has('F6'), '检出 F6 年度不符');

  /* ---------- 5. 生成器闭环 ---------- */
  console.log('\n\x1b[1m[5] 生成器闭环（生成 → 回检）\x1b[0m');
  const recs = [
    { '案卷档号': 'D0109-KJG01-0011-916-001', '案卷题名': '箱式变压器', '脊背宽度': '30mm',
      '文件题名': '光伏发电用变压器产品质量合格证、出厂试验报告', '文件编号': 'X001',
      '文件日期': 20250325, '责任者': '某厂家', '页数': 3, __line: 2 },
    { '案卷档号': 'D0109-KJG01-0011-916-001', '案卷题名': '箱式变压器', '脊背宽度': '30mm',
      '文件题名': '真空断路器合格证、检验报告、原理图', '文件编号': '',
      '文件日期': 20250306, '责任者': '某厂家', '页数': 2, __line: 3 },
    { '案卷档号': 'D0109-KJG01-0011-800-001', '案卷题名': '立项核准', '脊背宽度': '20mm',
      '文件题名': '项目备案告知书', '文件编号': '2403-001',
      '文件日期': 20240326, '责任者': '某机关', '页数': 1, __line: 4 }
  ];
  const g = E.buildLedgers(recs, { baseline: BASELINE, categoryMap: CATMAP, anchor: 20261023 });
  eq(g.errors.length, 0, '生成无错误');
  eq(g.volumes.length, 2, '归出 2 个案卷');
  eq(g.fileRows.length, 3, '生成 3 条文件记录');
  eq(g.fileRows[0]['文件档号'], 'D0109-KJG01-0011-916-001-001', '文件档号构成正确');
  eq(g.fileRows[0]['年度'], 2025, '年度取日期前四位');
  eq(g.fileRows[1]['文字页数'], 2, '文字页数=页数-图纸');
  eq(g.juanRows[0]['年度'], 2025, '案卷年度取卷内最晚');
  eq(String(g.fileRows[0]['分类号']), '916', '分类号从档号提取');
  eq(g.fileRows[0]['分类名称'], '箱式变压器', '分类名称查映射表');

  // 用生成的记录反检：构造引擎 sheet
  const hf = ['项目代号', '项目排序号', '所属卷号', '卷内序号', '文件档号', '文件题名', '文件编号',
    '责任者', '文件日期', '分类号', '分类名称', '年度', '所属部门', '保管期限', '保管期限代码',
    '文件页数', '文字页数', '图纸页数', '归档部门', '全宗号', '归档人', '归档日期', '归档份数',
    '存放地点', '数字化', '实体归档情况', '全宗名称', '立档单位名称', '案卷档号'];
  const hj = ['项目排序号', '项目代号', '分类号', '案卷号', '案卷档号', '案卷题名', '分类名称',
    '所属部门', '编制单位', '编制日期', '立卷单位', '立卷人', '立卷日期', '检查人', '检查日期',
    '归档部门', '保管期限', '年度', '保管期限代码', '全宗号', '归档人', '归档日期', '归档份数',
    '脊背宽度', '存放地点', '数字化', '装订方法', '实体归档情况', '全宗名称', '立档单位名称', '正副本数'];
  const toRows = (arr, hdr) => arr.map((d, i) => {
    const o = { __row: i + 2 };
    hdr.forEach(h => { o[h] = d[h]; });
    return o;
  });
  const gs = E.makeSheet(hf, toRows(g.fileRows.filter(r => r.__cls === '916'), hf), '文件');
  const gj = E.makeSheet(hj, toRows(g.juanRows.filter(r => r.__cls === '916'), hj), '案卷');
  const r3 = E.check(gs, gj, ctx);
  const r3err = r3.items.filter(i => E.RULE_MAP[i.rule].sev === 'ERROR');
  eq(r3err.length, 0, '生成结果回检：0 错误' +
    (r3err.length ? '（' + r3err.map(x => x.rule + ':' + x.msg).join('; ') + '）' : ''));
  ok(r3.items.some(i => i.rule === 'F8'), '含「原理图」的题名触发 F8 提醒（符合预期）');

  /* ---------- 6. 允许项不误报 ---------- */
  console.log('\n\x1b[1m[6] 允许为空不误报\x1b[0m');
  const noDate = JSON.parse(JSON.stringify(gs));
  noDate.rows[0]['文件日期'] = null;
  noDate.rows[0]['年度'] = null;
  const r4 = E.check(noDate, null, ctx);
  eq(r4.errors, 0, '文件日期为空不判错');
  ok(r4.items.some(i => i.rule === 'F12'), '空日期记入 F12 提示');

  /* ---------- 7. 案卷号不从 1 开始 ---------- */
  console.log('\n\x1b[1m[7] 案卷号允许不从 1 开始\x1b[0m');
  const r5 = E.check(gs, gj, ctx);
  const j4 = r5.items.filter(i => i.rule === 'J4');
  eq(j4.length, 0, '案卷号 1、2 连续，无告警');

  const gj3 = JSON.parse(JSON.stringify(gj));
  const extra = JSON.parse(JSON.stringify(gj3.rows[0]));
  extra.__row = 3;
  extra['案卷号'] = 5;
  extra['案卷档号'] = 'D0109-KJG01-0011-916-005';
  extra['脊背宽度'] = '40mm';
  gj3.rows.push(extra);
  eq(gj3.rows.length, 2, '构造两卷用于流水检测');
  const r6 = E.check(gs, gj3, ctx);
  ok(r6.items.some(i => i.rule === 'J4' && /不连续/.test(i.msg)), '跳号 1→5 能被检出');

  /* ---------- 8. PDF 补录启发式 ---------- */
  console.log('\n\x1b[1m[8] PDF 补录启发式\x1b[0m');
  const B = require('../assets/engine/backfill.js');

  const certText = `产品合格证
宁波奥克斯智能科技股份有限公司
产品名称：光伏发电用变压器
型号规格：ZGS11-Z.G-1000/35
产品编号：TKG711510002
出厂编号：TKG711510002
检验日期：2025年3月25日
签发日期：2025-03-25
文件档号：D0109-KJG01-0011-916-001-001
本产品经检验符合 GB/T 1094.1-2013 标准`;

  const d1 = B.guessDate(certText);
  ok(d1.length > 0, '能从文字层找到日期候选');
  eq(d1[0].ymd, 20250325, '日期取到 20250325');

  const n1 = B.guessDocNo(certText, ['TKG']);
  ok(n1.length > 0, '能找到编号候选');
  eq(n1[0].value, 'TKG711510002', '编号取到 TKG711510002');
  ok(!n1.some(x => /^D0109/.test(x.value)), '档号不会被误判为文件编号');
  ok(!n1.some(x => x.value === '20250325'), '8 位日期不会被误判为编号');

  // 误报控制：只有一个型号 token 时置信度应为低
  const n2 = B.guessDocNo('型号 ZGS11-Z.G-1000/35 符合标准', []);
  ok(!n2.length || n2[0].score < 4, '无关键词邻接的型号 token 不会高置信度命中');

  // 文字归一化：全角数字 + 中文日期
  const d3 = B.guessDate('签发日期：２０２５年０３月２５日');
  ok(d3.length > 0 && d3[0].ymd === 20250325, '全角数字与中文年月日可归一化');

  // 非法日期必须被拒绝
  const d4 = B.guessDate('编号 20250230 不是合法日期');
  ok(!d4.some(x => x.ymd === 20250230), '2025-02-30 被拒绝');

  /* ---------- 汇总 ---------- */
  console.log('\n' + '─'.repeat(52));
  const total = pass + fail;
  if (fail === 0) {
    console.log('\x1b[32m全部通过：' + pass + '/' + total + '\x1b[0m\n');
    process.exit(0);
  } else {
    console.log('\x1b[31m失败 ' + fail + ' 项 / 共 ' + total + ' 项\x1b[0m');
    failures.forEach(f => console.log('  - ' + f));
    console.log('');
    process.exit(1);
  }
})().catch(e => { console.error('测试异常：', e); process.exit(1); });
