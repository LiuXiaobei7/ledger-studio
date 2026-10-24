/*!
 * ExcelIO —— ExcelJS 与规则引擎之间的适配层
 * 负责：读工作簿 -> 引擎可用的纯数据表；按模板写出成品台账（保留列宽与样式）。
 */
(function (root) {
  'use strict';

  var E = root.LedgerEngine;

  function headerOf(ws) {
    var header = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, function (cell, col) {
      header[col - 1] = E.s(cell.value);
    });
    while (header.length && header[header.length - 1] === '') header.pop();
    return header;
  }

  /** ExcelJS worksheet -> 引擎 sheet 模型 */
  function sheetFromWorksheet(ws, label) {
    var header = headerOf(ws);
    var rows = [];
    ws.eachRow({ includeEmpty: false }, function (row, rowNo) {
      if (rowNo === 1) return;
      var vals = {}, any = false;
      for (var c = 0; c < header.length; c++) {
        if (!header[c]) continue;
        var v = E.cellVal(row.getCell(c + 1).value);
        vals[header[c]] = v;
        if (!E.isBlank(v)) any = true;
      }
      if (any) { vals.__row = rowNo; rows.push(vals); }
    });
    return E.makeSheet(header, rows, label);
  }

  /** 读取上传的 xlsx 文件 -> { workbook, sheet, sheetName } */
  async function readLedger(arrayBuffer, label) {
    var wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    var ws = wb.worksheets[0];
    return { workbook: wb, sheet: sheetFromWorksheet(ws, label), sheetName: ws.name };
  }

  /** 从模板生成成品台账，返回 ArrayBuffer */
  async function writeLedger(templateBuffer, rows) {
    var wb = new ExcelJS.Workbook();
    await wb.xlsx.load(templateBuffer);
    var ws = wb.worksheets[0];
    var header = headerOf(ws);
    var colOf = {};
    header.forEach(function (h, i) { if (h && !(h in colOf)) colOf[h] = i + 1; });

    if (ws.rowCount > 1) {
      // 先尝试整段删除；ExcelJS 在部分文件上不会真正收缩行集合，再逐格置空兜底
      try { ws.spliceRows(2, ws.rowCount - 1); } catch (e) { /* ignore */ }
      var maxR = ws.rowCount || 0, maxC = ws.columnCount || 0;
      for (var r = 2; r <= maxR; r++) {
        var rowTmp = ws.getRow(r);
        for (var c = 1; c <= maxC; c++) rowTmp.getCell(c).value = null;
        rowTmp.commit();
      }
    }

    var FONT = { name: '宋体', size: 11 };
    var ALIGN = { horizontal: 'center', vertical: 'middle', wrapText: true };

    ws.getRow(1).eachCell({ includeEmpty: false }, function (c) {
      c.font = FONT; c.alignment = ALIGN; c.numFmt = '@';
    });

    rows.forEach(function (data, i) {
      var row = ws.getRow(i + 2);
      Object.keys(data).forEach(function (k) {
        if (k.charAt(0) === '_') return;
        var col = colOf[k];
        if (!col) return;
        var v = data[k];
        if (v === null || v === undefined || v === '') return;
        var cell = row.getCell(col);
        cell.value = v;
        cell.font = FONT;
        cell.alignment = ALIGN;
        cell.numFmt = '@';
      });
      row.commit();
    });

    var buf = await wb.xlsx.writeBuffer();
    return buf;
  }

  root.ExcelIO = { readLedger: readLedger, writeLedger: writeLedger, headerOf: headerOf };
})(typeof self !== 'undefined' ? self : this);
