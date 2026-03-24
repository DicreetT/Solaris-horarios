import React, { useEffect, useMemo, useState } from 'react';
import { FileUp, Send, ClipboardCheck, Truck, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import { InventoryMovementRow, useInventoryMovementsDB } from '../hooks/useInventoryMovementsDB';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const FACTURACION_ORDERS_KEY = 'facturacion_orders_v1';
const FACTURACION_ARCHIVE_KEY = 'facturacion_archive_v1';
const FACTURACION_HIDDEN_ORDERS_KEY = 'facturacion_hidden_orders_v1';

type BillingWarehouse = 'CANET' | 'HUARTE';
type BillingOrderStatus = 'PENDIENTE_MANUAL' | 'PENDIENTE_PREPARACION' | 'EN_PREPARACION' | 'DESPACHADO' | 'CANCELADO';
type ProductCode = 'AV' | 'ENT' | 'ISO' | 'KL' | 'RG' | 'SV' | '';

type BillingOrderLine = {
  id: string;
  productCode: ProductCode;
  productRaw: string;
  quantity: number;
  unit: string;
  lote: string;
  lotePending: boolean;
  movementId?: number;
  notes?: string;
};

type BillingOrder = {
  id: string;
  createdAt: string;
  createdBy: string;
  sourceWarehouse: BillingWarehouse;
  inventoryTarget: 'canet' | 'huarte';
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerNif: string;
  sourceFileName: string;
  sourcePdfDataUrl?: string;
  orderNote?: string;
  status: BillingOrderStatus;
  extractedTextSnippet: string;
  lines: BillingOrderLine[];
};

type BillingArchiveEntry = {
  dateKey: string;
  archivedAt: string;
  orders: BillingOrder[];
  totalOrders: number;
  totalLines: number;
  totalQuantity: number;
};

const PRODUCT_OPTIONS: ProductCode[] = ['AV', 'ENT', 'ISO', 'KL', 'RG', 'SV'];

const PRODUCT_HINTS: Array<{ code: ProductCode; hints: string[] }> = [
  { code: 'AV', hints: ['AVHIRO', 'AVIRO'] },
  { code: 'ENT', hints: ['ENTEROVITAL', 'ENTERO VITAL', 'ENTHEROVITAL', 'ENTHERO'] },
  { code: 'ISO', hints: ['ISOTONIC', 'ISOTONICO', 'ISOTÓNICO'] },
  { code: 'KL', hints: ['KHALA', 'CALA'] },
  { code: 'RG', hints: ['REGENERIUM', 'REGENERYUM'] },
  { code: 'SV', hints: ['SOLAR VITAL', 'SOLARVITAL'] },
];

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function toNum(value: unknown) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function parseSpanishNumber(value: string) {
  const norm = clean(value)
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function normalizeWarehouseAlias(input: string): BillingWarehouse | '' {
  const v = clean(input).toUpperCase();
  if (!v) return '';
  if (v.startsWith('CAN')) return 'CANET';
  if (v.includes('HUARTE')) return 'HUARTE';
  return '';
}

function signedFromMovement(m: Partial<InventoryMovementRow>) {
  const qtySigned = toNum(m.cantidad_signed);
  if (qtySigned !== 0) return qtySigned;

  const qty = Math.abs(toNum(m.cantidad));
  const signo = toNum(m.signo);
  if (signo !== 0) return qty * signo;

  const t = clean(m.tipo_movimiento).toLowerCase();
  if (
    t.includes('venta') ||
    t.includes('envio') ||
    t.includes('traspaso') ||
    t.includes('ajuste_negativo')
  ) {
    return -qty;
  }
  return qty;
}

function decodePdfEscapes(value: string) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function extractPdfTextFromRawPdf(buffer: ArrayBuffer): string {
  const latin = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const chunks: string[] = [];

  const tjs = latin.matchAll(/\(([^()]*)\)\s*Tj/g);
  for (const m of tjs) {
    const value = decodePdfEscapes(clean(m[1]));
    if (value.length > 1 && /[A-Za-zÁÉÍÓÚáéíóú0-9]/.test(value)) chunks.push(value);
  }

  const tjsArray = latin.matchAll(/\[(.*?)\]\s*TJ/gs);
  for (const m of tjsArray) {
    const inner = m[1] || '';
    const parts = inner.matchAll(/\(([^()]*)\)/g);
    for (const p of parts) {
      const value = decodePdfEscapes(clean(p[1]));
      if (value.length > 1 && /[A-Za-zÁÉÍÓÚáéíóú0-9]/.test(value)) chunks.push(value);
    }
  }

  const extracted = chunks.join('\n').replace(/\u0000/g, '').trim();
  if (extracted.length > 50) return extracted;

  return latin
    .replace(/\u0000/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function toIsoDate(dateRaw: string): string {
  const v = clean(dateRaw);
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return new Date().toISOString().slice(0, 10);
}

function normalizeCustomerName(value: string) {
  let v = clean(value).replace(/\s{2,}/g, ' ');
  v = v.replace(/\b(S\.?\s*L\.?\s*U?\.?|S\.?\s*A\.?|INC\.?|LLC)\s*$/i, '');
  return clean(v.replace(/[,\-;\s]+$/, ''));
}

function inferProductCode(text: string): ProductCode {
  const upper = clean(text).toUpperCase();
  for (const entry of PRODUCT_HINTS) {
    if (entry.hints.some((hint) => upper.includes(hint))) {
      return entry.code;
    }
  }
  return '';
}

function normalizeTextLines(text: string) {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => clean(line))
    .filter(Boolean);
}

function toLocalDateKey(isoOrDate: string | Date) {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function findValueAfterLabel(lines: string[], labelRegex: RegExp, maxLookAhead = 5) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!labelRegex.test(line)) continue;

    const inline = clean(line.replace(labelRegex, '').replace(/^[:\-]/, ''));
    if (inline) return inline;

    for (let j = i + 1; j <= Math.min(lines.length - 1, i + maxLookAhead); j++) {
      if (!clean(lines[j])) continue;
      return clean(lines[j]);
    }
  }
  return '';
}

function findCustomerFromLines(lines: string[]) {
  const sanitize = (value: string) =>
    clean(
      value
        .replace(/^FACTURAR\s+A[:\-\s]*/i, '')
        .replace(/^CLIENTE[:\-\s]*/i, '')
        .replace(/^DATOS\s+CLIENTE[:\-\s]*/i, ''),
    );
  const skip = (v: string) =>
    !v ||
    /NIF|TEL|EMAIL|DIRECCI|FECHA|PEDIDO|DR:|EDAD|ESPECIALIDAD|FACTURA|DATOS|DE FACTURA/i.test(v);

  for (let i = 0; i < lines.length; i++) {
    const line = clean(lines[i]);
    if (!line) continue;

    if (/^FACTURAR\s+A\b/i.test(line)) {
      const inlineCandidate = sanitize(line);
      if (!skip(inlineCandidate) && inlineCandidate.length >= 4) return inlineCandidate;
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 6); j++) {
        const candidate = sanitize(lines[j]);
        if (skip(candidate)) continue;
        if (candidate.length >= 4) return candidate;
      }
    }

    if (/^DATOS\s+CLIENTE\b/i.test(line)) {
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 5); j++) {
        const candidate = sanitize(lines[j]);
        if (skip(candidate)) continue;
        if (candidate.length >= 4) return candidate;
      }
    }

    if (/DATOS\s+CLIENTE.*DATOS\s+PRESCRIPTOR/i.test(line)) {
      const next = clean(lines[i + 1] || '');
      const m = next.match(/^([A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ]+){1,4})\b/);
      if (m?.[1]) return clean(m[1]);
    }
  }
  return '';
}

