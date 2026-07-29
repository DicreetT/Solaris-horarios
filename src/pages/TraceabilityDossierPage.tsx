import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Beaker,
  Building2,
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
    identificacion_envase: [],
    ficha_tecnica: [],
    certificado_analisis: [],
    incidencia: [],
    otros: [],
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
  const [supplierDraft, setSupplierDraft] = useState({
    name: '',
    fiscalName: '',
    taxId: '',
    sanitaryRegister: '',
    address: '',
    contactName: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [productDraft, setProductDraft] = useState({
    name: '',
    reference: '',
    category: 'materia_prima' as SupplierCategory,
    unit: '',
    notes: '',
    technicalSheets: [] as Attachment[],
    certificates: [] as Attachment[],
  });
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
    setEntryDraft((prev) => ({ ...prev, supplierId: nextSupplier.id }));
    setSupplierDraft({ name: '', fiscalName: '', taxId: '', sanitaryRegister: '', address: '', contactName: '', phone: '', email: '', notes: '' });
    emitSuccessFeedback('Proveedor creado.');
  };

  const addInternalSupplier = () => {
    const existing = suppliers.find((supplier) => supplier.name.toLowerCase() === 'solaris interno');
    if (existing) {
      setSelectedSupplierId(existing.id);
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
    setEntryDraft((prev) => ({
      ...prev,
      supplierId: internalSupplier.id,
      supplierProductId: internalSupplier.products[0].id,
      stage: 'acondicionamiento',
    }));
    emitSuccessFeedback('Solaris interno añadido como responsable.');
  };

  const addSupplierProduct = () => {
    const supplier = selectedSupplier;
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
    setProductDraft({ name: '', reference: '', category: 'materia_prima', unit: '', notes: '', technicalSheets: [], certificates: [] });
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
    const name = window.prompt('Nombre proveedor', supplier.name);
    if (name === null) return;
    const sanitaryRegister = window.prompt('Registro sanitario', supplier.sanitaryRegister);
    if (sanitaryRegister === null) return;
    const fiscalName = window.prompt('Razón social', supplier.fiscalName);
    if (fiscalName === null) return;
    const taxId = window.prompt('NIF/CIF', supplier.taxId);
    if (taxId === null) return;
    const address = window.prompt('Dirección', supplier.address);
    if (address === null) return;
    const phone = window.prompt('Teléfono', supplier.phone);
    if (phone === null) return;
    const email = window.prompt('Email', supplier.email);
    if (email === null) return;
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        suppliers: base.suppliers.map((item) => item.id === supplier.id
          ? {
              ...item,
              name: clean(name) || item.name,
              sanitaryRegister: clean(sanitaryRegister),
              fiscalName: clean(fiscalName),
              taxId: clean(taxId),
              address: clean(address),
              phone: clean(phone),
              email: clean(email),
              updatedAt: new Date().toISOString(),
            }
          : item),
      };
    });
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
    const name = window.prompt('Producto/material', product.name);
    if (name === null) return;
    const reference = window.prompt('Referencia comercial', product.reference);
    if (reference === null) return;
    const unit = window.prompt('Unidad/formato recibido', product.unit);
    if (unit === null) return;
    const category = window.prompt(
      `Categoría (${CATEGORY_OPTIONS.map((option) => option.key).join(', ')})`,
      product.category,
    );
    if (category === null) return;
    const nextCategory = CATEGORY_OPTIONS.some((option) => option.key === category) ? category as SupplierCategory : product.category;
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        suppliers: base.suppliers.map((item) => {
          if (item.id !== supplier.id) return item;
          const products = item.products.map((supplierProduct) => supplierProduct.id === product.id
            ? {
                ...supplierProduct,
                name: clean(name) || supplierProduct.name,
                reference: clean(reference),
                unit: clean(unit),
                category: nextCategory,
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

  const editLot = (lot: FinalLot) => {
    const productName = window.prompt('Producto final', lot.productName);
    if (productName === null) return;
    const lotNumber = window.prompt('Lote producto montado', lot.lotNumber);
    if (lotNumber === null) return;
    const quantity = window.prompt('Cantidad producto montado', lot.quantity);
    if (quantity === null) return;
    const manufactureDate = window.prompt('Fecha montaje/fabricación (AAAA-MM-DD)', lot.manufactureDate);
    if (manufactureDate === null) return;
    const expiryDate = window.prompt('Caducidad/consumo preferente (AAAA-MM-DD)', lot.expiryDate);
    if (expiryDate === null) return;
    setState((prev) => {
      const base = normalizeState(prev);
      return {
        ...base,
        lots: base.lots.map((item) => item.id === lot.id
          ? {
              ...item,
              productName: clean(productName) || item.productName,
              lotNumber: clean(lotNumber) || item.lotNumber,
              quantity: clean(quantity),
              manufactureDate: clean(manufactureDate),
              expiryDate: clean(expiryDate),
              updatedAt: new Date().toISOString(),
            }
          : item),
      };
    });
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
      head: [['Etapa', 'Proveedor', 'Producto/material', 'Albarán', 'Lote proveedor', 'Cantidad', 'Cad./cons.', 'Adjuntos']],
      body: lot.entries.map((entry) => {
        const supplier = suppliers.find((item) => item.id === entry.supplierId);
        const product = supplier?.products.find((item) => item.id === entry.supplierProductId);
        return [
          labelForCategory(entry.stage),
          supplier?.name || '-',
          product?.name || '-',
          entry.albaranNumber || '-',
          entry.supplierLot || '-',
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
        head: [['Entrada', 'Tipo documental', 'Archivo', 'URL']],
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 space-y-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-teal-100 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">Centro de mando / Operación</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Dossier trazabilidad</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
              Proveedores, productos suministrados, entradas por albarán, identificación física, certificados, análisis de lote y hoja de fabricación en un solo dossier descargable.
            </p>
          </div>
          <button
            type="button"
            onClick={() => selectedLot && downloadLotPdf(selectedLot)}
            disabled={!selectedLot}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={17} />
            Descargar PDF
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Building2 size={18} className="text-teal-700" />
                <h2 className="text-sm font-black text-slate-950">Crear proveedor</h2>
              </div>
              <div className="grid gap-2">
                <input value={supplierDraft.name} onChange={(e) => updateSupplierDraft('name', e.target.value)} placeholder="Nombre proveedor" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <input value={supplierDraft.fiscalName} onChange={(e) => updateSupplierDraft('fiscalName', e.target.value)} placeholder="Razón social" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <input value={supplierDraft.taxId} onChange={(e) => updateSupplierDraft('taxId', e.target.value)} placeholder="NIF/CIF" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <input value={supplierDraft.sanitaryRegister} onChange={(e) => updateSupplierDraft('sanitaryRegister', e.target.value)} placeholder="Registro sanitario" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <textarea value={supplierDraft.address} onChange={(e) => updateSupplierDraft('address', e.target.value)} placeholder="Dirección" className="min-h-[68px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-teal-400" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={supplierDraft.phone} onChange={(e) => updateSupplierDraft('phone', e.target.value)} placeholder="Teléfono" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                  <input value={supplierDraft.email} onChange={(e) => updateSupplierDraft('email', e.target.value)} placeholder="Email" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                </div>
                <button type="button" onClick={addSupplier} className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
                  <Plus size={16} />
                  Crear proveedor
                </button>
                <button type="button" onClick={addInternalSupplier} className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-black text-teal-950 hover:bg-teal-100">
                  <Factory size={16} />
                  Usar Solaris interno
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Package size={18} className="text-teal-700" />
                <h2 className="text-sm font-black text-slate-950">Producto suministrado</h2>
              </div>
              <select value={selectedSupplier?.id || ''} onChange={(e) => setSelectedSupplierId(e.target.value)} className="mb-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-teal-400">
                {suppliers.length === 0 && <option value="">Sin proveedores</option>}
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
              <div className="grid gap-2">
                <input value={productDraft.name} onChange={(e) => setProductDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Producto/material" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <input value={productDraft.reference} onChange={(e) => setProductDraft((prev) => ({ ...prev, reference: e.target.value }))} placeholder="Referencia comercial" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <select value={productDraft.category} onChange={(e) => setProductDraft((prev) => ({ ...prev, category: e.target.value as SupplierCategory }))} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-teal-400">
                  {CATEGORY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
                <input value={productDraft.unit} onChange={(e) => setProductDraft((prev) => ({ ...prev, unit: e.target.value }))} placeholder="Unidad/formato recibido: kg, L, cajas, rollos..." className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Ficha técnica</p>
                  <FileUploader folderPath="traceability/supplier-products/technical-sheets" existingFiles={productDraft.technicalSheets} onUploadComplete={(files) => setProductDraft((prev) => ({ ...prev, technicalSheets: files }))} compact maxSizeMB={15} />
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Certificados recurrentes</p>
                  <FileUploader folderPath="traceability/supplier-products/certificates" existingFiles={productDraft.certificates} onUploadComplete={(files) => setProductDraft((prev) => ({ ...prev, certificates: files }))} compact maxSizeMB={15} />
                </div>
                <button type="button" onClick={addSupplierProduct} className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-black text-teal-950 hover:bg-teal-100">
                  <Save size={16} />
                  Guardar suministro
                </button>
                {selectedSupplier && selectedSupplier.products.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Suministros guardados</p>
                    {selectedSupplier.products.map((product) => (
                      <div key={product.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{product.name}</p>
                          <p className="text-xs font-semibold text-slate-500">{labelForCategory(product.category)} · {product.reference || 'Sin ref.'}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => editSupplierProduct(selectedSupplier, product)} className="rounded-lg border border-teal-200 bg-white p-1.5 text-teal-700 hover:bg-teal-50" title="Editar suministro">
                            <Edit2 size={14} />
                          </button>
                          <button type="button" onClick={() => deleteSupplierProduct(selectedSupplier, product)} className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-700 hover:bg-rose-50" title="Eliminar suministro">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </aside>

          <main className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <FolderTree size={18} className="text-teal-700" />
                  <h2 className="text-sm font-black text-slate-950">Lotes de producto final</h2>
                </div>
                <div className="relative md:w-72">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar lote o producto" className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-teal-400" />
                </div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                <input value={lotDraft.productName} onChange={(e) => setLotDraft((prev) => ({ ...prev, productName: e.target.value }))} placeholder="Producto final: Entero Vital" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <input value={lotDraft.lotNumber} onChange={(e) => setLotDraft((prev) => ({ ...prev, lotNumber: e.target.value }))} placeholder="Lote producto montado" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <input value={lotDraft.quantity} onChange={(e) => setLotDraft((prev) => ({ ...prev, quantity: e.target.value }))} placeholder="Cantidad producto montado" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fecha montaje/fabricación</span>
                  <input type="date" value={lotDraft.manufactureDate} onChange={(e) => setLotDraft((prev) => ({ ...prev, manufactureDate: e.target.value }))} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Caducidad/consumo pref.</span>
                  <input type="date" value={lotDraft.expiryDate} onChange={(e) => setLotDraft((prev) => ({ ...prev, expiryDate: e.target.value }))} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                </label>
                <button type="button" onClick={addLot} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-black text-white hover:bg-teal-700">
                  <Plus size={16} />
                  Crear lote
                </button>
              </div>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {filteredLots.map((lot) => (
                  <button key={lot.id} type="button" onClick={() => setSelectedLotId(lot.id)} className={`min-w-[190px] rounded-xl border px-3 py-2 text-left transition ${selectedLot?.id === lot.id ? 'border-teal-300 bg-teal-50 text-teal-950' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                    <span className="block truncate text-sm font-black">{lot.productName}</span>
                    <span className="block text-xs font-bold text-slate-500">Lote {lot.lotNumber} · {lot.entries.length} entradas</span>
                  </button>
                ))}
                {!loading && filteredLots.length === 0 && <p className="text-sm font-semibold text-slate-500">Aún no hay lotes.</p>}
              </div>
            </section>

            {selectedLot ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-teal-700">Hoja de fabricación</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-black text-slate-950">{selectedLot.productName} · Lote {selectedLot.lotNumber}</h2>
                      <button type="button" onClick={() => editLot(selectedLot)} className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-black text-teal-800 hover:bg-teal-100">
                        <Edit2 size={13} />
                        Editar
                      </button>
                      <button type="button" onClick={() => deleteLot(selectedLot)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-black text-rose-800 hover:bg-rose-100">
                        <Trash2 size={13} />
                        Eliminar
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedLot.processSteps.map((step) => (
                        <span key={step} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">
                          <Factory size={13} />
                          {labelForCategory(step)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-lg font-black text-slate-950">{selectedLot.entries.length}</p>
                      <p className="text-[11px] font-bold text-slate-500">Entradas</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-lg font-black text-slate-950">{selectedLot.analyses.length}</p>
                      <p className="text-[11px] font-bold text-slate-500">Análisis</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-lg font-black text-slate-950">{selectedLot.entries.reduce((total, entry) => total + fileCount(entry), 0)}</p>
                      <p className="text-[11px] font-bold text-slate-500">Adjuntos</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <ClipboardList size={18} className="text-teal-700" />
                      <h3 className="text-sm font-black text-teal-950">Añadir proveedor/material a este lote</h3>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <select value={entryDraft.supplierId} onChange={(e) => setEntryDraft((prev) => ({ ...prev, supplierId: e.target.value, supplierProductId: '' }))} className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-bold outline-none focus:border-teal-400">
                        <option value="">Proveedor</option>
                        {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                      </select>
                      <select value={entryDraft.supplierProductId} onChange={(e) => {
                        const product = entrySupplierProducts.find((item) => item.id === e.target.value);
                        setEntryDraft((prev) => ({ ...prev, supplierProductId: e.target.value, stage: product?.category || prev.stage }));
                      }} className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-bold outline-none focus:border-teal-400">
                        <option value="">Producto/material</option>
                        {entrySupplierProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                      </select>
                      <select value={entryDraft.stage} onChange={(e) => setEntryDraft((prev) => ({ ...prev, stage: e.target.value as SupplierCategory }))} className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-bold outline-none focus:border-teal-400">
                        {CATEGORY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                      </select>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-black uppercase tracking-widest text-teal-700">Fecha entrega</span>
                        <input type="date" value={entryDraft.deliveryDate} onChange={(e) => setEntryDraft((prev) => ({ ...prev, deliveryDate: e.target.value }))} className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                      </label>
                      <input value={entryDraft.albaranNumber} onChange={(e) => setEntryDraft((prev) => ({ ...prev, albaranNumber: e.target.value }))} placeholder="Nº albarán/factura" className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                      <input value={entryDraft.supplierLot} onChange={(e) => setEntryDraft((prev) => ({ ...prev, supplierLot: e.target.value }))} placeholder="Lote proveedor" className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                      <input value={entryDraft.quantity} onChange={(e) => setEntryDraft((prev) => ({ ...prev, quantity: e.target.value }))} placeholder="Cantidad" className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                      <label className="grid gap-1">
                        <span className="text-[11px] font-black uppercase tracking-widest text-teal-700">Caducidad/consumo pref.</span>
                        <input type="date" value={entryDraft.expiryDate || entryDraft.bestBeforeDate} onChange={(e) => setEntryDraft((prev) => ({ ...prev, expiryDate: e.target.value }))} className="h-10 rounded-xl border border-teal-100 px-3 text-sm font-semibold outline-none focus:border-teal-400" />
                      </label>
                    </div>
                    <textarea value={entryDraft.notes} onChange={(e) => setEntryDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Observaciones de entrada, no aplica, incidencias o aclaraciones" className="mt-2 min-h-[70px] w-full rounded-xl border border-teal-100 px-3 py-2 text-sm font-semibold outline-none focus:border-teal-400" />
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {DOCUMENT_GROUPS.map((group) => (
                        <div key={group.key} className="rounded-xl border border-white bg-white p-3">
                          <p className="text-xs font-black uppercase tracking-widest text-slate-600">{group.label}</p>
                          <p className="mb-2 text-xs font-semibold text-slate-500">{group.hint}</p>
                          <FileUploader folderPath={`traceability/lots/${selectedLot.id}/${group.key}`} existingFiles={entryDraft.attachments[group.key]} onUploadComplete={(files) => setEntryDraft((prev) => ({ ...prev, attachments: { ...prev.attachments, [group.key]: files } }))} compact maxSizeMB={20} />
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={addEntry} className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-black text-white hover:bg-teal-700">
                      <Plus size={16} />
                      Añadir proveedor/material al lote
                    </button>
                  </div>

                  <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Beaker size={18} className="text-amber-700" />
                      <h3 className="text-sm font-black text-amber-950">Análisis del lote final</h3>
                    </div>
                    <div className="grid gap-2">
                      <input value={analysisDraft.title} onChange={(e) => setAnalysisDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="Microbiología, metales, estabilidad..." className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={analysisDraft.date} onChange={(e) => setAnalysisDraft((prev) => ({ ...prev, date: e.target.value }))} className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                        <input value={analysisDraft.result} onChange={(e) => setAnalysisDraft((prev) => ({ ...prev, result: e.target.value }))} placeholder="Resultado" className="h-10 rounded-xl border border-amber-100 px-3 text-sm font-semibold outline-none focus:border-amber-400" />
                      </div>
                      <textarea value={analysisDraft.notes} onChange={(e) => setAnalysisDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notas del análisis" className="min-h-[70px] rounded-xl border border-amber-100 px-3 py-2 text-sm font-semibold outline-none focus:border-amber-400" />
                      <FileUploader folderPath={`traceability/lots/${selectedLot.id}/final-analysis`} existingFiles={analysisDraft.attachments} onUploadComplete={(files) => setAnalysisDraft((prev) => ({ ...prev, attachments: files }))} compact maxSizeMB={20} />
                      <button type="button" onClick={addAnalysis} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700">
                        <Plus size={16} />
                        Adjuntar análisis
                      </button>
                    </div>
                    <div className="mt-4 space-y-2">
                      {selectedLot.analyses.map((analysis) => (
                        <div key={analysis.id} className="flex items-start justify-between gap-2 rounded-xl border border-amber-100 bg-white p-3">
                          <div>
                            <p className="text-sm font-black text-slate-950">{analysis.title}</p>
                            <p className="text-xs font-semibold text-slate-500">{analysis.date || 'Sin fecha'} · {analysis.result || 'Sin resultado'} · {analysis.attachments.length} archivos</p>
                          </div>
                          <button type="button" onClick={() => deleteAnalysis(analysis.id)} className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100" title="Eliminar análisis">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {selectedLot.entries.map((entry) => {
                    const supplier = suppliers.find((item) => item.id === entry.supplierId);
                    const product = supplier?.products.find((item) => item.id === entry.supplierProductId);
                    return (
                      <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-black text-teal-800">{labelForCategory(entry.stage)}</span>
                              {entry.albaranNumber && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">Albarán {entry.albaranNumber}</span>}
                            </div>
                            <h3 className="mt-2 text-base font-black text-slate-950">{product?.name || 'Producto no encontrado'}</h3>
                            <p className="text-sm font-semibold text-slate-600">{supplier?.name || 'Proveedor no encontrado'} · Lote proveedor {entry.supplierLot || '-'}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">Entrega {entry.deliveryDate || '-'} · Cantidad {entry.quantity || '-'} · Cad./cons. {entry.expiryDate || entry.bestBeforeDate || '-'}</p>
                          </div>
                          <button type="button" onClick={() => deleteEntry(entry.id)} className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100" title="Eliminar entrada">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          {DOCUMENT_GROUPS.map((group) => (
                            <div key={group.key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
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
                    );
                  })}
                  {selectedLot.entries.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                      <AlertTriangle size={22} className="mx-auto text-slate-400" />
                      <p className="mt-2 text-sm font-bold text-slate-600">Este lote todavía no tiene entradas documentales.</p>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <ShieldCheck size={28} className="mx-auto text-teal-700" />
                <p className="mt-3 text-sm font-bold text-slate-600">Crea un lote final para empezar a reunir su trazabilidad.</p>
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Tags size={18} className="text-teal-700" />
                <h2 className="text-sm font-black text-slate-950">Mapa de proveedores</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {suppliers.map((supplier) => (
                  <div key={supplier.id} className={`rounded-2xl border p-4 transition ${selectedSupplier?.id === supplier.id ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => setSelectedSupplierId(supplier.id)} className="min-w-0 flex-1 text-left">
                        <p className="text-sm font-black text-slate-950">{supplier.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{supplier.sanitaryRegister || 'Sin registro sanitario'} · {supplier.products.length} suministros</p>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => editSupplier(supplier)} className="rounded-lg border border-teal-200 bg-white p-1.5 text-teal-700 hover:bg-teal-50" title="Editar proveedor">
                          <Edit2 size={14} />
                        </button>
                        <button type="button" onClick={() => deleteSupplier(supplier)} className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-700 hover:bg-rose-50" title="Eliminar proveedor">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {supplier.categories.map((category) => (
                        <span key={category} className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-600">{labelForCategory(category)}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
