import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, FileText, FolderOpen, Image as ImageIcon, Plus, ShieldAlert, Trash2, Upload, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import { CARLOS_EMAIL, DRIVE_FOLDERS } from '../constants';
import { FileUploader, Attachment } from '../components/FileUploader';

type AlbaranDamageKind = 'origen' | 'envio';

type AlbaranDocument = {
  id: string;
  title: string;
  attachment?: Attachment;
  attachments: Attachment[];
  note: string;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
  activeAt?: string;
  exhaustedAt?: string;
  createdBy: string;
  updatedBy?: string;
};

type AlbaranDamageEntry = {
  id: string;
  quantity: number;
  comment: string;
  attachments: Attachment[];
  kind: AlbaranDamageKind;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy?: string;
};

type AlbaranTag = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  documents: AlbaranDocument[];
  damageHistory: AlbaranDamageEntry[];
};

type AlbaranProduct = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tags: AlbaranTag[];
};

type AlbaranesState = {
  products: AlbaranProduct[];
};

const ALBARANES_STATE_KEY = 'albaranes_state_v1';

const emptyState: AlbaranesState = { products: [] };

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeAttachment(attachment: any): Attachment | null {
  const name = clean(attachment?.name);
  const url = clean(attachment?.url);
  if (!name || !url) return null;
  return {
    name,
    url,
    type: clean(attachment?.type) || 'application/octet-stream',
    size: Number(attachment?.size) || 0,
  };
}

function normalizeAttachments(value: any): Attachment[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.map(normalizeAttachment).filter(Boolean) as Attachment[];
}

function uid(prefix = 'alb') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const PRODUCT_PALETTES = [
  {
    card: 'from-violet-50/90 to-fuchsia-50/60',
    border: 'border-violet-200',
    accent: 'text-violet-700',
    soft: 'bg-violet-50/55',
    softBorder: 'border-violet-100',
    chip: 'bg-violet-100 text-violet-700',
  },
  {
    card: 'from-emerald-50/90 to-teal-50/60',
    border: 'border-emerald-200',
    accent: 'text-emerald-700',
    soft: 'bg-emerald-50/55',
    softBorder: 'border-emerald-100',
    chip: 'bg-emerald-100 text-emerald-700',
  },
  {
    card: 'from-sky-50/90 to-cyan-50/60',
    border: 'border-sky-200',
    accent: 'text-sky-700',
    soft: 'bg-sky-50/55',
    softBorder: 'border-sky-100',
    chip: 'bg-sky-100 text-sky-700',
  },
  {
    card: 'from-amber-50/90 to-orange-50/60',
    border: 'border-amber-200',
    accent: 'text-amber-700',
    soft: 'bg-amber-50/55',
    softBorder: 'border-amber-100',
    chip: 'bg-amber-100 text-amber-700',
  },
  {
    card: 'from-rose-50/90 to-pink-50/60',
    border: 'border-rose-200',
    accent: 'text-rose-700',
    soft: 'bg-rose-50/55',
    softBorder: 'border-rose-100',
    chip: 'bg-rose-100 text-rose-700',
  },
  {
    card: 'from-indigo-50/90 to-blue-50/60',
    border: 'border-indigo-200',
    accent: 'text-indigo-700',
    soft: 'bg-indigo-50/55',
    softBorder: 'border-indigo-100',
    chip: 'bg-indigo-100 text-indigo-700',
  },
] as const;

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getProductPalette(seed: string) {
  const safeSeed = clean(seed).toLowerCase() || 'producto';
  return PRODUCT_PALETTES[hashString(safeSeed) % PRODUCT_PALETTES.length];
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return clean(iso) || '-';
  return d.toLocaleString('es-ES');
}

function openAttachment(url: string) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function getFileKind(file: Attachment) {
  if (file.type.startsWith('image/')) return 'Imagen';
  if (file.type.includes('pdf')) return 'PDF';
  return 'Archivo';
}

function isAlbaranActive(document: AlbaranDocument) {
  return document.active !== false;
}

function getDocumentAttachments(document: AlbaranDocument) {
  return Array.isArray(document.attachments) && document.attachments.length > 0
    ? document.attachments
    : document.attachment
      ? [document.attachment]
      : [];
}

function getDocumentPrimaryAttachment(document: AlbaranDocument) {
  return getDocumentAttachments(document)[0] || null;
}

function getDocumentTitle(document: AlbaranDocument) {
  return clean(document.title) || getDocumentPrimaryAttachment(document)?.name || 'Albarán';
}

function getAlbaranStatus(document: AlbaranDocument) {
  if (isAlbaranActive(document)) return 'active' as const;
  if (document.exhaustedAt) return 'exhausted' as const;
  return 'pending' as const;
}

function getDamageKindLabel(kind: AlbaranDamageKind) {
  return kind === 'envio' ? 'Envío' : 'Origen';
}

function getDamageKindTone(kind: AlbaranDamageKind) {
  return kind === 'envio'
    ? 'bg-cyan-100 text-cyan-700 border-cyan-200'
    : 'bg-amber-100 text-amber-800 border-amber-200';
}

function safePdfText(value: unknown) {
  return clean(value)
    .replace(/\s+/g, ' ')
    .replace(/\u0000/g, '')
    .trim();
}

function normalizeTag(tag: Partial<AlbaranTag> | any, fallbackName = 'General'): AlbaranTag {
  const now = new Date().toISOString();
  return {
    id: clean(tag?.id) || uid('tag'),
    name: clean(tag?.name) || fallbackName,
    active: tag?.active !== false,
    createdAt: clean(tag?.createdAt) || now,
    updatedAt: clean(tag?.updatedAt) || clean(tag?.createdAt) || now,
    deletedAt: clean(tag?.deletedAt) || '',
    documents: Array.isArray(tag?.documents) ? tag.documents.map((doc: any) => ({
      id: clean(doc?.id) || uid('doc'),
      title: clean(doc?.title) || clean(doc?.attachment?.name) || 'Albarán',
      attachment: normalizeAttachment(doc?.attachment) || undefined,
      attachments: normalizeAttachments(doc?.attachments || doc?.attachment),
      note: clean(doc?.note),
      active: doc?.active !== false,
      createdAt: clean(doc?.createdAt) || now,
      updatedAt: clean(doc?.updatedAt) || clean(doc?.createdAt) || now,
      activeAt: clean(doc?.activeAt) || (doc?.active === false ? '' : clean(doc?.createdAt) || now),
      exhaustedAt: clean(doc?.exhaustedAt) || '',
      createdBy: clean(doc?.createdBy) || 'Sistema',
      updatedBy: clean(doc?.updatedBy) || '',
    })) : [],
    damageHistory: Array.isArray(tag?.damageHistory) ? tag.damageHistory.map((entry: any) => ({
      id: clean(entry?.id) || uid('dam'),
      quantity: Math.abs(Number(entry?.quantity) || 0),
      comment: clean(entry?.comment),
      attachments: normalizeAttachments(entry?.attachments),
      kind: entry?.kind === 'envio' ? 'envio' : 'origen',
      createdAt: clean(entry?.createdAt) || now,
      updatedAt: clean(entry?.updatedAt) || clean(entry?.createdAt) || now,
      createdBy: clean(entry?.createdBy) || 'Sistema',
      updatedBy: clean(entry?.updatedBy) || '',
    })) : [],
  };
}

