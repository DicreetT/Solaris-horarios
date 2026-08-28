import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Beaker,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  Edit2,
  FileText,
  FolderTree,
  Link as LinkIcon,
  Package,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
  UserRound,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import { FileUploader, type Attachment } from '../components/FileUploader';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import { emitSuccessFeedback } from '../utils/uiFeedback';
import canetSeed from '../data/inventory_seed.json';

type GenericRow = Record<string, any>;

type SupplierCategory =
  | 'materia_prima'
  | 'producto_intermedio'
  | 'fabricacion'
  | 'envasado_primario'
  | 'etiquetado'
  | 'cartonaje'
  | 'acondicionamiento'
  | 'logistica'
  | 'otros';

type FinalLotStatus = 'abierto' | 'completo' | 'revision';

type DocumentGroupKey =
  | 'albaran'
  | 'factura_solaris'
  | 'microbiologia'
  | 'identificacion_envase'
  | 'ficha_tecnica'
  | 'certificado_analisis'
  | 'incidencia'
  | 'otros';

type SupplierProduct = {
  id: string;
  name: string;
  reference: string;
  category: SupplierCategory;
  unit: string;
  notes: string;
  finalProductCodes: string[];
  technicalSheets: Attachment[];
  certificates: Attachment[];
};

type Supplier = {
  id: string;
  name: string;
  fiscalName: string;
  taxId: string;
  sanitaryRegister: string;
  address: string;
  contactName: string;
  phone: string;
  email: string;
  categories: SupplierCategory[];
  notes: string;
  contracts: Attachment[];
  products: SupplierProduct[];
  createdAt: string;
  updatedAt: string;
};

type TraceabilityEntry = {
  id: string;
  supplierId: string;
  supplierProductId: string;
  stage: SupplierCategory;
  deliveryDate: string;
  albaranNumber: string;
  solarisInvoiceNumber: string;
  deliveryNoteQuantity: string;
  quantity: string;
  quantityMatchesInvoice: string;
  quantityDifference: string;
  quantityCheckNotes: string;
  supplierLot: string;
  finalLotId: string;
  expiryDate: string;
  bestBeforeDate: string;
  notes: string;
  attachments: Record<DocumentGroupKey, Attachment[]>;
  createdAt: string;
  updatedAt: string;
};

type LotAnalysis = {
  id: string;
  title: string;
  date: string;
  result: string;
  notes: string;
  attachments: Attachment[];
  createdAt: string;
};

type FinalLot = {
  id: string;
  productName: string;
  lotNumber: string;
  quantity: string;
  quantityUnit: string;
  deliveryDate: string;
  albaranNumber: string;
  zohoPurchaseOrder: string;
  zohoInvoiceNumber: string;
  deliveryNoteQuantity: string;
  calculatedBoxes: string;
  status: FinalLotStatus;
  manufactureDate: string;
  expiryDate: string;
  processNotes: string;
  processSteps: SupplierCategory[];
  attachments: Record<DocumentGroupKey, Attachment[]>;
  entries: TraceabilityEntry[];
  analyses: LotAnalysis[];
  createdAt: string;
  updatedAt: string;
};

type TraceabilityState = {
  suppliers: Supplier[];
  lots: FinalLot[];
};

type SupplierLotDraft = {
  finalProductName: string;
  lotNumber: string;
  deliveryDate: string;
  albaranNumber: string;
  solarisInvoiceNumber: string;
  deliveryNoteQuantity: string;
  receivedQuantity: string;
  quantityMatchesInvoice: string;
  quantityDifference: string;
  quantityCheckNotes: string;
  manufactureDate: string;
  expiryDate: string;
  notes: string;
  attachments: Record<DocumentGroupKey, Attachment[]>;
};

type GuidedLotProviderDraft = {
  supplierId: string;
  suppliedName: string;
  reference: string;
  category: SupplierCategory;
  unit: string;
  notes: string;
};

const TRACEABILITY_STATE_KEY = 'traceability_dossier_v1';
const EMPTY_STATE: TraceabilityState = { suppliers: [], lots: [] };

const CATEGORY_OPTIONS: Array<{ key: SupplierCategory; label: string; description: string }> = [
  { key: 'materia_prima', label: 'Materia prima', description: 'Ingrediente o componente antes de mezclar.' },
  { key: 'producto_intermedio', label: 'Producto intermedio', description: 'Mezcla o granel sin producto terminado.' },
  { key: 'fabricacion', label: 'Fabricación', description: 'Servicio o etapa que transforma el producto.' },
  { key: 'envasado_primario', label: 'Envasado primario', description: 'Envase en contacto directo con el producto.' },
  { key: 'etiquetado', label: 'Etiquetado', description: 'Etiqueta, arte legal o aplicación de etiquetas.' },
  { key: 'cartonaje', label: 'Cartonaje', description: 'Caja, estuche o embalaje secundario.' },
  { key: 'acondicionamiento', label: 'Acondicionamiento', description: 'Montaje final interno o externo.' },
  { key: 'logistica', label: 'Logística', description: 'Movimiento entre etapas o almacenes.' },
  { key: 'otros', label: 'Otros', description: 'Documento o proveedor auxiliar.' },
];

const DOCUMENT_GROUPS: Array<{ key: DocumentGroupKey; label: string; hint: string }> = [
  { key: 'albaran', label: 'Albarán', hint: 'Entrega, factura o documento de compra.' },
  { key: 'factura_solaris', label: 'Factura Solaris', hint: 'Factura emitida por Solaris relacionada con este lote o entrega.' },
  { key: 'microbiologia', label: 'Microbiología', hint: 'Análisis microbiológico o control sanitario del lote.' },
  { key: 'identificacion_envase', label: 'Identificación física', hint: 'Foto/PDF de etiqueta de pallet, caja, saco o envase recibido.' },
  { key: 'ficha_tecnica', label: 'Ficha técnica', hint: 'Especificaciones pactadas del producto o material.' },
  { key: 'certificado_analisis', label: 'Certificado proveedor', hint: 'Conformidad, calidad u otro certificado del proveedor para esa entrega.' },
  { key: 'incidencia', label: 'Incidencias', hint: 'Daños, diferencias, observaciones o no conformidades.' },
  { key: 'otros', label: 'Otros', hint: 'Cualquier soporte adicional.' },
];

const DEFAULT_PROCESS: SupplierCategory[] = [
  'materia_prima',
  'producto_intermedio',
  'envasado_primario',
  'etiquetado',
  'cartonaje',
  'acondicionamiento',
];

const PRODUCT_LABELS_BY_CODE: Record<string, string> = {
  SV: 'Solar Vital',
  ENT: 'Enterovital',
  AV: 'Aviro Vital',
  RG: 'Regenerium',
  ISO: 'Isotónico',
  KL: 'Khala',
};

const PRODUCT_ALIASES: Record<string, string> = {
  SOLARVITAL: 'SV',
  SOLAR: 'SV',
  ENTEROVITAL: 'ENT',
  ENTERO: 'ENT',
  AVIROVITAL: 'AV',
  AVIRO: 'AV',
  REGENERIUM: 'RG',
  REGEN: 'RG',
  ISOTONICO: 'ISO',
  ISOTÓNICO: 'ISO',
  KHLA: 'KL',
  KHALA: 'KL',
  CALA: 'KL',
};

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function productKey(value: unknown) {
  const key = clean(value).toUpperCase().replace(/\s+/g, '');
  return PRODUCT_ALIASES[key] || key;
}

