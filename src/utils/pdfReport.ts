import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type PdfReportInput = {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  fileName?: string;
  subtitle?: string;
  signatures?: string[];
};

const normalizeToken = (value: string) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const toNumericCell = (value: string | number) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    const parsed = Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(raw)) {
    const parsed = Number(raw.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^-?\d+([.,]\d+)?$/.test(raw)) {
    const parsed = Number(raw.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isTotalRow = (row: Array<string | number>) => {
  const first = normalizeToken(String(row?.[0] ?? ''));
  return first === 'total' || first.startsWith('total ');
};

const buildSummaryRows = (headers: string[], rows: Array<Array<string | number>>) => {
  const sourceRows = rows.filter((row) => !isTotalRow(row));
  const summary: Array<[string, string]> = [['Total de registros', String(sourceRows.length)]];

  if (sourceRows.length === 0 || headers.length === 0) return summary;

  const includeKeys = ['cantidad', 'stock', 'total', 'salidas', 'potencial', 'viales', 'valor', 'movimientos', 'ajustes'];
  const excludeKeys = ['año', 'anio', 'mes', 'fecha', 'lote', 'bodega', 'cliente', 'tipo', 'producto', 'estado', 'semaforo', 'responsable', 'factura', 'doc', 'nota', 'destino', 'fuente', 'id'];
  const numericIndexes = headers
    .map((h, idx) => ({ token: normalizeToken(h), idx }))
    .filter(({ token }) => includeKeys.some((k) => token.includes(k)) && !excludeKeys.some((k) => token.includes(k)))
    .map(({ idx }) => idx);

  const idxs = numericIndexes.length > 0
    ? numericIndexes
    : (() => {
      const candidates: number[] = [];
      headers.forEach((h, idx) => {
        const token = normalizeToken(h);
        if (excludeKeys.some((k) => token.includes(k))) return;
        let numericCount = 0;
        for (const row of sourceRows) {
          if (toNumericCell(row[idx] as any) != null) numericCount += 1;
        }
        if (numericCount > 0 && numericCount / sourceRows.length >= 0.7) candidates.push(idx);
      });
      return candidates;
    })();

  const cantidadIdx = headers.findIndex((h) => normalizeToken(h).includes('cantidad'));
  if (cantidadIdx >= 0) {
    const cantidadTotal = sourceRows.reduce((acc, row) => {
      const n = toNumericCell(row[cantidadIdx] as any);
      return acc + (n ?? 0);
    }, 0);
    const cantidadFmt = Number.isInteger(cantidadTotal)
      ? cantidadTotal.toLocaleString('es-ES')
      : Number(cantidadTotal.toFixed(2)).toLocaleString('es-ES');
    summary.push(['Cantidad total registrada', cantidadFmt]);
  }

  idxs.forEach((idx) => {
    if (idx === cantidadIdx) return;
    const sum = sourceRows.reduce((acc, row) => {
      const n = toNumericCell(row[idx] as any);
      return acc + (n ?? 0);
    }, 0);
    const label = `Total ${String(headers[idx] ?? '').trim() || `columna ${idx + 1}`}`;
    const value = Number.isInteger(sum)
      ? sum.toLocaleString('es-ES')
      : Number(sum.toFixed(2)).toLocaleString('es-ES');
    summary.push([label, value]);
  });

  return summary;
};

export function openPrintablePdfReport(input: PdfReportInput) {
  const { title, headers, rows, fileName = 'reporte.pdf', subtitle, signatures = [] } = input;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 40, 40);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(subtitle, 40, 58);
  }

  autoTable(doc, {
    head: [headers.map((h) => String(h ?? ''))],
    body: rows.map((row) => row.map((cell) => String(cell ?? ''))),
    startY: subtitle ? 72 : 54,
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 4,
      overflow: 'linebreak',
      textColor: [17, 24, 39],
      lineColor: [229, 231, 235],
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [31, 41, 55],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    margin: { left: 30, right: 30, top: 20, bottom: 20 },
  });

  const summaryRows = buildSummaryRows(headers, rows);
  autoTable(doc, {
    head: [['Resumen', 'Valor']],
    body: summaryRows,
    startY: (((doc as any).lastAutoTable?.finalY || (subtitle ? 72 : 54)) + 14),
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 4,
      textColor: [17, 24, 39],
      lineColor: [229, 231, 235],
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: [239, 246, 255],
      textColor: [30, 64, 175],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 30, right: 30, top: 20, bottom: 20 },
    tableWidth: 320,
  });

  if (signatures.length > 0) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const neededHeight = 46 + signatures.length * 34;
    const currentY = ((doc as any).lastAutoTable?.finalY || 72) + 18;
    let startY = currentY;
    if (startY + neededHeight > pageHeight - 18) {
      doc.addPage();
      startY = 60;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Firmas', 40, startY);
    doc.setFont('helvetica', 'normal');

    signatures.forEach((label, idx) => {
      const y = startY + 22 + idx * 34;
      doc.line(40, y, 260, y);
      doc.text(label, 40, y + 12);
    });
  }

  doc.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}
