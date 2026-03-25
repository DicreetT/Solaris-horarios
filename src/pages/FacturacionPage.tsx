import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileUp, Send, ClipboardCheck, Truck, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import { InventoryMovementRow, useInventoryMovementsDB } from '../hooks/useInventoryMovementsDB';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const FACTURACION_ORDERS_KEY = 'facturacion_orders_v1';
const FACTURACION_ARCHIVE_KEY = 'facturacion_archive_v1';
const FACTURACION_HIDDEN_ORDERS_KEY = 'facturacion_hidden_orders_v1';
const FACTURACION_LABELS_KEY = 'facturacion_labels_v1';

type BillingWarehouse = 'CANET' | 'HUARTE';
type BillingOrderStatus =
  | 'PENDIENTE_MANUAL'
  | 'PENDIENTE_BULTOS'
  | 'PENDIENTE_ETIQUETAS'
  | 'PENDIENTE_PREPARACION'
  | 'EN_PREPARACION'
  | 'DESPACHADO'
  | 'CANCELADO';
type BillingMovementType = 'venta' | 'traspaso';
type BillingDocumentType = 'FACTURA' | 'TRANSFERENCIA';
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
  documentType: BillingDocumentType;
  movementType: BillingMovementType;
  sourceWarehouse: BillingWarehouse;
  transferDestination?: BillingWarehouse;
  inventoryTarget: 'canet' | 'huarte';
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerNif: string;
  sourceFileName: string;
  sourcePdfDataUrl?: string;
  orderNote?: string;
  requiredPackages: number;
  labels: BillingLabelAttachment[];
  labelFileName?: string;
  labelPdfDataUrl?: string;
  status: BillingOrderStatus;
  extractedTextSnippet: string;
  lines: BillingOrderLine[];
};

type BillingLabelAttachment = {
  id: string;
  sourceFileName: string;
  sourcePdfDataUrl?: string;
  customerName: string;
  attachedAt: string;
};

type BillingLabelDoc = {
  id: string;
  createdAt: string;
  sourceFileName: string;
  sourcePdfDataUrl?: string;
  customerName: string;
  customerKey: string;
  extractedTextSnippet: string;
};

type BillingUploadDocType = 'ORDER' | 'LABEL';

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
  { code: 'KL', hints: ['KHALA', 'KALAH', 'CALA'] },
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