function toNumber(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const compact = raw.replace(/\s/g, '');
  const hasComma = compact.includes(',');
  const hasDot = compact.includes('.');
  const normalized = hasComma && hasDot
    ? compact.replace(/\./g, '').replace(',', '.')
    : hasDot && /^\d{1,3}(?:\.\d{3})+$/.test(compact)
      ? compact.replace(/\./g, '')
      : compact.replace(',', '.');
  const parsed = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowTimestampMs(row: GenericRow) {
  const candidates = [
    clean(row?.lastChangedAt),
    clean(row?.updatedAt),
    clean(row?.updated_at),
    clean(row?.createdAt),
    clean(row?.created_at),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
}

function normalizeLotCompareToken(value: unknown) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0');
}

function masterLotKey(producto: unknown, lote: unknown) {
  return `${productKey(producto)}|${normalizeLotCompareToken(lote)}`;
}

function mergeCanetLotRows(base: GenericRow, incoming: GenericRow) {
  const baseTs = rowTimestampMs(base);
  const incomingTs = rowTimestampMs(incoming);
  const merged = incomingTs >= baseTs ? { ...base, ...incoming } : { ...incoming, ...base };
  const keepRichField = (field: string) => {
    if (!clean(merged[field]) && clean(base[field])) merged[field] = base[field];
    if (!clean(merged[field]) && clean(incoming[field])) merged[field] = incoming[field];
  };
  keepRichField('fecha_alta');
  keepRichField('fecha_caducidad');
  keepRichField('dias_restantes');
  keepRichField('semaforo_caducidad');
  keepRichField('notas');
  keepRichField('viales_recibidos');
  keepRichField('estado');
  keepRichField('ensamblaje_finalizado');
  return merged;
}

function mergeCanetLotesForDossier(remotePayload: any, localPayload: any) {
  if (!Array.isArray(remotePayload) || !Array.isArray(localPayload)) return localPayload;

  const byKey = new Map<string, GenericRow>();
  const order: string[] = [];
  const upsert = (row: GenericRow) => {
    if (!row || typeof row !== 'object') return;
    const producto = productKey(row.producto);
    const lote = clean(row.lote);
    if (!producto || !lote) return;
    const key = masterLotKey(producto, lote);
    if (!order.includes(key)) order.push(key);
    const normalized = { ...row, producto, lote };
    const previous = byKey.get(key);
    byKey.set(key, previous ? mergeCanetLotRows(previous, normalized) : normalized);
  };

  remotePayload.forEach(upsert);
  localPayload.forEach(upsert);

  return order.map((key) => byKey.get(key)).filter((row): row is GenericRow => !!row);
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function labelForCategory(category: SupplierCategory) {
  return CATEGORY_OPTIONS.find((option) => option.key === category)?.label || category;
}

function labelForQuantityMatch(value: string) {
  if (value === 'si') return 'Sí';
  if (value === 'no') return 'No';
  return '-';
}

function emptyAttachments(): Record<DocumentGroupKey, Attachment[]> {
  return {
    albaran: [],
    factura_solaris: [],
    microbiologia: [],
    identificacion_envase: [],
    ficha_tecnica: [],
    certificado_analisis: [],
    incidencia: [],
    otros: [],
  };
}

function emptySupplierLotDraft(productName = ''): SupplierLotDraft {
  return {
    finalProductName: productName,
    lotNumber: '',
    deliveryDate: '',
    albaranNumber: '',
    solarisInvoiceNumber: '',
    deliveryNoteQuantity: '',
    receivedQuantity: '',
    quantityMatchesInvoice: '',
    quantityDifference: '',
    quantityCheckNotes: '',
    manufactureDate: '',
    expiryDate: '',
    notes: '',
    attachments: emptyAttachments(),
  };
}

function emptySupplierFormDraft() {
  return {
    name: '',
    fiscalName: '',
    taxId: '',
    sanitaryRegister: '',
    address: '',
    contactName: '',
    phone: '',
    email: '',
    notes: '',
    contracts: [] as Attachment[],
  };
}

function emptyLotFormDraft(productName = '') {
  return {
    productName,
    lotNumber: '',
    quantity: '',
    quantityUnit: '',
    deliveryDate: '',
    albaranNumber: '',
    zohoPurchaseOrder: '',
    zohoInvoiceNumber: '',
    deliveryNoteQuantity: '',
    calculatedBoxes: '',
    manufactureDate: '',
    expiryDate: '',
    processNotes: '',
    attachments: emptyAttachments(),
  };
}

function emptyGuidedLotProviderDraft(): GuidedLotProviderDraft {
  return {
    supplierId: '',
    suppliedName: '',
    reference: '',
    category: 'materia_prima',
    unit: '',
    notes: '',
  };
}

function emptyProductFormDraft() {
  return {
    name: '',
    reference: '',
    category: 'materia_prima' as SupplierCategory,
    unit: '',
    notes: '',
    finalProductCodes: [] as string[],
    technicalSheets: [] as Attachment[],
    certificates: [] as Attachment[],
  };
}

function normalizeAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((file: any) => ({
      name: clean(file?.name),
      url: clean(file?.url),
      type: clean(file?.type) || 'application/octet-stream',
      size: Number(file?.size) || 0,
    }))
    .filter((file) => file.name && file.url);
}

function normalizeDocumentGroups(value: any): Record<DocumentGroupKey, Attachment[]> {
  const base = emptyAttachments();
  DOCUMENT_GROUPS.forEach((group) => {
    base[group.key] = normalizeAttachments(value?.[group.key]);
  });
  return base;
}

function normalizeState(value: any): TraceabilityState {
  const suppliers = Array.isArray(value?.suppliers) ? value.suppliers : [];
  const lots = Array.isArray(value?.lots) ? value.lots : [];
  return {
    suppliers: suppliers.map((supplier: any) => ({
      id: clean(supplier?.id) || uid('sup'),
      name: clean(supplier?.name) || 'Proveedor',
      fiscalName: clean(supplier?.fiscalName),
      taxId: clean(supplier?.taxId),
      sanitaryRegister: clean(supplier?.sanitaryRegister),
      address: clean(supplier?.address),
      contactName: clean(supplier?.contactName),
      phone: clean(supplier?.phone),
      email: clean(supplier?.email),
      categories: Array.isArray(supplier?.categories) ? supplier.categories.filter((item: string) => CATEGORY_OPTIONS.some((option) => option.key === item)) : [],
      notes: clean(supplier?.notes),
      contracts: normalizeAttachments(supplier?.contracts),
      products: Array.isArray(supplier?.products) ? supplier.products.map((product: any) => ({
        id: clean(product?.id) || uid('spr'),
        name: clean(product?.name) || 'Producto suministrado',
        reference: clean(product?.reference),
        category: CATEGORY_OPTIONS.some((option) => option.key === product?.category) ? product.category : 'otros',
        unit: clean(product?.unit),
        notes: clean(product?.notes),
        finalProductCodes: Array.isArray(product?.finalProductCodes)
          ? product.finalProductCodes.map(productKey).filter(Boolean)
          : [],
        technicalSheets: normalizeAttachments(product?.technicalSheets),
        certificates: normalizeAttachments(product?.certificates),
      })) : [],
      createdAt: clean(supplier?.createdAt) || new Date().toISOString(),
      updatedAt: clean(supplier?.updatedAt) || new Date().toISOString(),
    })),
    lots: lots.map((lot: any) => ({
      id: clean(lot?.id) || uid('lot'),
      productName: clean(lot?.productName) || 'Producto',
      lotNumber: clean(lot?.lotNumber) || 'Sin lote',
      quantity: clean(lot?.quantity),
      quantityUnit: clean(lot?.quantityUnit),
      deliveryDate: clean(lot?.deliveryDate),
      albaranNumber: clean(lot?.albaranNumber),
      zohoPurchaseOrder: clean(lot?.zohoPurchaseOrder),
      zohoInvoiceNumber: clean(lot?.zohoInvoiceNumber),
      deliveryNoteQuantity: clean(lot?.deliveryNoteQuantity),
      calculatedBoxes: clean(lot?.calculatedBoxes),
      status: lot?.status === 'completo' || lot?.status === 'revision' ? lot.status : 'abierto',
      manufactureDate: clean(lot?.manufactureDate),
      expiryDate: clean(lot?.expiryDate),
      processNotes: clean(lot?.processNotes),
      processSteps: Array.isArray(lot?.processSteps) && lot.processSteps.length > 0 ? lot.processSteps.filter((item: string) => CATEGORY_OPTIONS.some((option) => option.key === item)) : DEFAULT_PROCESS,
      attachments: normalizeDocumentGroups(lot?.attachments),
      entries: Array.isArray(lot?.entries) ? lot.entries.map((entry: any) => ({
        id: clean(entry?.id) || uid('ent'),
        supplierId: clean(entry?.supplierId),
        supplierProductId: clean(entry?.supplierProductId),
        stage: CATEGORY_OPTIONS.some((option) => option.key === entry?.stage) ? entry.stage : 'otros',
        deliveryDate: clean(entry?.deliveryDate),
        albaranNumber: clean(entry?.albaranNumber),
        solarisInvoiceNumber: clean(entry?.solarisInvoiceNumber),
        deliveryNoteQuantity: clean(entry?.deliveryNoteQuantity),
        quantity: clean(entry?.quantity),
        quantityMatchesInvoice: clean(entry?.quantityMatchesInvoice),
        quantityDifference: clean(entry?.quantityDifference),
        quantityCheckNotes: clean(entry?.quantityCheckNotes),
        supplierLot: clean(entry?.supplierLot),
        finalLotId: clean(entry?.finalLotId),
        expiryDate: clean(entry?.expiryDate),
        bestBeforeDate: clean(entry?.bestBeforeDate),
        notes: clean(entry?.notes),
        attachments: normalizeDocumentGroups(entry?.attachments),
        createdAt: clean(entry?.createdAt) || new Date().toISOString(),
        updatedAt: clean(entry?.updatedAt) || new Date().toISOString(),
      })) : [],
      analyses: Array.isArray(lot?.analyses) ? lot.analyses.map((analysis: any) => ({
        id: clean(analysis?.id) || uid('ana'),
        title: clean(analysis?.title) || 'Análisis de lote',
        date: clean(analysis?.date),
        result: clean(analysis?.result),
        notes: clean(analysis?.notes),
        attachments: normalizeAttachments(analysis?.attachments),
        createdAt: clean(analysis?.createdAt) || new Date().toISOString(),
      })) : [],
      createdAt: clean(lot?.createdAt) || new Date().toISOString(),
      updatedAt: clean(lot?.updatedAt) || new Date().toISOString(),
    })),
  };
}

function fileCount(entry: TraceabilityEntry) {
  return DOCUMENT_GROUPS.reduce((total, group) => total + (entry.attachments[group.key]?.length || 0), 0);
}

function safePdfText(value: unknown) {
  return clean(value).replace(/\s+/g, ' ');
}

export default function TraceabilityDossierPage() {
  const { currentUser } = useAuth();
  const [state, setState, loading] = useSharedJsonState<TraceabilityState>(
    TRACEABILITY_STATE_KEY,
    EMPTY_STATE,
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      pollIntervalMs: 4000,
      protectFromEmptyOverwrite: true,
      preferRemoteSnapshot: true,
      mergeBeforePersist: true,
      mergeIncomingWithLocal: false,
    },
  );
  const [canetProductos] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_productos_v1',
    (canetSeed as any).productos as GenericRow[],
    {
      userId: currentUser?.id,
      initializeIfMissing: true,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      preferRemoteSnapshot: true,
    },
  );
  const [canetLotes, setCanetLotes, canetLotesLoading] = useSharedJsonState<GenericRow[]>(
    'inventory_canet_lotes_v1',
    (canetSeed as any).lotes as GenericRow[],
    {
      userId: currentUser?.id,
      initializeIfMissing: true,
      protectFromEmptyOverwrite: true,
      mergeBeforePersist: true,
      preferRemoteSnapshot: true,
      mergeStrategy: mergeCanetLotesForDossier,
    },
  );

  const normalized = useMemo(() => normalizeState(state), [state]);
  const [query, setQuery] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedLotId, setSelectedLotId] = useState('');
  const [supplierDraft, setSupplierDraft] = useState(emptySupplierFormDraft());
  const [productDraft, setProductDraft] = useState(emptyProductFormDraft());
  const [lotDraft, setLotDraft] = useState(emptyLotFormDraft());
  const [entryDraft, setEntryDraft] = useState({
    supplierId: '',
    supplierProductId: '',
    stage: 'materia_prima' as SupplierCategory,
    deliveryDate: '',
    albaranNumber: '',
    solarisInvoiceNumber: '',
    deliveryNoteQuantity: '',
    quantity: '',
    quantityMatchesInvoice: '',
    quantityDifference: '',
    quantityCheckNotes: '',
    supplierLot: '',
    expiryDate: '',
    bestBeforeDate: '',
    notes: '',
    attachments: emptyAttachments(),
  });
  const [analysisDraft, setAnalysisDraft] = useState({
    title: '',
    date: '',
    result: '',
    notes: '',
    attachments: [] as Attachment[],
  });
  const [supplierLotDrafts, setSupplierLotDrafts] = useState<Record<string, SupplierLotDraft>>({});
  const [expandedSupplierIds, setExpandedSupplierIds] = useState<string[]>([]);
  const [expandedProductIds, setExpandedProductIds] = useState<string[]>([]);
  const [expandedLotIds, setExpandedLotIds] = useState<string[]>([]);
  const [expandedDocumentBlockIds, setExpandedDocumentBlockIds] = useState<string[]>([]);
  const [expandedCreateBlockIds, setExpandedCreateBlockIds] = useState<string[]>([]);
  const [editingSupplierId, setEditingSupplierId] = useState('');
  const [supplierEditDraft, setSupplierEditDraft] = useState(emptySupplierFormDraft());
  const [editingProductKey, setEditingProductKey] = useState('');
  const [productEditDraft, setProductEditDraft] = useState(emptyProductFormDraft());
  const [editingLotId, setEditingLotId] = useState('');
  const [lotEditContext, setLotEditContext] = useState<{ supplierId: string; productId: string } | null>(null);
  const [lotEditDraft, setLotEditDraft] = useState(emptySupplierLotDraft());
  const [guidedLotEditDraft, setGuidedLotEditDraft] = useState(emptyLotFormDraft());
  const [editingLotProviderEntryId, setEditingLotProviderEntryId] = useState('');
  const [lotProviderEditDraft, setLotProviderEditDraft] = useState(emptyGuidedLotProviderDraft());
  const [selectedProductKey, setSelectedProductKey] = useState('');
  const [showGuidedProviderPanel, setShowGuidedProviderPanel] = useState(false);
  const [showGuidedLotPanel, setShowGuidedLotPanel] = useState(false);
  const [selectedGuidedLotId, setSelectedGuidedLotId] = useState('');
  const [guidedLotProviderDraft, setGuidedLotProviderDraft] = useState(emptyGuidedLotProviderDraft());
  const [lotProviderDrafts, setLotProviderDrafts] = useState<GuidedLotProviderDraft[]>([emptyGuidedLotProviderDraft()]);

  const suppliers = normalized.suppliers;
  const lots = normalized.lots;
  const productCards = useMemo(() => {
    const map = new Map<string, {
      key: string;
      label: string;
      mode: string;
      vialsPerBox: number;
      active: boolean;
      color: string;
    }>();

    const productRows = Array.isArray(canetProductos) && canetProductos.length > 0
      ? canetProductos
      : ((canetSeed as any).productos as GenericRow[] || []);

    productRows.forEach((row) => {
      const key = productKey(row.producto);
      if (!key) return;
      map.set(key, {
        key,
        label: PRODUCT_LABELS_BY_CODE[key] || clean(row.nombre || row.producto),
        mode: clean(row.modo_stock || row.tipo_producto || 'DIRECTO').toUpperCase() || 'DIRECTO',
        vialsPerBox: toNumber(row.viales_por_caja),
        active: clean(row.activo_si_no).toUpperCase() !== 'NO',
        color: clean(row.color_hex_opcional),
      });
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [canetProductos]);
  const selectedProduct = productCards.find((product) => product.key === selectedProductKey) || productCards[0] || null;
  const activeProductKey = selectedProduct?.key || '';
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId) || suppliers[0] || null;
  const selectedLot = lots.find((lot) => lot.id === selectedLotId) || lots[0] || null;
  const entrySupplier = suppliers.find((supplier) => supplier.id === entryDraft.supplierId) || null;
  const entrySupplierProducts = entrySupplier?.products || [];
  const filteredLots = lots.filter((lot) => {
    const needle = `${lot.productName} ${lot.lotNumber}`.toLowerCase();
    return !query || needle.includes(query.toLowerCase());
  });
  const filteredSuppliers = suppliers.filter((supplier) => {
    if (!query) return true;
    const needle = [
      supplier.name,
      supplier.fiscalName,
      supplier.sanitaryRegister,
      ...supplier.products.flatMap((product) => [product.name, product.reference, labelForCategory(product.category)]),
      ...lots
        .filter((lot) => lot.entries.some((entry) => entry.supplierId === supplier.id))
        .flatMap((lot) => [
          lot.productName,
          lot.lotNumber,
          ...lot.entries.map((entry) => entry.albaranNumber),
        ]),
    ].join(' ').toLowerCase();
    return needle.includes(query.toLowerCase());
  });
  const selectedProductLots = lots.filter((lot) => productKey(lot.productName) === activeProductKey);
  const selectedProductSupplierSummary = Array.from(
    selectedProductLots.reduce((map, lot) => {
      lot.entries.forEach((entry) => {
        const supplier = suppliers.find((item) => item.id === entry.supplierId);
        if (!supplier) return;
        const product = supplier.products.find((item) => item.id === entry.supplierProductId);
        const current = map.get(supplier.id) || {
          supplier,
          lotNumbers: new Set<string>(),
          contributions: new Set<string>(),
        };
        current.lotNumbers.add(lot.lotNumber);
        current.contributions.add(`${product?.name || entry.notes || 'Aporte'} · ${labelForCategory(entry.stage)}`);
        map.set(supplier.id, current);
      });
      return map;
    }, new Map<string, { supplier: Supplier; lotNumbers: Set<string>; contributions: Set<string> }>())
      .values(),
  );
  const selectedProductDocumentCount = selectedProductLots.reduce(
    (total, lot) => (
      total
      + DOCUMENT_GROUPS.reduce((docTotal, group) => docTotal + (lot.attachments[group.key]?.length || 0), 0)
      + lot.entries.reduce((entryTotal, entry) => entryTotal + fileCount(entry), 0)
      + lot.analyses.reduce((analysisTotal, analysis) => analysisTotal + analysis.attachments.length, 0)
    ),
    0,
  );
  const selectedProductQuantityUnit = selectedProduct?.mode === 'ENSAMBLAJE'
    ? 'viales'
    : selectedProduct?.mode === 'KIT'
      ? 'kits'
      : 'unidades';
  const selectedProductModeLabel = selectedProduct
    ? `${selectedProduct.mode}${selectedProduct.vialsPerBox > 0 ? ` · ${selectedProduct.vialsPerBox} viales/caja` : ''}`
    : '-';

  const updateSupplierDraft = (key: keyof typeof supplierDraft, value: string) => {
    setSupplierDraft((prev) => ({ ...prev, [key]: value }));
  };

  const draftKeyFor = (supplierId: string, productId: string) => `${supplierId}::${productId}`;
  const productKeyFor = (supplierId: string, productId: string) => `${supplierId}::${productId}`;
  const documentBlockKeyFor = (...parts: string[]) => parts.join('::');

  const toggleExpanded = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    id: string,
  ) => {
    setter((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const expandAllDossier = () => {
    setExpandedSupplierIds(suppliers.map((supplier) => supplier.id));
    setExpandedProductIds(suppliers.flatMap((supplier) => supplier.products.map((product) => productKeyFor(supplier.id, product.id))));
    setExpandedLotIds(lots.map((lot) => lot.id));
  };

  const collapseAllDossier = () => {
    setExpandedSupplierIds([]);
    setExpandedProductIds([]);
    setExpandedLotIds([]);
    setExpandedDocumentBlockIds([]);
    setExpandedCreateBlockIds([]);
  };

  const lotDraftFor = (supplier: Supplier, product: SupplierProduct) => {
    const key = draftKeyFor(supplier.id, product.id);
    const associatedProductKey = product.finalProductCodes[0] || activeProductKey;
    const defaultProductName = productCards.find((item) => item.key === associatedProductKey)?.label || selectedProduct?.label || product.name;
    return supplierLotDrafts[key] || emptySupplierLotDraft(defaultProductName);
  };

  const updateSupplierLotDraft = (
    supplier: Supplier,
    product: SupplierProduct,
    patch: Partial<SupplierLotDraft>,
  ) => {
    const key = draftKeyFor(supplier.id, product.id);
    setSupplierLotDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || emptySupplierLotDraft(product.name)),
        ...patch,
      },
    }));
  };

  const supplierProductLots = (supplier: Supplier, product: SupplierProduct) => (
    lots.filter((lot) => lot.entries.some((entry) => entry.supplierId === supplier.id && entry.supplierProductId === product.id))
  );

  const selectedGuidedLot = lots.find((lot) => lot.id === selectedGuidedLotId)
    || selectedProductLots[0]
    || null;

  const lotProductMetaFor = (productName: string) => (
    productCards.find((product) => product.key === productKey(productName))
    || selectedProduct
    || null
  );

  const boxCountFor = (productName: string, quantity: string) => {
    const meta = lotProductMetaFor(productName);
    const units = toNumber(quantity);
    if (!meta || meta.vialsPerBox <= 0 || units <= 0) return '';
    const boxes = units / meta.vialsPerBox;
    return String(Number(boxes.toFixed(2)));
  };

  const dossierMasterLotRows = useMemo(() => {
    const now = new Date().toISOString();
    return lots
      .map((lot) => {
        const producto = productKey(lot.productName);
        const lote = clean(lot.lotNumber);
        if (!producto || !lote) return null;
        const primaryQuantity = clean(lot.deliveryNoteQuantity) || clean(lot.quantity);
        return {
          producto,
          lote,
          fecha_alta: clean(lot.deliveryDate),
          fecha_caducidad: clean(lot.expiryDate),
          dias_restantes: '',
          semaforo_caducidad: '',
          notas: clean(lot.processNotes),
          viales_recibidos: primaryQuantity,
          estado: 'ACTIVO',
          ensamblaje_finalizado: 'NO',
          origen_dossier_trazabilidad: 'SI',
          lastChangedAt: clean(lot.updatedAt) || now,
        } satisfies GenericRow;
      })
      .filter(Boolean) as GenericRow[];
  }, [lots]);

  const canetLotesSignature = useMemo(
    () => (Array.isArray(canetLotes) ? canetLotes : [])
      .map((row) => masterLotKey(row?.producto, row?.lote))
      .filter((key) => !key.endsWith('|'))
      .sort()
      .join('||'),
    [canetLotes],
  );

  useEffect(() => {
    if (loading || canetLotesLoading || dossierMasterLotRows.length === 0) return;

    setCanetLotes((prev) => {
      const rows = Array.isArray(prev) ? prev : [];
      const nextRows = [...rows];
      let changed = false;

      dossierMasterLotRows.forEach((syncRow) => {
        const key = masterLotKey(syncRow.producto, syncRow.lote);
        if (!key || key.endsWith('|')) return;
        const index = nextRows.findIndex((row) => masterLotKey(row?.producto, row?.lote) === key);

        if (index < 0) {
          nextRows.unshift(syncRow);
          changed = true;
          return;
        }

        const current = nextRows[index];
        const repaired = {
          ...current,
          producto: syncRow.producto,
          lote: clean(current.lote) || syncRow.lote,
          fecha_alta: clean(current.fecha_alta) || syncRow.fecha_alta,
          fecha_caducidad: clean(current.fecha_caducidad) || syncRow.fecha_caducidad,
          notas: clean(current.notas) || syncRow.notas,
          viales_recibidos: clean(current.viales_recibidos) || syncRow.viales_recibidos,
          estado: clean(current.estado) || 'ACTIVO',
          ensamblaje_finalizado: clean(current.ensamblaje_finalizado) || 'NO',
          origen_dossier_trazabilidad: clean(current.origen_dossier_trazabilidad) || 'SI',
          lastChangedAt: clean(current.lastChangedAt) || syncRow.lastChangedAt,
        };

        if (JSON.stringify(repaired) !== JSON.stringify(current)) {
          nextRows[index] = repaired;
          changed = true;
        }
      });

      return changed ? nextRows : prev;
    });
  }, [canetLotesLoading, canetLotesSignature, dossierMasterLotRows, loading, setCanetLotes]);

  const scrollToDossierBlock = (id: string) => {
    if (typeof document === 'undefined') return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectSupplierForProduct = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    setExpandedSupplierIds((prev) => Array.from(new Set([...prev, supplierId])));
    window.setTimeout(() => scrollToDossierBlock(`traceability-supplier-${supplierId}`), 50);
  };

  const selectSupplierForEntry = (supplier: Supplier, product?: SupplierProduct) => {
    setSelectedSupplierId(supplier.id);
    setEntryDraft((prev) => ({
      ...prev,
      supplierId: supplier.id,
      supplierProductId: product?.id || prev.supplierProductId,
      stage: product?.category || prev.stage,
    }));
    window.setTimeout(() => scrollToDossierBlock('traceability-lot-workspace'), 50);
  };

  const buildLinkedProductForActiveProduct = (): SupplierProduct => ({
    id: uid('spr'),
    name: clean(productDraft.name) || selectedProduct?.label || 'Suministro',
    reference: clean(productDraft.reference),
    category: productDraft.category || 'otros',
    unit: clean(productDraft.unit) || selectedProductQuantityUnit,
    notes: clean(productDraft.notes),
    finalProductCodes: activeProductKey ? [activeProductKey] : [],
    technicalSheets: productDraft.technicalSheets,
    certificates: productDraft.certificates,
  });

  const associateExistingSupplierToProduct = (supplierId: string) => {
    if (!activeProductKey || !selectedProduct) return;
    const supplier = suppliers.find((item) => item.id === supplierId);
    if (!supplier) return;
    const alreadyLinked = supplier.products.some((product) => product.finalProductCodes.includes(activeProductKey));
    if (alreadyLinked) {
      setSelectedSupplierId(supplier.id);
      setExpandedSupplierIds((prev) => Array.from(new Set([...prev, supplier.id])));
      emitSuccessFeedback('Este proveedor ya estaba asociado al producto.');
      return;
    }
    const now = new Date().toISOString();
    const linkedProduct = buildLinkedProductForActiveProduct();
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        suppliers: base.suppliers.map((item) => item.id === supplier.id
          ? {
              ...item,
              categories: Array.from(new Set([...item.categories, linkedProduct.category])),
              products: [linkedProduct, ...item.products],
              updatedAt: now,
            }
          : item),
      };
    });
    setSelectedSupplierId(supplier.id);
    setExpandedSupplierIds((prev) => Array.from(new Set([...prev, supplier.id])));
    setExpandedProductIds((prev) => Array.from(new Set([...prev, productKeyFor(supplier.id, linkedProduct.id)])));
    setProductDraft(emptyProductFormDraft());
    emitSuccessFeedback('Proveedor asociado al producto.');
  };

  const addSupplier = () => {
    if (!clean(supplierDraft.name)) {
      alert('Pon al menos el nombre del proveedor.');
      return;
    }
    const now = new Date().toISOString();
    const nextSupplier: Supplier = {
      id: uid('sup'),
      ...supplierDraft,
      categories: [],
      products: [],
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => {
      const base = normalizeState(prev);
      return { ...base, suppliers: [nextSupplier, ...base.suppliers] };
    });
    setSelectedSupplierId(nextSupplier.id);
    setExpandedSupplierIds((prev) => Array.from(new Set([...prev, nextSupplier.id])));
    setEntryDraft((prev) => ({ ...prev, supplierId: nextSupplier.id }));
    setSupplierDraft(emptySupplierFormDraft());
    emitSuccessFeedback('Proveedor creado.');
  };

  const addInternalSupplier = () => {
    const existing = suppliers.find((supplier) => supplier.name.toLowerCase() === 'solaris interno');
    if (existing) {
      const alreadyLinked = existing.products.some((product) => activeProductKey && product.finalProductCodes.includes(activeProductKey));
      if (activeProductKey && !alreadyLinked) {
        const now = new Date().toISOString();
        const internalProduct: SupplierProduct = {
          id: uid('spr'),
          name: 'Acondicionamiento interno',
          reference: 'SOLARIS-INTERNO',
          category: 'acondicionamiento',
          unit: 'Servicio interno',
          notes: 'Usar cuando el acondicionamiento o montaje final lo realiza Solaris.',
          finalProductCodes: [activeProductKey],
          technicalSheets: [],
          certificates: [],
        };
        setState((prev) => {
          const base = normalizeState(prev);
          return {
            ...base,
            suppliers: base.suppliers.map((supplier) => supplier.id === existing.id
              ? {
                  ...supplier,
                  categories: Array.from(new Set([...supplier.categories, 'acondicionamiento'])),
                  products: [internalProduct, ...supplier.products],
                  updatedAt: now,
                }
              : supplier),
          };
        });
        setExpandedProductIds((prev) => Array.from(new Set([...prev, productKeyFor(existing.id, internalProduct.id)])));
      }
      setSelectedSupplierId(existing.id);
      setExpandedSupplierIds((prev) => Array.from(new Set([...prev, existing.id])));
      setEntryDraft((prev) => ({ ...prev, supplierId: existing.id }));
      emitSuccessFeedback('Solaris interno asociado.');
      return;
    }
    const now = new Date().toISOString();
    const internalSupplier: Supplier = {
      id: uid('sup'),
      name: 'Solaris interno',
      fiscalName: 'Solaris',
      taxId: '',
      sanitaryRegister: '',
      address: '',
      contactName: '',
      phone: '',
      email: '',
      categories: ['fabricacion', 'acondicionamiento'],
      notes: 'Responsable interno para fabricación, montaje o acondicionamiento realizados por Solaris.',
      contracts: [],
      products: [
        {
          id: uid('spr'),
          name: 'Acondicionamiento interno',
          reference: 'SOLARIS-INTERNO',
          category: 'acondicionamiento',
          unit: 'Servicio interno',
          notes: 'Usar cuando el acondicionamiento o montaje final lo realiza Solaris.',
          finalProductCodes: activeProductKey ? [activeProductKey] : [],
          technicalSheets: [],
          certificates: [],
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => {
      const base = normalizeState(prev);
      return { ...base, suppliers: [internalSupplier, ...base.suppliers] };
    });
    setSelectedSupplierId(internalSupplier.id);
    setExpandedSupplierIds((prev) => Array.from(new Set([...prev, internalSupplier.id])));
    setExpandedProductIds((prev) => Array.from(new Set([...prev, productKeyFor(internalSupplier.id, internalSupplier.products[0].id)])));
    setEntryDraft((prev) => ({
      ...prev,
      supplierId: internalSupplier.id,
      supplierProductId: internalSupplier.products[0].id,
      stage: 'acondicionamiento',
    }));
    emitSuccessFeedback('Solaris interno añadido como responsable.');
  };

  const addSupplierProduct = (supplierOverride?: Supplier) => {
    const supplier = supplierOverride || selectedSupplier;
    if (!supplier) {
      alert('Crea o selecciona un proveedor primero.');
      return;
    }
    if (!clean(productDraft.name)) {
      alert('Pon el nombre del producto o material suministrado.');
      return;
    }
    const now = new Date().toISOString();
    const nextProduct: SupplierProduct = {
      id: uid('spr'),
      ...productDraft,
      finalProductCodes: Array.from(new Set([
        ...productDraft.finalProductCodes.map(productKey).filter(Boolean),
        activeProductKey,
      ].filter(Boolean))),
    };
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        suppliers: base.suppliers.map((item) => item.id === supplier.id
          ? {
              ...item,
              categories: Array.from(new Set([...item.categories, productDraft.category])),
              products: [nextProduct, ...item.products],
              updatedAt: now,
            }
          : item),
      };
    });
    setEntryDraft((prev) => ({
      ...prev,
      supplierId: supplier.id,
      supplierProductId: nextProduct.id,
      stage: productDraft.category,
    }));
    setSelectedSupplierId(supplier.id);
    setExpandedSupplierIds((prev) => Array.from(new Set([...prev, supplier.id])));
    setExpandedProductIds((prev) => Array.from(new Set([...prev, productKeyFor(supplier.id, nextProduct.id)])));
    setExpandedCreateBlockIds((prev) => prev.filter((id) => id !== documentBlockKeyFor('create-product', supplier.id)));
    setProductDraft(emptyProductFormDraft());
    emitSuccessFeedback('Producto del proveedor guardado.');
  };

  const addLot = () => {
    if (!clean(lotDraft.productName) || !clean(lotDraft.lotNumber)) {
      alert('Pon el producto final y el número de lote.');
      return;
    }
    const alreadyExists = lots.some((lot) => (
      productKey(lot.productName) === productKey(lotDraft.productName)
      && clean(lot.lotNumber).toLowerCase() === clean(lotDraft.lotNumber).toLowerCase()
    ));
    if (alreadyExists) {
      alert('Ese lote ya existe para este producto. Ábrelo y asocia los proveedores ahí.');
      return;
    }
    const now = new Date().toISOString();
    const meta = lotProductMetaFor(lotDraft.productName);
    const primaryQuantity = clean(lotDraft.deliveryNoteQuantity) || clean(lotDraft.quantity);
    const calculatedBoxes = clean(lotDraft.calculatedBoxes) || boxCountFor(lotDraft.productName, primaryQuantity);
    const nextLot: FinalLot = {
      id: uid('lot'),
      ...lotDraft,
      productName: PRODUCT_LABELS_BY_CODE[productKey(lotDraft.productName)] || lotDraft.productName,
      quantity: primaryQuantity,
      deliveryNoteQuantity: clean(lotDraft.deliveryNoteQuantity) || primaryQuantity,
      quantityUnit: lotDraft.quantityUnit || (meta?.mode === 'ENSAMBLAJE' ? 'viales' : meta?.mode === 'KIT' ? 'kits' : 'unidades'),
      calculatedBoxes,
      status: 'abierto',
      processSteps: DEFAULT_PROCESS,
      entries: [],
      analyses: [],
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => {
      const base = normalizeState(prev);
      let nextSuppliers = base.suppliers;
      let lotWithProviders = nextLot;
      const finalProductCode = productKey(nextLot.productName);

      lotProviderDrafts
        .filter((draft) => !!clean(draft.supplierId))
        .forEach((draft) => {
          const supplier = nextSuppliers.find((item) => item.id === draft.supplierId);
          if (!supplier) return;
          const existingProduct = supplier.products.find((product) => (
            product.finalProductCodes.includes(finalProductCode)
            && (!draft.category || product.category === draft.category)
          )) || supplier.products.find((product) => product.finalProductCodes.includes(finalProductCode));
          const supplierProduct: SupplierProduct = existingProduct || {
            id: uid('spr'),
            name: clean(draft.suppliedName) || `Aporte para ${nextLot.productName}`,
            reference: clean(draft.reference),
            category: draft.category,
            unit: clean(draft.unit) || nextLot.quantityUnit || 'unidades',
            notes: clean(draft.notes),
            finalProductCodes: [finalProductCode],
            technicalSheets: [],
            certificates: [],
          };
          const nextEntry: TraceabilityEntry = {
            id: uid('ent'),
            supplierId: supplier.id,
            supplierProductId: supplierProduct.id,
            stage: supplierProduct.category,
            deliveryDate: nextLot.deliveryDate,
            albaranNumber: nextLot.albaranNumber,
            solarisInvoiceNumber: nextLot.zohoInvoiceNumber,
            deliveryNoteQuantity: nextLot.deliveryNoteQuantity,
            quantity: nextLot.quantity,
            quantityMatchesInvoice: '',
            quantityDifference: '',
            quantityCheckNotes: '',
            supplierLot: nextLot.lotNumber,
            finalLotId: nextLot.id,
            expiryDate: nextLot.expiryDate,
            bestBeforeDate: nextLot.expiryDate,
            notes: clean(draft.notes),
            attachments: emptyAttachments(),
            createdAt: now,
            updatedAt: now,
          };

          lotWithProviders = {
            ...lotWithProviders,
            processSteps: Array.from(new Set([...lotWithProviders.processSteps, supplierProduct.category])),
            entries: [nextEntry, ...lotWithProviders.entries],
          };

          if (!existingProduct) {
            nextSuppliers = nextSuppliers.map((item) => item.id === supplier.id
              ? {
                  ...item,
                  categories: Array.from(new Set([...item.categories, supplierProduct.category])),
                  products: [supplierProduct, ...item.products],
                  updatedAt: now,
                }
              : item);
          }
        });

      return { ...base, suppliers: nextSuppliers, lots: [lotWithProviders, ...base.lots] };
    });
    const inventoryProduct = productKey(lotDraft.productName);
    const inventoryLot = clean(lotDraft.lotNumber);
    setCanetLotes((prev) => {
      const rows = Array.isArray(prev) ? prev : [];
      const exists = rows.some((row) => (
        productKey(row?.producto) === inventoryProduct
        && clean(row?.lote).toLowerCase() === inventoryLot.toLowerCase()
      ));
      if (exists) {
        return rows.map((row) => (
          productKey(row?.producto) === inventoryProduct
          && clean(row?.lote).toLowerCase() === inventoryLot.toLowerCase()
            ? {
                ...row,
                fecha_alta: clean(lotDraft.deliveryDate) || row.fecha_alta,
                fecha_caducidad: clean(lotDraft.expiryDate) || row.fecha_caducidad,
                notas: clean(lotDraft.processNotes) || row.notas,
                viales_recibidos: primaryQuantity || row.viales_recibidos,
                origen_dossier_trazabilidad: clean(row?.origen_dossier_trazabilidad) || 'SI',
                lastChangedAt: now,
              }
            : row
        ));
      }
      return [{
        producto: inventoryProduct,
        lote: inventoryLot,
        fecha_alta: clean(lotDraft.deliveryDate),
        fecha_caducidad: clean(lotDraft.expiryDate),
        dias_restantes: '',
        semaforo_caducidad: '',
        notas: clean(lotDraft.processNotes),
        viales_recibidos: primaryQuantity,
        estado: 'ACTIVO',
        ensamblaje_finalizado: 'NO',
        origen_dossier_trazabilidad: 'SI',
        lastChangedAt: now,
      }, ...rows];
    });
    setSelectedLotId(nextLot.id);
    setSelectedGuidedLotId(nextLot.id);
    setExpandedLotIds((prev) => Array.from(new Set([...prev, nextLot.id])));
    setLotDraft(emptyLotFormDraft(selectedProduct?.label || ''));
    setLotProviderDrafts([emptyGuidedLotProviderDraft()]);
    emitSuccessFeedback('Lote final creado.');
  };

  const addProviderToGuidedLot = () => {
    const lot = selectedGuidedLot;
    const supplier = suppliers.find((item) => item.id === guidedLotProviderDraft.supplierId);
    if (!lot || !supplier) {
      alert('Selecciona un lote y un proveedor.');
      return;
    }
    const now = new Date().toISOString();
    const finalProductCode = productKey(lot.productName);
    const existingProduct = supplier.products.find((product) => (
      product.finalProductCodes.includes(finalProductCode)
      && (!guidedLotProviderDraft.category || product.category === guidedLotProviderDraft.category)
    )) || supplier.products.find((product) => product.finalProductCodes.includes(finalProductCode));
    const supplierProduct: SupplierProduct = existingProduct || {
      id: uid('spr'),
      name: clean(guidedLotProviderDraft.suppliedName) || `Aporte para ${lot.productName}`,
      reference: clean(guidedLotProviderDraft.reference),
      category: guidedLotProviderDraft.category,
      unit: clean(guidedLotProviderDraft.unit) || lot.quantityUnit || 'unidades',
      notes: clean(guidedLotProviderDraft.notes),
      finalProductCodes: [finalProductCode],
      technicalSheets: [],
      certificates: [],
    };
    const nextEntry: TraceabilityEntry = {
      id: uid('ent'),
      supplierId: supplier.id,
      supplierProductId: supplierProduct.id,
      stage: supplierProduct.category,
      deliveryDate: lot.deliveryDate,
      albaranNumber: lot.albaranNumber,
      solarisInvoiceNumber: lot.zohoInvoiceNumber,
      deliveryNoteQuantity: lot.deliveryNoteQuantity,
      quantity: lot.quantity,
      quantityMatchesInvoice: '',
      quantityDifference: '',
      quantityCheckNotes: '',
      supplierLot: lot.lotNumber,
      finalLotId: lot.id,
      expiryDate: lot.expiryDate,
      bestBeforeDate: lot.expiryDate,
      notes: clean(guidedLotProviderDraft.notes),
      attachments: emptyAttachments(),
      createdAt: now,
      updatedAt: now,
    };

    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        suppliers: base.suppliers.map((item) => {
          if (item.id !== supplier.id) return item;
          const products = existingProduct
            ? item.products
            : [supplierProduct, ...item.products];
          return {
            ...item,
            categories: Array.from(new Set([...item.categories, supplierProduct.category])),
            products,
            updatedAt: now,
          };
        }),
        lots: base.lots.map((item) => item.id === lot.id
          ? {
              ...item,
              processSteps: Array.from(new Set([...item.processSteps, supplierProduct.category])),
              entries: [nextEntry, ...item.entries],
              updatedAt: now,
            }
          : item),
      };
    });
    setGuidedLotProviderDraft(emptyGuidedLotProviderDraft());
    setSelectedSupplierId(supplier.id);
    emitSuccessFeedback('Proveedor asociado al lote.');
  };

  const addSupplierProductLot = (supplier: Supplier, product: SupplierProduct) => {
    const draft = lotDraftFor(supplier, product);
    if (!clean(draft.lotNumber)) {
      alert('Pon el número de lote.');
      return;
    }
    const now = new Date().toISOString();
    const productName = clean(draft.finalProductName) || product.name;
    const quantityLine = [
      clean(draft.deliveryNoteQuantity) ? `Cantidad en albarán: ${clean(draft.deliveryNoteQuantity)}` : '',
      clean(draft.receivedQuantity) ? `Cantidad entregada: ${clean(draft.receivedQuantity)}` : '',
    ].filter(Boolean).join(' · ');
    const processNotes = [quantityLine, clean(draft.notes)].filter(Boolean).join('\n');
    const existingLot = lots.find((lot) => (
      productKey(lot.productName) === productKey(productName)
      && clean(lot.lotNumber).toLowerCase() === clean(draft.lotNumber).toLowerCase()
    ));
    const nextLotId = existingLot?.id || uid('lot');
    const nextEntry: TraceabilityEntry = {
      id: uid('ent'),
      supplierId: supplier.id,
      supplierProductId: product.id,
      stage: product.category,
      deliveryDate: clean(draft.deliveryDate),
      albaranNumber: clean(draft.albaranNumber),
      solarisInvoiceNumber: clean(draft.solarisInvoiceNumber),
      deliveryNoteQuantity: clean(draft.deliveryNoteQuantity),
      quantity: clean(draft.receivedQuantity),
      quantityMatchesInvoice: clean(draft.quantityMatchesInvoice),
      quantityDifference: clean(draft.quantityDifference),
      quantityCheckNotes: clean(draft.quantityCheckNotes),
      supplierLot: clean(draft.lotNumber),
      finalLotId: nextLotId,
      expiryDate: clean(draft.expiryDate),
      bestBeforeDate: clean(draft.expiryDate),
      notes: processNotes,
      attachments: draft.attachments,
      createdAt: now,
      updatedAt: now,
    };

    setState((prev) => {
      const base = normalizeState(prev);
      const match = base.lots.find((lot) => (
        productKey(lot.productName) === productKey(productName)
        && clean(lot.lotNumber).toLowerCase() === clean(draft.lotNumber).toLowerCase()
      ));
      if (match) {
        return {
          ...base,
          lots: base.lots.map((lot) => lot.id === match.id
            ? {
                ...lot,
                productName,
                quantity: clean(draft.receivedQuantity) || lot.quantity,
                manufactureDate: clean(draft.manufactureDate) || lot.manufactureDate,
                expiryDate: clean(draft.expiryDate) || lot.expiryDate,
                processNotes: [lot.processNotes, processNotes].filter(Boolean).join('\n'),
                processSteps: Array.from(new Set([...lot.processSteps, product.category])),
                entries: [nextEntry, ...lot.entries],
                updatedAt: now,
              }
            : lot),
        };
      }
      const nextLot: FinalLot = {
        id: nextLotId,
        productName,
        lotNumber: clean(draft.lotNumber),
        quantity: clean(draft.receivedQuantity),
        quantityUnit: product.unit || selectedProductQuantityUnit,
        deliveryDate: clean(draft.deliveryDate),
        albaranNumber: clean(draft.albaranNumber),
        zohoPurchaseOrder: '',
        zohoInvoiceNumber: clean(draft.solarisInvoiceNumber),
        deliveryNoteQuantity: clean(draft.deliveryNoteQuantity),
        calculatedBoxes: boxCountFor(productName, clean(draft.receivedQuantity)),
        status: 'abierto',
        manufactureDate: clean(draft.manufactureDate),
        expiryDate: clean(draft.expiryDate),
        processNotes,
        processSteps: [product.category],
        attachments: draft.attachments,
        entries: [nextEntry],
        analyses: [],
        createdAt: now,
        updatedAt: now,
      };
      return { ...base, lots: [nextLot, ...base.lots] };
    });
    setSelectedSupplierId(supplier.id);
    setSelectedLotId(nextLotId);
    setExpandedSupplierIds((prev) => Array.from(new Set([...prev, supplier.id])));
    setExpandedProductIds((prev) => Array.from(new Set([...prev, productKeyFor(supplier.id, product.id)])));
    setExpandedLotIds((prev) => Array.from(new Set([...prev, nextLotId])));
    setExpandedCreateBlockIds((prev) => prev.filter((id) => id !== documentBlockKeyFor('create-lot', supplier.id, product.id)));
    setSupplierLotDrafts((prev) => ({
      ...prev,
      [draftKeyFor(supplier.id, product.id)]: emptySupplierLotDraft(product.name),
    }));
    setSelectedGuidedLotId(nextLotId);
    emitSuccessFeedback(existingLot ? 'Entrada añadida al lote existente.' : 'Lote final creado.');
  };

  const addEntry = () => {
    const lot = selectedLot;
    if (!lot) {
      alert('Crea o selecciona un lote final primero.');
      return;
    }
    if (!clean(entryDraft.supplierId) || !clean(entryDraft.supplierProductId)) {
      alert('Selecciona proveedor y producto/material suministrado.');
      return;
    }
    const now = new Date().toISOString();
    const nextEntry: TraceabilityEntry = {
      id: uid('ent'),
      ...entryDraft,
      finalLotId: lot.id,
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        lots: base.lots.map((item) => item.id === lot.id
          ? { ...item, entries: [nextEntry, ...item.entries], updatedAt: now }
          : item),
      };
    });
    setEntryDraft({
      supplierId: entryDraft.supplierId,
      supplierProductId: '',
      stage: entryDraft.stage,
      deliveryDate: '',
      albaranNumber: '',
      solarisInvoiceNumber: '',
      deliveryNoteQuantity: '',
      quantity: '',
      quantityMatchesInvoice: '',
      quantityDifference: '',
      quantityCheckNotes: '',
      supplierLot: '',
      expiryDate: '',
      bestBeforeDate: '',
      notes: '',
      attachments: emptyAttachments(),
    });
    emitSuccessFeedback('Entrada documental añadida al lote.');
  };

  const addAnalysis = () => {
    const lot = selectedLot;
    if (!lot) {
      alert('Selecciona un lote final primero.');
      return;
    }
    if (!clean(analysisDraft.title) && analysisDraft.attachments.length === 0) {
      alert('Añade un título o un archivo de análisis.');
      return;
    }
    const now = new Date().toISOString();
    const nextAnalysis: LotAnalysis = {
      id: uid('ana'),
      title: clean(analysisDraft.title) || 'Análisis de lote',
      date: analysisDraft.date,
      result: analysisDraft.result,
      notes: analysisDraft.notes,
      attachments: analysisDraft.attachments,
      createdAt: now,
    };
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        lots: base.lots.map((item) => item.id === lot.id
          ? { ...item, analyses: [nextAnalysis, ...item.analyses], updatedAt: now }
          : item),
      };
    });
    setAnalysisDraft({ title: '', date: '', result: '', notes: '', attachments: [] });
    emitSuccessFeedback('Análisis del lote adjuntado.');
  };

  const deleteEntry = (entryId: string) => {
    if (!selectedLot || !window.confirm('¿Eliminar esta entrada documental?')) return;
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        lots: base.lots.map((lot) => lot.id === selectedLot.id
          ? { ...lot, entries: lot.entries.filter((entry) => entry.id !== entryId), updatedAt: new Date().toISOString() }
          : lot),
      };
    });
  };

  const editSupplier = (supplier: Supplier) => {
    setEditingSupplierId(supplier.id);
    setSupplierEditDraft({
      name: supplier.name,
      fiscalName: supplier.fiscalName,
      taxId: supplier.taxId,
      sanitaryRegister: supplier.sanitaryRegister,
      address: supplier.address,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      notes: supplier.notes,
      contracts: supplier.contracts,
    });
    setSelectedSupplierId(supplier.id);
    setExpandedSupplierIds((prev) => Array.from(new Set([...prev, supplier.id])));
  };

  const saveSupplierEdit = () => {
    if (!editingSupplierId) return;
    if (!clean(supplierEditDraft.name)) {
      alert('El proveedor necesita nombre.');
      return;
    }
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        suppliers: base.suppliers.map((item) => item.id === editingSupplierId
          ? {
              ...item,
              name: clean(supplierEditDraft.name),
              fiscalName: clean(supplierEditDraft.fiscalName),
              taxId: clean(supplierEditDraft.taxId),
              sanitaryRegister: clean(supplierEditDraft.sanitaryRegister),
              address: clean(supplierEditDraft.address),
              contactName: clean(supplierEditDraft.contactName),
              phone: clean(supplierEditDraft.phone),
              email: clean(supplierEditDraft.email),
              notes: clean(supplierEditDraft.notes),
              contracts: supplierEditDraft.contracts,
              updatedAt: new Date().toISOString(),
            }
          : item),
      };
    });
    setEditingSupplierId('');
    setSupplierEditDraft(emptySupplierFormDraft());
    emitSuccessFeedback('Proveedor editado.');
  };

  const deleteSupplier = (supplier: Supplier) => {
    const usedEntries = lots.reduce((total, lot) => total + lot.entries.filter((entry) => entry.supplierId === supplier.id).length, 0);
    const message = usedEntries > 0
      ? `¿Eliminar ${supplier.name}? También se eliminarán ${usedEntries} entradas asociadas en lotes.`
      : `¿Eliminar ${supplier.name}?`;
    if (!window.confirm(message)) return;
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        suppliers: base.suppliers.filter((item) => item.id !== supplier.id),
        lots: base.lots.map((lot) => ({
          ...lot,
          entries: lot.entries.filter((entry) => entry.supplierId !== supplier.id),
          updatedAt: new Date().toISOString(),
        })),
      };
    });
    if (selectedSupplierId === supplier.id) setSelectedSupplierId('');
    emitSuccessFeedback('Proveedor eliminado.');
  };

  const editSupplierProduct = (supplier: Supplier, product: SupplierProduct) => {
    const key = productKeyFor(supplier.id, product.id);
    setEditingProductKey(key);
    setProductEditDraft({
      name: product.name,
      reference: product.reference,
      category: product.category,
      unit: product.unit,
      notes: product.notes,
      finalProductCodes: product.finalProductCodes,
      technicalSheets: product.technicalSheets,
      certificates: product.certificates,
    });
    setSelectedSupplierId(supplier.id);
    setExpandedSupplierIds((prev) => Array.from(new Set([...prev, supplier.id])));
    setExpandedProductIds((prev) => Array.from(new Set([...prev, key])));
  };

  const saveSupplierProductEdit = (supplier: Supplier, product: SupplierProduct) => {
    if (!clean(productEditDraft.name)) {
      alert('El producto suministrado necesita nombre.');
      return;
    }
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        suppliers: base.suppliers.map((item) => {
          if (item.id !== supplier.id) return item;
          const products = item.products.map((supplierProduct) => supplierProduct.id === product.id
            ? {
                ...supplierProduct,
                name: clean(productEditDraft.name),
                reference: clean(productEditDraft.reference),
                unit: clean(productEditDraft.unit),
                category: productEditDraft.category,
                notes: clean(productEditDraft.notes),
                finalProductCodes: productEditDraft.finalProductCodes.map(productKey).filter(Boolean),
                technicalSheets: productEditDraft.technicalSheets,
                certificates: productEditDraft.certificates,
              }
            : supplierProduct);
          return {
            ...item,
            products,
            categories: Array.from(new Set(products.map((supplierProduct) => supplierProduct.category))),
            updatedAt: new Date().toISOString(),
          };
        }),
      };
    });
    setEditingProductKey('');
    setProductEditDraft(emptyProductFormDraft());
    emitSuccessFeedback('Suministro editado.');
  };

  const deleteSupplierProduct = (supplier: Supplier, product: SupplierProduct) => {
    const usedEntries = lots.reduce((total, lot) => total + lot.entries.filter((entry) => entry.supplierProductId === product.id).length, 0);
    const message = usedEntries > 0
      ? `¿Eliminar ${product.name}? También se eliminarán ${usedEntries} entradas asociadas en lotes.`
      : `¿Eliminar ${product.name}?`;
    if (!window.confirm(message)) return;
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        suppliers: base.suppliers.map((item) => {
          if (item.id !== supplier.id) return item;
          const products = item.products.filter((supplierProduct) => supplierProduct.id !== product.id);
          return {
            ...item,
            products,
            categories: Array.from(new Set(products.map((supplierProduct) => supplierProduct.category))),
            updatedAt: new Date().toISOString(),
          };
        }),
        lots: base.lots.map((lot) => ({
          ...lot,
          entries: lot.entries.filter((entry) => entry.supplierProductId !== product.id),
          updatedAt: new Date().toISOString(),
        })),
      };
    });
    emitSuccessFeedback('Suministro eliminado.');
  };

  const editLot = (lot: FinalLot, supplier: Supplier, product: SupplierProduct, entry?: TraceabilityEntry) => {
    setEditingLotId(lot.id);
    setLotEditContext({ supplierId: supplier.id, productId: product.id });
    setLotEditDraft({
      finalProductName: lot.productName,
      lotNumber: entry?.supplierLot || lot.lotNumber,
      deliveryDate: entry?.deliveryDate || '',
      albaranNumber: entry?.albaranNumber || '',
      solarisInvoiceNumber: entry?.solarisInvoiceNumber || '',
      deliveryNoteQuantity: entry?.deliveryNoteQuantity || '',
      receivedQuantity: entry?.quantity || lot.quantity,
      quantityMatchesInvoice: entry?.quantityMatchesInvoice || '',
      quantityDifference: entry?.quantityDifference || '',
      quantityCheckNotes: entry?.quantityCheckNotes || '',
      manufactureDate: lot.manufactureDate,
      expiryDate: entry?.expiryDate || entry?.bestBeforeDate || lot.expiryDate,
      notes: entry?.notes || lot.processNotes,
      attachments: entry?.attachments || emptyAttachments(),
    });
    setSelectedLotId(lot.id);
    setExpandedLotIds((prev) => Array.from(new Set([...prev, lot.id])));
  };

  const saveLotEdit = () => {
    if (!editingLotId || !lotEditContext) return;
    if (!clean(lotEditDraft.lotNumber)) {
      alert('El lote necesita número.');
      return;
    }
    const now = new Date().toISOString();
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        lots: base.lots.map((item) => {
          if (item.id !== editingLotId) return item;
          const supplier = base.suppliers.find((candidate) => candidate.id === lotEditContext.supplierId);
          const product = supplier?.products.find((candidate) => candidate.id === lotEditContext.productId);
          const quantityLine = [
            clean(lotEditDraft.deliveryNoteQuantity) ? `Cantidad en albarán: ${clean(lotEditDraft.deliveryNoteQuantity)}` : '',
            clean(lotEditDraft.receivedQuantity) ? `Cantidad entregada: ${clean(lotEditDraft.receivedQuantity)}` : '',
          ].filter(Boolean).join(' · ');
          const processNotes = [quantityLine, clean(lotEditDraft.notes)].filter(Boolean).join('\n');
          return {
            ...item,
            productName: clean(lotEditDraft.finalProductName) || item.productName,
            lotNumber: clean(lotEditDraft.lotNumber) || item.lotNumber,
            quantity: clean(lotEditDraft.receivedQuantity),
            manufactureDate: clean(lotEditDraft.manufactureDate),
            expiryDate: clean(lotEditDraft.expiryDate),
            processNotes,
            processSteps: product ? Array.from(new Set([...item.processSteps, product.category])) : item.processSteps,
            entries: item.entries.map((entry) => (
              entry.supplierId === lotEditContext.supplierId && entry.supplierProductId === lotEditContext.productId
                ? {
                    ...entry,
                    stage: product?.category || entry.stage,
                    deliveryDate: clean(lotEditDraft.deliveryDate),
                    albaranNumber: clean(lotEditDraft.albaranNumber),
                    solarisInvoiceNumber: clean(lotEditDraft.solarisInvoiceNumber),
                    deliveryNoteQuantity: clean(lotEditDraft.deliveryNoteQuantity),
                    quantity: clean(lotEditDraft.receivedQuantity),
                    quantityMatchesInvoice: clean(lotEditDraft.quantityMatchesInvoice),
                    quantityDifference: clean(lotEditDraft.quantityDifference),
                    quantityCheckNotes: clean(lotEditDraft.quantityCheckNotes),
                    supplierLot: clean(lotEditDraft.lotNumber),
                    expiryDate: clean(lotEditDraft.expiryDate),
                    bestBeforeDate: clean(lotEditDraft.expiryDate),
                    notes: processNotes,
                    attachments: lotEditDraft.attachments,
                    updatedAt: now,
                  }
                : entry
            )),
            updatedAt: now,
          };
        }),
      };
    });
    setEditingLotId('');
    setLotEditContext(null);
    setLotEditDraft(emptySupplierLotDraft());
    emitSuccessFeedback('Lote editado.');
  };

  const startGuidedLotEdit = (lot: FinalLot) => {
    setEditingLotId(lot.id);
    setLotEditContext(null);
    setGuidedLotEditDraft({
      productName: lot.productName,
      lotNumber: lot.lotNumber,
      quantity: lot.quantity,
      quantityUnit: lot.quantityUnit,
      deliveryDate: lot.deliveryDate,
      albaranNumber: lot.albaranNumber,
      zohoPurchaseOrder: lot.zohoPurchaseOrder,
      zohoInvoiceNumber: lot.zohoInvoiceNumber,
      deliveryNoteQuantity: lot.deliveryNoteQuantity,
      calculatedBoxes: lot.calculatedBoxes,
      manufactureDate: lot.manufactureDate,
      expiryDate: lot.expiryDate,
      processNotes: lot.processNotes,
      attachments: lot.attachments,
    });
    setSelectedLotId(lot.id);
    setSelectedGuidedLotId(lot.id);
  };

  const saveGuidedLotEdit = () => {
    const currentLot = lots.find((lot) => lot.id === editingLotId);
    if (!currentLot) return;
    if (!clean(guidedLotEditDraft.productName) || !clean(guidedLotEditDraft.lotNumber)) {
      alert('El lote necesita producto y número de lote.');
      return;
    }
    const now = new Date().toISOString();
    const duplicatedLot = lots.some((lot) => (
      lot.id !== currentLot.id
      && productKey(lot.productName) === productKey(guidedLotEditDraft.productName)
      && clean(lot.lotNumber).toLowerCase() === clean(guidedLotEditDraft.lotNumber).toLowerCase()
    ));
    if (duplicatedLot) {
      alert('Ya existe otro lote con ese producto y número de lote.');
      return;
    }
    const previousProduct = productKey(currentLot.productName);
    const previousLot = clean(currentLot.lotNumber).toLowerCase();
    const nextProductCode = productKey(guidedLotEditDraft.productName);
    const nextProductName = PRODUCT_LABELS_BY_CODE[nextProductCode] || guidedLotEditDraft.productName;
    const meta = lotProductMetaFor(nextProductName);
    const primaryQuantity = clean(guidedLotEditDraft.deliveryNoteQuantity) || clean(guidedLotEditDraft.quantity);
    const quantityUnit = clean(guidedLotEditDraft.quantityUnit)
      || (meta?.mode === 'ENSAMBLAJE' ? 'viales' : meta?.mode === 'KIT' ? 'kits' : 'unidades');
    const calculatedBoxes = clean(guidedLotEditDraft.calculatedBoxes) || boxCountFor(nextProductName, primaryQuantity);

    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        lots: base.lots.map((lot) => lot.id === currentLot.id
          ? {
              ...lot,
              productName: nextProductName,
              lotNumber: clean(guidedLotEditDraft.lotNumber),
              quantity: primaryQuantity,
              quantityUnit,
              deliveryDate: clean(guidedLotEditDraft.deliveryDate),
              albaranNumber: clean(guidedLotEditDraft.albaranNumber),
              zohoPurchaseOrder: clean(guidedLotEditDraft.zohoPurchaseOrder),
              zohoInvoiceNumber: clean(guidedLotEditDraft.zohoInvoiceNumber),
              deliveryNoteQuantity: clean(guidedLotEditDraft.deliveryNoteQuantity) || primaryQuantity,
              calculatedBoxes,
              manufactureDate: clean(guidedLotEditDraft.manufactureDate),
              expiryDate: clean(guidedLotEditDraft.expiryDate),
              processNotes: clean(guidedLotEditDraft.processNotes),
              attachments: guidedLotEditDraft.attachments,
              entries: lot.entries.map((entry) => ({
                ...entry,
                deliveryDate: clean(guidedLotEditDraft.deliveryDate) || entry.deliveryDate,
                albaranNumber: clean(guidedLotEditDraft.albaranNumber) || entry.albaranNumber,
                solarisInvoiceNumber: clean(guidedLotEditDraft.zohoInvoiceNumber) || entry.solarisInvoiceNumber,
                deliveryNoteQuantity: clean(guidedLotEditDraft.deliveryNoteQuantity) || entry.deliveryNoteQuantity,
                quantity: primaryQuantity || entry.quantity,
                supplierLot: clean(guidedLotEditDraft.lotNumber) || entry.supplierLot,
                finalLotId: lot.id,
                expiryDate: clean(guidedLotEditDraft.expiryDate) || entry.expiryDate,
                bestBeforeDate: clean(guidedLotEditDraft.expiryDate) || entry.bestBeforeDate,
                updatedAt: now,
              })),
              updatedAt: now,
            }
          : lot),
      };
    });

    setCanetLotes((prev) => {
      const rows = Array.isArray(prev) ? prev : [];
      let updated = false;
      const nextRows = rows.map((row) => {
        const samePrevious = productKey(row?.producto) === previousProduct
          && clean(row?.lote).toLowerCase() === previousLot;
        const sameNext = productKey(row?.producto) === nextProductCode
          && clean(row?.lote).toLowerCase() === clean(guidedLotEditDraft.lotNumber).toLowerCase();
        if (!samePrevious && !sameNext) return row;
        updated = true;
        return {
          ...row,
          producto: nextProductCode,
          lote: clean(guidedLotEditDraft.lotNumber),
          fecha_alta: clean(guidedLotEditDraft.deliveryDate),
          fecha_caducidad: clean(guidedLotEditDraft.expiryDate),
          notas: clean(guidedLotEditDraft.processNotes),
          viales_recibidos: primaryQuantity,
          estado: clean(row?.estado) || 'ACTIVO',
          origen_dossier_trazabilidad: clean(row?.origen_dossier_trazabilidad) || 'SI',
          lastChangedAt: now,
        };
      });
      if (updated) return nextRows;
      return [{
        producto: nextProductCode,
        lote: clean(guidedLotEditDraft.lotNumber),
        fecha_alta: clean(guidedLotEditDraft.deliveryDate),
        fecha_caducidad: clean(guidedLotEditDraft.expiryDate),
        dias_restantes: '',
        semaforo_caducidad: '',
        notas: clean(guidedLotEditDraft.processNotes),
        viales_recibidos: primaryQuantity,
        estado: 'ACTIVO',
        ensamblaje_finalizado: 'NO',
        origen_dossier_trazabilidad: 'SI',
        lastChangedAt: now,
      }, ...rows];
    });

    setEditingLotId('');
    setGuidedLotEditDraft(emptyLotFormDraft(selectedProduct?.label || ''));
    if (nextProductCode) setSelectedProductKey(nextProductCode);
    setSelectedGuidedLotId(currentLot.id);
    emitSuccessFeedback('Lote editado y sincronizado con maestros.');
  };

  const startLotProviderEntryEdit = (entry: TraceabilityEntry) => {
    const supplier = suppliers.find((item) => item.id === entry.supplierId);
    const product = supplier?.products.find((item) => item.id === entry.supplierProductId);
    setEditingLotProviderEntryId(entry.id);
    setLotProviderEditDraft({
      supplierId: entry.supplierId,
      suppliedName: product?.name || entry.notes,
      reference: product?.reference || '',
      category: product?.category || entry.stage,
      unit: product?.unit || '',
      notes: entry.notes,
    });
  };

  const saveLotProviderEntryEdit = (lot: FinalLot, entry: TraceabilityEntry) => {
    const supplier = suppliers.find((item) => item.id === lotProviderEditDraft.supplierId);
    if (!supplier) {
      alert('Selecciona un proveedor.');
      return;
    }
    const now = new Date().toISOString();
    const finalProductCode = productKey(lot.productName);
    const existingProduct = supplier.products.find((product) => (
      product.id === entry.supplierProductId
      || (
        product.finalProductCodes.includes(finalProductCode)
        && product.category === lotProviderEditDraft.category
        && clean(product.name).toLowerCase() === clean(lotProviderEditDraft.suppliedName).toLowerCase()
      )
    ));
    const supplierProduct: SupplierProduct = existingProduct || {
      id: uid('spr'),
      name: clean(lotProviderEditDraft.suppliedName) || `Aporte para ${lot.productName}`,
      reference: clean(lotProviderEditDraft.reference),
      category: lotProviderEditDraft.category,
      unit: clean(lotProviderEditDraft.unit) || lot.quantityUnit || 'unidades',
      notes: clean(lotProviderEditDraft.notes),
      finalProductCodes: [finalProductCode],
      technicalSheets: [],
      certificates: [],
    };

    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        suppliers: base.suppliers.map((item) => {
          if (item.id !== supplier.id) return item;
          const products = existingProduct
            ? item.products.map((product) => product.id === existingProduct.id
              ? {
                  ...product,
                  name: clean(lotProviderEditDraft.suppliedName) || product.name,
                  reference: clean(lotProviderEditDraft.reference),
                  category: lotProviderEditDraft.category,
                  unit: clean(lotProviderEditDraft.unit) || product.unit,
                  notes: clean(lotProviderEditDraft.notes),
                  finalProductCodes: Array.from(new Set([...product.finalProductCodes, finalProductCode])),
                }
              : product)
            : [supplierProduct, ...item.products];
          return {
            ...item,
            categories: Array.from(new Set([...item.categories, supplierProduct.category])),
            products,
            updatedAt: now,
          };
        }),
        lots: base.lots.map((item) => item.id === lot.id
          ? {
              ...item,
              processSteps: Array.from(new Set([...item.processSteps, supplierProduct.category])),
              entries: item.entries.map((candidate) => candidate.id === entry.id
                ? {
                    ...candidate,
                    supplierId: supplier.id,
                    supplierProductId: supplierProduct.id,
                    stage: supplierProduct.category,
                    notes: clean(lotProviderEditDraft.notes),
                    updatedAt: now,
                  }
                : candidate),
              updatedAt: now,
            }
          : item),
      };
    });
    setEditingLotProviderEntryId('');
    setLotProviderEditDraft(emptyGuidedLotProviderDraft());
    emitSuccessFeedback('Proveedor del lote editado.');
  };

  const deleteLotProviderEntry = (lot: FinalLot, entry: TraceabilityEntry) => {
    if (!window.confirm('¿Quitar este proveedor de este lote?')) return;
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        lots: base.lots.map((item) => item.id === lot.id
          ? {
              ...item,
              entries: item.entries.filter((candidate) => candidate.id !== entry.id),
              updatedAt: new Date().toISOString(),
            }
          : item),
      };
    });
    emitSuccessFeedback('Proveedor quitado del lote.');
  };

  const deleteLot = (lot: FinalLot) => {
    if (!window.confirm(`¿Eliminar completamente ${lot.productName} · lote ${lot.lotNumber}?`)) return;
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        lots: base.lots.filter((item) => item.id !== lot.id),
      };
    });
    if (selectedLotId === lot.id) setSelectedLotId('');
    if (selectedGuidedLotId === lot.id) setSelectedGuidedLotId('');
    setCanetLotes((prev) => {
      const rows = Array.isArray(prev) ? prev : [];
      return rows.filter((row) => {
        const sameLot = productKey(row?.producto) === productKey(lot.productName)
          && clean(row?.lote).toLowerCase() === clean(lot.lotNumber).toLowerCase();
        return !(sameLot && clean(row?.origen_dossier_trazabilidad).toUpperCase() === 'SI');
      });
    });
    emitSuccessFeedback('Lote eliminado.');
  };

  const deleteAnalysis = (analysisId: string) => {
    if (!selectedLot || !window.confirm('¿Eliminar este análisis del lote?')) return;
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        lots: base.lots.map((lot) => lot.id === selectedLot.id
          ? { ...lot, analyses: lot.analyses.filter((analysis) => analysis.id !== analysisId), updatedAt: new Date().toISOString() }
          : lot),
      };
    });
  };

  const downloadLotPdf = (lot: FinalLot) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const margin = 36;
    const entryDetails = lot.entries.map((entry) => {
      const supplier = suppliers.find((item) => item.id === entry.supplierId);
      const product = supplier?.products.find((item) => item.id === entry.supplierProductId);
      return {
        entry,
        supplier,
        product,
        stage: product?.category || entry.stage,
        unit: clean(product?.unit),
      };
    });
    const deliveryNoteQuantities = entryDetails
      .map(({ entry, unit }) => [entry.deliveryNoteQuantity || '-', unit].filter(Boolean).join(' '))
      .join('\n') || [lot.deliveryNoteQuantity || '-', lot.quantityUnit].filter(Boolean).join(' ');
    const deliveredQuantities = entryDetails
      .map(({ entry, unit }) => [entry.quantity || lot.quantity || '-', unit].filter(Boolean).join(' '))
      .join('\n') || [lot.quantity || '-', lot.quantityUnit].filter(Boolean).join(' ');
    const receptionFormats = Array.from(new Set([...entryDetails.map((detail) => detail.unit), lot.quantityUnit].filter(Boolean))).join(', ') || '-';

    doc.setFontSize(18);
    doc.text('Dossier de trazabilidad', margin, 42);
    doc.setFontSize(10);
    doc.text(`Producto: ${safePdfText(lot.productName)} · Lote: ${safePdfText(lot.lotNumber)}`, margin, 62);
    doc.text(`Generado: ${new Date().toLocaleString('es-ES')}`, margin, 78);

    autoTable(doc, {
      startY: 98,
      head: [['Campo', 'Valor']],
      body: [
        ['Producto final', safePdfText(lot.productName)],
        ['Lote final', safePdfText(lot.lotNumber)],
        ['Cantidades en albarán', safePdfText(deliveryNoteQuantities) || '-'],
        ['Cantidades entregadas', safePdfText(deliveredQuantities) || '-'],
        ['Albarán', safePdfText(lot.albaranNumber) || '-'],
        ['Orden de compra Zoho', safePdfText(lot.zohoPurchaseOrder) || '-'],
        ['Factura Zoho / Solaris', safePdfText(lot.zohoInvoiceNumber) || '-'],
        ['Cajas calculadas', safePdfText(lot.calculatedBoxes) || '-'],
        ['Formato de recepción', safePdfText(receptionFormats) || '-'],
        ['Fecha montaje/fabricación', safePdfText(lot.manufactureDate) || '-'],
        ['Caducidad / consumo preferente final', safePdfText(lot.expiryDate) || '-'],
      ],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [15, 118, 110] },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 18,
      head: [['Proveedor', 'Registro sanitario', 'Producto suministrado', 'Referencia', 'Tipo', 'Unidad/formato']],
      body: entryDetails.map(({ supplier, product, stage }) => [
        supplier?.name || '-',
        supplier?.sanitaryRegister || '-',
        product?.name || '-',
        product?.reference || '-',
        labelForCategory(stage),
        product?.unit || '-',
      ]),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 4 },
      headStyles: { fillColor: [15, 118, 110] },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 18,
      head: [['Etapa', 'Albarán', 'Lote proveedor', 'Fecha entrega', 'Cantidad en albarán', 'Cantidad entregada', 'Cad./cons.', 'Factura Solaris', 'Corresponde', 'Diferencia', 'Observación', 'Adjuntos']],
      body: entryDetails.map(({ entry, stage, unit }) => [
        labelForCategory(stage),
        entry.albaranNumber || '-',
        entry.supplierLot || '-',
        entry.deliveryDate || '-',
        [entry.deliveryNoteQuantity || '-', unit].filter(Boolean).join(' '),
        [entry.quantity || '-', unit].filter(Boolean).join(' '),
        entry.expiryDate || entry.bestBeforeDate || '-',
        entry.solarisInvoiceNumber || '-',
        labelForQuantityMatch(entry.quantityMatchesInvoice),
        entry.quantityDifference || '-',
        safePdfText(entry.quantityCheckNotes) || '-',
        String(fileCount(entry)),
      ]),
      theme: 'grid',
      styles: { fontSize: 6, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [31, 41, 55] },
      columnStyles: { 10: { cellWidth: 115 } },
    });

    const lotBaseFiles = DOCUMENT_GROUPS.flatMap((group) => (lot.attachments[group.key] || []).map((file) => [
      'Lote base',
      group.label,
      file.name,
      file.url,
    ]));
    const entryFiles = lot.entries.flatMap((entry) => {
      const supplier = suppliers.find((item) => item.id === entry.supplierId);
      const product = supplier?.products.find((item) => item.id === entry.supplierProductId);
      const title = `${supplier?.name || '-'} / ${product?.name || '-'} / ${entry.supplierLot || '-'}`;
      return DOCUMENT_GROUPS.flatMap((group) => (entry.attachments[group.key] || []).map((file) => [
        title,
        group.label,
        file.name,
        file.url,
      ]));
    });

    if (lotBaseFiles.length > 0 || entryFiles.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 18,
        head: [['Entrada', 'Tipo documental', 'Archivo adjunto', 'URL']],
        body: [...lotBaseFiles, ...entryFiles],
        theme: 'striped',
        styles: { fontSize: 6, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [15, 118, 110] },
        columnStyles: { 3: { cellWidth: 230 } },
      });
    }

    if (lot.analyses.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 18,
        head: [['Análisis lote final', 'Fecha', 'Resultado', 'Archivos']],
        body: lot.analyses.map((analysis) => [
          analysis.title,
          analysis.date || '-',
          analysis.result || '-',
          analysis.attachments.map((file) => file.name).join(', ') || '-',
        ]),
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 4 },
        headStyles: { fillColor: [124, 45, 18] },
      });
    }

    doc.save(`dossier-trazabilidad-${lot.productName}-${lot.lotNumber}.pdf`.replace(/[^\w.-]+/g, '-').toLowerCase());
  };

  const downloadSupplierPdf = (supplier: Supplier) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const margin = 36;
    doc.setFontSize(18);
    doc.text(`Carpeta proveedor: ${safePdfText(supplier.name)}`, margin, 42);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-ES')}`, margin, 60);

    autoTable(doc, {
      startY: 82,
      head: [['Campo', 'Valor']],
      body: [
        ['Proveedor', safePdfText(supplier.name)],
        ['Razón social', safePdfText(supplier.fiscalName) || '-'],
        ['NIF/CIF', safePdfText(supplier.taxId) || '-'],
        ['Registro sanitario', safePdfText(supplier.sanitaryRegister) || '-'],
        ['Dirección', safePdfText(supplier.address) || '-'],
        ['Teléfono', safePdfText(supplier.phone) || '-'],
        ['Email', safePdfText(supplier.email) || '-'],
        ['Contratos adjuntos', String(supplier.contracts.length)],
      ],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [15, 118, 110] },
    });

    if (supplier.contracts.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 16,
        head: [['Contrato / documento proveedor', 'URL']],
        body: supplier.contracts.map((file) => [file.name, file.url]),
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [15, 118, 110] },
        columnStyles: { 1: { cellWidth: 330 } },
      });
    }

    doc.save(`carpeta-proveedor-${supplier.name}.pdf`.replace(/[^\w.-]+/g, '-').toLowerCase());
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-6">
        <div className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">Centro de mando / Operación</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Dossier trazabilidad</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
            Crea proveedores en una bolsa general y después entra a cada producto maestro para dar de alta sus lotes con los proveedores que correspondan.
          </p>
          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-black text-slate-900">FAQ rápido</summary>
            <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-600 md:grid-cols-2">
              <p><span className="font-black text-slate-900">Proveedor:</span> datos legales, registro sanitario, notas y contrato Solaris/proveedor.</p>
              <p><span className="font-black text-slate-900">Lote:</span> producto maestro, lote, albarán, cantidades, caducidad y documentos de recepción.</p>
              <p><span className="font-black text-slate-900">Proveedor asociado:</span> proveedor que participa en ese lote, como mezcla, envasado, cartonaje o acondicionamiento.</p>
              <p><span className="font-black text-slate-900">Inventario:</span> al crear un lote aquí, también se da de alta en maestros de Canet si no existía.</p>
            </div>
          </details>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Bolsa general</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Proveedores independientes</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Da de alta proveedores una vez. Luego podrás asociarlos a uno o varios lotes dentro de cualquier producto.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuidedProviderPanel((prev) => !prev)}
              className="inline-flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-left text-sm font-black text-teal-950 shadow-sm hover:bg-teal-100"
            >
              <span className="inline-flex items-center gap-2">
                <Building2 size={18} />
                Crear proveedor
              </span>
              {showGuidedProviderPanel ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
          </div>

          {showGuidedProviderPanel && (
            <div className="mt-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-3">
              <p className="text-xs font-black uppercase tracking-widest text-teal-700">Datos del proveedor</p>
              <div className="mt-2 grid gap-2 md:grid-cols-4">
                <input value={supplierDraft.name} onChange={(e) => updateSupplierDraft('name', e.target.value)} placeholder="Nombre proveedor" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <input value={supplierDraft.fiscalName} onChange={(e) => updateSupplierDraft('fiscalName', e.target.value)} placeholder="Razón social" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <input value={supplierDraft.taxId} onChange={(e) => updateSupplierDraft('taxId', e.target.value)} placeholder="NIF/CIF" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <input value={supplierDraft.sanitaryRegister} onChange={(e) => updateSupplierDraft('sanitaryRegister', e.target.value)} placeholder="Registro sanitario" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <input value={supplierDraft.phone} onChange={(e) => updateSupplierDraft('phone', e.target.value)} placeholder="Teléfono" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <input value={supplierDraft.email} onChange={(e) => updateSupplierDraft('email', e.target.value)} placeholder="Email" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <textarea value={supplierDraft.address} onChange={(e) => updateSupplierDraft('address', e.target.value)} placeholder="Dirección" className="min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-teal-400 md:col-span-2" />
                <textarea value={supplierDraft.notes} onChange={(e) => updateSupplierDraft('notes', e.target.value)} placeholder="Notas del proveedor" className="min-h-[58px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-teal-400 md:col-span-4" />
                <div className="rounded-xl border border-slate-100 bg-white p-3 md:col-span-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Contrato Solaris con proveedor</p>
                  <FileUploader
                    folderPath="traceability/supplier-contracts"
                    existingFiles={supplierDraft.contracts}
                    onUploadComplete={(files) => setSupplierDraft((prev) => ({ ...prev, contracts: files }))}
                    compact
                    maxSizeMB={20}
                  />
                </div>
              </div>
              <button type="button" onClick={addSupplier} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
                <Plus size={16} />
                Crear proveedor
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-700">Vista guiada por producto</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Productos → lotes → proveedores asociados</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Elige un producto maestro, crea sus lotes y vincula los proveedores que participaron en cada lote.
              </p>
            </div>
            {selectedProduct && (
              <div className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-2 text-right">
                <p className="text-[11px] font-black uppercase tracking-widest text-teal-700">Modo maestro</p>
                <p className="text-sm font-black text-teal-950">{selectedProductModeLabel}</p>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {productCards.map((product) => {
              const isActive = product.key === activeProductKey;
              const productLots = lots.filter((lot) => productKey(lot.productName) === product.key);
              const lotCount = productLots.length;
              const supplierCount = new Set(productLots.flatMap((lot) => lot.entries.map((entry) => entry.supplierId).filter(Boolean))).size;
              const validColor = /^#[0-9a-f]{6}$/i.test(product.color);
              return (
                <button
                  key={product.key}
                  type="button"
                  onClick={() => {
                    setSelectedProductKey(product.key);
                    setSelectedGuidedLotId('');
                    setShowGuidedLotPanel(false);
                    setShowGuidedProviderPanel(false);
                    setLotDraft((prev) => ({
                      ...prev,
                      productName: product.label,
                      quantityUnit: product.mode === 'ENSAMBLAJE' ? 'viales' : product.mode === 'KIT' ? 'kits' : 'unidades',
                      calculatedBoxes: boxCountFor(product.label, prev.deliveryNoteQuantity || prev.quantity),
                    }));
                  }}
                  style={validColor ? { borderColor: product.color } : undefined}
                  className={`min-h-[96px] rounded-2xl border p-3 text-left transition ${isActive ? 'bg-slate-950 text-white shadow-md' : 'bg-slate-50 text-slate-800 hover:bg-white'}`}
                >
                  <span className={`block text-[11px] font-black uppercase tracking-widest ${isActive ? 'text-teal-100' : 'text-slate-500'}`}>{product.mode}</span>
                  <span className="mt-1 block text-lg font-black">{product.label}</span>
                  <span className={`mt-1 block text-xs font-bold ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>
                    {supplierCount} proveedor(es) · {lotCount} lote(s)
                  </span>
                </button>
              );
            })}
          </div>

          {selectedProduct && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowGuidedLotPanel((prev) => !prev);
                    setLotDraft((prev) => ({
                      ...prev,
                      productName: selectedProduct.label,
                      quantityUnit: prev.quantityUnit || selectedProductQuantityUnit,
                      calculatedBoxes: prev.calculatedBoxes || boxCountFor(selectedProduct.label, prev.deliveryNoteQuantity || prev.quantity),
                    }));
                  }}
                  className="inline-flex items-center justify-between rounded-2xl border border-slate-900 bg-slate-950 px-4 py-3 text-left text-sm font-black text-white shadow-sm hover:bg-slate-800"
                >
                  <span className="inline-flex items-center gap-2">
                    <Package size={18} />
                    Dar de alta lote
                  </span>
                  {showGuidedLotPanel ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
              </div>

              {showGuidedLotPanel && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Crear nuevo lote</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-4">
                      <label className="grid gap-1">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Producto maestro</span>
                        <select
                          value={activeProductKey}
                          onChange={(event) => {
                            const next = productCards.find((product) => product.key === event.target.value);
                            if (!next) return;
                            setSelectedProductKey(next.key);
                            setLotDraft((prev) => ({
                              ...prev,
                              productName: next.label,
                              quantityUnit: next.mode === 'ENSAMBLAJE' ? 'viales' : next.mode === 'KIT' ? 'kits' : 'unidades',
                              calculatedBoxes: boxCountFor(next.label, prev.deliveryNoteQuantity || prev.quantity),
                            }));
                          }}
                          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-400"
                        >
                          {productCards.map((product) => <option key={product.key} value={product.key}>{product.label}</option>)}
                        </select>
                      </label>
                      <input
                        value={lotDraft.lotNumber}
                        onChange={(e) => setLotDraft((prev) => ({ ...prev, lotNumber: e.target.value }))}
                        placeholder="Nº lote"
                        className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400"
                      />
                      <input
                        value={lotDraft.albaranNumber}
                        onChange={(e) => setLotDraft((prev) => ({ ...prev, albaranNumber: e.target.value }))}
                        placeholder="Nº albarán"
                        className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400"
                      />
                      <label className="grid gap-1">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fecha entrada</span>
                        <input
                          type="date"
                          value={lotDraft.deliveryDate}
                          onChange={(e) => setLotDraft((prev) => ({ ...prev, deliveryDate: e.target.value }))}
                          className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400"
                        />
                      </label>
                      <input
                        value={lotDraft.zohoPurchaseOrder}
                        onChange={(e) => setLotDraft((prev) => ({ ...prev, zohoPurchaseOrder: e.target.value }))}
                        placeholder="Orden de compra Zoho"
                        className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400"
                      />
                      <input
                        value={lotDraft.zohoInvoiceNumber}
                        onChange={(e) => setLotDraft((prev) => ({ ...prev, zohoInvoiceNumber: e.target.value }))}
                        placeholder="Factura Zoho / Solaris"
                        className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400"
                      />
                      <label className="grid gap-1">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Cantidad según albarán ({selectedProductQuantityUnit})</span>
                        <input
                          value={lotDraft.deliveryNoteQuantity}
                          onChange={(e) => {
                            const quantity = e.target.value;
                            setLotDraft((prev) => ({
                              ...prev,
                              deliveryNoteQuantity: quantity,
                              quantity,
                              quantityUnit: selectedProductQuantityUnit,
                              calculatedBoxes: boxCountFor(selectedProduct.label, quantity),
                            }));
                          }}
                          placeholder={`En ${selectedProductQuantityUnit}`}
                          className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Cajas calculadas</span>
                        <input
                          value={lotDraft.calculatedBoxes || boxCountFor(selectedProduct.label, lotDraft.deliveryNoteQuantity || lotDraft.quantity)}
                          onChange={(e) => setLotDraft((prev) => ({ ...prev, calculatedBoxes: e.target.value }))}
                          placeholder="Automático si aplica"
                          className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Caducidad/consumo pref.</span>
                        <input
                          type="date"
                          value={lotDraft.expiryDate}
                          onChange={(e) => setLotDraft((prev) => ({ ...prev, expiryDate: e.target.value }))}
                          className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400"
                        />
                      </label>
                      <textarea
                        value={lotDraft.processNotes}
                        onChange={(e) => setLotDraft((prev) => ({ ...prev, processNotes: e.target.value }))}
                        placeholder="Notas del lote"
                        className="min-h-[70px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-teal-400 md:col-span-3"
                      />
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-600">Proveedores asociados a este lote</p>
                          <p className="text-xs font-semibold text-slate-500">Puedes asociar uno o varios proveedores ya dados de alta.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLotProviderDrafts((prev) => [...prev, emptyGuidedLotProviderDraft()])}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                        >
                          <Plus size={14} />
                          Añadir proveedor
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {lotProviderDrafts.map((draft, index) => (
                          <div key={`new-lot-provider-${index}`} className="grid gap-2 rounded-xl border border-white bg-white p-2 md:grid-cols-[1.2fr_1fr_1fr_auto]">
                            <label className="grid gap-1">
                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Proveedor</span>
                              <select
                                value={draft.supplierId}
                                onChange={(event) => setLotProviderDrafts((prev) => prev.map((item, itemIndex) => (
                                  itemIndex === index ? { ...item, supplierId: event.target.value } : item
                                )))}
                                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-400"
                              >
                                <option value="">Elegir proveedor...</option>
                                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                              </select>
                            </label>
                            <label className="grid gap-1">
                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Qué aporta</span>
                              <input
                                value={draft.suppliedName}
                                onChange={(event) => setLotProviderDrafts((prev) => prev.map((item, itemIndex) => (
                                  itemIndex === index ? { ...item, suppliedName: event.target.value } : item
                                )))}
                                placeholder="Viales, mezcla, cartonaje..."
                                className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400"
                              />
                            </label>
                            <label className="grid gap-1">
                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Tipo de aporte</span>
                              <select
                                value={draft.category}
                                onChange={(event) => setLotProviderDrafts((prev) => prev.map((item, itemIndex) => (
                                  itemIndex === index ? { ...item, category: event.target.value as SupplierCategory } : item
                                )))}
                                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-400"
                              >
                                {CATEGORY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() => setLotProviderDrafts((prev) => prev.length <= 1 ? [emptyGuidedLotProviderDraft()] : prev.filter((_, itemIndex) => itemIndex !== index))}
                              className="mt-5 inline-flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-rose-700 hover:bg-rose-100"
                              aria-label="Quitar proveedor"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-teal-100 bg-teal-50/50 p-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(setExpandedDocumentBlockIds, documentBlockKeyFor('new-lot-docs', activeProductKey))}
                        className="inline-flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs font-black uppercase tracking-widest text-teal-800 hover:bg-white"
                      >
                        <span className="inline-flex items-center gap-2">
                          {expandedDocumentBlockIds.includes(documentBlockKeyFor('new-lot-docs', activeProductKey)) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          Documentos del lote
                        </span>
                        <span>{DOCUMENT_GROUPS.reduce((total, group) => total + (lotDraft.attachments[group.key]?.length || 0), 0)} adjunto(s)</span>
                      </button>
                      {expandedDocumentBlockIds.includes(documentBlockKeyFor('new-lot-docs', activeProductKey)) && (
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          {DOCUMENT_GROUPS.map((group) => (
                            <div key={`lot-base-${group.key}`} className="rounded-xl border border-slate-100 bg-white p-3">
                              <p className="text-xs font-black uppercase tracking-widest text-slate-600">{group.label}</p>
                              <p className="mb-2 text-xs font-semibold text-slate-500">{group.hint}</p>
                              <FileUploader
                                folderPath={`traceability/lots/${activeProductKey}/${group.key}`}
                                existingFiles={lotDraft.attachments[group.key]}
                                onUploadComplete={(files) => setLotDraft((prev) => ({ ...prev, attachments: { ...prev.attachments, [group.key]: files } }))}
                                compact
                                maxSizeMB={20}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={addLot} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
                      <Plus size={16} />
                      Crear lote
                    </button>
                  </div>

                  <div className="mt-3 rounded-2xl border border-teal-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-teal-700">Lotes de {selectedProduct.label}</p>
                        <p className="text-sm font-semibold text-slate-600">Abre un lote para asociar proveedores o revisar su dossier.</p>
                      </div>
                      <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-800">{selectedProductLots.length} lote(s)</span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {selectedProductLots.map((lot) => {
                        const isLotSelected = selectedGuidedLotId === lot.id;
                        const supplierNames = Array.from(new Set(lot.entries.map((entry) => suppliers.find((supplier) => supplier.id === entry.supplierId)?.name).filter(Boolean)));
                        return (
                          <div key={`guided-lot-${lot.id}`} className={`rounded-xl border p-3 ${isLotSelected ? 'border-teal-300 bg-teal-50/80' : 'border-slate-200 bg-slate-50'}`}>
                            <button
                              type="button"
                              onClick={() => setSelectedGuidedLotId(isLotSelected ? '' : lot.id)}
                              className="flex w-full items-start justify-between gap-3 text-left"
                            >
	                              <span>
	                                <span className="flex items-center gap-2 text-sm font-black text-slate-950">
	                                  {isLotSelected ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
	                                  Lote {lot.lotNumber}
	                                </span>
	                                <span className="mt-1 block text-xs font-semibold text-slate-600">
	                                  Albarán {lot.albaranNumber || '-'} · {lot.quantity || '-'} {lot.quantityUnit || selectedProductQuantityUnit} · {supplierNames.length} proveedor(es)
	                                </span>
	                              </span>
	                              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">{lot.status}</span>
	                            </button>
	                            {isLotSelected && (
	                              <div className="mt-3 space-y-3">
	                                <div className="flex flex-wrap gap-2">
	                                  <button
	                                    type="button"
	                                    onClick={() => startGuidedLotEdit(lot)}
	                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100"
	                                  >
	                                    <Edit2 size={14} />
	                                    Editar lote
	                                  </button>
	                                  <button
	                                    type="button"
	                                    onClick={() => deleteLot(lot)}
	                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100"
	                                  >
	                                    <Trash2 size={14} />
	                                    Eliminar lote
	                                  </button>
	                                </div>
	                                {editingLotId === lot.id && !lotEditContext && (
	                                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
	                                    <p className="text-xs font-black uppercase tracking-widest text-amber-800">Editar datos del lote</p>
	                                    <div className="mt-3 grid gap-2 md:grid-cols-4">
	                                      <label className="grid gap-1">
	                                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Producto maestro</span>
	                                        <select
	                                          value={productKey(guidedLotEditDraft.productName)}
	                                          onChange={(event) => {
	                                            const next = productCards.find((product) => product.key === event.target.value);
	                                            if (!next) return;
	                                            setGuidedLotEditDraft((prev) => ({
	                                              ...prev,
	                                              productName: next.label,
	                                              quantityUnit: next.mode === 'ENSAMBLAJE' ? 'viales' : next.mode === 'KIT' ? 'kits' : 'unidades',
	                                              calculatedBoxes: boxCountFor(next.label, prev.deliveryNoteQuantity || prev.quantity),
	                                            }));
	                                          }}
	                                          className="h-10 rounded-xl border border-amber-100 bg-white px-3 text-sm font-bold outline-none focus:border-amber-400"
	                                        >
	                                          {productCards.map((product) => <option key={product.key} value={product.key}>{product.label}</option>)}
	                                        </select>
	                                      </label>
	                                      <input value={guidedLotEditDraft.lotNumber} onChange={(e) => setGuidedLotEditDraft((prev) => ({ ...prev, lotNumber: e.target.value }))} placeholder="Nº lote" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
	                                      <input value={guidedLotEditDraft.albaranNumber} onChange={(e) => setGuidedLotEditDraft((prev) => ({ ...prev, albaranNumber: e.target.value }))} placeholder="Nº albarán" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
	                                      <label className="grid gap-1">
	                                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fecha entrada</span>
	                                        <input type="date" value={guidedLotEditDraft.deliveryDate} onChange={(e) => setGuidedLotEditDraft((prev) => ({ ...prev, deliveryDate: e.target.value }))} className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
	                                      </label>
	                                      <input value={guidedLotEditDraft.zohoPurchaseOrder} onChange={(e) => setGuidedLotEditDraft((prev) => ({ ...prev, zohoPurchaseOrder: e.target.value }))} placeholder="Orden de compra Zoho" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
	                                      <input value={guidedLotEditDraft.zohoInvoiceNumber} onChange={(e) => setGuidedLotEditDraft((prev) => ({ ...prev, zohoInvoiceNumber: e.target.value }))} placeholder="Factura Zoho / Solaris" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
	                                      <label className="grid gap-1">
	                                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Cantidad según albarán ({guidedLotEditDraft.quantityUnit || selectedProductQuantityUnit})</span>
	                                        <input
	                                          value={guidedLotEditDraft.deliveryNoteQuantity}
	                                          onChange={(e) => {
	                                            const quantity = e.target.value;
	                                            setGuidedLotEditDraft((prev) => ({
	                                              ...prev,
	                                              deliveryNoteQuantity: quantity,
	                                              quantity,
	                                              calculatedBoxes: boxCountFor(prev.productName || selectedProduct.label, quantity),
	                                            }));
	                                          }}
	                                          placeholder="Cantidad"
	                                          className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400"
	                                        />
	                                      </label>
	                                      <input value={guidedLotEditDraft.calculatedBoxes || boxCountFor(guidedLotEditDraft.productName || selectedProduct.label, guidedLotEditDraft.deliveryNoteQuantity || guidedLotEditDraft.quantity)} onChange={(e) => setGuidedLotEditDraft((prev) => ({ ...prev, calculatedBoxes: e.target.value }))} placeholder="Cajas calculadas" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
	                                      <label className="grid gap-1">
	                                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Caducidad/consumo pref.</span>
	                                        <input type="date" value={guidedLotEditDraft.expiryDate} onChange={(e) => setGuidedLotEditDraft((prev) => ({ ...prev, expiryDate: e.target.value }))} className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
	                                      </label>
	                                      <textarea value={guidedLotEditDraft.processNotes} onChange={(e) => setGuidedLotEditDraft((prev) => ({ ...prev, processNotes: e.target.value }))} placeholder="Notas del lote" className="min-h-[70px] rounded-xl border border-amber-100 px-3 py-2 text-sm font-semibold outline-none focus:border-amber-400 md:col-span-3" />
	                                    </div>
	                                    <div className="mt-3 rounded-xl border border-amber-100 bg-white p-2">
	                                      <button
	                                        type="button"
	                                        onClick={() => toggleExpanded(setExpandedDocumentBlockIds, documentBlockKeyFor('edit-lot-docs', lot.id))}
	                                        className="inline-flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs font-black uppercase tracking-widest text-amber-800 hover:bg-amber-50"
	                                      >
	                                        <span className="inline-flex items-center gap-2">
	                                          {expandedDocumentBlockIds.includes(documentBlockKeyFor('edit-lot-docs', lot.id)) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
	                                          Documentos del lote
	                                        </span>
	                                        <span>{DOCUMENT_GROUPS.reduce((total, group) => total + (guidedLotEditDraft.attachments[group.key]?.length || 0), 0)} adjunto(s)</span>
	                                      </button>
	                                      {expandedDocumentBlockIds.includes(documentBlockKeyFor('edit-lot-docs', lot.id)) && (
	                                        <div className="mt-2 grid gap-2 md:grid-cols-3">
	                                          {DOCUMENT_GROUPS.map((group) => (
	                                            <div key={`edit-lot-${lot.id}-${group.key}`} className="rounded-xl border border-slate-100 bg-white p-3">
	                                              <p className="text-xs font-black uppercase tracking-widest text-slate-600">{group.label}</p>
	                                              <p className="mb-2 text-xs font-semibold text-slate-500">{group.hint}</p>
	                                              <FileUploader
	                                                folderPath={`traceability/lots/${productKey(guidedLotEditDraft.productName) || activeProductKey}/${lot.id}/${group.key}`}
	                                                existingFiles={guidedLotEditDraft.attachments[group.key]}
	                                                onUploadComplete={(files) => setGuidedLotEditDraft((prev) => ({ ...prev, attachments: { ...prev.attachments, [group.key]: files } }))}
	                                                compact
	                                                maxSizeMB={20}
	                                              />
	                                            </div>
	                                          ))}
	                                        </div>
	                                      )}
	                                    </div>
	                                    <div className="mt-3 flex flex-wrap gap-2">
	                                      <button type="button" onClick={saveGuidedLotEdit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700">
	                                        <Save size={16} />
	                                        Guardar lote
	                                      </button>
	                                      <button type="button" onClick={() => setEditingLotId('')} className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-black text-amber-800 hover:bg-amber-50">
	                                        Cancelar
	                                      </button>
	                                    </div>
	                                  </div>
	                                )}
	                                <div className="grid gap-2 md:grid-cols-4">
	                                  <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">Orden Zoho: {lot.zohoPurchaseOrder || '-'}</p>
                                  <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">Factura: {lot.zohoInvoiceNumber || '-'}</p>
                                  <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">Cajas calculadas: {lot.calculatedBoxes || '-'}</p>
                                  <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">Caducidad: {lot.expiryDate || '-'}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Proveedores asociados al lote</p>
                                  <div className="mt-2 grid gap-2 md:grid-cols-2">
	                                    {lot.entries.map((entry) => {
	                                      const supplier = suppliers.find((item) => item.id === entry.supplierId);
	                                      const product = supplier?.products.find((item) => item.id === entry.supplierProductId);
	                                      return (
	                                        <div key={entry.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
	                                          {editingLotProviderEntryId === entry.id ? (
	                                            <div className="space-y-2">
	                                              <select
	                                                value={lotProviderEditDraft.supplierId}
	                                                onChange={(e) => setLotProviderEditDraft((prev) => ({ ...prev, supplierId: e.target.value }))}
	                                                className="h-9 w-full rounded-lg border border-amber-100 bg-white px-2 text-xs font-bold outline-none focus:border-amber-400"
	                                              >
	                                                <option value="">Elegir proveedor...</option>
	                                                {suppliers.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
	                                              </select>
	                                              <div className="grid gap-2 sm:grid-cols-2">
	                                                <input value={lotProviderEditDraft.suppliedName} onChange={(e) => setLotProviderEditDraft((prev) => ({ ...prev, suppliedName: e.target.value }))} placeholder="Qué aporta" className="h-9 rounded-lg border border-amber-100 px-2 text-xs font-semibold outline-none focus:border-amber-400" />
	                                                <select value={lotProviderEditDraft.category} onChange={(e) => setLotProviderEditDraft((prev) => ({ ...prev, category: e.target.value as SupplierCategory }))} className="h-9 rounded-lg border border-amber-100 bg-white px-2 text-xs font-bold outline-none focus:border-amber-400">
	                                                  {CATEGORY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
	                                                </select>
	                                              </div>
	                                              <textarea value={lotProviderEditDraft.notes} onChange={(e) => setLotProviderEditDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notas de este proveedor en el lote" className="min-h-[52px] w-full rounded-lg border border-amber-100 px-2 py-2 text-xs font-semibold outline-none focus:border-amber-400" />
	                                              <div className="flex flex-wrap gap-2">
	                                                <button type="button" onClick={() => saveLotProviderEntryEdit(lot, entry)} className="inline-flex items-center justify-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-black text-white hover:bg-amber-700">
	                                                  <Save size={13} />
	                                                  Guardar
	                                                </button>
	                                                <button type="button" onClick={() => setEditingLotProviderEntryId('')} className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-black text-amber-800 hover:bg-amber-50">
	                                                  Cancelar
	                                                </button>
	                                              </div>
	                                            </div>
	                                          ) : (
	                                            <div className="flex items-start justify-between gap-2">
	                                              <div>
	                                                <p className="text-sm font-black text-slate-950">{supplier?.name || 'Proveedor'}</p>
	                                                <p className="text-xs font-semibold text-slate-500">{product?.name || entry.notes || '-'} · {labelForCategory(entry.stage)}</p>
	                                              </div>
	                                              <div className="flex shrink-0 items-center gap-1">
	                                                <button type="button" onClick={() => startLotProviderEntryEdit(entry)} className="rounded-lg border border-amber-200 bg-white p-1.5 text-amber-700 hover:bg-amber-50" title="Editar proveedor del lote">
	                                                  <Edit2 size={13} />
	                                                </button>
	                                                <button type="button" onClick={() => deleteLotProviderEntry(lot, entry)} className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-700 hover:bg-rose-50" title="Quitar proveedor del lote">
	                                                  <Trash2 size={13} />
	                                                </button>
	                                              </div>
	                                            </div>
	                                          )}
	                                        </div>
	                                      );
	                                    })}
                                    {lot.entries.length === 0 && (
                                      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500 md:col-span-2">Sin proveedores asociados todavía.</p>
                                    )}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-teal-100 bg-white p-3">
                                  <p className="text-xs font-black uppercase tracking-widest text-teal-700">Asociar proveedor a este lote</p>
                                  <div className="mt-2 grid gap-2 md:grid-cols-4">
                                    <select
                                      value={guidedLotProviderDraft.supplierId}
                                      onChange={(e) => setGuidedLotProviderDraft((prev) => ({ ...prev, supplierId: e.target.value }))}
                                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-400"
                                    >
                                      <option value="">Elegir proveedor...</option>
                                      {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                                    </select>
                                    <input value={guidedLotProviderDraft.suppliedName} onChange={(e) => setGuidedLotProviderDraft((prev) => ({ ...prev, suppliedName: e.target.value }))} placeholder="Qué aporta" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                                    <select value={guidedLotProviderDraft.category} onChange={(e) => setGuidedLotProviderDraft((prev) => ({ ...prev, category: e.target.value as SupplierCategory }))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-400">
                                      {CATEGORY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                                    </select>
                                    <button type="button" onClick={addProviderToGuidedLot} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-black text-white hover:bg-teal-700">
                                      <Plus size={15} />
                                      Asociar
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {selectedProductLots.length === 0 && (
                        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">Todavía no hay lotes de este producto.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Proveedores usados en lotes</p>
                    <h3 className="text-lg font-black text-slate-950">{selectedProduct.label}</h3>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-teal-700">{selectedProductSupplierSummary.length}</span>
                </div>
                <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {selectedProductSupplierSummary.map(({ supplier, lotNumbers, contributions }) => (
                    <div key={supplier.id} className="rounded-xl border border-white bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">{supplier.name}</p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-500">{supplier.sanitaryRegister || 'Sin registro sanitario'} · {lotNumbers.size} lote(s)</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => selectSupplierForProduct(supplier.id)}
                          className="shrink-0 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-black text-teal-800 hover:bg-teal-100"
                        >
                          Abrir
                        </button>
                      </div>
                      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Aportes registrados</p>
                        <p className="text-sm font-bold text-slate-800">{Array.from(contributions).join(', ')}</p>
                        <p className="text-xs font-semibold text-slate-500">Lotes: {Array.from(lotNumbers).join(', ')}</p>
                      </div>
                    </div>
                  ))}
                  {selectedProductSupplierSummary.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center">
                      <UserRound size={20} className="mx-auto text-slate-400" />
                      <p className="mt-2 text-sm font-bold text-slate-600">Todavía no hay proveedores usados en lotes de este producto.</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Crea un lote y asocia uno o varios proveedores desde la bolsa general.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Recepciones y lotes</p>
                    <h3 className="text-lg font-black text-slate-950">Dossier documental del producto</h3>
                  </div>
                  <div className="text-right text-xs font-black text-slate-500">
                    <p>{selectedProductLots.length} lote(s)</p>
                    <p>{selectedProductDocumentCount} adjunto(s)</p>
                  </div>
                </div>
                <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {selectedProductLots.map((lot) => {
                    const supplierNames = Array.from(new Set(lot.entries.map((entry) => suppliers.find((supplier) => supplier.id === entry.supplierId)?.name).filter(Boolean))).join(', ') || '-';
                    const albaranes = Array.from(new Set(lot.entries.map((entry) => entry.albaranNumber).filter(Boolean))).join(', ') || '-';
                    const deliveryNoteQuantity = lot.entries.map((entry) => entry.deliveryNoteQuantity).filter(Boolean).join(', ') || '-';
                    return (
                      <div key={lot.id} className="rounded-2xl border border-teal-200 bg-teal-50/60 p-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-widest text-teal-700">Lote {lot.lotNumber}</p>
                            <p className="text-sm font-black text-slate-950">{supplierNames}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => downloadLotPdf(lot)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-black text-teal-800 hover:bg-teal-50"
                          >
                            <Download size={14} />
                            Descargar lote
                          </button>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-4">
                          <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">Albarán: {albaranes}</p>
                          <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">Cantidad albarán: {deliveryNoteQuantity} {selectedProductQuantityUnit}</p>
                          <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">Caducidad: {lot.expiryDate || '-'}</p>
                          <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">Estado: {lot.status}</p>
                        </div>
                      </div>
                    );
                  })}
                  {selectedProductLots.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                      <FolderTree size={22} className="mx-auto text-slate-400" />
                      <p className="mt-2 text-sm font-bold text-slate-600">Este producto todavía no tiene recepciones/lotes en el dossier.</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Usa “Dar de alta lote” cuando quieras crear la recepción documental.</p>
                    </div>
                  )}
                </div>
              </div>
              </div>
            </div>
          )}
        </section>

        {suppliers.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={expandAllDossier} className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-black text-teal-800 hover:bg-teal-100">
              Desplegar todo
            </button>
            <button type="button" onClick={collapseAllDossier} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
              Plegar todo
            </button>
          </div>
        )}

        <main className="grid gap-4">
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Carpetas editables por proveedor</p>
              <p className="text-sm font-semibold text-slate-600">Aquí editas datos legales, contacto, notas y contratos generales.</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={15} className="text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar proveedor"
                className="h-8 w-48 bg-transparent text-sm font-semibold outline-none"
              />
            </div>
          </div>
          {filteredSuppliers.map((supplier) => {
            const isOpen = expandedSupplierIds.includes(supplier.id);
            const relatedLots = lots.filter((lot) => lot.entries.some((entry) => entry.supplierId === supplier.id));
            return (
              <section id={`traceability-supplier-${supplier.id}`} key={supplier.id} className={`rounded-2xl border bg-white p-4 shadow-sm transition ${isOpen ? 'border-teal-300 ring-2 ring-teal-100' : 'border-slate-200'}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSupplierId(supplier.id);
                      toggleExpanded(setExpandedSupplierIds, supplier.id);
                    }}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-teal-100 bg-teal-50 text-teal-700">
                      <UserRound size={24} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-lg font-black text-slate-950">
                        {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        {supplier.name}
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-slate-500">{supplier.sanitaryRegister || 'Sin registro sanitario'} · {supplier.contracts.length} contrato(s) · usado en {relatedLots.length} lote(s)</span>
                      <span className="mt-1 block text-xs font-semibold text-slate-500">{supplier.phone || 'Sin teléfono'} · {supplier.email || 'Sin email'}</span>
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <button type="button" onClick={() => downloadSupplierPdf(supplier)} className="rounded-lg border border-teal-200 bg-teal-50 p-1.5 text-teal-700 hover:bg-teal-100" title="Descargar carpeta proveedor">
                      <Download size={14} />
                    </button>
                    <button type="button" onClick={() => editSupplier(supplier)} className="rounded-lg border border-teal-200 bg-white p-1.5 text-teal-700 hover:bg-teal-50" title="Editar proveedor">
                      <Edit2 size={14} />
                    </button>
                    <button type="button" onClick={() => deleteSupplier(supplier)} className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-700 hover:bg-rose-50" title="Eliminar proveedor">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-4">
                    {editingSupplierId === supplier.id && (
                      <div className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 md:grid-cols-4">
                        <p className="text-xs font-black uppercase tracking-widest text-amber-800 md:col-span-4">Editar proveedor</p>
                        <input value={supplierEditDraft.name} onChange={(e) => setSupplierEditDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nombre proveedor" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                        <input value={supplierEditDraft.fiscalName} onChange={(e) => setSupplierEditDraft((prev) => ({ ...prev, fiscalName: e.target.value }))} placeholder="Razón social" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                        <input value={supplierEditDraft.taxId} onChange={(e) => setSupplierEditDraft((prev) => ({ ...prev, taxId: e.target.value }))} placeholder="NIF/CIF" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                        <input value={supplierEditDraft.sanitaryRegister} onChange={(e) => setSupplierEditDraft((prev) => ({ ...prev, sanitaryRegister: e.target.value }))} placeholder="Registro sanitario" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                        <input value={supplierEditDraft.contactName} onChange={(e) => setSupplierEditDraft((prev) => ({ ...prev, contactName: e.target.value }))} placeholder="Contacto" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                        <input value={supplierEditDraft.phone} onChange={(e) => setSupplierEditDraft((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Teléfono" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                        <input value={supplierEditDraft.email} onChange={(e) => setSupplierEditDraft((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                        <textarea value={supplierEditDraft.address} onChange={(e) => setSupplierEditDraft((prev) => ({ ...prev, address: e.target.value }))} placeholder="Dirección" className="min-h-[40px] rounded-xl border border-amber-100 px-3 py-2 text-sm font-semibold outline-none focus:border-amber-400" />
                        <textarea value={supplierEditDraft.notes} onChange={(e) => setSupplierEditDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notas del proveedor" className="min-h-[64px] rounded-xl border border-amber-100 px-3 py-2 text-sm font-semibold outline-none focus:border-amber-400 md:col-span-4" />
                        <div className="rounded-xl border border-white bg-white p-3 md:col-span-4">
                          <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Contrato Solaris con proveedor</p>
                          <FileUploader
                            folderPath={`traceability/suppliers/${supplier.id}/contracts`}
                            existingFiles={supplierEditDraft.contracts}
                            onUploadComplete={(files) => setSupplierEditDraft((prev) => ({ ...prev, contracts: files }))}
                            compact
                            maxSizeMB={20}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 md:col-span-4">
                          <button type="button" onClick={saveSupplierEdit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700">
                            <Save size={16} />
                            Guardar cambios
                          </button>
                          <button type="button" onClick={() => setEditingSupplierId('')} className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-black text-amber-800 hover:bg-amber-50">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Contratos del proveedor</p>
                          <p className="text-sm font-semibold text-slate-600">Contrato Solaris/proveedor y documentos generales de homologación.</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">{supplier.contracts.length} archivo(s)</span>
                      </div>
                      {supplier.contracts.length === 0 ? (
                        <p className="mt-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-500">
                          Sin contratos adjuntos. Usa editar proveedor para subirlos.
                        </p>
                      ) : (
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {supplier.contracts.map((file) => (
                            <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 truncate rounded-xl border border-white bg-white px-3 py-2 text-xs font-bold text-teal-700 hover:text-teal-900">
                              <LinkIcon size={13} />
                              {file.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </section>
            );
          })}

          {suppliers.length === 0 && (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Building2 size={28} className="mx-auto text-teal-700" />
              <p className="mt-3 text-sm font-bold text-slate-600">Crea un proveedor y aquí aparecerá su carpeta.</p>
            </section>
          )}
          {suppliers.length > 0 && filteredSuppliers.length === 0 && (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Search size={28} className="mx-auto text-slate-400" />
              <p className="mt-3 text-sm font-bold text-slate-600">No encontré carpetas con esa búsqueda.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