function isNoiseLine(line: string) {
  const v = clean(line).toUpperCase();
  if (!v) return true;
  return [
    'FACTURA',
    'RESUMEN FISCAL',
    'SUBTOTAL',
    'IVA',
    'TOTAL',
    'SALDO ADEUDADO',
    'TÉRMINOS',
    'N.º DE FACTURA',
    'FECHA DE LA FACTURA',
    'N.º DE ORDEN DE COMPRA',
    'PVP',
    'TARIFA',
    'CANTIDAD',
    'CANT.',
    'NO PEDIDO',
    'ALBARÁN',
    'PORTES',
    'PAGADO EN PRESCRIPCIÓN',
    'INCIDENCIAS',
    'RESPONSABLE',
    'DÍA/HORA',
  ].some((k) => v.includes(k));
}

function isProductAnchorLine(line: string) {
  const code = inferProductCode(line);
  if (!code) return false;
  const v = clean(line).toUpperCase();
  if (
    v.includes('PORTES') ||
    v.includes('PAGADO EN PRESCRIPCIÓN') ||
    v.includes('SUBTOTAL') ||
    v.includes('TOTAL')
  ) {
    return false;
  }
  return true;
}

function extractBestQuantity(lines: string[]) {
  const numericCandidates: Array<{ value: number; score: number }> = [];
  const qtyWithUnitRegex = /(\d{1,4}(?:[.,]\d{1,3})?)\s*(box|caja|cajas|ud|uds|unidad|unidades)\b/gi;
  const numberRegex = /(\d{1,4}(?:[.,]\d{1,3})?)/g;

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = clean(lines[idx]);
    const upper = rawLine.toUpperCase();
    if (!rawLine) continue;

    const unitMatches = [...rawLine.matchAll(qtyWithUnitRegex)];
    for (const m of unitMatches) {
      const v = parseSpanishNumber(m[1]);
      if (v > 0 && v <= 5000) {
        numericCandidates.push({ value: v, score: 100 - idx * 4 });
      }
    }

    const hasCurrency = /€|EUR|PVP|TARIFA|SUBTOTAL|IVA|TOTAL/i.test(rawLine);
    const matches = [...rawLine.matchAll(numberRegex)];
    for (const m of matches) {
      const token = clean(m[1]);
      const value = parseSpanishNumber(token);
      if (!Number.isFinite(value) || value <= 0 || value > 5000) continue;
      if (hasCurrency) continue;

      const contextStart = Math.max(0, (m.index || 0) - 8);
      const contextEnd = Math.min(rawLine.length, (m.index || 0) + token.length + 8);
      const context = rawLine.slice(contextStart, contextEnd).toLowerCase();
      if (/ml|vial|viales/.test(context)) continue;
      if (/^0\d+$/.test(token)) continue;

      let score = 50 - idx * 3;
      if (/^\d+$/.test(token)) score += 10;
      if (/,/.test(token)) score += 5;
      numericCandidates.push({ value, score });
    }
  }

  if (numericCandidates.length === 0) return 0;
  numericCandidates.sort((a, b) => b.score - a.score);
  return numericCandidates[0].value;
}

