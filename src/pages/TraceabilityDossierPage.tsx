import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Beaker,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  Edit2,
  Factory,
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
  quantity: string;
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
  status: FinalLotStatus;
  manufactureDate: string;
  expiryDate: string;
  processNotes: string;
  processSteps: SupplierCategory[];
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
  receivedQuantity: string;
  manufactureDate: string;
  expiryDate: string;
  notes: string;
  attachments: Record<DocumentGroupKey, Attachment[]>;
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

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function labelForCategory(category: SupplierCategory) {
  return CATEGORY_OPTIONS.find((option) => option.key === category)?.label || category;
}

function emptyAttachments(): Record<DocumentGroupKey, Attachment[]> {
  return {
    albaran: [],
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
    receivedQuantity: '',
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
  };
}

function emptyProductFormDraft() {
  return {
    name: '',
    reference: '',
    category: 'materia_prima' as SupplierCategory,
    unit: '',
    notes: '',
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
      products: Array.isArray(supplier?.products) ? supplier.products.map((product: any) => ({
        id: clean(product?.id) || uid('spr'),
        name: clean(product?.name) || 'Producto suministrado',
        reference: clean(product?.reference),
        category: CATEGORY_OPTIONS.some((option) => option.key === product?.category) ? product.category : 'otros',
        unit: clean(product?.unit),
        notes: clean(product?.notes),
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
      status: lot?.status === 'completo' || lot?.status === 'revision' ? lot.status : 'abierto',
      manufactureDate: clean(lot?.manufactureDate),
      expiryDate: clean(lot?.expiryDate),
      processNotes: clean(lot?.processNotes),
      processSteps: Array.isArray(lot?.processSteps) && lot.processSteps.length > 0 ? lot.processSteps.filter((item: string) => CATEGORY_OPTIONS.some((option) => option.key === item)) : DEFAULT_PROCESS,
      entries: Array.isArray(lot?.entries) ? lot.entries.map((entry: any) => ({
        id: clean(entry?.id) || uid('ent'),
        supplierId: clean(entry?.supplierId),
        supplierProductId: clean(entry?.supplierProductId),
        stage: CATEGORY_OPTIONS.some((option) => option.key === entry?.stage) ? entry.stage : 'otros',
        deliveryDate: clean(entry?.deliveryDate),
        albaranNumber: clean(entry?.albaranNumber),
        quantity: clean(entry?.quantity),
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

  const normalized = useMemo(() => normalizeState(state), [state]);
  const [query, setQuery] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedLotId, setSelectedLotId] = useState('');
  const [supplierDraft, setSupplierDraft] = useState(emptySupplierFormDraft());
  const [productDraft, setProductDraft] = useState(emptyProductFormDraft());
  const [lotDraft, setLotDraft] = useState({
    productName: '',
    lotNumber: '',
    quantity: '',
    manufactureDate: '',
    expiryDate: '',
    processNotes: '',
  });
  const [entryDraft, setEntryDraft] = useState({
    supplierId: '',
    supplierProductId: '',
    stage: 'materia_prima' as SupplierCategory,
    deliveryDate: '',
    albaranNumber: '',
    quantity: '',
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
  const [editingSupplierId, setEditingSupplierId] = useState('');
  const [supplierEditDraft, setSupplierEditDraft] = useState(emptySupplierFormDraft());
  const [editingProductKey, setEditingProductKey] = useState('');
  const [productEditDraft, setProductEditDraft] = useState(emptyProductFormDraft());
  const [editingLotId, setEditingLotId] = useState('');
  const [lotEditContext, setLotEditContext] = useState<{ supplierId: string; productId: string } | null>(null);
  const [lotEditDraft, setLotEditDraft] = useState(emptySupplierLotDraft());

  const suppliers = normalized.suppliers;
  const lots = normalized.lots;
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId) || suppliers[0] || null;
  const selectedLot = lots.find((lot) => lot.id === selectedLotId) || lots[0] || null;
  const entrySupplier = suppliers.find((supplier) => supplier.id === entryDraft.supplierId) || null;
  const entrySupplierProducts = entrySupplier?.products || [];
  const filteredLots = lots.filter((lot) => {
    const needle = `${lot.productName} ${lot.lotNumber}`.toLowerCase();
    return !query || needle.includes(query.toLowerCase());
  });

  const updateSupplierDraft = (key: keyof typeof supplierDraft, value: string) => {
    setSupplierDraft((prev) => ({ ...prev, [key]: value }));
  };

  const draftKeyFor = (supplierId: string, productId: string) => `${supplierId}::${productId}`;
  const productKeyFor = (supplierId: string, productId: string) => `${supplierId}::${productId}`;

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
  };

  const lotDraftFor = (supplier: Supplier, product: SupplierProduct) => {
    const key = draftKeyFor(supplier.id, product.id);
    return supplierLotDrafts[key] || emptySupplierLotDraft(product.name);
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

  const scrollToDossierBlock = (id: string) => {
    if (typeof document === 'undefined') return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectSupplierForProduct = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    window.setTimeout(() => scrollToDossierBlock('traceability-product-form'), 50);
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
      setSelectedSupplierId(existing.id);
      setExpandedSupplierIds((prev) => Array.from(new Set([...prev, existing.id])));
      setEntryDraft((prev) => ({ ...prev, supplierId: existing.id }));
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
      products: [
        {
          id: uid('spr'),
          name: 'Acondicionamiento interno',
          reference: 'SOLARIS-INTERNO',
          category: 'acondicionamiento',
          unit: 'Servicio interno',
          notes: 'Usar cuando el acondicionamiento o montaje final lo realiza Solaris.',
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
    setProductDraft(emptyProductFormDraft());
    emitSuccessFeedback('Producto del proveedor guardado.');
  };

  const addLot = () => {
    if (!clean(lotDraft.productName) || !clean(lotDraft.lotNumber)) {
      alert('Pon el producto final y el número de lote.');
      return;
    }
    const now = new Date().toISOString();
    const nextLot: FinalLot = {
      id: uid('lot'),
      ...lotDraft,
      status: 'abierto',
      processSteps: DEFAULT_PROCESS,
      entries: [],
      analyses: [],
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => {
      const base = normalizeState(prev);
      return { ...base, lots: [nextLot, ...base.lots] };
    });
    setSelectedLotId(nextLot.id);
    setLotDraft({ productName: '', lotNumber: '', quantity: '', manufactureDate: '', expiryDate: '', processNotes: '' });
    emitSuccessFeedback('Lote final creado.');
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
      clean(draft.receivedQuantity) ? `Cantidad recibida: ${clean(draft.receivedQuantity)}` : '',
    ].filter(Boolean).join(' · ');
    const processNotes = [quantityLine, clean(draft.notes)].filter(Boolean).join('\n');
    const nextLot: FinalLot = {
      id: uid('lot'),
      productName,
      lotNumber: clean(draft.lotNumber),
      quantity: clean(draft.receivedQuantity),
      status: 'abierto',
      manufactureDate: clean(draft.manufactureDate),
      expiryDate: clean(draft.expiryDate),
      processNotes,
      processSteps: [product.category],
      entries: [{
        id: uid('ent'),
        supplierId: supplier.id,
        supplierProductId: product.id,
        stage: product.category,
        deliveryDate: clean(draft.deliveryDate),
        albaranNumber: clean(draft.albaranNumber),
        quantity: clean(draft.receivedQuantity),
        supplierLot: clean(draft.lotNumber),
        finalLotId: '',
        expiryDate: clean(draft.expiryDate),
        bestBeforeDate: clean(draft.expiryDate),
        notes: processNotes,
        attachments: draft.attachments,
        createdAt: now,
        updatedAt: now,
      }],
      analyses: [],
      createdAt: now,
      updatedAt: now,
    };
    nextLot.entries[0].finalLotId = nextLot.id;

    setState((prev) => {
      const base = normalizeState(prev);
      return { ...base, lots: [nextLot, ...base.lots] };
    });
    setSelectedSupplierId(supplier.id);
    setSelectedLotId(nextLot.id);
    setExpandedSupplierIds((prev) => Array.from(new Set([...prev, supplier.id])));
    setExpandedProductIds((prev) => Array.from(new Set([...prev, productKeyFor(supplier.id, product.id)])));
    setExpandedLotIds((prev) => Array.from(new Set([...prev, nextLot.id])));
    setSupplierLotDrafts((prev) => ({
      ...prev,
      [draftKeyFor(supplier.id, product.id)]: emptySupplierLotDraft(product.name),
    }));
    emitSuccessFeedback('Lote añadido al proveedor.');
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
      quantity: '',
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
      receivedQuantity: entry?.quantity || lot.quantity,
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
          const quantityLine = clean(lotEditDraft.receivedQuantity) ? `Cantidad recibida: ${clean(lotEditDraft.receivedQuantity)}` : '';
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
                    quantity: clean(lotEditDraft.receivedQuantity),
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
        ['Cantidad', safePdfText(lot.quantity) || '-'],
        ['Fecha montaje/fabricación', safePdfText(lot.manufactureDate) || '-'],
        ['Caducidad / consumo preferente final', safePdfText(lot.expiryDate) || '-'],
        ['Estado', lot.status],
        ['Proceso', lot.processSteps.map(labelForCategory).join(' > ')],
        ['Observaciones', safePdfText(lot.processNotes) || '-'],
      ],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [15, 118, 110] },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 18,
      head: [['Proveedor', 'Registro sanitario', 'Producto suministrado', 'Referencia', 'Tipo', 'Unidad/formato']],
      body: lot.entries.map((entry) => {
        const supplier = suppliers.find((item) => item.id === entry.supplierId);
        const product = supplier?.products.find((item) => item.id === entry.supplierProductId);
        return [
          supplier?.name || '-',
          supplier?.sanitaryRegister || '-',
          product?.name || '-',
          product?.reference || '-',
          product ? labelForCategory(product.category) : labelForCategory(entry.stage),
          product?.unit || '-',
        ];
      }),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 4 },
      headStyles: { fillColor: [15, 118, 110] },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 18,
      head: [['Etapa', 'Albarán', 'Lote proveedor', 'Fecha entrega', 'Cantidad llegada', 'Cad./cons.', 'Adjuntos']],
      body: lot.entries.map((entry) => {
        return [
          labelForCategory(entry.stage),
          entry.albaranNumber || '-',
          entry.supplierLot || '-',
          entry.deliveryDate || '-',
          entry.quantity || '-',
          entry.expiryDate || entry.bestBeforeDate || '-',
          String(fileCount(entry)),
        ];
      }),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 4 },
      headStyles: { fillColor: [31, 41, 55] },
    });

    if (lot.entries.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 18,
        head: [['Entrada', 'Tipo documental', 'Archivo adjunto', 'URL']],
        body: lot.entries.flatMap((entry) => {
          const supplier = suppliers.find((item) => item.id === entry.supplierId);
          const product = supplier?.products.find((item) => item.id === entry.supplierProductId);
          const title = `${supplier?.name || '-'} / ${product?.name || '-'} / ${entry.supplierLot || '-'}`;
          return DOCUMENT_GROUPS.flatMap((group) => (entry.attachments[group.key] || []).map((file) => [
            title,
            group.label,
            file.name,
            file.url,
          ]));
        }),
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
    const relatedLots = lots.filter((lot) => lot.entries.some((entry) => entry.supplierId === supplier.id));
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
      ],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [15, 118, 110] },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 16,
      head: [['Producto suministrado', 'Referencia', 'Tipo', 'Unidad/formato', 'Fichas', 'Certificados base']],
      body: supplier.products.map((product) => [
        product.name,
        product.reference || '-',
        labelForCategory(product.category),
        product.unit || '-',
        String(product.technicalSheets.length),
        String(product.certificates.length),
      ]),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 4 },
      headStyles: { fillColor: [31, 41, 55] },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 16,
      head: [['Lote', 'Producto', 'Albarán', 'Entrega', 'Caducidad', 'Cantidad', 'Documentos', 'Observaciones']],
      body: relatedLots.flatMap((lot) => lot.entries
        .filter((entry) => entry.supplierId === supplier.id)
        .map((entry) => {
          const product = supplier.products.find((item) => item.id === entry.supplierProductId);
          return [
            entry.supplierLot || lot.lotNumber,
            product?.name || lot.productName,
            entry.albaranNumber || '-',
            entry.deliveryDate || '-',
            entry.expiryDate || entry.bestBeforeDate || lot.expiryDate || '-',
            entry.quantity || lot.quantity || '-',
            String(fileCount(entry)),
            safePdfText(entry.notes || lot.processNotes) || '-',
          ];
        })),
      theme: 'striped',
      styles: { fontSize: 6, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 118, 110] },
      columnStyles: { 7: { cellWidth: 210 } },
    });

    doc.save(`carpeta-proveedor-${supplier.name}.pdf`.replace(/[^\w.-]+/g, '-').toLowerCase());
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-6">
        <div className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">Centro de mando / Operación</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Dossier trazabilidad</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
            Crea un proveedor y trabaja dentro de su carpeta: productos suministrados, lotes, albaranes, microbiología y documentos.
          </p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Building2 size={18} className="text-teal-700" />
            <h2 className="text-sm font-black text-slate-950">Crear proveedor</h2>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <input value={supplierDraft.name} onChange={(e) => updateSupplierDraft('name', e.target.value)} placeholder="Nombre proveedor" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
            <input value={supplierDraft.fiscalName} onChange={(e) => updateSupplierDraft('fiscalName', e.target.value)} placeholder="Razón social" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
            <input value={supplierDraft.taxId} onChange={(e) => updateSupplierDraft('taxId', e.target.value)} placeholder="NIF/CIF" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
            <input value={supplierDraft.sanitaryRegister} onChange={(e) => updateSupplierDraft('sanitaryRegister', e.target.value)} placeholder="Registro sanitario" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
            <input value={supplierDraft.phone} onChange={(e) => updateSupplierDraft('phone', e.target.value)} placeholder="Teléfono" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
            <input value={supplierDraft.email} onChange={(e) => updateSupplierDraft('email', e.target.value)} placeholder="Email" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
            <textarea value={supplierDraft.address} onChange={(e) => updateSupplierDraft('address', e.target.value)} placeholder="Dirección" className="min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-teal-400 md:col-span-2" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={addSupplier} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
              <Plus size={16} />
              Crear proveedor
            </button>
            <button type="button" onClick={addInternalSupplier} className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-black text-teal-950 hover:bg-teal-100">
              <Factory size={16} />
              Usar Solaris interno
            </button>
          </div>
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
          {suppliers.map((supplier) => {
            const isOpen = expandedSupplierIds.includes(supplier.id);
            const relatedLots = lots.filter((lot) => lot.entries.some((entry) => entry.supplierId === supplier.id));
            return (
              <section key={supplier.id} className={`rounded-2xl border bg-white p-4 shadow-sm transition ${isOpen ? 'border-teal-300 ring-2 ring-teal-100' : 'border-slate-200'}`}>
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
                      <span className="mt-1 block text-xs font-semibold text-slate-500">{supplier.sanitaryRegister || 'Sin registro sanitario'} · {supplier.products.length} producto(s) · {relatedLots.length} lote(s)</span>
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

                    {selectedSupplierId === supplier.id ? (
                    <div className="grid gap-2 rounded-2xl border border-teal-100 bg-teal-50/50 p-3 md:grid-cols-4">
                      <div className="md:col-span-4">
                        <p className="text-xs font-black uppercase tracking-widest text-teal-700">Crear producto suministrado dentro de {supplier.name}</p>
                      </div>
                      <input value={productDraft.name} onChange={(e) => setProductDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Producto/material" className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                      <input value={productDraft.reference} onChange={(e) => setProductDraft((prev) => ({ ...prev, reference: e.target.value }))} placeholder="Referencia comercial" className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                      <select value={productDraft.category} onChange={(e) => setProductDraft((prev) => ({ ...prev, category: e.target.value as SupplierCategory }))} className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-bold outline-none focus:border-teal-400">
                        {CATEGORY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                      </select>
                      <input value={productDraft.unit} onChange={(e) => setProductDraft((prev) => ({ ...prev, unit: e.target.value }))} placeholder="Unidad/formato" className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                      <div className="rounded-xl border border-white bg-white p-3 md:col-span-2">
                        <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Ficha técnica</p>
                        <FileUploader folderPath="traceability/supplier-products/technical-sheets" existingFiles={productDraft.technicalSheets} onUploadComplete={(files) => setProductDraft((prev) => ({ ...prev, technicalSheets: files }))} compact maxSizeMB={15} />
                      </div>
                      <div className="rounded-xl border border-white bg-white p-3 md:col-span-2">
                        <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Certificados base</p>
                        <FileUploader folderPath="traceability/supplier-products/certificates" existingFiles={productDraft.certificates} onUploadComplete={(files) => setProductDraft((prev) => ({ ...prev, certificates: files }))} compact maxSizeMB={15} />
                      </div>
                      <button type="button" onClick={() => addSupplierProduct(supplier)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-black text-white hover:bg-teal-700 md:col-span-4">
                        <Save size={16} />
                        Guardar producto suministrado
                      </button>
                    </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedSupplierId(supplier.id)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-black text-teal-800 hover:bg-teal-100"
                      >
                        <Plus size={16} />
                        Crear producto suministrado en este proveedor
                      </button>
                    )}

                    {supplier.products.map((product) => {
                      const draft = lotDraftFor(supplier, product);
                      const productLots = supplierProductLots(supplier, product);
                      const productKey = productKeyFor(supplier.id, product.id);
                      const isProductOpen = expandedProductIds.includes(productKey);
                      return (
                        <div key={product.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(setExpandedProductIds, productKey)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="flex items-center gap-2 text-base font-black text-slate-950">
                                {isProductOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                {product.name}
                              </p>
                              <p className="text-xs font-semibold text-slate-500">{labelForCategory(product.category)} · {product.reference || 'Sin ref.'} · {product.unit || 'Sin unidad'} · {productLots.length} lote(s)</p>
                            </button>
                            <div className="flex shrink-0 gap-1">
                              <button type="button" onClick={() => editSupplierProduct(supplier, product)} className="rounded-lg border border-teal-200 bg-white p-1.5 text-teal-700 hover:bg-teal-50" title="Editar producto">
                                <Edit2 size={14} />
                              </button>
                              <button type="button" onClick={() => deleteSupplierProduct(supplier, product)} className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-700 hover:bg-rose-50" title="Eliminar producto">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {editingProductKey === productKey && (
                            <div className="mt-3 grid gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 md:grid-cols-4">
                              <p className="text-xs font-black uppercase tracking-widest text-amber-800 md:col-span-4">Editar producto suministrado</p>
                              <input value={productEditDraft.name} onChange={(e) => setProductEditDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Producto/material" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                              <input value={productEditDraft.reference} onChange={(e) => setProductEditDraft((prev) => ({ ...prev, reference: e.target.value }))} placeholder="Referencia comercial" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                              <select value={productEditDraft.category} onChange={(e) => setProductEditDraft((prev) => ({ ...prev, category: e.target.value as SupplierCategory }))} className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-bold outline-none focus:border-amber-400">
                                {CATEGORY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                              </select>
                              <input value={productEditDraft.unit} onChange={(e) => setProductEditDraft((prev) => ({ ...prev, unit: e.target.value }))} placeholder="Unidad/formato" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                              <textarea value={productEditDraft.notes} onChange={(e) => setProductEditDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notas del producto suministrado" className="min-h-[64px] rounded-xl border border-amber-100 px-3 py-2 text-sm font-semibold outline-none focus:border-amber-400 md:col-span-4" />
                              <div className="rounded-xl border border-white bg-white p-3 md:col-span-2">
                                <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Ficha técnica</p>
                                <FileUploader folderPath="traceability/supplier-products/technical-sheets" existingFiles={productEditDraft.technicalSheets} onUploadComplete={(files) => setProductEditDraft((prev) => ({ ...prev, technicalSheets: files }))} compact maxSizeMB={15} />
                              </div>
                              <div className="rounded-xl border border-white bg-white p-3 md:col-span-2">
                                <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Certificados base</p>
                                <FileUploader folderPath="traceability/supplier-products/certificates" existingFiles={productEditDraft.certificates} onUploadComplete={(files) => setProductEditDraft((prev) => ({ ...prev, certificates: files }))} compact maxSizeMB={15} />
                              </div>
                              <div className="flex flex-wrap gap-2 md:col-span-4">
                                <button type="button" onClick={() => saveSupplierProductEdit(supplier, product)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700">
                                  <Save size={16} />
                                  Guardar cambios
                                </button>
                                <button type="button" onClick={() => setEditingProductKey('')} className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-black text-amber-800 hover:bg-amber-50">
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}

                          {isProductOpen && (
                            <div className="mt-3 grid gap-2">
                              {productLots.map((lot) => {
                                const entry = lot.entries.find((item) => item.supplierId === supplier.id && item.supplierProductId === product.id);
                                const isLotOpen = expandedLotIds.includes(lot.id);
                                const isEditingThisLot = editingLotId === lot.id && lotEditContext?.supplierId === supplier.id && lotEditContext?.productId === product.id;
                                return (
                                  <div key={lot.id} className="rounded-xl border border-white bg-white p-3">
                                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                      <button type="button" onClick={() => toggleExpanded(setExpandedLotIds, lot.id)} className="min-w-0 flex-1 text-left">
                                        <p className="flex items-center gap-2 text-sm font-black text-slate-900">
                                          {isLotOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                          Lote {entry?.supplierLot || lot.lotNumber}
                                        </p>
                                        <p className="text-xs font-semibold text-slate-500">Albarán {entry?.albaranNumber || '-'} · Cantidad llegada {entry?.quantity || lot.quantity || '-'} · {fileCount(entry || lot.entries[0])} documento(s)</p>
                                      </button>
                                      <div className="flex flex-wrap gap-1">
                                        <button type="button" onClick={() => editLot(lot, supplier, product, entry)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100">
                                          <Edit2 size={14} />
                                          Editar
                                        </button>
                                        <button type="button" onClick={() => downloadLotPdf(lot)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-black text-teal-800 hover:bg-teal-100">
                                          <Download size={14} />
                                          Descargar lote
                                        </button>
                                      </div>
                                    </div>
                                    {isLotOpen && (
                                      <div className="mt-3 space-y-3">
                                        {isEditingThisLot && (
                                          <div className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 md:grid-cols-4">
                                            <p className="text-xs font-black uppercase tracking-widest text-amber-800 md:col-span-4">Editar lote</p>
                                            <input value={lotEditDraft.finalProductName} onChange={(e) => setLotEditDraft((prev) => ({ ...prev, finalProductName: e.target.value }))} placeholder="Producto/lote" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                                            <input value={lotEditDraft.lotNumber} onChange={(e) => setLotEditDraft((prev) => ({ ...prev, lotNumber: e.target.value }))} placeholder="Nº lote" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                                            <input value={lotEditDraft.albaranNumber} onChange={(e) => setLotEditDraft((prev) => ({ ...prev, albaranNumber: e.target.value }))} placeholder="Albarán/factura entrada" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                                            <label className="grid gap-1">
                                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fecha entrega</span>
                                              <input type="date" value={lotEditDraft.deliveryDate} onChange={(e) => setLotEditDraft((prev) => ({ ...prev, deliveryDate: e.target.value }))} className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                                            </label>
                                            <input value={lotEditDraft.receivedQuantity} onChange={(e) => setLotEditDraft((prev) => ({ ...prev, receivedQuantity: e.target.value }))} placeholder="Cantidad recibida" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                                            <label className="grid gap-1">
                                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fabricación</span>
                                              <input type="date" value={lotEditDraft.manufactureDate} onChange={(e) => setLotEditDraft((prev) => ({ ...prev, manufactureDate: e.target.value }))} className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                                            </label>
                                            <label className="grid gap-1 md:col-span-2">
                                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Caducidad/consumo pref.</span>
                                              <input type="date" value={lotEditDraft.expiryDate} onChange={(e) => setLotEditDraft((prev) => ({ ...prev, expiryDate: e.target.value }))} className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                                            </label>
                                            <textarea value={lotEditDraft.notes} onChange={(e) => setLotEditDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notas del lote, fabricación, incidencias o aclaraciones" className="min-h-[70px] rounded-xl border border-amber-100 px-3 py-2 text-sm font-semibold outline-none focus:border-amber-400 md:col-span-4" />
                                            <div className="grid gap-2 md:col-span-4 md:grid-cols-3">
                                              {DOCUMENT_GROUPS.map((group) => (
                                                <div key={`edit-${lot.id}-${group.key}`} className="rounded-xl border border-white bg-white p-3">
                                                  <p className="text-xs font-black uppercase tracking-widest text-slate-600">{group.label}</p>
                                                  <p className="mb-2 text-xs font-semibold text-slate-500">{group.hint}</p>
                                                  <FileUploader
                                                    folderPath={`traceability/suppliers/${supplier.id}/products/${product.id}/${group.key}`}
                                                    existingFiles={lotEditDraft.attachments[group.key]}
                                                    onUploadComplete={(files) => setLotEditDraft((prev) => ({ ...prev, attachments: { ...prev.attachments, [group.key]: files } }))}
                                                    compact
                                                    maxSizeMB={20}
                                                  />
                                                </div>
                                              ))}
                                            </div>
                                            <div className="flex flex-wrap gap-2 md:col-span-4">
                                              <button type="button" onClick={saveLotEdit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700">
                                                <Save size={16} />
                                                Guardar cambios
                                              </button>
                                              <button type="button" onClick={() => { setEditingLotId(''); setLotEditContext(null); }} className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-black text-amber-800 hover:bg-amber-50">
                                                Cancelar
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        <div className="grid gap-2 md:grid-cols-3">
                                          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">Entrega: {entry?.deliveryDate || '-'}</p>
                                          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">Caducidad: {entry?.expiryDate || lot.expiryDate || '-'}</p>
                                          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">Albarán: {entry?.albaranNumber || '-'}</p>
                                          {entry && DOCUMENT_GROUPS.map((group) => (
                                            <div key={`${lot.id}-${group.key}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                              <p className="text-xs font-black uppercase tracking-widest text-slate-500">{group.label}</p>
                                              {(entry.attachments[group.key] || []).length === 0 ? (
                                                <p className="mt-1 text-xs font-semibold text-slate-400">Sin adjuntos</p>
                                              ) : (
                                                <div className="mt-2 space-y-1">
                                                  {entry.attachments[group.key].map((file) => (
                                                    <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 truncate text-xs font-bold text-teal-700 hover:text-teal-900">
                                                      <LinkIcon size={13} />
                                                      {file.name}
                                                    </a>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {isProductOpen && (
                          <div className="mt-3 rounded-2xl border border-dashed border-teal-200 bg-white p-3">
                            <p className="mb-2 text-xs font-black uppercase tracking-widest text-teal-700">Dar de alta lote de este producto</p>
                            <div className="grid gap-2 md:grid-cols-4">
                              <input value={draft.finalProductName} onChange={(e) => updateSupplierLotDraft(supplier, product, { finalProductName: e.target.value })} placeholder="Producto/lote: SolarVital..." className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                              <input value={draft.lotNumber} onChange={(e) => updateSupplierLotDraft(supplier, product, { lotNumber: e.target.value })} placeholder="Nº lote" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                              <input value={draft.albaranNumber} onChange={(e) => updateSupplierLotDraft(supplier, product, { albaranNumber: e.target.value })} placeholder="Albarán/factura entrada" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                              <label className="grid gap-1">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fecha entrega</span>
                                <input type="date" value={draft.deliveryDate} onChange={(e) => updateSupplierLotDraft(supplier, product, { deliveryDate: e.target.value })} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                              </label>
                              <input value={draft.receivedQuantity} onChange={(e) => updateSupplierLotDraft(supplier, product, { receivedQuantity: e.target.value })} placeholder="Cantidad recibida" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                              <label className="grid gap-1">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fabricación</span>
                                <input type="date" value={draft.manufactureDate} onChange={(e) => updateSupplierLotDraft(supplier, product, { manufactureDate: e.target.value })} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                              </label>
                              <label className="grid gap-1 md:col-span-2">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Caducidad/consumo pref.</span>
                                <input type="date" value={draft.expiryDate} onChange={(e) => updateSupplierLotDraft(supplier, product, { expiryDate: e.target.value })} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                              </label>
                              <textarea value={draft.notes} onChange={(e) => updateSupplierLotDraft(supplier, product, { notes: e.target.value })} placeholder="Notas del lote, fabricación, incidencias o aclaraciones" className="min-h-[70px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-teal-400 md:col-span-2" />
                            </div>
                            <div className="mt-3 grid gap-2 md:grid-cols-3">
                              {DOCUMENT_GROUPS.map((group) => (
                                <div key={group.key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                  <p className="text-xs font-black uppercase tracking-widest text-slate-600">{group.label}</p>
                                  <p className="mb-2 text-xs font-semibold text-slate-500">{group.hint}</p>
                                  <FileUploader
                                    folderPath={`traceability/suppliers/${supplier.id}/products/${product.id}/${group.key}`}
                                    existingFiles={draft.attachments[group.key]}
                                    onUploadComplete={(files) => updateSupplierLotDraft(supplier, product, { attachments: { ...draft.attachments, [group.key]: files } })}
                                    compact
                                    maxSizeMB={20}
                                  />
                                </div>
                              ))}
                            </div>
                            <button type="button" onClick={() => addSupplierProductLot(supplier, product)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-black text-white hover:bg-teal-700">
                              <Plus size={16} />
                              Guardar lote en esta carpeta
                            </button>
                          </div>
                          )}
                        </div>
                      );
                    })}

                    {supplier.products.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                        <Package size={22} className="mx-auto text-slate-400" />
                        <p className="mt-2 text-sm font-bold text-slate-600">Este proveedor todavía no tiene productos suministrados.</p>
                      </div>
                    )}
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
        </main>
      </div>
    </div>
  );
}
