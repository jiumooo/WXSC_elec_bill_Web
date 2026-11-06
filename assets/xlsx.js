/* ==========================================================================
 * 极简 XLSX 生成器（零依赖）
 * 用 ZIP(store) + SpreadsheetML 直接拼出一个 Excel 能打开的 .xlsx
 * ========================================================================== */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

function zipStore(files) {
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = enc.encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + data.length;
  });

  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + cdSize + end.length;
  const out = new Uint8Array(total);
  let at = 0;
  chunks.forEach((c) => { out.set(c, at); at += c.length; });
  central.forEach((c) => { out.set(c, at); at += c.length; });
  out.set(end, at);
  return out;
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function colName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* 样式索引：0 默认 / 1 表头 / 2 文本+边框 / 3 数字 0.00 / 4 百分比 / 5 标题 / 6 居中 */ 
const STYLE = { DEFAULT: 0, HEAD: 1, TEXT: 2, NUM: 3, PCT: 4, TITLE: 5, CENTER: 6 };

function cellXml(cell, ref) {
  if (cell == null) return '';
  if (typeof cell === 'object' && cell.t === 'skip') return '';
  const obj = typeof cell === 'object' ? cell : { v: cell };
  const s = obj.s == null ? STYLE.DEFAULT : obj.s;
  const v = obj.v;
  if (v == null || v === '') return '<c r="' + ref + '" s="' + s + '"/>';
  if (obj.t === 'n' || (typeof v === 'number' && isFinite(v) && obj.t !== 's')) {
    return '<c r="' + ref + '" s="' + s + '"><v>' + Number(v) + '</v></c>';
  }
  return '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' +
    xmlEscape(v) + '</t></is></c>';
}

function sheetXml(sheet) {
  const rows = sheet.rows || [];
  const maxCols = rows.reduce((a, r) => Math.max(a, r.length), 1);
  const cols = (sheet.cols || []).map((w, i) =>
    '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('');

  const body = rows.map((row, ri) => {
    const height = sheet.rowHeights && sheet.rowHeights[ri];
    const cells = row.map((cell, ci) => cellXml(cell, colName(ci) + (ri + 1))).join('');
    return '<row r="' + (ri + 1) + '"' + (height ? ' ht="' + height + '" customHeight="1"' : '') + '>' + cells + '</row>';
  }).join('');

  const freezeRow = sheet.freeze || 0;
  const pane = freezeRow
    ? '<pane ySplit="' + freezeRow + '" topLeftCell="A' + (freezeRow + 1) +
      '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A' + (freezeRow + 1) + '" sqref="A' + (freezeRow + 1) + '"/>'
    : '';

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<dimension ref="A1:' + colName(maxCols - 1) + Math.max(rows.length, 1) + '"/>' +
    '<sheetViews><sheetView workbookViewId="0" tabSelected="' + (sheet.active ? 1 : 0) + '">' + pane + '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    (cols ? '<cols>' + cols + '</cols>' : '') +
    '<sheetData>' + body + '</sheetData>' +
    '</worksheet>';
}

const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>' +
  '<fonts count="4">' +
  '<font><sz val="11"/><color rgb="FF1F2328"/><name val="Microsoft YaHei"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/><family val="2"/></font>' +
  '<font><b/><sz val="15"/><color rgb="FF1F2328"/><name val="Microsoft YaHei"/><family val="2"/></font>' +
  '<font><sz val="10"/><color rgb="FF6B7280"/><name val="Microsoft YaHei"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1F6FEB"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FFD0D7DE"/></left><right style="thin"><color rgb="FFD0D7DE"/></right>' +
  '<top style="thin"><color rgb="FFD0D7DE"/></top><bottom style="thin"><color rgb="FFD0D7DE"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

export function buildXlsx(sheets) {
  const files = [];

  const overrides = sheets.map((_, i) =>
    '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
    '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('');

  files.push({
    name: '[Content_Types].xml',
    data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      overrides +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>'),
  });

  files.push({
    name: '_rels/.rels',
    data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'),
  });

  files.push({
    name: 'xl/workbook.xml',
    data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) =>
        '<sheet name="' + xmlEscape(s.name || ('Sheet' + (i + 1))) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
      '</sheets></workbook>'),
  });

  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) =>
        '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>'),
  });

  files.push({ name: 'xl/styles.xml', data: enc.encode(STYLES_XML) });

  sheets.forEach((sheet, i) => {
    files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc.encode(sheetXml(sheet)) });
  });

  return zipStore(files);
}

export { STYLE };