function buildPdfOpenUrl(source: string): { url: string; revoke?: () => void } {
  const raw = clean(source);
  if (!raw) return { url: '' };
  if (/^(https?:|blob:)/i.test(raw)) return { url: raw };
  if (!raw.startsWith('data:')) return { url: raw };

  const commaIdx = raw.indexOf(',');
  if (commaIdx === -1) return { url: raw };
  const header = raw.slice(0, commaIdx);
  const payload = raw.slice(commaIdx + 1);

  try {
    let bytes: Uint8Array;
    if (/;base64/i.test(header)) {
      const bin = window.atob(payload);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      const decoded = decodeURIComponent(payload);
      bytes = new TextEncoder().encode(decoded);
    }
    const mime = clean(header.match(/^data:([^;]+)/i)?.[1]) || 'application/pdf';
    const blob = new Blob([new Uint8Array(bytes)], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    return {
      url: blobUrl,
      revoke: () => URL.revokeObjectURL(blobUrl),
    };
  } catch {
    return { url: raw };
  }
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

function normalizeCustomerKey(value: string) {
  return normalizeCustomerName(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

const CUSTOMER_STOP_WORDS = new Set([
  'DE',
  'DEL',
  'LA',
  'LAS',
  'LOS',
  'EL',
  'Y',
  'S',
  'SL',
  'SLU',
  'SA',
  'SAS',
  'SCP',
  'SOCIEDAD',
  'LIMITADA',
  'CONSULTING',
  'MEDICAL',
  'CENTER',
  'CENTRO',
  'CLINICA',
  'CLINIC',
  'HOSPITAL',
  'DESTINATARIO',
  'CLIENTE',
]);

function normalizeCustomerTokens(value: string) {
  return normalizeCustomerName(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((v) => clean(v))
    .filter((v) => v.length >= 3 && !CUSTOMER_STOP_WORDS.has(v));
}

function scoreCustomerMatch(orderName: string, labelName: string, labelFileName: string) {
  const orderKey = normalizeCustomerKey(orderName);
  const labelKey = normalizeCustomerKey(labelName);
  const fileNameKey = normalizeCustomerKey(inferCustomerFromFileName(labelFileName));
  if (!orderKey) return 0;

  let score = 0;
  if (labelKey) {
    if (orderKey === labelKey) score += 200;
    if (orderKey.includes(labelKey) || labelKey.includes(orderKey)) score += 120;
  }
  if (fileNameKey) {
    if (orderKey === fileNameKey) score += 160;
    if (orderKey.includes(fileNameKey) || fileNameKey.includes(orderKey)) score += 90;
  }

  const orderTokens = normalizeCustomerTokens(orderName);
  const labelTokens = Array.from(new Set([...normalizeCustomerTokens(labelName), ...normalizeCustomerTokens(labelFileName)]));

  let exactMatches = 0;
  let fuzzyMatches = 0;
  for (const token of labelTokens) {
    if (orderTokens.includes(token)) {
      exactMatches += 1;
      continue;
    }
    const hasFuzzy = orderTokens.some((orderToken) => {
      if (token.length < 5 || orderToken.length < 5) return false;
      return orderToken.startsWith(token) || token.startsWith(orderToken);
    });
    if (hasFuzzy) fuzzyMatches += 1;
  }

  score += exactMatches * 35;
  score += fuzzyMatches * 16;

  if (labelTokens.length > 0) {
    const coverage = (exactMatches + fuzzyMatches * 0.5) / labelTokens.length;
    score += Math.round(coverage * 20);
  }

  return score;
}

function inferCustomerFromFileName(fileName: string) {
  const base = clean(fileName).replace(/\.[^.]+$/, '');
  const norm = base
    .replace(/[_-]+/g, ' ')
    .replace(/\b(ETIQUETA|LABEL|ENVIO|ENVÍO|GUIA|GU[IÍ]A|CORREOS|SEUR|MRW|DHL|UPS|PDF)\b/gi, ' ')
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return normalizeCustomerName(norm);
}

function inferUploadDocType(text: string, fileName: string): BillingUploadDocType {
  const upperText = clean(text).toUpperCase();
  const upperName = clean(fileName).toUpperCase();

  const orderSignals = [
    'FACTURA',
    'ORDEN DE TRANSFERENCIA',
    'ALMACEN DE ORIGEN',
    'ALMACÉN DE ORIGEN',
    'N.º DE FACTURA',
    'N. DE FACTURA',
    'ARTÍCULO',
    'ARTICULO',
    'MOTIVO',
  ];
  if (orderSignals.some((sig) => upperText.includes(sig))) return 'ORDER';

  const labelSignals = [
    'DESTINATARIO',
    'REMITENTE',
    'CÓDIGO POSTAL',
    'CODIGO POSTAL',
    'ENVIO',
    'ENVÍO',
    'SHIPMENT TO',
    'SHIP TO',
    'DELIVER TO',
  ];
  if (labelSignals.some((sig) => upperText.includes(sig))) return 'LABEL';

  if (/\b(ETIQUETA|LABEL|ENVIO|GUIA)\b/i.test(upperName)) return 'LABEL';
  if (/\b(FACTURA|TRANSFERENCIA|T\d{2}-\d{4,})\b/i.test(upperName)) return 'ORDER';

  if (PRODUCT_HINTS.some((entry) => entry.hints.some((hint) => upperText.includes(hint)))) return 'ORDER';
  return 'LABEL';
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

function findShipmentToCustomer(lines: string[]) {
  const shipmentLabel = /^(?:SHIP(?:MENT)?\s+TO|DELIVER\s+TO|SEND\s+TO)\b[:\-\s]*/i;
  const sanitize = (value: string) =>
    clean(
      value
        .replace(shipmentLabel, '')
        .replace(/^TO[:\-\s]*/i, '')
        .replace(/\s{2,}/g, ' '),
    );
  const invalid = (value: string) =>
    !value ||
    /^\d+$/.test(value) ||
    /(STREET|CALLE|AVENIDA|ROAD|RD\.?|CP\b|CÓDIGO POSTAL|CODIGO POSTAL|ZIP|CITY|STATE|PAIS|SPAIN|ESPAÑA)/i.test(
      value,
    );

  for (let i = 0; i < lines.length; i++) {
    const line = clean(lines[i]);
    if (!shipmentLabel.test(line)) continue;

    const inline = sanitize(line);
    if (!invalid(inline) && !/\d/.test(inline) && inline.length >= 4) return inline;

    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 5); j++) {
      const candidate = sanitize(lines[j]);
      if (invalid(candidate)) continue;
      if (/\d/.test(candidate)) continue;
      if (candidate.length >= 4) return candidate;
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
    const m = clean(line).toUpperCase().match(/\b(?:\d{4}[A-Z]\d{2}|\d{6})\b/);
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

function extractTransferLines(text: string): BillingOrderLine[] {
  const tokens = normalizeTextLines(text);
  const lines: BillingOrderLine[] = [];
  const dedupe = new Set<string>();

  const isTransferRowAnchor = (line: string) => /^\d+\s+/.test(clean(line)) && isProductAnchorLine(line);
  const anchors = tokens
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => isTransferRowAnchor(line));

  const extractTransferQuantityFromSegment = (segment: string[]) => {
    const rows = segment.map((line) => clean(line)).filter(Boolean);
    if (rows.length === 0) return 0;

    for (let i = 0; i < rows.length; i++) {
      const valueOnly = rows[i].match(/^(\d{1,4}(?:\.\d{3})?,\d{2})$/);
      if (!valueOnly) continue;
      const next = clean(rows[i + 1] || '').toLowerCase();
      if (next.includes('box') || next.includes('caja') || next.includes('ud')) {
        const qty = parseSpanishNumber(valueOnly[1]);
        if (qty > 0 && qty <= 5000) return qty;
      }
    }

    const scored: Array<{ value: number; score: number }> = [];
    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      const lower = line.toLowerCase();

      const withUnit = line.match(/(\d{1,4}(?:\.\d{3})?,\d{2}|\d{1,4})\s*(box|caja|cajas|ud|uds|unidad|unidades)\b/i);
      if (withUnit?.[1]) {
        const qty = parseSpanishNumber(withUnit[1]);
        if (qty > 0 && qty <= 5000) scored.push({ value: qty, score: 120 });
      }

      const decimalOnly = line.match(/^(\d{1,4}(?:\.\d{3})?,\d{2})$/);
      if (decimalOnly?.[1]) {
        const qty = parseSpanishNumber(decimalOnly[1]);
        if (qty > 0 && qty <= 5000) {
          let score = 70;
          const prev = clean(rows[i - 1] || '').toLowerCase();
          const next = clean(rows[i + 1] || '').toLowerCase();
          if (next.includes('box') || next.includes('caja') || next.includes('ud')) score += 40;
          if (prev.includes('total') || next.includes('total') || next.includes('€') || prev.includes('€')) score -= 50;
          scored.push({ value: qty, score });
        }
      }

      if (/(€|eur|total|subtotal|tarifa|precio|iva)/i.test(lower)) continue;
    }

    if (scored.length === 0) return 0;
    scored.sort((a, b) => b.score - a.score);
    return scored[0].value;
  };

  const anchorsOrFallback = anchors.length
    ? anchors
    : tokens.map((line, idx) => ({ line, idx })).filter(({ line }) => isProductAnchorLine(line));

  for (let i = 0; i < anchorsOrFallback.length; i++) {
    const start = anchorsOrFallback[i].idx;
    const end =
      i < anchorsOrFallback.length - 1
        ? anchorsOrFallback[i + 1].idx - 1
        : Math.min(tokens.length - 1, start + 12);
    const segment = tokens.slice(start, end + 1);
    const anchorLine = clean(anchorsOrFallback[i].line);
    const productRaw = normalizeProductRaw(anchorLine.replace(/^\d+\s+/, ''));
    const productCode = inferProductCode(productRaw || anchorLine);
    if (!productCode) continue;

    const lote = extractLotFromSegment(segment);
    const anchorDecimals = [...anchorLine.matchAll(/\d{1,4}(?:\.\d{3})?,\d{2}/g)]
      .map((m) => parseSpanishNumber(m[0]))
      .filter((v) => Number.isFinite(v) && v > 0 && v <= 5000);
    const quantity = anchorDecimals.length >= 2 ? anchorDecimals[0] : extractTransferQuantityFromSegment(segment);
    const key = `${productCode}|${lote}|${Math.round(quantity * 100)}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);

    lines.push({
      id: uid('line'),
      productCode,
      productRaw,
      quantity,
      unit: 'box',
      lote,
      lotePending: !lote,
      notes: quantity <= 0 ? 'Cantidad pendiente de revisión manual.' : undefined,
    });
  }

  if (lines.length > 0) return lines;
  return extractInvoiceLines(text);
}

async function extractPdfTextFromArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const pages = await extractPdfPagesTextFromArrayBuffer(buffer);
  return clean(pages.join('\n'));
}

async function extractPdfPagesTextFromArrayBuffer(buffer: ArrayBuffer): Promise<string[]> {
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

    const normalizedPages = pagesText.map((p) => clean(p)).filter(Boolean);
    if (normalizedPages.length > 0 && clean(normalizedPages.join('\n')).length > 30) {
      return normalizedPages;
    }
  } catch (error) {
    console.warn('pdfjs extraction failed, fallback raw parser', error);
  }

  const fallback = clean(extractPdfTextFromRawPdf(buffer));
  return fallback ? [fallback] : [];
}

function isTransferDocText(text: string) {
  const upper = clean(text).toUpperCase();
  return (
    upper.includes('ORDEN DE TRANSFERENCIA') ||
    upper.includes('ALMACÉN DE ORIGEN') ||
    upper.includes('ALMACEN DE ORIGEN')
  );
}

function hasMeaningfulOrderLines(order: BillingOrder) {
  return order.lines.some((line) => {
    const code = clean(line.productCode);
    const qty = Number(line.quantity) || 0;
    return !!code && qty > 0;
  });
}

function isMimedicoDocText(text: string) {
  const upper = clean(text).toUpperCase();
  return upper.includes('PACIENTES.MIMEDICO.COM') || upper.includes('HOJA DE SEGUIMIENTO');
}

function countLikelyProductAnchors(text: string) {
  const tokens = normalizeTextLines(text);
  return tokens.filter((line) => isProductAnchorLine(line)).length;
}

function scoreOrderCandidate(order: BillingOrder, pageText: string) {
  let score = 0;
  const customer = clean(order.customerName);
  if (customer && customer !== 'CLIENTE SIN DETECTAR') score += 30;
  else score -= 25;

  const anchors = countLikelyProductAnchors(pageText);
  score += Math.min(anchors, 6) * 6;

  const validLines = order.lines.filter((line) => {
    const code = clean(line.productCode);
    const qty = Number(line.quantity) || 0;
    return !!code && qty > 0;
  }).length;
  score += validLines * 18;
  if (validLines === 0) score -= 40;

  const upper = clean(pageText).toUpperCase();
  if (upper.includes('DATOS CLIENTE')) score += 10;
  if (upper.includes('NO PEDIDO')) score += 8;
  if (upper.includes('HOJA DE SEGUIMIENTO')) score += 8;
  if (upper.includes('INCIDENCIAS') && validLines <= 1) score -= 10;
  if (upper.includes('RESUMEN FISCAL') && validLines <= 1) score -= 8;

  return score;
}

function buildOrderSignature(order: BillingOrder) {
  const customerKey = normalizeCustomerKey(order.customerName || '');
  const linesSig = order.lines
    .filter((line) => clean(line.productCode))
    .map((line) => {
      const code = clean(line.productCode);
      const qty = Math.round((Number(line.quantity) || 0) * 100);
      const lote = clean(line.lote).toUpperCase() || '-';
      return `${code}|${qty}|${lote}`;
    })
    .sort()
    .join(';');
  return `${customerKey}|${linesSig}`;
}

function parseOrdersFromExtractedPages(
  pagesText: string[],
  fileName: string,
  warehouse: BillingWarehouse,
  actor: string,
  sourcePdfDataUrl?: string,
): BillingOrder[] {
  const normalizedPages = pagesText.map((p) => clean(p)).filter(Boolean);
  const fullText = clean(normalizedPages.join('\n'));
  if (!fullText) return [];

  if (isTransferDocText(fullText)) {
    return [parseTransferFromText(fullText, fileName, warehouse, actor, sourcePdfDataUrl)];
  }

  const perPageCandidates = normalizedPages.map((pageText) => ({
    pageText,
    order: parseInvoiceFromText(pageText, fileName, warehouse, actor, sourcePdfDataUrl),
  }));

  const validPerPage = perPageCandidates.filter(({ order }) => hasMeaningfulOrderLines(order));
  if (validPerPage.length === 0) {
    return [parseInvoiceFromText(fullText, fileName, warehouse, actor, sourcePdfDataUrl)];
  }

  const unique = new Map<string, { order: BillingOrder; pageText: string; score: number }>();
  for (const candidate of validPerPage) {
    const sig = buildOrderSignature(candidate.order);
    if (!sig || sig.endsWith('|')) continue;
    const score = scoreOrderCandidate(candidate.order, candidate.pageText);
    const existing = unique.get(sig);
    if (!existing || score > existing.score) {
      unique.set(sig, { order: candidate.order, pageText: candidate.pageText, score });
    }
  }

  let deduped = Array.from(unique.values());
  deduped = deduped
    .filter((item) => item.score >= 20)
    .sort((a, b) => b.score - a.score);

  if (deduped.length === 0) {
    return [parseInvoiceFromText(fullText, fileName, warehouse, actor, sourcePdfDataUrl)];
  }

  if (isMimedicoDocText(fullText)) {
    const byCustomer = new Map<string, { order: BillingOrder; score: number }>();
    for (const item of deduped) {
      const customerKey = normalizeCustomerKey(item.order.customerName || '');
      const key = customerKey || `NO_CUSTOMER_${item.order.id}`;
      const existing = byCustomer.get(key);
      if (!existing || item.score > existing.score) {
        byCustomer.set(key, { order: item.order, score: item.score });
      }
    }
    const grouped = Array.from(byCustomer.values()).map((v) => v.order);
    if (grouped.length >= 2) return grouped;
  }

  const dedupedOrders = deduped.map((d) => d.order);
  if (dedupedOrders.length >= 2) return dedupedOrders;

  return [parseInvoiceFromText(fullText, fileName, warehouse, actor, sourcePdfDataUrl)];
}

function parseLabelsFromExtractedPages(
  pagesText: string[],
  fileName: string,
  sourcePdfDataUrl?: string,
) {
  const normalizedPages = pagesText.map((p) => clean(p)).filter(Boolean);
  if (normalizedPages.length === 0) return [] as BillingLabelDoc[];

  if (normalizedPages.length === 1) {
    return [parseLabelFromText(normalizedPages[0], fileName, sourcePdfDataUrl)];
  }

  const labels = normalizedPages
    .map((pageText, idx) => {
      const parsed = parseLabelFromText(pageText, fileName, sourcePdfDataUrl);
      return {
        ...parsed,
        sourceFileName: `${fileName} · p${idx + 1}`,
      };
    })
    .filter((label) => clean(label.customerName) && clean(label.customerName) !== 'CLIENTE SIN DETECTAR');

  return labels.length > 0 ? labels : [parseLabelFromText(normalizedPages.join('\n'), fileName, sourcePdfDataUrl)];
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
    documentType: 'FACTURA',
    movementType: 'venta',
    sourceWarehouse: warehouse,
    inventoryTarget: warehouse === 'CANET' ? 'canet' : 'huarte',
    invoiceNumber,
    invoiceDate,
    customerName: customerName || 'CLIENTE SIN DETECTAR',
    customerNif,
    sourceFileName: fileName,
    sourcePdfDataUrl,
    orderNote,
    requiredPackages: 0,
    labels: [],
    status: hasPending ? 'PENDIENTE_MANUAL' : 'PENDIENTE_BULTOS',
    extractedTextSnippet: normalized.slice(0, 600),
    lines: invoiceLines,
  };
}

function parseTransferFromText(
  text: string,
  fileName: string,
  fallbackWarehouse: BillingWarehouse,
  actor: string,
  sourcePdfDataUrl?: string,
): BillingOrder {
  const normalized = text.replace(/\r/g, '\n').replace(/\n{2,}/g, '\n');
  const lines = normalizeTextLines(normalized);

  const transferNumber =
    findValueAfterLabel(lines, /^ORDEN\s+DE\s+TRANSFERENCIA\s*N[º°o]?[.\s:\/-]*/i) ||
    clean(normalized.match(/\bT\d{2}-\d{4,8}\b/i)?.[0]) ||
    clean(normalized.match(/\bTR?26-\d{4,8}\b/i)?.[0]) ||
    `T-${uid('ot')}`;

  const dateRaw =
    findValueAfterLabel(lines, /^FECHA[:\-\s]*/i) ||
    clean(normalized.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1]);
  const invoiceDate = toIsoDate(dateRaw);

  const originRaw = findValueAfterLabel(lines, /^ALMAC[EÉ]N\s+DE\s+ORIGEN[:\-\s]*/i, 4);
  const destinationRaw = findValueAfterLabel(lines, /^ALMAC[EÉ]N\s+DE\s+DESTINO[:\-\s]*/i, 4);
  const sourceWarehouse = normalizeWarehouseAlias(originRaw) || fallbackWarehouse;
  const transferDestination = normalizeWarehouseAlias(destinationRaw) || (sourceWarehouse === 'CANET' ? 'HUARTE' : 'CANET');

  const motive = findValueAfterLabel(lines, /^MOTIVO[:\-\s]*/i, 3);
  const customerName = transferDestination;
  const transferLines = extractTransferLines(normalized);
  const hasPending = transferLines.some((line) => line.lotePending || !clean(line.lote));

  return {
    id: uid('ord'),
    createdAt: new Date().toISOString(),
    createdBy: actor || 'Sistema',
    documentType: 'TRANSFERENCIA',
    movementType: 'traspaso',
    sourceWarehouse,
    transferDestination,
    inventoryTarget: sourceWarehouse === 'CANET' ? 'canet' : 'huarte',
    invoiceNumber: transferNumber,
    invoiceDate,
    customerName,
    customerNif: '',
    sourceFileName: fileName,
    sourcePdfDataUrl,
    orderNote: motive ? `Motivo: ${motive}` : 'Solicitud de transferencia',
    requiredPackages: 0,
    labels: [],
    status: hasPending ? 'PENDIENTE_MANUAL' : 'PENDIENTE_BULTOS',
    extractedTextSnippet: normalized.slice(0, 600),
    lines: transferLines,
  };
}

function parseLabelFromText(text: string, fileName: string, sourcePdfDataUrl?: string): BillingLabelDoc {
  const normalized = text.replace(/\r/g, '\n').replace(/\n{2,}/g, '\n');
  const lines = normalizeTextLines(normalized);
  const customerName =
    normalizeCustomerName(
      findShipmentToCustomer(lines) ||
      findCustomerFromLines(lines) ||
      findValueAfterLabel(lines, /^DESTINATARIO[:\-\s]*/i, 4) ||
      findValueAfterLabel(lines, /^CLIENTE[:\-\s]*/i, 4) ||
      findValueAfterLabel(lines, /^SHIP(?:MENT)?\s+TO[:\-\s]*/i, 4) ||
      findValueAfterLabel(lines, /^DELIVER\s+TO[:\-\s]*/i, 4) ||
      inferCustomerFromFileName(fileName),
    ) || 'CLIENTE SIN DETECTAR';

  return {
    id: uid('lbl'),
    createdAt: new Date().toISOString(),
    sourceFileName: fileName,
    sourcePdfDataUrl,
    customerName,
    customerKey: normalizeCustomerKey(customerName),
    extractedTextSnippet: normalized.slice(0, 600),
  };
}

function parseOrderFromText(
  text: string,
  fileName: string,
  warehouse: BillingWarehouse,
  actor: string,
  sourcePdfDataUrl?: string,
): BillingOrder {
  if (isTransferDocText(text)) {
    return parseTransferFromText(text, fileName, warehouse, actor, sourcePdfDataUrl);
  }
  return parseInvoiceFromText(text, fileName, warehouse, actor, sourcePdfDataUrl);
}

function statusClass(status: BillingOrderStatus) {
  if (status === 'DESPACHADO') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'EN_PREPARACION') return 'bg-sky-100 text-sky-800 border-sky-200';
  if (status === 'PENDIENTE_ETIQUETAS') return 'bg-cyan-100 text-cyan-800 border-cyan-200';
  if (status === 'PENDIENTE_BULTOS') return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  if (status === 'PENDIENTE_PREPARACION') return 'bg-violet-100 text-violet-800 border-violet-200';
  if (status === 'PENDIENTE_MANUAL') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function getOrderLabels(order: BillingOrder): BillingLabelAttachment[] {
  if (Array.isArray(order.labels) && order.labels.length > 0) return order.labels;
  if (order.labelPdfDataUrl || order.labelFileName) {
    return [
      {
        id: `legacy-${order.id}`,
        sourceFileName: order.labelFileName || 'Etiqueta',
        sourcePdfDataUrl: order.labelPdfDataUrl,
        customerName: order.customerName,
        attachedAt: order.createdAt || new Date().toISOString(),
      },
    ];
  }
  return [];
}

function getOrderRequiredPackages(order: BillingOrder) {
  const raw = Number((order as any).requiredPackages);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

function orderRequiresLabels(order: BillingOrder) {
  return clean(order.sourceWarehouse).toUpperCase() === 'CANET';
}

function recomputeOrderStatus(order: BillingOrder): BillingOrderStatus {
  if (order.status === 'CANCELADO' || order.status === 'DESPACHADO') return order.status;
  const hasPendingLot = order.lines.some((line) => line.lotePending || !clean(line.lote));
  if (hasPendingLot) return 'PENDIENTE_MANUAL';
  if (!orderRequiresLabels(order)) {
    if (order.status === 'EN_PREPARACION') return 'EN_PREPARACION';
    return 'PENDIENTE_PREPARACION';
  }
  const requiredPackages = getOrderRequiredPackages(order);
  if (requiredPackages <= 0) return 'PENDIENTE_BULTOS';
  const labelsAttached = getOrderLabels(order).length;
  if (labelsAttached < requiredPackages) return 'PENDIENTE_ETIQUETAS';
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
  const [pendingInboxFiles, setPendingInboxFiles] = useState<File[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingLabelFiles, setPendingLabelFiles] = useState<File[]>([]);
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
  const [labelQueue, setLabelQueue] = useSharedJsonState<BillingLabelDoc[]>(
    FACTURACION_LABELS_KEY,
    [],
    { userId: currentUser?.id, initializeIfMissing: true, pollIntervalMs: 15000 },
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
  const activeLabelQueue = useMemo(() => (labelQueue || []), [labelQueue]);

  useEffect(() => {
    if (!orders || orders.length === 0) return;
    let changed = false;
    const next = orders.map((order) => {
      const requiredPackages = getOrderRequiredPackages(order);
      const labels = getOrderLabels(order);
      const primaryLabel = labels[0];
      const status = recomputeOrderStatus({ ...order, requiredPackages, labels } as BillingOrder);
      const mustUpdate =
        requiredPackages !== (order as any).requiredPackages ||
        !Array.isArray((order as any).labels) ||
        (order as any).labels.length !== labels.length ||
        clean(order.labelFileName) !== clean(primaryLabel?.sourceFileName) ||
        clean(order.labelPdfDataUrl) !== clean(primaryLabel?.sourcePdfDataUrl) ||
        order.status !== status;
      if (!mustUpdate) return order;
      changed = true;
      return {
        ...order,
        requiredPackages,
        labels,
        labelFileName: primaryLabel?.sourceFileName,
        labelPdfDataUrl: primaryLabel?.sourcePdfDataUrl,
        status,
      };
    });
    if (changed) setOrders(next);
  }, [orders, setOrders]);

  const hideOrderId = (orderId: string) => {
    const id = clean(orderId);
    if (!id) return;
    setHiddenOrderIds((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      if (current.includes(id)) return current;
      return [id, ...current];
    });
  };

  const tryAttachLabels = useCallback(
    (ordersList: BillingOrder[], labelsList: BillingLabelDoc[]) => {
      if (!ordersList.length || !labelsList.length) {
        return { ordersNext: ordersList, labelsNext: labelsList, attached: 0 };
      }

      const nextOrders = [...ordersList];
      let attached = 0;
      const labelsNext: BillingLabelDoc[] = [];

      for (const label of labelsList) {
        const labelKey = normalizeCustomerKey(label.customerName || '');
        const fileNameKey = normalizeCustomerKey(inferCustomerFromFileName(label.sourceFileName || ''));
        if (!labelKey && !fileNameKey) {
          labelsNext.push(label);
          continue;
        }

        const candidates = nextOrders
          .map((order, idx) => ({ order, idx }))
          .filter(({ order }) => {
            if (order.status === 'DESPACHADO' || order.status === 'CANCELADO') return false;
            const requiredPackages = getOrderRequiredPackages(order);
            const attachedLabels = getOrderLabels(order);
            if (requiredPackages > 0 && attachedLabels.length >= requiredPackages) return false;
            const orderKey = normalizeCustomerKey(order.customerName || '');
            return !!orderKey;
          })
          .map(({ order, idx }) => ({
            idx,
            score: scoreCustomerMatch(order.customerName || '', label.customerName || '', label.sourceFileName || ''),
          }))
          .filter((c) => c.score > 0)
          .sort((a, b) => b.score - a.score);

        if (candidates.length === 0) {
          labelsNext.push(label);
          continue;
        }

        const best = candidates[0];
        const second = candidates[1];
        const isAmbiguous = !!second && best.score - second.score < 25;
        const isTooWeak = best.score < 45;
        if (isAmbiguous || isTooWeak) {
          labelsNext.push(label);
          continue;
        }

        const orderIdx = best.idx;
        const currentLabels = getOrderLabels(nextOrders[orderIdx]);
        const requiredPackages = getOrderRequiredPackages(nextOrders[orderIdx]);
        if (requiredPackages > 0 && currentLabels.length >= requiredPackages) {
          labelsNext.push(label);
          continue;
        }

        const duplicate = currentLabels.some((existing) => clean(existing.id) === clean(label.id));
        if (duplicate) {
          labelsNext.push(label);
          continue;
        }

        const mergedLabels: BillingLabelAttachment[] = [
          ...currentLabels,
          {
            id: label.id,
            sourceFileName: label.sourceFileName,
            sourcePdfDataUrl: label.sourcePdfDataUrl,
            customerName: label.customerName,
            attachedAt: new Date().toISOString(),
          },
        ];
        nextOrders[orderIdx] = {
          ...nextOrders[orderIdx],
          labels: mergedLabels,
          labelPdfDataUrl: mergedLabels[0]?.sourcePdfDataUrl,
          labelFileName: mergedLabels[0]?.sourceFileName,
        };
        attached += 1;
      }

      return { ordersNext: nextOrders, labelsNext, attached };
    },
    [],
  );

  useEffect(() => {
    const queue = activeLabelQueue;
    const currentOrders = orders || [];
    if (queue.length === 0 || currentOrders.length === 0) return;

    const { ordersNext, labelsNext, attached } = tryAttachLabels(currentOrders, queue);
    if (attached <= 0) return;
    setOrders(ordersNext);
    setLabelQueue(labelsNext);
  }, [activeLabelQueue, orders, setLabelQueue, setOrders, tryAttachLabels]);

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

  const handleInboxFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).filter((f) => f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf'));
    setPendingInboxFiles(next);
  };

  const handleLabelFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).filter((f) => f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf'));
    setPendingLabelFiles(next);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removePendingInboxFile = (index: number) => {
    setPendingInboxFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearPendingFiles = () => {
    setPendingFiles([]);
  };

  const clearPendingInboxFiles = () => {
    setPendingInboxFiles([]);
  };

  const removePendingLabelFile = (index: number) => {
    setPendingLabelFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearPendingLabelFiles = () => {
    setPendingLabelFiles([]);
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
        const extractedPages = await extractPdfPagesTextFromArrayBuffer(buffer);
        const sourcePdfDataUrl = await readFileAsDataUrl(file);
        parsedOrders.push(
          ...parseOrdersFromExtractedPages(
            extractedPages,
            file.name,
            sourceWarehouse,
            currentUser?.name || 'Sistema',
            sourcePdfDataUrl,
          ),
        );
      }

      setOrders((prev) => {
        const next = Array.isArray(prev) ? [...prev] : [];
        const merged = [...parsedOrders, ...next];
        const attached = tryAttachLabels(merged, activeLabelQueue);
        if (attached.attached > 0) {
          setLabelQueue(attached.labelsNext);
          return attached.ordersNext;
        }
        return merged;
      });
      setPendingFiles([]);
      const transferCount = parsedOrders.filter((o) => o.documentType === 'TRANSFERENCIA').length;
      const invoiceCount = parsedOrders.length - transferCount;
      alert(`${invoiceCount} factura(s) y ${transferCount} transferencia(s) cargada(s) en cola.`);
    } catch (error) {
      console.error('Error processing invoices:', error);
      alert('No se pudieron procesar las facturas. Revisa el formato PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const processInboxFiles = async () => {
    if (pendingInboxFiles.length === 0) {
      alert('Selecciona al menos un PDF.');
      return;
    }
    setIsProcessing(true);
    try {
      const parsedOrders: BillingOrder[] = [];
      const parsedLabels: BillingLabelDoc[] = [];
      const failedFiles: string[] = [];

      for (const file of pendingInboxFiles) {
        try {
          const buffer = await file.arrayBuffer();
          let extractedPages: string[] = [];
          let extracted = '';
          try {
            extractedPages = await extractPdfPagesTextFromArrayBuffer(buffer);
            extracted = clean(extractedPages.join('\n'));
          } catch {
            extractedPages = [];
            extracted = '';
          }
          let sourcePdfDataUrl = '';
          try {
            sourcePdfDataUrl = await readFileAsDataUrl(file);
          } catch {
            sourcePdfDataUrl = '';
          }
          const docType = inferUploadDocType(extracted, file.name);
          if (docType === 'LABEL') {
            parsedLabels.push(
              ...parseLabelsFromExtractedPages(
                extractedPages.length > 0 ? extractedPages : [extracted],
                file.name,
                sourcePdfDataUrl,
              ),
            );
          } else {
            parsedOrders.push(
              ...parseOrdersFromExtractedPages(
                extractedPages.length > 0 ? extractedPages : [extracted],
                file.name,
                sourceWarehouse,
                currentUser?.name || 'Sistema',
                sourcePdfDataUrl,
              ),
            );
          }
        } catch {
          failedFiles.push(file.name);
        }
      }

      const mergedLabels = [...parsedLabels, ...(activeLabelQueue || [])];
      setOrders((prev) => {
        const next = Array.isArray(prev) ? [...prev] : [];
        const mergedOrders = [...parsedOrders, ...next];
        const attached = tryAttachLabels(mergedOrders, mergedLabels);
        setLabelQueue(attached.labelsNext);
        return attached.ordersNext;
      });

      setPendingInboxFiles([]);
      const transferCount = parsedOrders.filter((o) => o.documentType === 'TRANSFERENCIA').length;
      const invoiceCount = parsedOrders.filter((o) => o.documentType === 'FACTURA').length;
      const labelCount = parsedLabels.length;
      const attachedHint =
        parsedLabels.length > 0 ? ' Las etiquetas se intentaron asociar automáticamente por cliente.' : '';
      const failedHint = failedFiles.length > 0 ? ` No se pudieron leer: ${failedFiles.join(', ')}.` : '';
      alert(
        `Carga automática completa. Facturas: ${invoiceCount}, transferencias: ${transferCount}, etiquetas: ${labelCount}.${attachedHint}${failedHint}`,
      );
    } catch (error) {
      console.error('Error processing mixed files:', error);
      alert('No se pudieron procesar los documentos. Revisa el formato PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const processLabelFiles = async () => {
    if (pendingLabelFiles.length === 0) {
      alert('Selecciona al menos un PDF de etiqueta.');
      return;
    }
    setIsProcessing(true);
    try {
      const labels: BillingLabelDoc[] = [];
      const failedFiles: string[] = [];
      for (const file of pendingLabelFiles) {
        try {
          const buffer = await file.arrayBuffer();
          let extractedPages: string[] = [];
          let extracted = '';
          try {
            extractedPages = await extractPdfPagesTextFromArrayBuffer(buffer);
            extracted = clean(extractedPages.join('\n'));
          } catch {
            extractedPages = [];
            extracted = '';
          }
          let sourcePdfDataUrl = '';
          try {
            sourcePdfDataUrl = await readFileAsDataUrl(file);
          } catch {
            sourcePdfDataUrl = '';
          }
          labels.push(
            ...parseLabelsFromExtractedPages(
              extractedPages.length > 0 ? extractedPages : [extracted],
              file.name,
              sourcePdfDataUrl,
            ),
          );
        } catch {
          failedFiles.push(file.name);
        }
      }

      if (labels.length === 0) {
        alert(
          `No se pudieron procesar las etiquetas.${failedFiles.length > 0 ? ` Archivos: ${failedFiles.join(', ')}` : ''}`,
        );
        return;
      }

      const mergedLabels = [...labels, ...(activeLabelQueue || [])];
      const attached = tryAttachLabels(orders || [], mergedLabels);
      if (attached.attached > 0) {
        setOrders(attached.ordersNext);
      }
      setLabelQueue(attached.labelsNext);
      setPendingLabelFiles([]);
      alert(
        `${labels.length} etiqueta(s) cargada(s). ${
          attached.attached > 0 ? `${attached.attached} asociada(s) automáticamente.` : 'Sin asociaciones automáticas; quedaron en cola.'
        }${failedFiles.length > 0 ? ` No se pudieron leer: ${failedFiles.join(', ')}.` : ''}`,
      );
    } catch (error) {
      console.error('Error processing labels:', error);
      alert('No se pudieron procesar las etiquetas. Revisa el formato PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateOrder = (orderId: string, updater: (order: BillingOrder) => BillingOrder) => {
    setOrders((prev) =>
      (prev || []).map((order) => {
        if (order.id !== orderId) return order;
        const updated = updater(order);
        const labels = getOrderLabels(updated);
        return {
          ...updated,
          requiredPackages: getOrderRequiredPackages(updated),
          labels,
          labelPdfDataUrl: labels[0]?.sourcePdfDataUrl,
          labelFileName: labels[0]?.sourceFileName,
          status: recomputeOrderStatus({ ...updated, labels } as BillingOrder),
        };
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

  const removeQueuedLabel = (labelId: string) => {
    setLabelQueue((prev) => (prev || []).filter((label) => label.id !== labelId));
  };

  const setRequiredPackages = (orderId: string, value: number) => {
    updateOrder(orderId, (order) => ({
      ...order,
      requiredPackages: Math.max(0, Math.floor(Number(value) || 0)),
    }));
  };

  const attachQueuedLabelToOrder = (order: BillingOrder, labelId: string) => {
    const label = activeLabelQueue.find((item) => item.id === labelId);
    if (!label) return;

    const labels = getOrderLabels(order);
    const requiredPackages = getOrderRequiredPackages(order);
    if (requiredPackages > 0 && labels.length >= requiredPackages) {
      alert('Este pedido ya tiene todas las etiquetas requeridas por bultos.');
      return;
    }

    updateOrder(order.id, (current) => {
      const currentLabels = getOrderLabels(current);
      return {
        ...current,
        labels: [
          ...currentLabels,
          {
            id: label.id,
            sourceFileName: label.sourceFileName,
            sourcePdfDataUrl: label.sourcePdfDataUrl,
            customerName: label.customerName,
            attachedAt: new Date().toISOString(),
          },
        ],
      };
    });
    setLabelQueue((prev) => (prev || []).filter((item) => item.id !== labelId));
  };

  const removeAttachedLabelFromOrder = (orderId: string, labelId: string) => {
    updateOrder(orderId, (order) => ({
      ...order,
      labels: getOrderLabels(order).filter((item) => item.id !== labelId),
    }));
  };

  const openPdfDataUrl = (dataUrl?: string, emptyMessage = 'No hay PDF adjunto.') => {
    if (!dataUrl) {
      alert(emptyMessage);
      return;
    }
    const { url, revoke } = buildPdfOpenUrl(dataUrl);
    if (!url) {
      alert('No se pudo construir el enlace del PDF.');
      return;
    }
    if (revoke) window.setTimeout(revoke, 120000);
    let opened = false;
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      opened = true;
    } catch {
      opened = false;
    }
    if (opened) return;
    try {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) return;
    } catch {
      // noop
    }
    try {
      window.location.href = url;
    } catch {
      alert('No se pudo abrir el PDF. Revisa el bloqueador de ventanas emergentes.');
    }
  };

  const printPdfDataUrl = (dataUrl?: string, emptyMessage = 'No hay PDF adjunto.') => {
    if (!dataUrl) {
      alert(emptyMessage);
      return;
    }
    const { url, revoke } = buildPdfOpenUrl(dataUrl);
    if (!url) {
      alert('No se pudo construir el enlace del PDF.');
      return;
    }
    const win = window.open(url, '_blank');
    if (revoke) window.setTimeout(revoke, 120000);
    const doPrint = (target: Window | null) => {
      if (!target) return false;
      try {
        target.focus();
        target.print();
        return true;
      } catch {
        return false;
      }
    };
    if (win) {
      const printLater = () => {
        void doPrint(win);
      };
      win.onload = printLater;
      window.setTimeout(printLater, 1200);
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.src = url;
    document.body.appendChild(iframe);
    const printFromFrame = () => {
      try {
        const target = iframe.contentWindow;
        if (!doPrint(target)) throw new Error('print-failed');
      } catch {
        alert('No se pudo abrir/imprimir el PDF. Revisa el bloqueador de ventanas emergentes.');
      } finally {
        window.setTimeout(() => iframe.remove(), 5000);
      }
    };
    iframe.onload = printFromFrame;
    window.setTimeout(printFromFrame, 1500);
  };

  const openOrderPdf = (order: BillingOrder) => {
    openPdfDataUrl(order.sourcePdfDataUrl, 'No hay PDF adjunto en este pedido.');
  };

  const printOrderPdf = (order: BillingOrder) => {
    printPdfDataUrl(order.sourcePdfDataUrl, 'No hay PDF adjunto en este pedido.');
  };

  const dispatchOrder = async (order: BillingOrder) => {
    if (order.status === 'DESPACHADO' || order.status === 'CANCELADO') return;

    const pending = order.lines.filter((line) => !clean(line.lote));
    if (pending.length > 0) {
      alert('Este pedido sigue pendiente manual: faltan lotes por completar.');
      return;
    }

    const requiresLabels = orderRequiresLabels(order);
    const requiredPackages = getOrderRequiredPackages(order);
    const attachedLabels = getOrderLabels(order);
    if (requiresLabels) {
      if (requiredPackages <= 0) {
        alert('Antes de despachar, define cuántos bultos/etiquetas requiere este pedido.');
        return;
      }
      if (attachedLabels.length < requiredPackages) {
        alert(
          `Faltan etiquetas para despachar: ${attachedLabels.length}/${requiredPackages}.`,
        );
        return;
      }
    }

    const movementSource = order.inventoryTarget === 'canet' ? canetMovements : huarteMovements;
    const mutation = order.inventoryTarget === 'canet' ? canetMutations.addMovement : huarteMutations.addMovement;
    const isTransfer = order.movementType === 'traspaso';
    const transferDestination = clean(order.transferDestination || '');

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
          tipo_movimiento: isTransfer ? 'traspaso' : 'venta',
          producto: clean(line.productCode),
          lote: clean(line.lote),
          cantidad: qty,
          cantidad_signed: -qty,
          signo: -1,
          bodega: order.sourceWarehouse,
          cliente: isTransfer ? transferDestination || order.customerName : order.customerName,
          destino: isTransfer ? transferDestination : '',
          notas: `${marker} | Factura ${order.invoiceNumber}${order.orderNote ? ` | ${order.orderNote}` : ''}`,
          factura_doc: order.invoiceNumber,
          responsable: currentUser?.name || 'Sistema',
          source: 'facturacion_pdf',
          afecta_stock: 'SI',
        });

        if (
          isTransfer &&
          order.inventoryTarget === 'canet' &&
          order.sourceWarehouse === 'CANET' &&
          transferDestination === 'HUARTE'
        ) {
          const autoMarker = `${marker}|AUTO_IN`;
          const existingAutoIn = huarteMovements.find((m) => clean(m.notas).includes(autoMarker));
          if (!existingAutoIn) {
            await huarteMutations.addMovement({
              fecha: order.invoiceDate || new Date().toISOString().slice(0, 10),
              tipo_movimiento: 'entrada_traspaso',
              producto: clean(line.productCode),
              lote: clean(line.lote),
              cantidad: qty,
              cantidad_signed: qty,
              signo: 1,
              bodega: 'HUARTE',
              cliente: 'CANET',
              destino: 'HUARTE',
              notas: `${autoMarker} | Auto entrada por traspaso desde Canet`,
              factura_doc: order.invoiceNumber,
              responsable: currentUser?.name || 'Sistema',
              source: 'facturacion_pdf_auto_in',
              afecta_stock: 'SI',
            });
          }
        }

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
      alert(`Pedido ${order.invoiceNumber} despachado y convertido en movimientos (${order.movementType}).`);
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
        <h1 className="text-3xl font-black text-violet-950">Despachos</h1>
        <p className="mt-1 text-sm text-violet-700">
          Carga facturas PDF, revisa líneas, completa lotes pendientes y envía/despacha pedidos para Canet o Huarte.
        </p>
      </section>

      <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-6">
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

          <label className="md:col-span-2 text-xs font-black uppercase tracking-wide text-violet-700">
            PDFs de etiquetas
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(e) => handleLabelFilesSelected(e.target.files)}
              className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
            />
            {pendingLabelFiles.length > 0 && (
              <div className="mt-2 space-y-1 rounded-xl border border-cyan-200 bg-cyan-50/50 p-2">
                {pendingLabelFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-2 text-[11px] font-semibold text-cyan-900">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removePendingLabelFile(idx)}
                      className="rounded-md border border-rose-200 bg-white px-2 py-0.5 font-black text-rose-700 hover:bg-rose-50"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clearPendingLabelFiles}
                    className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar carga
                  </button>
                </div>
              </div>
            )}
          </label>

          <div className="flex items-end">
            <div className="flex w-full flex-col gap-2">
              <button
                onClick={() => void processPendingFiles()}
                disabled={isProcessing || pendingFiles.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
              >
                <FileUp size={16} />
                {isProcessing ? 'Procesando...' : `Cargar pedidos (${pendingFiles.length})`}
              </button>
              <button
                onClick={() => void processLabelFiles()}
                disabled={isProcessing || pendingLabelFiles.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-black text-cyan-900 disabled:opacity-50"
              >
                <FileUp size={16} />
                {isProcessing ? 'Procesando...' : `Cargar etiquetas (${pendingLabelFiles.length})`}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/40 p-3">
          <div className="grid gap-3 md:grid-cols-6">
            <label className="md:col-span-5 text-xs font-black uppercase tracking-wide text-violet-700">
              PDFs mixtos (auto: factura/transferencia/etiqueta)
              <input
                type="file"
                accept=".pdf,application/pdf"
                multiple
                onChange={(e) => handleInboxFilesSelected(e.target.files)}
                className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
              />
              {pendingInboxFiles.length > 0 && (
                <div className="mt-2 space-y-1 rounded-xl border border-violet-200 bg-white p-2">
                  {pendingInboxFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center justify-between gap-2 text-[11px] font-semibold text-violet-800"
                    >
                      <span className="truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removePendingInboxFile(idx)}
                        className="rounded-md border border-rose-200 bg-white px-2 py-0.5 font-black text-rose-700 hover:bg-rose-50"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={clearPendingInboxFiles}
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
                onClick={() => void processInboxFiles()}
                disabled={isProcessing || pendingInboxFiles.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-900 disabled:opacity-50"
              >
                <FileUp size={16} />
                {isProcessing ? 'Procesando...' : `Cargar docs (${pendingInboxFiles.length})`}
              </button>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs font-semibold text-violet-600">
          Si el PDF no trae lote, el pedido queda en <span className="font-black">pendiente manual</span> hasta que alguien complete el lote.
          Puedes cargar separado (facturas/etiquetas) o usar carga mixta automática. Para pedidos de <span className="font-black">Canet</span> define bultos requeridos y asocia etiquetas; en <span className="font-black">Huarte</span> las etiquetas son opcionales.
        </p>
        {activeLabelQueue.length > 0 && (
          <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-wide text-cyan-900">
                Etiquetas pendientes de asociar: {activeLabelQueue.length}
              </p>
            </div>
            <div className="space-y-1">
              {activeLabelQueue.slice(0, 8).map((label) => (
                <div key={label.id} className="flex items-center justify-between gap-2 rounded-lg border border-cyan-200 bg-white px-2 py-1">
                  <div className="truncate text-xs font-semibold text-cyan-900">
                    {label.customerName} · {label.sourceFileName}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openPdfDataUrl(label.sourcePdfDataUrl, 'Etiqueta sin PDF adjunto.')}
                      className="rounded-md border border-cyan-300 bg-white px-2 py-0.5 text-[11px] font-black text-cyan-900 hover:bg-cyan-50"
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQueuedLabel(label.id)}
                      className="rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-black text-rose-700 hover:bg-rose-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-black text-violet-950">Cola de pedidos</h2>
          <span className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-black text-violet-700">
            {ordersLoading ? 'Cargando...' : `${activeOrders.length} activo(s)`}
          </span>
        </div>
        <p className="mb-3 text-xs font-semibold text-violet-600">
          Al despachar, el pedido se convierte en movimientos de <span className="font-black">tipo venta/traspaso</span>, se oculta de esta cola y pasa a la carpeta interna de despachos.
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
              const requiredPackages = getOrderRequiredPackages(order);
              const attachedLabels = getOrderLabels(order);
              const requiresLabels = orderRequiresLabels(order);

              return (
                <article key={order.id} className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-black text-violet-950">
                      {order.documentType === 'TRANSFERENCIA' ? 'Transferencia' : 'Factura'} {order.invoiceNumber} · {order.customerName}
                    </h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${statusClass(order.status)}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700">
                      {order.sourceWarehouse}
                    </span>
                    {order.transferDestination && (
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-black text-cyan-800">
                        Destino {order.transferDestination}
                      </span>
                    )}
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-black text-indigo-700">
                      {order.movementType}
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

                  <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-violet-100 bg-violet-50/40 px-2 py-2">
                    {requiresLabels ? (
                      <>
                        <label className="text-[11px] font-black uppercase tracking-wide text-violet-700">
                          Bultos requeridos
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={requiredPackages}
                            onChange={(e) => setRequiredPackages(order.id, Number(e.target.value || 0))}
                            className="mt-1 w-24 rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs font-black text-violet-900"
                          />
                        </label>
                        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-black text-cyan-800">
                          Etiquetas: {attachedLabels.length}/{requiredPackages || 0}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-800">
                        Huarte: despacho permitido sin etiqueta
                      </div>
                    )}
                    {activeLabelQueue.length > 0 && (
                      <>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const value = clean(e.target.value);
                            if (!value) return;
                            attachQueuedLabelToOrder(order, value);
                            e.currentTarget.value = '';
                          }}
                          className="min-w-52 rounded-lg border border-cyan-200 bg-white px-2 py-1 text-xs font-semibold text-cyan-900"
                        >
                          <option value="">Asociar etiqueta pendiente...</option>
                          {activeLabelQueue.map((label) => (
                            <option key={label.id} value={label.id}>
                              {label.customerName} · {label.sourceFileName}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>

                  {attachedLabels.length > 0 && (
                    <div className="mt-2 space-y-1 rounded-xl border border-cyan-200 bg-cyan-50/50 p-2">
                      {attachedLabels.map((label, idx) => (
                        <div key={label.id} className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black text-cyan-900">
                            Etiqueta {idx + 1}: {label.sourceFileName}
                          </span>
                          <button
                            onClick={() => openPdfDataUrl(label.sourcePdfDataUrl, 'No hay etiqueta asociada.')}
                            className="rounded-lg border border-cyan-200 bg-white px-2 py-0.5 text-[11px] font-black text-cyan-800 hover:bg-cyan-50"
                          >
                            Abrir
                          </button>
                          <button
                            onClick={() => printPdfDataUrl(label.sourcePdfDataUrl, 'No hay etiqueta asociada.')}
                            className="rounded-lg border border-cyan-200 bg-white px-2 py-0.5 text-[11px] font-black text-cyan-800 hover:bg-cyan-50"
                          >
                            Imprimir
                          </button>
                          <button
                            onClick={() => removeAttachedLabelFromOrder(order.id, label.id)}
                            className="rounded-lg border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-black text-rose-700 hover:bg-rose-50"
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

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
