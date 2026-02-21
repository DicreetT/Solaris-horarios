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