function extractLotFromSegment(lines: string[]) {
  for (const line of lines) {
    const m = clean(line).toUpperCase().match(/\b\d{4}[A-Z]\d{2}\b/);
    if (m?.[0]) return m[0];
  }
  return '';
}

function extractQuantityFromSegment(lines: string[]) {
  for (const line of lines) {
    const triple = clean(line).match(
      /(\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/,
    );
    if (triple?.[1]) {
      const qty = parseSpanishNumber(triple[1]);
      if (qty > 0) return qty;
    }
  }

  for (const line of lines) {
    const m = clean(line).match(/\b\d{3,}\s+(\d{1,3})\s+\d{1,3},\d{2}\s*€/);
    if (m?.[1]) {
      const qty = parseSpanishNumber(m[1]);
      if (qty > 0) return qty;
    }
  }

  for (const line of lines) {
    const withUnit = clean(line).match(/(\d{1,4}(?:[.,]\d{1,3})?)\s*(box|caja|cajas|ud|uds|unidad|unidades)\b/i);
    if (withUnit?.[1]) {
      const qty = parseSpanishNumber(withUnit[1]);
      if (qty > 0) return qty;
    }
  }

  return extractBestQuantity(lines);
}

function normalizeProductRaw(line: string) {
  return clean(line).replace(/^\d+\s+/, '');
}

function extractInvoiceLines(text: string): BillingOrderLine[] {
  const parsed: BillingOrderLine[] = [];
  const dedupe = new Set<string>();
  const tokens = normalizeTextLines(text);

  const pushLine = (productRaw: string, segment: string[]) => {
    const productCode = inferProductCode(productRaw);
    if (!productCode) return;

    const quantity = extractQuantityFromSegment(segment);
    const loteFromDescription = extractLotFromSegment(segment);
    const unit = /(caja|box|ud|uds|unid)/i.test(segment.join(' ')) ? 'box' : 'box';
    const key = `${productCode}|${Math.round(quantity * 100)}|${loteFromDescription}`;
    if (dedupe.has(key)) return;
    dedupe.add(key);

    parsed.push({
      id: uid('line'),
      productCode,
      productRaw: normalizeProductRaw(productRaw),
      quantity,
      unit,
      lote: loteFromDescription,
      lotePending: !loteFromDescription,
      notes: quantity <= 0 ? 'Cantidad pendiente de revisión manual.' : undefined,
    });
  };

  // 1) Barrido principal por anclas de producto.
  const anchors = tokens
    .map((line, idx) => ({ idx, line }))
    .filter((e) => isProductAnchorLine(e.line));

  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i].idx;
    const end = i < anchors.length - 1 ? anchors[i + 1].idx - 1 : Math.min(tokens.length - 1, start + 8);
    const segment = tokens.slice(start, end + 1).filter((l) => !isNoiseLine(l));
    pushLine(anchors[i].line, segment);
  }

  // 2) Barrido de refuerzo: algunas facturas mezclan líneas y se escapan artículos.
  for (let i = 0; i < tokens.length; i++) {
    const line = tokens[i];
    if (!isProductAnchorLine(line)) continue;
    const segment = tokens.slice(i, Math.min(tokens.length, i + 6)).filter((l) => !isNoiseLine(l));
    pushLine(line, segment);
  }

  if (parsed.length === 0) {
    parsed.push({
      id: uid('line'),
      productCode: inferProductCode(text),
      productRaw: '',
      quantity: 0,
      unit: 'box',
      lote: '',
      lotePending: true,
      notes: 'No se pudo leer la línea automáticamente. Completar manual.',
    });
  }

  return parsed;
}

async function extractPdfTextFromArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  try {
    const loadingTask = (pdfjsLib as any).getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const pagesText: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const byY = new Map<number, string[]>();

      for (const item of (textContent.items || []) as any[]) {
        const str = clean(item?.str);
        if (!str) continue;
        const yRaw = Number(item?.transform?.[5] ?? 0);
        const y = Number.isFinite(yRaw) ? Math.round(yRaw * 10) / 10 : 0;
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y)!.push(str);
      }

      const pageLines = Array.from(byY.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => clean(parts.join(' ')))
        .filter(Boolean);

      pagesText.push(pageLines.join('\n'));
    }

    const extracted = clean(pagesText.join('\n'));
    if (extracted.length > 30) return extracted;
  } catch (error) {
    console.warn('pdfjs extraction failed, fallback raw parser', error);
  }

  return extractPdfTextFromRawPdf(buffer);
}

