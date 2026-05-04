import * as XLSX from 'xlsx';

type CellValue = string | number;

type TableExportInput = {
  title: string;
  headers: string[];
  rows: Array<Array<CellValue>>;
  fileName?: string;
  subtitle?: string;
  sheetName?: string;
  summaryRows?: Array<[string, CellValue]>;
};

const clean = (v: unknown) => (v == null ? '' : String(v).trim());

const sanitizeSheetName = (name: string, fallback = 'Datos') => {
  const cleaned = clean(name)
    .replace(/[\[\]\*\/\\\?\:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, 31);
};

const fitWidth = (value: unknown) => {
  const len = clean(value).length;
  if (len <= 0) return 10;
  return Math.max(10, Math.min(45, len + 2));
};

const buildSheet = (input: TableExportInput) => {
  const { title, subtitle, headers, rows } = input;
  const data: Array<Array<CellValue>> = [];
  data.push([title]);
  if (subtitle) data.push([subtitle]);
  data.push([]);
  data.push(headers);
  rows.forEach((row) => data.push(row));

  const ws = XLSX.utils.aoa_to_sheet(data);
  const colsCount = Math.max(headers.length, ...rows.map((r) => r.length), 1);
  const endCol = XLSX.utils.encode_col(Math.max(0, colsCount - 1));
  const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, colsCount - 1) } }];
  if (subtitle) merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(0, colsCount - 1) } });
  (ws as XLSX.WorkSheet)['!merges'] = merges;
  (ws as XLSX.WorkSheet)['!cols'] = Array.from({ length: colsCount }, (_, idx) => {
    const values: unknown[] = [
      headers[idx] ?? '',
      ...rows.map((row) => row[idx] ?? ''),
      title,
      subtitle || '',
    ];
    return { wch: Math.max(...values.map(fitWidth), 10) };
  });
  (ws as XLSX.WorkSheet)['!autofilter'] = { ref: `A4:${endCol}${rows.length + 4}` };
  return ws;
};

export function openTableXlsx(input: TableExportInput) {
  const workbook = XLSX.utils.book_new();
  const mainSheet = buildSheet(input);
  XLSX.utils.book_append_sheet(workbook, mainSheet, sanitizeSheetName(input.sheetName || input.title));

  if (input.summaryRows?.length) {
    const summaryData: Array<Array<CellValue>> = [
      [input.title],
      input.subtitle ? [input.subtitle] : [],
      [],
      ['Resumen', 'Valor'],
      ...input.summaryRows.map(([label, value]) => [label, value]),
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    const summaryEndCol = XLSX.utils.encode_col(1);
    (summarySheet as XLSX.WorkSheet)['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
      ...(input.subtitle ? [{ s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }] : []),
    ];
    (summarySheet as XLSX.WorkSheet)['!cols'] = [
      { wch: Math.max(18, ...input.summaryRows.map(([label]) => fitWidth(label))) },
      { wch: Math.max(14, ...input.summaryRows.map(([, value]) => fitWidth(value))) },
    ];
    (summarySheet as XLSX.WorkSheet)['!autofilter'] = { ref: `A4:${summaryEndCol}${input.summaryRows.length + 4}` };
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
  }

  const fileName = clean(input.fileName || `${input.title}.xlsx`);
  XLSX.writeFile(workbook, fileName.toLowerCase().endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}