function normalizeProduct(product: any): AlbaranProduct {
  const now = new Date().toISOString();
  const legacyDocuments = Array.isArray(product?.documents) ? product.documents : [];
  const legacyDamages = Array.isArray(product?.damageHistory) ? product.damageHistory : [];
  const normalizedTags = Array.isArray(product?.tags) && product.tags.length > 0
    ? product.tags.map((tag: any) => normalizeTag(tag, 'General')).filter((tag: AlbaranTag) => !tag.deletedAt)
    : legacyDocuments.length > 0 || legacyDamages.length > 0
      ? [normalizeTag({
          id: uid('tag'),
          name: 'General',
          active: true,
          createdAt: now,
          updatedAt: now,
          documents: legacyDocuments,
          damageHistory: legacyDamages,
        }, 'General')]
      : [];

  return {
    id: clean(product?.id) || uid('prod'),
    name: clean(product?.name) || 'Producto',
    createdAt: clean(product?.createdAt) || now,
    updatedAt: clean(product?.updatedAt) || now,
    tags: normalizedTags,
  };
}

function getTagKey(tag: Pick<AlbaranTag, 'id' | 'name'>) {
  return `${clean(tag.id)}:${clean(tag.name).toLowerCase()}`;
}

export default function AlbaranesPage() {
  const { currentUser } = useAuth();
  const isRestrictedUser = !!currentUser?.isRestricted || (currentUser?.email || '').toLowerCase() === CARLOS_EMAIL;
  const conteoFolder = DRIVE_FOLDERS.find((folder) => folder.id === 'conteo');
  const allowedUsers = conteoFolder?.users || [];
  const canAccess = !!currentUser && allowedUsers.includes(currentUser.id);

  const [state, setState, loading] = useSharedJsonState<AlbaranesState>(
    ALBARANES_STATE_KEY,
    emptyState,
    {
      userId: currentUser?.id,
      initializeIfMissing: false,
      pollIntervalMs: 2000,
      protectFromEmptyOverwrite: true,
      preferRemoteSnapshot: true,
      mergeBeforePersist: true,
      mergeIncomingWithLocal: false,
    },
  );

  const products = useMemo(
    () => (Array.isArray(state?.products) ? state.products.map((product: any) => normalizeProduct(product)) : []),
    [state],
  );
  const [productName, setProductName] = useState('');
  const [query, setQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [showEditTag, setShowEditTag] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [tagName, setTagName] = useState('');
  const [editingTagId, setEditingTagId] = useState<string>('');
  const [editingDocumentId, setEditingDocumentId] = useState<string>('');
  const [editingDamageId, setEditingDamageId] = useState<string>('');
  const [selectedNote, setSelectedNote] = useState<{ title: string; note: string } | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docNote, setDocNote] = useState('');
  const [docActive, setDocActive] = useState(false);
  const [docFiles, setDocFiles] = useState<Attachment[]>([]);
  const [damageQty, setDamageQty] = useState('');
  const [damageComment, setDamageComment] = useState('');
  const [damageFiles, setDamageFiles] = useState<Attachment[]>([]);
  const [damageKind, setDamageKind] = useState<AlbaranDamageKind>('origen');

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId],
  );
  const selectedTag = useMemo(
    () => selectedProduct?.tags.find((tag) => tag.id === selectedTagId) || selectedProduct?.tags[0] || null,
    [selectedProduct, selectedTagId],
  );

  const filteredProducts = useMemo(() => {
    const q = clean(query).toLowerCase();
    return [...products].filter((product) => {
      if (!q) return true;
      const productMatch = clean(product.name).toLowerCase().includes(q);
      const tagMatch = product.tags.some((tag) => clean(tag.name).toLowerCase().includes(q));
      return productMatch || tagMatch;
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [products, query]);

  const stats = useMemo(() => {
    const totalDocs = products.reduce(
      (acc, product) => acc + product.tags.reduce((tagAcc, tag) => tagAcc + (tag.documents?.length || 0), 0),
      0,
    );
    const activeDocs = products.reduce(
      (acc, product) =>
        acc +
        product.tags.reduce(
          (tagAcc, tag) => tagAcc + (tag.documents?.filter((document) => isAlbaranActive(document)).length || 0),
          0,
        ),
      0,
    );
    const pendingDocs = products.reduce(
      (acc, product) =>
        acc +
        product.tags.reduce(
          (tagAcc, tag) =>
            tagAcc +
            (tag.documents?.filter((document) => getAlbaranStatus(document) === 'pending').length || 0),
          0,
        ),
      0,
    );
    const exhaustedDocs = products.reduce(
      (acc, product) =>
        acc +
        product.tags.reduce(
          (tagAcc, tag) =>
            tagAcc +
            (tag.documents?.filter((document) => getAlbaranStatus(document) === 'exhausted').length || 0),
          0,
        ),
      0,
    );
    return {
      totalProducts: products.length,
      activeDocs,
      totalDocs,
      pendingDocs,
      exhaustedDocs,
    };
  }, [products]);

  const updateState = (updater: (prev: AlbaranesState) => AlbaranesState) => {
    setState((prev) => {
      const current = Array.isArray((prev as any)?.products)
        ? { products: (prev as any).products.map((product: any) => normalizeProduct(product)) }
        : emptyState;
      return updater({
        products: Array.isArray(current.products) ? current.products : [],
      });
    });
  };

  const updateProduct = (productId: string, updater: (product: AlbaranProduct) => AlbaranProduct) => {
    updateState((prev) => ({
      ...prev,
      products: prev.products.map((product) => (product.id === productId ? updater(product) : product)),
    }));
  };

  const createProduct = () => {
    const name = clean(productName);
    if (!name) {
      window.alert('Escribe un nombre de producto.');
      return;
    }
    if (products.some((product) => clean(product.name).toLowerCase() === name.toLowerCase())) {
      window.alert('Ese producto ya existe.');
      return;
    }
    const now = new Date().toISOString();
    const nextProduct: AlbaranProduct = {
      id: uid('prod'),
      name,
      createdAt: now,
      updatedAt: now,
      tags: [],
    };
    updateState((prev) => ({ ...prev, products: [nextProduct, ...prev.products] }));
    setProductName('');
    setShowCreateProduct(false);
  };

  const createTag = () => {
    if (!selectedProduct) return;
    const name = clean(tagName);
    if (!name) {
      window.alert('Escribe un nombre de etiqueta.');
      return;
    }
    if (selectedProduct.tags.some((tag) => clean(tag.name).toLowerCase() === name.toLowerCase())) {
      window.alert('Esa etiqueta ya existe en este producto.');
      return;
    }
    const now = new Date().toISOString();
    const newTag: AlbaranTag = {
      id: uid('tag'),
      name,
      active: true,
      createdAt: now,
      updatedAt: now,
      documents: [],
      damageHistory: [],
    };
    updateProduct(selectedProduct.id, (product) => ({
      ...product,
      tags: [newTag, ...product.tags],
      updatedAt: now,
    }));
    setTagName('');
    setSelectedTagId(newTag.id);
    setShowCreateTag(false);
  };

  const openEditTag = () => {
    if (!selectedTag) return;
    setEditingTagId(selectedTag.id);
    setTagName(selectedTag.name);
    setShowEditTag(true);
  };

  const saveTagName = () => {
    if (!selectedProduct || !selectedTag) return;
    const name = clean(tagName);
    if (!name) {
      window.alert('Escribe un nombre de etiqueta.');
      return;
    }
    if (
      selectedProduct.tags.some(
        (tag) => tag.id !== selectedTag.id && clean(tag.name).toLowerCase() === name.toLowerCase(),
      )
    ) {
      window.alert('Esa etiqueta ya existe en este producto.');
      return;
    }
    const now = new Date().toISOString();
    updateProduct(selectedProduct.id, (product) => ({
      ...product,
      tags: product.tags.map((tag) =>
        tag.id === selectedTag.id
          ? { ...tag, name, updatedAt: now }
          : tag,
      ),
      updatedAt: now,
    }));
    setEditingTagId('');
    setTagName('');
    setShowEditTag(false);
  };

  const deleteProduct = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    if (!window.confirm(`¿Borrar el producto "${product.name}" y todo su historial?`)) return;
    updateState((prev) => ({
      ...prev,
      products: prev.products.filter((item) => item.id !== productId),
    }));
    if (selectedProductId === productId) {
      setSelectedProductId('');
    }
  };

  const deleteTag = (productId: string, tagId: string) => {
    const product = products.find((item) => item.id === productId);
    const tag = product?.tags.find((item) => item.id === tagId);
    if (!product || !tag) return;
    if (!window.confirm(`¿Borrar la etiqueta "${tag.name}" y todo su historial?`)) return;
    const now = new Date().toISOString();
    updateProduct(productId, (current) => {
      return {
        ...current,
        tags: current.tags.map((item) =>
          item.id === tagId
            ? { ...item, deletedAt: now, updatedAt: now }
            : item,
        ),
        updatedAt: now,
      };
    });
    if (selectedTagId === tagId) {
      const remaining = product.tags.filter((item) => item.id !== tagId);
      setSelectedTagId(remaining[0]?.id || '');
    }
  };

  const toggleDocumentStatus = (productId: string, documentId: string) => {
    updateProduct(productId, (product) => ({
      ...product,
      tags: product.tags.map((tag) => ({
        ...tag,
        documents: tag.documents.map((document) =>
          document.id === documentId
            ? (() => {
                const now = new Date().toISOString();
                const nextActive = !isAlbaranActive(document);
                return {
                  ...document,
                  active: nextActive,
                  activeAt: nextActive ? now : document.activeAt,
                  exhaustedAt: nextActive ? '' : now,
                  updatedAt: now,
                  updatedBy: currentUser?.name || 'Sistema',
                };
              })()
            : document,
        ),
      })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const deleteDocument = (productId: string, documentId: string) => {
    const product = products.find((item) => item.id === productId);
    const document = product?.tags.flatMap((tag) => tag.documents).find((item) => item.id === documentId);
    if (!product || !document) return;
    const attachmentName = getDocumentPrimaryAttachment(document)?.name || 'albarán';
    if (!window.confirm(`¿Borrar el albarán "${attachmentName}"?`)) return;
    updateProduct(productId, (current) => ({
      ...current,
      tags: current.tags.map((tag) => ({
        ...tag,
        documents: tag.documents.filter((item) => item.id !== documentId),
      })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const deleteDamageEntry = (productId: string, entryId: string) => {
    const product = products.find((item) => item.id === productId);
    const entry = product?.tags.flatMap((tag) => tag.damageHistory).find((item) => item.id === entryId);
    if (!product || !entry) return;
    if (!window.confirm('¿Borrar este registro de dañado?')) return;
    updateProduct(productId, (current) => ({
      ...current,
      tags: current.tags.map((tag) => ({
        ...tag,
        damageHistory: tag.damageHistory.filter((item) => item.id !== entryId),
      })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const openProduct = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    setSelectedProductId(productId);
    setSelectedTagId(product?.tags[0]?.id || '');
  };

  const openTag = (tagId: string) => {
    setSelectedTagId(tagId);
  };

  const openDocumentModal = () => {
    if (!selectedProduct || !selectedTag) return;
    setEditingDocumentId('');
    setDocTitle('');
    setDocNote('');
    setDocActive(false);
    setDocFiles([]);
    setShowDocumentModal(true);
  };

  const openEditDocumentModal = (document: AlbaranDocument) => {
    if (!selectedProduct || !selectedTag) return;
    setEditingDocumentId(document.id);
    setDocTitle(getDocumentTitle(document));
    setDocNote(document.note || '');
    setDocActive(isAlbaranActive(document));
    setDocFiles(getDocumentAttachments(document));
    setShowDocumentModal(true);
  };

  const saveDocuments = () => {
    if (!selectedProduct || !selectedTag) return;
    const title = clean(docTitle);
    if (docFiles.length === 0) {
      window.alert('Adjunta al menos un PDF o una foto.');
      return;
    }
    if (!title) {
      window.alert('Escribe un título para el albarán.');
      return;
    }
    const now = new Date().toISOString();
    if (editingDocumentId) {
      updateProduct(selectedProduct.id, (product) => ({
        ...product,
        tags: product.tags.map((tag) =>
          tag.id === selectedTag.id
            ? {
                ...tag,
                documents: tag.documents.map((document) =>
                  document.id === editingDocumentId
                    ? {
                        ...document,
                        title,
                        attachments: docFiles,
                        attachment: docFiles[0],
                        note: docNote.trim(),
                        active: docActive,
                        activeAt: docActive ? (document.activeAt || now) : document.activeAt,
                        exhaustedAt: docActive ? '' : (document.exhaustedAt || now),
                        updatedAt: now,
                        updatedBy: currentUser?.name || 'Sistema',
                      }
                    : document,
                ),
                updatedAt: now,
              }
            : tag,
        ),
        updatedAt: now,
      }));
    } else {
      const entry: AlbaranDocument = {
        id: uid('doc'),
        title,
        attachments: docFiles,
        attachment: docFiles[0],
        note: docNote.trim(),
        active: docActive,
        createdAt: now,
        updatedAt: now,
        activeAt: docActive ? now : '',
        exhaustedAt: docActive ? '' : '',
        createdBy: currentUser?.name || 'Sistema',
        updatedBy: currentUser?.name || 'Sistema',
      };
      updateProduct(selectedProduct.id, (product) => ({
        ...product,
        tags: product.tags.map((tag) =>
          tag.id === selectedTag.id
            ? { ...tag, documents: [entry, ...tag.documents], updatedAt: now }
            : tag,
        ),
        updatedAt: now,
      }));
    }
    setShowDocumentModal(false);
    setEditingDocumentId('');
    setDocTitle('');
  };

  const openDamageModal = () => {
    if (!selectedProduct || !selectedTag) return;
    setEditingDamageId('');
    setDamageQty('');
    setDamageComment('');
    setDamageFiles([]);
    setDamageKind('origen');
    setShowDamageModal(true);
  };

  const openEditDamageModal = (entry: AlbaranDamageEntry) => {
    if (!selectedProduct || !selectedTag) return;
    setEditingDamageId(entry.id);
    setDamageQty(String(entry.quantity || ''));
    setDamageComment(entry.comment || '');
    setDamageFiles(entry.attachments || []);
    setDamageKind(entry.kind || 'origen');
    setShowDamageModal(true);
  };

  const openNoteModal = (document: AlbaranDocument) => {
    if (!document.note) return;
    setSelectedNote({
      title: getDocumentTitle(document),
      note: document.note,
    });
    setShowNoteModal(true);
  };

  const saveDamage = () => {
    if (!selectedProduct || !selectedTag) return;
    const qty = Math.abs(Number(clean(damageQty)));
    if (!Number.isFinite(qty) || qty <= 0) {
      window.alert('Escribe una cantidad válida de dañados.');
      return;
    }
    const now = new Date().toISOString();
    if (editingDamageId) {
      updateProduct(selectedProduct.id, (product) => ({
        ...product,
        tags: product.tags.map((tag) =>
          tag.id === selectedTag.id
            ? {
                ...tag,
                damageHistory: tag.damageHistory.map((entry) =>
                  entry.id === editingDamageId
                    ? {
                        ...entry,
                        quantity: qty,
                        comment: clean(damageComment),
                        attachments: damageFiles,
                        kind: damageKind,
                        updatedAt: now,
                        updatedBy: currentUser?.name || 'Sistema',
                      }
                    : entry,
                ),
                updatedAt: now,
              }
            : tag,
        ),
        updatedAt: now,
      }));
    } else {
      const entry: AlbaranDamageEntry = {
        id: uid('dam'),
        quantity: qty,
        comment: clean(damageComment),
        attachments: damageFiles,
        kind: damageKind,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser?.name || 'Sistema',
        updatedBy: currentUser?.name || 'Sistema',
      };
      updateProduct(selectedProduct.id, (product) => ({
        ...product,
        tags: product.tags.map((tag) =>
          tag.id === selectedTag.id
            ? { ...tag, damageHistory: [entry, ...tag.damageHistory], updatedAt: now }
            : tag,
        ),
        updatedAt: now,
      }));
    }
    setShowDamageModal(false);
    setEditingDamageId('');
  };

  const downloadDamageHistoryPdf = () => {
    if (!selectedProduct || !selectedTag) return;
    const title = `${selectedProduct.name} · ${selectedTag.name}`;
    const fileName = `albaran-danados-${selectedProduct.name.toLowerCase().replace(/\s+/g, '-')}-${selectedTag.name.toLowerCase().replace(/\s+/g, '-')}.pdf`;
    const entries = [...selectedTag.damageHistory].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const originEntries = entries.filter((entry) => (entry.kind || 'origen') !== 'envio');
    const shippingEntries = entries.filter((entry) => (entry.kind || 'origen') === 'envio');
    const totalOrigin = originEntries.reduce((acc, entry) => acc + (Number(entry.quantity) || 0), 0);
    const totalShipping = shippingEntries.reduce((acc, entry) => acc + (Number(entry.quantity) || 0), 0);
    const linkedDocuments = selectedTag.documents
      .map((doc) => getDocumentTitle(doc) || getDocumentPrimaryAttachment(doc)?.name || '')
      .filter(Boolean);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const marginX = 36;
    let startY = 36;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Lunaris · Albaranes', marginX, startY);
    startY += 22;
    doc.setFontSize(13);
    doc.text(safePdfText(title), marginX, startY);
    startY += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Historial de dañados descargable`, marginX, startY);
    startY += 13;
    doc.text(`Producto: ${safePdfText(selectedProduct.name)}`, marginX, startY);
    startY += 12;
    doc.text(`Etiqueta: ${safePdfText(selectedTag.name)}`, marginX, startY);
    startY += 12;
    doc.text(`Total albaranes: ${selectedTag.documents.length} · Incidencias: ${selectedTag.damageHistory.length}`, marginX, startY);
    startY += 12;
    if (linkedDocuments.length > 0) {
      doc.text(`Albaranes asociados: ${linkedDocuments.join(' · ')}`, marginX, startY, { maxWidth: 760 });
      startY += 24;
    } else {
      startY += 6;
    }

    const summaryRows = [
      ['Origen', String(totalOrigin)],
      ['Envío', String(totalShipping)],
      ['Total general', String(totalOrigin + totalShipping)],
    ];
    autoTable(doc, {
      head: [['Resumen', 'Valor']],
      body: summaryRows,
      startY,
      margin: { left: marginX, right: marginX, top: 20, bottom: 20 },
      tableWidth: 250,
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 4,
        textColor: [17, 24, 39],
        lineColor: [229, 231, 235],
        lineWidth: 0.4,
      },
      headStyles: {
        fillColor: [245, 158, 11],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [255, 251, 235],
      },
    });

    const renderSection = (
      label: string,
      rows: AlbaranDamageEntry[],
      tone: { fillColor: [number, number, number]; textColor: [number, number, number] },
      kind: AlbaranDamageKind,
    ) => {
      const finalY = (doc as any).lastAutoTable?.finalY || startY;
      const sectionStart = finalY + 18;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`${label} (${rows.length})`, marginX, sectionStart);
      autoTable(doc, {
        head: [['Fecha', 'Cantidad', 'Comentario', 'Adjuntos', 'Creado por']],
        body: rows.length > 0
          ? [
              ...rows.map((entry) => [
                formatDateTime(entry.createdAt),
                String(entry.quantity || 0),
                safePdfText(entry.comment || '—'),
                String(entry.attachments?.length || 0),
                safePdfText(entry.createdBy || 'Sistema'),
              ]),
              ['TOTAL', String(rows.reduce((acc, entry) => acc + (Number(entry.quantity) || 0), 0)), '', '', ''],
            ]
          : [['Sin registros', '', '', '', '']],
        startY: sectionStart + 10,
        margin: { left: marginX, right: marginX, top: 20, bottom: 20 },
        styles: {
          font: 'helvetica',
          fontSize: 8.5,
          cellPadding: 4,
          textColor: [17, 24, 39],
          lineColor: [229, 231, 235],
          lineWidth: 0.4,
        },
        headStyles: {
          fillColor: tone.fillColor,
          textColor: tone.textColor,
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: kind === 'envio' ? [240, 253, 250] : [255, 251, 235],
        },
        didParseCell: (hookData) => {
          if (hookData.row.index === rows.length && rows.length > 0) {
            hookData.cell.styles.fontStyle = 'bold';
            hookData.cell.styles.fillColor = kind === 'envio' ? [207, 250, 254] : [254, 240, 138];
          }
        },
      });
    };

    renderSection(
      'Historial de dañados de origen',
      originEntries,
      { fillColor: [245, 158, 11], textColor: [255, 255, 255] },
      'origen',
    );
    renderSection(
      'Historial de dañados de envío',
      shippingEntries,
      { fillColor: [14, 165, 233], textColor: [255, 255, 255] },
      'envio',
    );

    doc.save(fileName);
  };

  if (!canAccess) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-violet-50 p-3 text-violet-700">
              <FolderOpen size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-violet-950">Albaranes</h1>
              <p className="text-sm text-violet-700">No tienes acceso a esta sección.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
      <section className="rounded-[2rem] border border-violet-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-violet-50 p-3 text-violet-700">
              <FolderOpen size={30} />
            </div>
            <div>
              <h1 className="text-4xl font-black text-violet-950">Albaranes</h1>
              <p className="text-sm font-medium text-violet-700">
                Productos, documentos asociados y historial de incidencias en una sola vista.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateProduct(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
            >
              <Plus size={16} />
              Nuevo producto
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Productos" value={stats.totalProducts} tone="violet" />
          <SummaryCard title="Activos" value={stats.activeDocs} tone="emerald" />
          <SummaryCard title="Pendientes" value={stats.pendingDocs} tone="sky" />
          <SummaryCard title="Agotados" value={stats.exhaustedDocs} tone="amber" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
            Total albaranes: {stats.totalDocs}
          </span>
        </div>
      </section>

      <section className="rounded-[2rem] border border-violet-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-violet-950">Catálogo de productos</h2>
            <p className="text-xs font-semibold text-violet-600">Activos, agotados y documentación adjunta por producto.</p>
          </div>
          <label className="flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto..."
              className="min-w-[220px] bg-transparent text-sm font-semibold text-violet-900 outline-none placeholder:text-violet-400"
            />
          </label>
        </div>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-6 text-center text-sm font-semibold text-violet-700">
            Cargando albaranes...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-6 text-center text-sm font-semibold text-violet-700">
            No hay productos todavía. Crea el primero para empezar a guardar albaranes.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const palette = getProductPalette(product.name || product.id);
              const activeDocs = product.tags.reduce(
                (acc, tag) => acc + tag.documents.filter((document) => isAlbaranActive(document)).length,
                0,
              );
              const pendingDocs = product.tags.reduce(
                (acc, tag) => acc + tag.documents.filter((document) => getAlbaranStatus(document) === 'pending').length,
                0,
              );
              const exhaustedDocs = product.tags.reduce(
                (acc, tag) => acc + tag.documents.filter((document) => getAlbaranStatus(document) === 'exhausted').length,
                0,
              );
              const totalDocs = product.tags.reduce((acc, tag) => acc + tag.documents.length, 0);
              return (
                <article
                  key={product.id}
                  className={`rounded-[1.75rem] border ${palette.border} bg-gradient-to-br from-white ${palette.card} p-5 shadow-sm transition-shadow hover:shadow-md`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => openProduct(product.id)} className="text-left">
                      <p className={`text-xl font-black ${palette.accent}`}>{product.name}</p>
                      <p className={`mt-1 text-xs font-semibold ${palette.accent}`}>
                        {product.tags.length} etiqueta(s) · {activeDocs} activos · {pendingDocs} pendientes · {exhaustedDocs} agotados
                      </p>
                    </button>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${palette.chip}`}>
                      {totalDocs} albarán(es)
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openProduct(product.id)}
                      className={`rounded-xl border ${palette.border} bg-white px-3 py-2 text-xs font-bold ${palette.accent} hover:bg-white/80`}
                    >
                      Ver detalle
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProduct(product.id)}
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 size={14} />
                      Borrar
                    </button>
                  </div>

                  <div className={`mt-4 rounded-2xl border ${palette.softBorder} ${palette.soft} p-3 text-xs ${palette.accent}`}>
                    <div className="flex items-center gap-2">
                      <FileText size={14} />
                      <span className="font-bold">Última actualización</span>
                    </div>
                    <p className="mt-1 font-semibold">{formatDateTime(product.updatedAt)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedProduct && (() => {
        const palette = getProductPalette(selectedProduct.name || selectedProduct.id);
        const totalDocs = selectedProduct.tags.reduce((acc, tag) => acc + tag.documents.length, 0);
        const activeDocs = selectedProduct.tags.reduce(
          (acc, tag) => acc + tag.documents.filter((document) => isAlbaranActive(document)).length,
          0,
        );
        return (
          <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 md:pl-64">
            <div className={`w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[2rem] border ${palette.border} bg-white p-5 shadow-2xl`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className={`text-2xl font-black ${palette.accent}`}>{selectedProduct.name}</h3>
                  <p className={`text-sm font-semibold ${palette.accent}`}>
                    {selectedProduct.tags.length} etiqueta(s) · {totalDocs} albarán(es) · {selectedProduct.tags.reduce((acc, tag) => acc + tag.damageHistory.length, 0)} incidencias
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => deleteProduct(selectedProduct.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 size={15} />
                    Borrar producto
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProductId('')}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
                <section className={`rounded-[1.5rem] border ${palette.softBorder} ${palette.soft} p-4`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className={`text-lg font-black ${palette.accent}`}>Etiquetas asociadas</h4>
                      <p className={`text-xs font-semibold ${palette.accent}`}>Haz clic en una etiqueta para ver sus albaranes e incidencias.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateTag(true)}
                      className={`inline-flex items-center gap-2 rounded-xl border ${palette.border} bg-white px-3 py-2 text-sm font-bold ${palette.accent} hover:bg-white/80`}
                    >
                      <Plus size={15} />
                      Añadir etiqueta
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {selectedProduct.tags.map((tag) => {
                      const isSelected = tag.id === selectedTag?.id;
                      const tagActiveDocs = tag.documents.filter((document) => isAlbaranActive(document)).length;
                      const tagPendingDocs = tag.documents.filter((document) => getAlbaranStatus(document) === 'pending').length;
                      const tagExhaustedDocs = tag.documents.filter((document) => getAlbaranStatus(document) === 'exhausted').length;
                      const paletteIndex = getProductPalette(`${selectedProduct.name}-${tag.name}`);
                      return (
                        <div
                          key={tag.id}
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            isSelected ? `${paletteIndex.border} bg-white shadow-sm` : 'border-slate-200 bg-white/70 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button type="button" onClick={() => openTag(tag.id)} className="flex-1 text-left">
                              <p className={`text-sm font-black ${paletteIndex.accent}`}>{tag.name}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                {tag.documents.length} albarán(es) · {tag.damageHistory.length} incidencias
                              </p>
                              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                Activos {tagActiveDocs} · Pendientes {tagPendingDocs} · Agotados {tagExhaustedDocs}
                              </p>
                            </button>
                            <div className="flex flex-col items-end gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${paletteIndex.chip}`}>
                                {tagActiveDocs} activos
                              </span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTagId(tag.id);
                                    setTagName(tag.name);
                                    setEditingTagId(tag.id);
                                    setShowEditTag(true);
                                  }}
                                  className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-50"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteTag(selectedProduct.id, tag.id)}
                                  className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50"
                                >
                                  Borrar
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className={`rounded-[1.5rem] border ${palette.softBorder} ${palette.soft} p-4`}>
                  {selectedTag ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className={`text-lg font-black ${palette.accent}`}>Etiqueta actual · {selectedTag.name}</h4>
                          <p className={`text-xs font-semibold ${palette.accent}`}>Albaranes y daños guardados dentro de esta etiqueta.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={openDocumentModal}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700"
                          >
                            <Upload size={15} />
                            Añadir albarán
                          </button>
                          <button
                            type="button"
                            onClick={openDamageModal}
                            className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100"
                          >
                            <ShieldAlert size={15} />
                            Añadir dañado
                          </button>
                          <button
                            type="button"
                            onClick={downloadDamageHistoryPdf}
                            className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800 hover:bg-cyan-100"
                          >
                            <Download size={15} />
                            Descargar PDF
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
                        <section className={`rounded-[1.5rem] border ${palette.softBorder} bg-white p-4`}>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h5 className={`text-lg font-black ${palette.accent}`}>Albaranes asociados</h5>
                              <p className={`text-xs font-semibold ${palette.accent}`}>PDFs y fotos guardados para esta etiqueta.</p>
                            </div>
                          </div>

                          {selectedTag.documents.length === 0 ? (
                            <div className={`mt-4 rounded-2xl border border-dashed ${palette.border} bg-white p-5 text-center text-sm font-semibold ${palette.accent}`}>
                              Todavía no hay albaranes cargados.
                            </div>
                          ) : (
                            <div className="mt-4 space-y-2">
                              {selectedTag.documents.map((doc) => {
                                const primaryAttachment = getDocumentPrimaryAttachment(doc);
                                const attachments = getDocumentAttachments(doc);
                                return (
                                  <div key={doc.id} className={`rounded-2xl border ${palette.softBorder} bg-white p-4`}>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                                        <p className={`truncate text-sm font-black ${palette.accent}`}>
                                          {getDocumentTitle(doc)}
                                        </p>
                                        <p className={`mt-1 text-xs font-semibold ${palette.accent}`}>
                                          {getFileKind(primaryAttachment || attachments[0] || { name: '', url: '', type: '', size: 0 })} · {doc.createdBy} · {formatDateTime(doc.createdAt)}
                                        </p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                          <span
                                            className={`rounded-full px-2 py-1 text-[11px] font-black ${
                                              getAlbaranStatus(doc) === 'active'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : getAlbaranStatus(doc) === 'pending'
                                                  ? 'bg-sky-100 text-sky-700'
                                                  : 'bg-rose-100 text-rose-700'
                                            }`}
                                          >
                                            {getAlbaranStatus(doc) === 'active'
                                              ? 'ACTIVO'
                                              : getAlbaranStatus(doc) === 'pending'
                                                ? 'PENDIENTE'
                                                : 'AGOTADO'}
                                          </span>
                                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">
                                            {attachments.length} adjunto(s)
                                          </span>
                                          {doc.note && (
                                            <button
                                              type="button"
                                              onClick={() => openNoteModal(doc)}
                                              className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100"
                                            >
                                              <FileText size={11} />
                                              Notas
                                            </button>
                                          )}
                                        </div>
                                        <div className="mt-2 grid gap-1 text-[11px] font-semibold text-slate-500 sm:grid-cols-4">
                                          <span className="rounded-lg bg-slate-50 px-2 py-1">
                                            Ingreso: {formatDateTime(doc.createdAt)}
                                          </span>
                                          <span className="rounded-lg bg-slate-50 px-2 py-1">
                                            Activación: {doc.activeAt ? formatDateTime(doc.activeAt) : 'Pendiente'}
                                          </span>
                                          <span className="rounded-lg bg-slate-50 px-2 py-1">
                                            Agotado: {doc.exhaustedAt ? formatDateTime(doc.exhaustedAt) : '—'}
                                          </span>
                                          <span className="rounded-lg bg-slate-50 px-2 py-1">
                                            Editado: {doc.updatedAt ? formatDateTime(doc.updatedAt) : '—'}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => openEditDocumentModal(doc)}
                                          className={`inline-flex items-center gap-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50`}
                                        >
                                          Editar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => toggleDocumentStatus(selectedProduct.id, doc.id)}
                                          className={`inline-flex items-center gap-1 rounded-xl border ${palette.border} bg-white px-3 py-2 text-xs font-bold ${palette.accent} hover:bg-white/80`}
                                        >
                                          {getAlbaranStatus(doc) === 'active' ? 'Agotar' : 'Activar'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteDocument(selectedProduct.id, doc.id)}
                                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                                        >
                                          <Trash2 size={13} />
                                          Borrar
                                        </button>
                                      </div>
                                    </div>

                                    {attachments.length > 0 && (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {attachments.map((attachment, idx) => (
                                          <button
                                            type="button"
                                            key={`${doc.id}-${attachment.url}-${idx}`}
                                            onClick={() => openAttachment(attachment.url)}
                                            className={`inline-flex items-center gap-2 rounded-xl border ${palette.border} ${palette.soft} px-3 py-2 text-xs font-bold ${palette.accent} hover:opacity-90`}
                                          >
                                            {attachment.type.startsWith('image/') ? <ImageIcon size={13} /> : <FileText size={13} />}
                                            {attachment.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>

                        <section className="rounded-[1.5rem] border border-amber-100 bg-amber-50/40 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h5 className="text-lg font-black text-amber-950">Historial de dañados</h5>
                              <p className="text-xs font-semibold text-amber-700">Cantidad, comentario, adjuntos y origen/envío de cada incidencia.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800">
                                Origen: {selectedTag.damageHistory.filter((entry) => entry.kind !== 'envio').length}
                              </span>
                              <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[11px] font-black text-cyan-800">
                                Envío: {selectedTag.damageHistory.filter((entry) => entry.kind === 'envio').length}
                              </span>
                            </div>
                          </div>

                          {selectedTag.damageHistory.length === 0 ? (
                            <div className="mt-4 rounded-2xl border border-dashed border-amber-200 bg-white p-5 text-center text-sm font-semibold text-amber-800">
                              No hay incidencias registradas.
                            </div>
                          ) : (
                            <div className="mt-4 space-y-3">
                              {(['origen', 'envio'] as const).map((kind) => {
                                const entries = selectedTag.damageHistory.filter((entry) => (entry.kind || 'origen') === kind);
                                if (entries.length === 0) return null;
                                return (
                                  <div key={kind} className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <h6 className={`text-sm font-black ${kind === 'envio' ? 'text-cyan-900' : 'text-amber-900'}`}>
                                        {getDamageKindLabel(kind)}
                                      </h6>
                                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${getDamageKindTone(kind)}`}>
                                        {entries.length} registro(s)
                                      </span>
                                    </div>
                                    <div className="space-y-2">
                                      {entries.map((entry) => (
                                        <details key={entry.id} className="rounded-2xl border border-amber-100 bg-white p-3">
                                <summary className="flex list-none cursor-pointer items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-black text-amber-950">
                                      {entry.quantity} uds · {entry.createdBy}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-amber-700">{formatDateTime(entry.createdAt)}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`rounded-full border px-2 py-1 text-[11px] font-black ${getDamageKindTone(entry.kind || 'origen')}`}>
                                      {getDamageKindLabel(entry.kind || 'origen')}
                                    </span>
                                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800">
                                      {entry.attachments.length} adjunto(s)
                                    </span>
                                  </div>
                                </summary>
                                <div className="mt-3 space-y-3 border-t border-amber-100 pt-3">
                                  {entry.comment && <p className="text-sm text-slate-700">{entry.comment}</p>}
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openEditDamageModal(entry)}
                                      className="inline-flex items-center gap-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteDamageEntry(selectedProduct.id, entry.id)}
                                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                                    >
                                      <Trash2 size={13} />
                                      Borrar
                                    </button>
                                  </div>
                                  {entry.attachments.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {entry.attachments.map((attachment, idx) => (
                                        <button
                                          type="button"
                                          key={`${entry.id}-${idx}`}
                                          onClick={() => openAttachment(attachment.url)}
                                          className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                                        >
                                          {attachment.type.startsWith('image/') ? <ImageIcon size={13} /> : <FileText size={13} />}
                                          {attachment.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </details>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm font-semibold text-slate-600">
                      Crea o selecciona una etiqueta para ver sus albaranes e incidencias.
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        );
      })()}

      {showCreateProduct && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/60 p-3 md:pl-64">
          <div className="w-full max-w-lg rounded-[2rem] border border-violet-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-violet-950">Nuevo producto</h3>
              <button
                type="button"
                onClick={() => setShowCreateProduct(false)}
                className="rounded-lg p-1.5 text-violet-700 hover:bg-violet-50"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-black uppercase tracking-wide text-violet-700">
                Nombre del producto
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Solar Vital, Enterovital, Cartonaje..."
                  className="mt-1 w-full rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm font-semibold text-violet-900 outline-none placeholder:text-violet-400"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateProduct(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createProduct}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700"
                >
                  Crear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateTag && selectedProduct && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/60 p-3 md:pl-64">
          <div className="w-full max-w-lg rounded-[2rem] border border-violet-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-violet-950">Nueva etiqueta · {selectedProduct.name}</h3>
              <button
                type="button"
                onClick={() => setShowCreateTag(false)}
                className="rounded-lg p-1.5 text-violet-700 hover:bg-violet-50"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-black uppercase tracking-wide text-violet-700">
                Nombre de la etiqueta
                <input
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder="Viales, cartonaje, pegatinas..."
                  className="mt-1 w-full rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm font-semibold text-violet-900 outline-none placeholder:text-violet-400"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTag(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createTag}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700"
                >
                  Crear etiqueta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditTag && selectedProduct && selectedTag && editingTagId === selectedTag.id && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/60 p-3 md:pl-64">
          <div className="w-full max-w-lg rounded-[2rem] border border-sky-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-sky-950">Editar etiqueta · {selectedTag.name}</h3>
              <button
                type="button"
                onClick={() => {
                  setShowEditTag(false);
                  setEditingTagId('');
                  setTagName('');
                }}
                className="rounded-lg p-1.5 text-sky-700 hover:bg-sky-50"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-black uppercase tracking-wide text-sky-700">
                Nombre de la etiqueta
                <input
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder="Viales, cartonaje, pegatinas..."
                  className="mt-1 w-full rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm font-semibold text-sky-900 outline-none placeholder:text-sky-400"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditTag(false);
                    setEditingTagId('');
                    setTagName('');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveTagName}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700"
                >
                  Guardar cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDocumentModal && selectedProduct && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/60 p-3 md:pl-64">
          <div className="w-full max-w-2xl rounded-[2rem] border border-violet-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-violet-950">
                {editingDocumentId ? 'Editar albarán' : 'Añadir albarán'} · {selectedProduct.name}{selectedTag ? ` · ${selectedTag.name}` : ''}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowDocumentModal(false);
                  setEditingDocumentId('');
                }}
                className="rounded-lg p-1.5 text-violet-700 hover:bg-violet-50"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <label className="block text-xs font-black uppercase tracking-wide text-violet-700">
                Título del albarán
                <input
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Lote 2511A20, factura 003355..."
                  className="mt-1 w-full rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm font-semibold text-violet-900 outline-none placeholder:text-violet-400"
                />
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-violet-700">
                Nota opcional
                <textarea
                  value={docNote}
                  onChange={(e) => setDocNote(e.target.value)}
                  placeholder="Lote, observaciones, proveedor, etc."
                  rows={4}
                  className="mt-1 w-full rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm font-semibold text-violet-900 outline-none placeholder:text-violet-400"
                />
              </label>
              <label className="flex items-center gap-3 rounded-[1.25rem] border border-violet-100 bg-violet-50/40 px-4 py-3 text-sm font-bold text-violet-900">
                <input
                  type="checkbox"
                  checked={docActive}
                  onChange={(e) => setDocActive(e.target.checked)}
                  className="h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                />
                Marcar como activo al subir
              </label>
              <div className="rounded-[1.5rem] border border-violet-100 bg-violet-50/50 p-4">
                <FileUploader
                  key={`document-uploader-${editingDocumentId || 'new'}`}
                  bucketName="attachments"
                  folderPath="albaranes"
                  onUploadComplete={setDocFiles}
                  existingFiles={docFiles}
                  acceptedTypes="image/*,.pdf"
                  compact
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDocumentModal(false);
                    setEditingDocumentId('');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveDocuments}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700"
                >
                  {editingDocumentId ? 'Guardar cambios' : 'Guardar albaranes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDamageModal && selectedProduct && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/60 p-3 md:pl-64">
          <div className="w-full max-w-2xl rounded-[2rem] border border-amber-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-amber-950">
                {editingDamageId ? 'Editar dañado' : 'Añadir dañado'} · {selectedProduct.name}{selectedTag ? ` · ${selectedTag.name}` : ''}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowDamageModal(false);
                  setEditingDamageId('');
                }}
                className="rounded-lg p-1.5 text-amber-800 hover:bg-amber-50"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-black uppercase tracking-wide text-amber-700">
                  Cantidad
                  <input
                    type="number"
                    min="1"
                    value={damageQty}
                    onChange={(e) => setDamageQty(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm font-semibold text-amber-950 outline-none"
                    placeholder="0"
                  />
                </label>
                <label className="block text-xs font-black uppercase tracking-wide text-amber-700">
                  Comentario
                  <textarea
                    value={damageComment}
                    onChange={(e) => setDamageComment(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm font-semibold text-amber-950 outline-none placeholder:text-amber-400"
                    placeholder="Se cayó, vino roto, contaminación..."
                  />
                </label>
                <label className="block text-xs font-black uppercase tracking-wide text-amber-700">
                  Tipo
                  <select
                    value={damageKind}
                    onChange={(e) => setDamageKind((e.target.value === 'envio' ? 'envio' : 'origen') as AlbaranDamageKind)}
                    className="mt-1 w-full rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm font-semibold text-amber-950 outline-none"
                  >
                    <option value="origen">Origen</option>
                    <option value="envio">Envío</option>
                  </select>
                </label>
              </div>
              <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/50 p-4">
                <FileUploader
                  key={`damage-uploader-${editingDamageId || 'new'}`}
                  bucketName="attachments"
                  folderPath="albaranes_damaged"
                  onUploadComplete={setDamageFiles}
                  existingFiles={damageFiles}
                  acceptedTypes="image/*,.pdf"
                  compact
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDamageModal(false);
                    setEditingDamageId('');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveDamage}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 inline-flex items-center gap-2"
                >
                  <AlertTriangle size={15} />
                  {editingDamageId ? 'Guardar cambios' : 'Guardar daño'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNoteModal && selectedNote && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/60 p-3 md:pl-64">
          <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-slate-950">Notas del albarán</h3>
                <p className="text-sm font-semibold text-slate-500">{selectedNote.title}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNoteModal(false);
                  setSelectedNote(null);
                }}
                className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedNote.note}</p>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowNoteModal(false);
                  setSelectedNote(null);
                }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, tone }: { title: string; value: number; tone: 'violet' | 'emerald' | 'sky' | 'amber' }) {
  const toneClasses = {
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <div className={`rounded-3xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-black uppercase tracking-wide">{title}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </div>
  );
}