function parseInvoiceFromText(
  text: string,
  fileName: string,
  warehouse: BillingWarehouse,
  actor: string,
  sourcePdfDataUrl?: string,
): BillingOrder {
  const normalized = text.replace(/\r/g, '\n').replace(/\n{2,}/g, '\n');
  const lines = normalizeTextLines(normalized);
  const textUpper = normalized.toUpperCase();
  const isSegLabFormat = /HOJA\s+DE\s+SEGUIMIENTO|PACIENTES\.MIMEDICO\.COM/i.test(textUpper);
  const normalizedForLines = isSegLabFormat
    ? normalized.split(/INCIDENCIA\s+PEDIDO|ALBARÁN\s+DE\s+ENTREGA/i)[0] || normalized
    : normalized;

  const invoiceNumber =
    findValueAfterLabel(lines, /^N\.?\s*[º°o]?\s*de\s*factura[:\-\s]*/i) ||
    findValueAfterLabel(lines, /^HOJA\s+DE\s+SEGUIMIENTO\s*N[º°o]?[:\-\s]*/i) ||
    clean(textUpper.match(/\b(\d{4}[-/]\d{4,8})\b/)?.[1]) ||
    `SIN-NUM-${uid('fac')}`;

  const dateRaw =
    findValueAfterLabel(lines, /^FECHA\s+DE\s+LA\s+FACTURA[:\-\s]*/i) ||
    clean(normalized.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1]);
  const invoiceDate = toIsoDate(dateRaw);

  let customerName =
    findCustomerFromLines(lines) ||
    findValueAfterLabel(lines, /^FACTURAR\s+A[:\-\s]*/i, 8) ||
    findValueAfterLabel(lines, /^DATOS\s+CLIENTE[:\-\s]*/i, 3) ||
    findValueAfterLabel(lines, /^CLIENTE[:\-\s]*/i, 4) ||
    clean(normalized.match(/\n([A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,5})\nTel[:\s]/i)?.[1]);
  customerName = normalizeCustomerName(customerName);
  if (/^(DATOS CLIENTE|CLIENTE)$/i.test(customerName)) {
    customerName = '';
  }
  if (isSegLabFormat) {
    if (!customerName) {
      for (let i = 0; i < lines.length; i++) {
        if (!/DATOS\s+CLIENTE.*DATOS\s+PRESCRIPTOR/i.test(lines[i])) continue;
        const next = clean(lines[i + 1] || '');
        const headerMatch = next.match(/^([A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,4})\b/);
        if (headerMatch?.[1]) {
          customerName = clean(headerMatch[1]);
          break;
        }
      }
    }
    const m = normalized.match(/\n([A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ]+){1,4})\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/);
    if (m?.[1]) customerName = normalizeCustomerName(m[1]);
  }

  const customerNif =
    clean(normalized.match(/\bNIF\b\s*([A-Z0-9]+)/i)?.[1]) ||
    clean(normalized.match(/\b[A-Z]\d{8}\b/)?.[0]);
  const invoiceLines = extractInvoiceLines(normalizedForLines);
  const hasPending = invoiceLines.some((line) => line.lotePending || !clean(line.lote));
  const orderNote = isSegLabFormat ? 'Pertenece a MIMEDICO' : '';

  return {
    id: uid('ord'),
    createdAt: new Date().toISOString(),
    createdBy: actor || 'Sistema',
    sourceWarehouse: warehouse,
    inventoryTarget: warehouse === 'CANET' ? 'canet' : 'huarte',
    invoiceNumber,
    invoiceDate,
    customerName: customerName || 'CLIENTE SIN DETECTAR',
    customerNif,
    sourceFileName: fileName,
    sourcePdfDataUrl,
    orderNote,
    status: hasPending ? 'PENDIENTE_MANUAL' : 'PENDIENTE_PREPARACION',
    extractedTextSnippet: normalized.slice(0, 600),
    lines: invoiceLines,
  };
}

function statusClass(status: BillingOrderStatus) {
  if (status === 'DESPACHADO') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'EN_PREPARACION') return 'bg-sky-100 text-sky-800 border-sky-200';
  if (status === 'PENDIENTE_PREPARACION') return 'bg-violet-100 text-violet-800 border-violet-200';
  if (status === 'PENDIENTE_MANUAL') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function recomputeOrderStatus(order: BillingOrder): BillingOrderStatus {
  if (order.status === 'CANCELADO' || order.status === 'DESPACHADO') return order.status;
  const hasPendingLot = order.lines.some((line) => line.lotePending || !clean(line.lote));
  if (hasPendingLot) return 'PENDIENTE_MANUAL';
  if (order.status === 'EN_PREPARACION') return 'EN_PREPARACION';
  return 'PENDIENTE_PREPARACION';
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return clean(iso);
  return d.toLocaleDateString('es-ES');
}

export default function FacturacionPage() {
  const { currentUser } = useAuth();
  const [sourceWarehouse, setSourceWarehouse] = useState<BillingWarehouse>('CANET');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const [orders, setOrders, ordersLoading] = useSharedJsonState<BillingOrder[]>(
    FACTURACION_ORDERS_KEY,
    [],
    { userId: currentUser?.id, initializeIfMissing: true, pollIntervalMs: 15000 },
  );
  const [archives, setArchives] = useSharedJsonState<BillingArchiveEntry[]>(
    FACTURACION_ARCHIVE_KEY,
    [],
    { userId: currentUser?.id, initializeIfMissing: true, pollIntervalMs: 20000 },
  );
  const [hiddenOrderIds, setHiddenOrderIds] = useSharedJsonState<string[]>(
    FACTURACION_HIDDEN_ORDERS_KEY,
    [],
    { userId: currentUser?.id, initializeIfMissing: true, pollIntervalMs: 20000 },
  );

  const [canetMovements, , , canetMutations] = useInventoryMovementsDB('canet');
  const [huarteMovements, , , huarteMutations] = useInventoryMovementsDB('huarte');

  const stockByWarehouseProductLot = useMemo(() => {
    const map = new Map<string, number>();

    const push = (inventory: 'canet' | 'huarte', movement: InventoryMovementRow) => {
      const wh = normalizeWarehouseAlias(clean(movement.bodega));
      if (!wh) return;
      if (inventory === 'canet' && wh !== 'CANET') return;
      if (inventory === 'huarte' && wh !== 'HUARTE') return;
      const key = `${inventory}|${wh}|${clean(movement.producto).toUpperCase()}|${clean(movement.lote).toUpperCase()}`;
      map.set(key, (map.get(key) || 0) + signedFromMovement(movement));
    };

    for (const m of canetMovements) push('canet', m);
    for (const m of huarteMovements) push('huarte', m);

    return map;
  }, [canetMovements, huarteMovements]);

  const lotOptionsByWarehouseProduct = useMemo(() => {
    const map = new Map<string, Array<{ lote: string; stock: number }>>();

    for (const [key, qty] of stockByWarehouseProductLot.entries()) {
      const [inventory, wh, product, lote] = key.split('|');
      const safeQty = Math.max(0, Math.round(qty));
      if (safeQty <= 0) continue;
      const groupKey = `${inventory}|${wh}|${product}`;
      const arr = map.get(groupKey) || [];
      arr.push({ lote, stock: safeQty });
      map.set(groupKey, arr);
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => b.stock - a.stock || a.lote.localeCompare(b.lote));
      map.set(k, arr);
    }

    return map;
  }, [stockByWarehouseProductLot]);

  const hiddenOrderSet = useMemo(() => new Set(hiddenOrderIds || []), [hiddenOrderIds]);

  const hideOrderId = (orderId: string) => {
    const id = clean(orderId);
    if (!id) return;
    setHiddenOrderIds((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      if (current.includes(id)) return current;
      return [id, ...current];
    });
  };

  useEffect(() => {
    if (!orders || orders.length === 0 || hiddenOrderSet.size === 0) return;
    if (!orders.some((order) => hiddenOrderSet.has(order.id))) return;
    setOrders((prev) => (prev || []).filter((order) => !hiddenOrderSet.has(order.id)));
  }, [orders, hiddenOrderSet, setOrders]);

  useEffect(() => {
    const archiveDueDays = () => {
      const queue = (orders || []).filter((order) => !hiddenOrderSet.has(order.id));
      if (queue.length === 0) return;

      const now = new Date();
      const todayKey = toLocalDateKey(now);
      if (!todayKey) return;

      const archivedKeys = new Set((archives || []).map((entry) => entry.dateKey));
      const queueDateKeys = Array.from(
        new Set(
          queue
            .map((order) => toLocalDateKey(order.createdAt))
            .filter(Boolean),
        ),
      ).sort();

      const dueKeys = queueDateKeys.filter((dateKey) => {
        if (archivedKeys.has(dateKey)) return false;
        if (dateKey < todayKey) return true;
        if (dateKey === todayKey && now.getHours() >= 21) return true;
        return false;
      });

      if (dueKeys.length === 0) return;

      const snapshots: BillingArchiveEntry[] = dueKeys
        .map((dateKey) => {
          const dayOrders = queue.filter((order) => toLocalDateKey(order.createdAt) === dateKey);
          if (dayOrders.length === 0) return null;

          const totalLines = dayOrders.reduce((acc, order) => acc + order.lines.length, 0);
          const totalQuantity = dayOrders.reduce(
            (acc, order) => acc + order.lines.reduce((lineAcc, line) => lineAcc + Math.max(0, Number(line.quantity) || 0), 0),
            0,
          );
          return {
            dateKey,
            archivedAt: new Date().toISOString(),
            orders: dayOrders,
            totalOrders: dayOrders.length,
            totalLines,
            totalQuantity,
          } as BillingArchiveEntry;
        })
        .filter((x): x is BillingArchiveEntry => !!x);

      if (snapshots.length === 0) return;

      setArchives((prev) => {
        const filtered = (prev || []).filter((entry) => !dueKeys.includes(entry.dateKey));
        return [...snapshots, ...filtered].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
      });
      setOrders((prev) => (prev || []).filter((order) => !dueKeys.includes(toLocalDateKey(order.createdAt))));
    };

    archiveDueDays();
    const id = window.setInterval(archiveDueDays, 60_000);
    return () => window.clearInterval(id);
  }, [archives, orders, hiddenOrderSet, setArchives, setOrders]);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).filter((f) => f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf'));
    setPendingFiles(next);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearPendingFiles = () => {
    setPendingFiles([]);
  };

  const processPendingFiles = async () => {
    if (pendingFiles.length === 0) {
      alert('Selecciona al menos un PDF.');
      return;
    }
    setIsProcessing(true);
    try {
      const parsedOrders: BillingOrder[] = [];
      for (const file of pendingFiles) {
        const buffer = await file.arrayBuffer();
        const extracted = await extractPdfTextFromArrayBuffer(buffer);
        const sourcePdfDataUrl = await readFileAsDataUrl(file);
        parsedOrders.push(
          parseInvoiceFromText(extracted, file.name, sourceWarehouse, currentUser?.name || 'Sistema', sourcePdfDataUrl),
        );
      }

      setOrders((prev) => {
        const next = Array.isArray(prev) ? [...prev] : [];
        return [...parsedOrders, ...next];
      });
      setPendingFiles([]);
      alert(`${parsedOrders.length} factura(s) cargada(s) en cola.`);
    } catch (error) {
      console.error('Error processing invoices:', error);
      alert('No se pudieron procesar las facturas. Revisa el formato PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateOrder = (orderId: string, updater: (order: BillingOrder) => BillingOrder) => {
    setOrders((prev) =>
      (prev || []).map((order) => {
        if (order.id !== orderId) return order;
        const updated = updater(order);
        return { ...updated, status: recomputeOrderStatus(updated) };
      }),
    );
  };

  const updateLine = (orderId: string, lineId: string, patch: Partial<BillingOrderLine>) => {
    updateOrder(orderId, (order) => ({
      ...order,
      lines: order.lines.map((line) =>
        line.id === lineId
          ? {
              ...line,
              ...patch,
              lotePending:
                patch.lote !== undefined
                  ? !clean(patch.lote)
                  : patch.lotePending !== undefined
                    ? patch.lotePending
                    : line.lotePending,
            }
          : line,
      ),
    }));
  };

  const addManualLine = (orderId: string) => {
    updateOrder(orderId, (order) => ({
      ...order,
      lines: [
        ...order.lines,
        {
          id: uid('line'),
          productCode: '',
          productRaw: '',
          quantity: 0,
          unit: 'box',
          lote: '',
          lotePending: true,
          notes: 'Línea manual',
        },
      ],
    }));
  };

  const removeLine = (orderId: string, lineId: string) => {
    updateOrder(orderId, (order) => ({ ...order, lines: order.lines.filter((line) => line.id !== lineId) }));
  };

  const markInPreparation = (orderId: string) => {
    updateOrder(orderId, (order) => ({ ...order, status: 'EN_PREPARACION' }));
  };

  const cancelOrder = (orderId: string) => {
    updateOrder(orderId, (order) => ({ ...order, status: 'CANCELADO' }));
  };

  const deleteOrder = (orderId: string) => {
    hideOrderId(orderId);
    setOrders((prev) => (prev || []).filter((order) => order.id !== orderId));
  };

  const openOrderPdf = (order: BillingOrder) => {
    if (!order.sourcePdfDataUrl) {
      alert('No hay PDF adjunto en este pedido.');
      return;
    }
    const win = window.open(order.sourcePdfDataUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      alert('No se pudo abrir el PDF. Revisa el bloqueador de ventanas emergentes.');
    }
  };

  const printOrderPdf = (order: BillingOrder) => {
    if (!order.sourcePdfDataUrl) {
      alert('No hay PDF adjunto en este pedido.');
      return;
    }
    const win = window.open(order.sourcePdfDataUrl, '_blank');
    if (!win) {
      alert('No se pudo abrir el PDF para imprimir.');
      return;
    }
    win.onload = () => win.print();
  };

  const dispatchOrder = async (order: BillingOrder) => {
    if (order.status === 'DESPACHADO' || order.status === 'CANCELADO') return;

    const pending = order.lines.filter((line) => !clean(line.lote));
    if (pending.length > 0) {
      alert('Este pedido sigue pendiente manual: faltan lotes por completar.');
      return;
    }

    const movementSource = order.inventoryTarget === 'canet' ? canetMovements : huarteMovements;
    const mutation = order.inventoryTarget === 'canet' ? canetMutations.addMovement : huarteMutations.addMovement;

    try {
      for (const line of order.lines) {
        const marker = `ORDER:${order.id}|LINE:${line.id}`;
        const existing = movementSource.find((m) => clean(m.notas).includes(marker));
        if (existing) {
          updateLine(order.id, line.id, { movementId: existing.id, lotePending: false });
          continue;
        }

        const qty = Math.max(0, parseSpanishNumber(String(line.quantity)));
        if (qty <= 0) continue;

        const created = await mutation({
          fecha: order.invoiceDate || new Date().toISOString().slice(0, 10),
          tipo_movimiento: 'venta',
          producto: clean(line.productCode),
          lote: clean(line.lote),
          cantidad: qty,
          cantidad_signed: -qty,
          signo: -1,
          bodega: order.sourceWarehouse,
          cliente: order.customerName,
          destino: '',
          notas: `${marker} | Factura ${order.invoiceNumber}${order.orderNote ? ` | ${order.orderNote}` : ''}`,
          factura_doc: order.invoiceNumber,
          responsable: currentUser?.name || 'Sistema',
          source: 'facturacion_pdf',
          afecta_stock: 'SI',
        });

        updateLine(order.id, line.id, {
          movementId: created.id,
          lotePending: false,
        });
      }
      const dispatchedSnapshot: BillingOrder = {
        ...order,
        status: 'DESPACHADO',
      };
      const dateKey = toLocalDateKey(new Date()) || toLocalDateKey(order.createdAt);
      if (dateKey) {
        setArchives((prev) => {
          const current = prev || [];
          const idx = current.findIndex((entry) => entry.dateKey === dateKey);
          if (idx >= 0) {
            const existing = current[idx];
            const nextOrders = [dispatchedSnapshot, ...(existing.orders || [])];
            const nextEntry: BillingArchiveEntry = {
              ...existing,
              archivedAt: new Date().toISOString(),
              orders: nextOrders,
              totalOrders: nextOrders.length,
              totalLines: nextOrders.reduce((acc, item) => acc + item.lines.length, 0),
              totalQuantity: nextOrders.reduce(
                (acc, item) => acc + item.lines.reduce((lineAcc, line) => lineAcc + Math.max(0, Number(line.quantity) || 0), 0),
                0,
              ),
            };
            return current.map((entry, entryIdx) => (entryIdx === idx ? nextEntry : entry));
          }
          const newEntry: BillingArchiveEntry = {
            dateKey,
            archivedAt: new Date().toISOString(),
            orders: [dispatchedSnapshot],
            totalOrders: 1,
            totalLines: dispatchedSnapshot.lines.length,
            totalQuantity: dispatchedSnapshot.lines.reduce((acc, line) => acc + Math.max(0, Number(line.quantity) || 0), 0),
          };
          return [newEntry, ...current].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
        });
      }
      hideOrderId(order.id);
      setOrders((prev) => (prev || []).filter((item) => item.id !== order.id));
      alert(`Pedido ${order.invoiceNumber} despachado y convertido en movimientos.`);
    } catch (error: any) {
      console.error('Dispatch order failed:', error);
      alert(`No se pudo despachar el pedido: ${error?.message || 'error desconocido'}`);
    }
  };

  const ordersVisible = useMemo(
    () => (orders || []).filter((order) => !hiddenOrderSet.has(order.id)),
    [orders, hiddenOrderSet],
  );
  const ordersSorted = useMemo(
    () => [...ordersVisible].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [ordersVisible],
  );
  const activeOrders = useMemo(
    () => ordersSorted.filter((order) => order.status !== 'DESPACHADO'),
    [ordersSorted],
  );

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <h1 className="text-3xl font-black text-violet-950">Facturación</h1>
        <p className="mt-1 text-sm text-violet-700">
          Carga facturas PDF, revisa líneas, completa lotes pendientes y envía/despacha pedidos para Canet o Huarte.
        </p>
      </section>

      <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs font-black uppercase tracking-wide text-violet-700">
            Origen del pedido
            <select
              value={sourceWarehouse}
              onChange={(e) => setSourceWarehouse(e.target.value as BillingWarehouse)}
              className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
            >
              <option value="CANET">Canet</option>
              <option value="HUARTE">Huarte</option>
            </select>
          </label>

          <label className="md:col-span-2 text-xs font-black uppercase tracking-wide text-violet-700">
            PDFs de facturas
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
            />
            {pendingFiles.length > 0 && (
              <div className="mt-2 space-y-1 rounded-xl border border-violet-200 bg-violet-50/50 p-2">
                {pendingFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-2 text-[11px] font-semibold text-violet-800">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(idx)}
                      className="rounded-md border border-rose-200 bg-white px-2 py-0.5 font-black text-rose-700 hover:bg-rose-50"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clearPendingFiles}
                    className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar carga
                  </button>
                </div>
              </div>
            )}
          </label>

          <div className="flex items-end">
            <button
              onClick={() => void processPendingFiles()}
              disabled={isProcessing || pendingFiles.length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              <FileUp size={16} />
              {isProcessing ? 'Procesando...' : `Cargar (${pendingFiles.length})`}
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs font-semibold text-violet-600">
          Si el PDF no trae lote, el pedido queda en <span className="font-black">pendiente manual</span> hasta que alguien complete el lote.
        </p>
      </section>

      <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-black text-violet-950">Cola de pedidos</h2>
          <span className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-black text-violet-700">
            {ordersLoading ? 'Cargando...' : `${activeOrders.length} activo(s)`}
          </span>
        </div>
        <p className="mb-3 text-xs font-semibold text-violet-600">
          Al despachar, el pedido se convierte en movimientos de <span className="font-black">tipo venta</span>, se oculta de esta cola y pasa a la carpeta interna de facturación.
        </p>

        {activeOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-6 text-center text-sm font-semibold text-violet-700">
            No hay pedidos todavía.
          </div>
        ) : (
          <div className="space-y-4">
            {activeOrders.map((order) => {
              const lotOptionsForLine = (line: BillingOrderLine) =>
                lotOptionsByWarehouseProduct.get(
                  `${order.inventoryTarget}|${order.sourceWarehouse}|${clean(line.productCode).toUpperCase()}`,
                ) || [];

              return (
                <article key={order.id} className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-black text-violet-950">
                      Factura {order.invoiceNumber} · {order.customerName}
                    </h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${statusClass(order.status)}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700">
                      {order.sourceWarehouse}
                    </span>
                    <span className="text-xs font-semibold text-violet-600">
                      {formatDate(order.invoiceDate)} · {order.sourceFileName}
                    </span>
                    {order.orderNote && (
                      <span className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-black text-cyan-800">
                        {order.orderNote}
                      </span>
                    )}
                    <button
                      onClick={() => openOrderPdf(order)}
                      className="rounded-lg border border-violet-200 bg-white px-2 py-0.5 text-[11px] font-black text-violet-700 hover:bg-violet-50"
                    >
                      Abrir PDF
                    </button>
                    <button
                      onClick={() => printOrderPdf(order)}
                      className="rounded-lg border border-violet-200 bg-white px-2 py-0.5 text-[11px] font-black text-violet-700 hover:bg-violet-50"
                    >
                      Imprimir
                    </button>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-black uppercase tracking-wide text-violet-700">
                          <th className="px-2 py-1">Producto</th>
                          <th className="px-2 py-1">Descripción</th>
                          <th className="px-2 py-1">Cantidad</th>
                          <th className="px-2 py-1">Lote</th>
                          <th className="px-2 py-1">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.lines.map((line) => {
                          const options = lotOptionsForLine(line);
                          return (
                            <tr key={line.id} className="border-t border-violet-100">
                              <td className="px-2 py-2">
                                <select
                                  value={line.productCode}
                                  onChange={(e) => updateLine(order.id, line.id, { productCode: e.target.value as ProductCode })}
                                  className="w-28 rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs font-black text-violet-900"
                                >
                                  <option value="">-</option>
                                  {PRODUCT_OPTIONS.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  value={line.productRaw}
                                  onChange={(e) => updateLine(order.id, line.id, { productRaw: e.target.value })}
                                  className="w-full min-w-56 rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs font-semibold text-violet-900"
                                  placeholder="Descripción factura"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={Number.isFinite(line.quantity) ? line.quantity : 0}
                                  onChange={(e) => updateLine(order.id, line.id, { quantity: toNum(e.target.value) })}
                                  className="w-24 rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs font-black text-violet-900"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex min-w-48 gap-1">
                                  <select
                                    value={line.lote}
                                    onChange={(e) => updateLine(order.id, line.id, { lote: clean(e.target.value), lotePending: !clean(e.target.value) })}
                                    className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs font-black text-violet-900"
                                  >
                                    <option value="">Seleccionar lote</option>
                                    {options.map((opt) => (
                                      <option key={opt.lote} value={opt.lote}>{opt.lote} ({opt.stock})</option>
                                    ))}
                                  </select>
                                  <input
                                    value={line.lote}
                                    onChange={(e) => updateLine(order.id, line.id, { lote: clean(e.target.value), lotePending: !clean(e.target.value) })}
                                    placeholder="manual"
                                    className="w-24 rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs font-black text-violet-900"
                                  />
                                </div>
                                {!clean(line.lote) && (
                                  <div className="mt-1 text-[11px] font-black text-amber-700">Pendiente manual</div>
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  onClick={() => removeLine(order.id, line.id)}
                                  className="rounded-lg border border-rose-200 p-1 text-rose-700 hover:bg-rose-50"
                                  title="Eliminar línea"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => addManualLine(order.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-black text-violet-700"
                    >
                      <Plus size={12} /> Línea manual
                    </button>

                    <button
                      onClick={() => markInPreparation(order.id)}
                      disabled={order.status === 'DESPACHADO' || order.status === 'CANCELADO'}
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-black text-sky-700 disabled:opacity-50"
                    >
                      <ClipboardCheck size={12} /> En preparación
                    </button>

                    <button
                      onClick={() => void dispatchOrder(order)}
                      disabled={order.status === 'DESPACHADO' || order.status === 'CANCELADO'}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700 disabled:opacity-50"
                    >
                      <Truck size={12} /> Despachar (crear movimientos)
                    </button>

                    <button
                      onClick={() => cancelOrder(order.id)}
                      disabled={order.status === 'DESPACHADO'}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black text-slate-700 disabled:opacity-50"
                    >
                      <Send size={12} /> Cancelar
                    </button>

                    <button
                      onClick={() => deleteOrder(order.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-black text-rose-700"
                    >
                      <Trash2 size={12} /> Eliminar pedido
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
