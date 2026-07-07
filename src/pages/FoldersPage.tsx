import React, { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CARLOS_EMAIL, DRIVE_FOLDERS } from '../constants';
import { Download, ExternalLink, FileSpreadsheet, FileText, Folder, Printer, Trash2 } from 'lucide-react';
import { useSharedJsonState } from '../hooks/useSharedJsonState';
import { supabase } from '../lib/supabase';
import {
    INVENTORY_MONTHLY_CLOSURES_KEY,
    monthlyCloseRowsForExport,
    type InventoryMonthlyCloseSnapshot,
} from '../utils/inventoryMonthlyClose';
import { openTableXlsx } from '../utils/tableExport';

const FACTURACION_ARCHIVE_KEY = 'facturacion_archive_v1';
const FACTURACION_FILE_BLOB_PREFIX = 'facturacion_file_blob_v1:';
const FACTURACION_ARCHIVE_BACKUP_KEY = `shared_json_state_backup_non_empty:${FACTURACION_ARCHIVE_KEY}`;
const OPERATIONAL_CONTROL_KEY = 'operational_control_monthly_v2';

type ArchiveOrderLine = {
    quantity: number;
    productCode: string;
    productRaw: string;
    lote?: string;
    lotePending?: boolean;
};

type ArchiveOrder = {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    customerName: string;
    sourceFileName: string;
    sourcePdfRef?: string;
    sourcePdfDataUrl?: string;
    status?: string;
    requiredPackages?: number;
    labels?: Array<unknown>;
    movementType?: string;
    lastChangedAt?: string;
    lines: ArchiveOrderLine[];
};

type BillingArchiveEntry = {
    dateKey: string;
    archivedAt: string;
    orders: ArchiveOrder[];
    totalOrders: number;
    totalLines: number;
    totalQuantity: number;
};

type OperationalStatusKey = 'pendiente' | 'correcto' | 'revision' | 'critica';

type OperationalAttachment = {
    name: string;
    url: string;
};

type OperationalProcessRecord = {
    id: string;
    process: string;
    year: number;
    month: number;
    status: OperationalStatusKey;
    reviewed: boolean;
    fields: Record<string, string>;
    checklist: Record<string, boolean>;
    attachments: Record<string, OperationalAttachment[]>;
    participantProgress?: Record<string, {
        label: string;
        savedAt?: string;
        savedByName?: string;
        reviewedAt?: string;
        reviewedByName?: string;
    }>;
    updatedAt: string;
    updatedByName: string;
};

type OperationalMonthArchive = {
    id: string;
    year: number;
    month: number;
    monthLabel: string;
    closedAt: string;
    closedByName: string;
    records: OperationalProcessRecord[];
    statusCounts: Record<OperationalStatusKey, number>;
    missingAttachments: number;
    openIncidentCount: number;
};

type OperationalMonthlyState = {
    operationalClosures?: OperationalMonthArchive[];
};

function calcArchiveTotals(orders: ArchiveOrder[]) {
    const safeOrders = Array.isArray(orders) ? orders : [];
    const totalLines = safeOrders.reduce((acc, order) => acc + ((order.lines || []).length || 0), 0);
    const totalQuantity = safeOrders.reduce(
        (acc, order) =>
            acc +
            (order.lines || []).reduce((lineAcc, line) => lineAcc + (Number(line?.quantity) || 0), 0),
        0,
    );
    return {
        totalOrders: safeOrders.length,
        totalLines,
        totalQuantity,
    };
}

function pickBestOrder(prev: ArchiveOrder, next: ArchiveOrder) {
    const prevScore =
        (clean(prev.sourcePdfRef) ? 4 : 0) +
        (clean(prev.sourcePdfDataUrl) ? 2 : 0) +
        ((prev.lines || []).length > 0 ? 1 : 0);
    const nextScore =
        (clean(next.sourcePdfRef) ? 4 : 0) +
        (clean(next.sourcePdfDataUrl) ? 2 : 0) +
        ((next.lines || []).length > 0 ? 1 : 0);
    return nextScore >= prevScore ? { ...prev, ...next } : { ...next, ...prev };
}

function mergeArchiveEntries(base: BillingArchiveEntry[], incoming: BillingArchiveEntry[]) {
    const byDay = new Map<string, BillingArchiveEntry>();

    const upsertDay = (day: BillingArchiveEntry) => {
        const key = clean(day?.dateKey);
        if (!key) return;
        const current = byDay.get(key);
        if (!current) {
            const safeOrders = Array.isArray(day.orders) ? day.orders : [];
            const totals = calcArchiveTotals(safeOrders);
            byDay.set(key, {
                ...day,
                dateKey: key,
                orders: safeOrders,
                ...totals,
            });
            return;
        }
        const orderMap = new Map<string, ArchiveOrder>();
        for (const order of current.orders || []) {
            const id = clean(order?.id);
            if (!id) continue;
            orderMap.set(id, order);
        }
        for (const order of day.orders || []) {
            const id = clean(order?.id);
            if (!id) continue;
            const prev = orderMap.get(id);
            orderMap.set(id, prev ? pickBestOrder(prev, order) : order);
        }
        const mergedOrders = Array.from(orderMap.values()).sort((a, b) => {
            const aDate = new Date(String(a.invoiceDate || '')).getTime();
            const bDate = new Date(String(b.invoiceDate || '')).getTime();
            if (Number.isFinite(aDate) && Number.isFinite(bDate) && aDate !== bDate) return bDate - aDate;
            return clean(a.invoiceNumber).localeCompare(clean(b.invoiceNumber));
        });
        const totals = calcArchiveTotals(mergedOrders);
        byDay.set(key, {
            ...current,
            ...day,
            dateKey: key,
            archivedAt: clean(day.archivedAt) || clean(current.archivedAt) || new Date().toISOString(),
            orders: mergedOrders,
            ...totals,
        });
    };

    (Array.isArray(base) ? base : []).forEach(upsertDay);
    (Array.isArray(incoming) ? incoming : []).forEach(upsertDay);

    return Array.from(byDay.values()).sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
}

function formatDate(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-ES');
}

function formatMonthKey(monthKey: string) {
    const [year, month] = clean(monthKey).split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return clean(monthKey) || '-';
    return new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

const OPERATIONAL_PROCESS_LABELS: Record<string, string> = {
    entradas_canet: 'Entradas Canet',
    traspasos_huarte: 'Traspasos Huarte',
    ensamblajes: 'Ensamblajes',
    inventario_stock: 'Inventario / Stock',
    ventas_salidas: 'Ventas / Salidas',
    contabilidad: 'Contabilidad',
    sistemas_analytics: 'Sistemas / Analytics',
    estado_almacen: 'Estado de almacén',
    cierre_comun: 'Cierre común',
};

const OPERATIONAL_STATUS_LABELS: Record<OperationalStatusKey, string> = {
    correcto: 'Completado',
    revision: 'En revisión',
    critica: 'Incidencia',
    pendiente: 'Pendiente',
};

function isRealDispatchedOrder(order: ArchiveOrder) {
    return clean(order.status).toUpperCase() === 'DESPACHADO';
}

function dispatchArchiveReason(order: ArchiveOrder) {
    const status = clean(order.status).toUpperCase();
    if (status === 'DESPACHADO') return 'Despachado real: movimientos creados.';
    const missingLots = (order.lines || []).filter((line) => line.lotePending || !clean(line.lote)).length;
    if (status === 'PENDIENTE_MANUAL' || missingLots > 0) {
        return `Pendiente manual: faltan ${missingLots || 1} lote(s).`;
    }
    const required = Number(order.requiredPackages) || 0;
    const attached = Array.isArray(order.labels) ? order.labels.length : 0;
    if (status === 'PENDIENTE_BULTOS') {
        return required > 0
            ? `Pendiente etiquetas/bultos (${attached}/${required}).`
            : 'Pendiente definir bultos/etiquetas.';
    }
    if (status === 'EN_PREPARACION') return 'En preparación: no se completó el despacho o hubo despacho parcial.';
    if (status === 'CANCELADO') return 'Cancelado.';
    return status ? `No consta como despachado real (${status}).` : 'Snapshot diario: no consta como despachado real.';
}

const appendTotalRow = (headers: string[], rows: Array<Array<string | number>>) => [
    ...rows,
    Array.from({ length: Math.max(headers.length, 1) }, (_, idx) => {
        if (idx === 0) return 'TOTAL';
        if (idx === headers.length - 1) return rows.reduce((acc, row) => acc + (Number(row[idx]) || 0), 0);
        return '';
    }),
];

function clean(value: unknown) {
    return String(value ?? '').trim();
}

function buildFileBlobKey(ref: string) {
    return `${FACTURACION_FILE_BLOB_PREFIX}${clean(ref)}`;
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

/**
 * Folders page
 * Shows shared Google Drive folders
 */
function FoldersPage() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const isRestrictedUser = !!currentUser?.isRestricted || (currentUser?.email || '').toLowerCase() === CARLOS_EMAIL;
    const [facturacionArchive, setFacturacionArchive, archiveLoading] = useSharedJsonState<BillingArchiveEntry[]>(
        FACTURACION_ARCHIVE_KEY,
        [],
        {
            userId: currentUser?.id,
            initializeIfMissing: true,
            pollIntervalMs: 8000,
            protectFromEmptyOverwrite: true,
        },
    );
    const [monthlyClosures, , monthlyClosuresLoading] = useSharedJsonState<InventoryMonthlyCloseSnapshot[]>(
        INVENTORY_MONTHLY_CLOSURES_KEY,
        [],
        {
            userId: currentUser?.id,
            initializeIfMissing: true,
            pollIntervalMs: 8000,
            protectFromEmptyOverwrite: true,
        },
    );
    const [operationalControlState, , operationalClosuresLoading] = useSharedJsonState<OperationalMonthlyState>(
        OPERATIONAL_CONTROL_KEY,
        {},
        {
            userId: currentUser?.id,
            initializeIfMissing: true,
            pollIntervalMs: 8000,
            protectFromEmptyOverwrite: true,
        },
    );
    const pdfBlobCacheRef = useRef<Map<string, string>>(new Map());
    const archiveRecoveryTriedRef = useRef(false);

    const resolvePdfDataUrl = useCallback(async (sourcePdfRef?: string, fallbackDataUrl?: string) => {
        const fallback = clean(fallbackDataUrl);
        if (fallback) return fallback;
        const ref = clean(sourcePdfRef);
        if (!ref) return '';
        const cached = pdfBlobCacheRef.current.get(ref);
        if (cached) return cached;
        try {
            const { data, error } = await supabase
                .from('shared_json_state')
                .select('payload')
                .eq('key', buildFileBlobKey(ref))
                .maybeSingle();
            if (error) return '';
            const url = clean((data as any)?.payload?.dataUrl);
            if (url) {
                pdfBlobCacheRef.current.set(ref, url);
            }
            return url;
        } catch {
            return '';
        }
    }, []);

    useEffect(() => {
        if (archiveRecoveryTriedRef.current) return;
        archiveRecoveryTriedRef.current = true;
        void (async () => {
            try {
                const { data, error } = await supabase
                    .from('shared_json_state')
                    .select('payload')
                    .eq('key', FACTURACION_ARCHIVE_BACKUP_KEY)
                    .maybeSingle();
                if (error) return;
                const backup = (data?.payload || []) as BillingArchiveEntry[];
                if (!Array.isArray(backup) || backup.length === 0) return;
                const current = Array.isArray(facturacionArchive) ? facturacionArchive : [];
                const merged = mergeArchiveEntries(current, backup);
                const hasMoreDays = merged.length > current.length;
                const currentOrders = current.reduce((acc, day) => acc + ((day.orders || []).length || 0), 0);
                const mergedOrders = merged.reduce((acc, day) => acc + ((day.orders || []).length || 0), 0);
                if (hasMoreDays || mergedOrders > currentOrders) {
                    setFacturacionArchive(merged);
                }
            } catch {
                // noop
            }
        })();
    }, [facturacionArchive, setFacturacionArchive]);

    // Filter folders for current user
    const foldersForUser = isRestrictedUser
        ? DRIVE_FOLDERS.filter((f) => f.id === 'protocolos')
        : DRIVE_FOLDERS.filter((f) => f.users.includes(currentUser?.id));

    const openPdf = async (sourcePdfRef?: string, sourcePdfDataUrl?: string) => {
        const dataUrl = await resolvePdfDataUrl(sourcePdfRef, sourcePdfDataUrl);
        if (!dataUrl) {
            alert('Este pedido no tiene PDF adjunto.');
            return;
        }
        const { url, revoke } = buildPdfOpenUrl(dataUrl);
        if (!url) {
            alert('No se pudo construir el enlace del PDF.');
            return;
        }
        const win = window.open(url, '_blank');
        if (revoke) window.setTimeout(revoke, 120000);
        if (win) return;
        try {
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch {
            try {
                window.location.href = url;
            } catch {
                alert('No se pudo abrir el PDF. Revisa el bloqueador de ventanas emergentes.');
            }
        }
    };

    const printPdf = async (sourcePdfRef?: string, sourcePdfDataUrl?: string) => {
        const dataUrl = await resolvePdfDataUrl(sourcePdfRef, sourcePdfDataUrl);
        if (!dataUrl) {
            alert('Este pedido no tiene PDF adjunto.');
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

    const deleteArchivedInvoice = (dateKey: string, orderId: string) => {
        const safeDateKey = dateKey.trim();
        const safeOrderId = orderId.trim();
        if (!safeDateKey || !safeOrderId) return;
        if (!window.confirm('¿Eliminar este despacho del historial interno?')) return;

        setFacturacionArchive((prev) => {
            const current = Array.isArray(prev) ? prev : [];
            return current
                .map((day) => {
                    if (day.dateKey !== safeDateKey) return day;
                    const nextOrders = (day.orders || []).filter((order) => order.id !== safeOrderId);
                    const totalLines = nextOrders.reduce((acc, order) => acc + (order.lines?.length || 0), 0);
                    const totalQuantity = nextOrders.reduce(
                        (acc, order) => acc + (order.lines || []).reduce((lineAcc, line) => lineAcc + (Number(line.quantity) || 0), 0),
                        0,
                    );
                    return {
                        ...day,
                        orders: nextOrders,
                        totalOrders: nextOrders.length,
                        totalLines,
                        totalQuantity,
                    };
                })
                .filter((day) => (day.orders || []).length > 0);
        });
    };

    const renderArchiveOrderCard = (day: BillingArchiveEntry, order: ArchiveOrder, isRealDispatch: boolean) => (
        <div key={`${day.dateKey}-${order.id}`} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-gray-900">
                            Factura {order.invoiceNumber} · {order.customerName || 'Cliente sin detectar'}
                        </p>
                        <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                                isRealDispatch
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-800'
                            }`}
                        >
                            {isRealDispatch ? 'Despacho real' : 'Archivo diario'}
                        </span>
                    </div>
                    <p className="text-xs font-semibold text-gray-500">
                        Factura: {formatDate(order.invoiceDate)}
                        {isRealDispatch && order.lastChangedAt ? ` · Despacho: ${formatDate(order.lastChangedAt)}` : ''}
                        {' · '}
                        {order.sourceFileName}
                    </p>
                    {!isRealDispatch && (
                        <p className="mt-1 text-xs font-black text-amber-800">{dispatchArchiveReason(order)}</p>
                    )}
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => void openPdf(order.sourcePdfRef, order.sourcePdfDataUrl)}
                        className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-white px-2 py-1 text-xs font-black text-primary hover:bg-primary/5"
                    >
                        <FileText size={12} /> Abrir
                    </button>
                    <button
                        type="button"
                        onClick={() => void printPdf(order.sourcePdfRef, order.sourcePdfDataUrl)}
                        className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-white px-2 py-1 text-xs font-black text-primary hover:bg-primary/5"
                    >
                        <Printer size={12} /> Imprimir
                    </button>
                    <button
                        type="button"
                        onClick={() => deleteArchivedInvoice(day.dateKey, order.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-black text-rose-700 hover:bg-rose-50"
                        title="Eliminar factura de este día"
                    >
                        <Trash2 size={12} /> Eliminar
                    </button>
                </div>
            </div>

            <div className="mt-2 text-xs font-semibold text-gray-600">
                {(order.lines || [])
                    .map((line) => `${line.productCode || line.productRaw}: ${line.quantity}${clean(line.lote) ? ` · lote ${clean(line.lote)}` : ''}`)
                    .join(' · ')}
            </div>
        </div>
    );

    const sortedMonthlyClosures = (Array.isArray(monthlyClosures) ? monthlyClosures : [])
        .filter((snapshot) => !snapshot.deletedAt)
        .sort((a, b) => clean(b.monthKey).localeCompare(clean(a.monthKey)) || clean(a.scope).localeCompare(clean(b.scope)));

    const sortedOperationalClosures = (Array.isArray(operationalControlState?.operationalClosures)
        ? operationalControlState.operationalClosures
        : [])
        .slice()
        .sort((a, b) => (a.year === b.year ? b.month - a.month : b.year - a.year));

    const downloadMonthlyClose = (snapshot: InventoryMonthlyCloseSnapshot) => {
        const scopeLabel = snapshot.scope === 'huarte' ? 'Huarte' : 'Canet';
        openTableXlsx({
            title: `Inventario ${scopeLabel} - Cierre de mes`,
            subtitle: `Foto congelada · Cierre: ${snapshot.monthLabel || formatMonthKey(snapshot.monthKey)} · Guardado: ${formatDate(snapshot.closedAt)} · Responsable: ${snapshot.closedBy || '-'}`,
            fileName: `cierre-mes-${snapshot.scope}-${snapshot.monthKey}.xlsx`,
            headers: ['Producto', 'Lote', 'Bodega', 'Stock cierre'],
            rows: appendTotalRow(['Producto', 'Lote', 'Bodega', 'Stock cierre'], monthlyCloseRowsForExport(snapshot)),
            summaryRows: [
                ['Stock cierre', snapshot.totalStock],
                ['Productos', snapshot.productCount],
                ['Lotes', snapshot.lotCount],
                ['Bodegas', snapshot.warehouseCount],
                ['Filas snapshot', snapshot.rowCount ?? snapshot.rows.length],
                ['Huella snapshot', snapshot.snapshotHash || 'legacy'],
            ],
        });
    };

    const downloadOperationalClose = (snapshot: OperationalMonthArchive) => {
        const headers = [
            'Sección',
            'Estado',
            'Última edición',
            'Completó',
            'Responsables guardaron',
            'Responsables revisaron',
            'Adjuntos',
            'Observaciones',
        ];
        const rows = (snapshot.records || []).map((record) => {
            const progress = Object.values(record.participantProgress || {});
            const saved = progress
                .filter((item) => item.savedAt)
                .map((item) => `${item.label} (${formatDate(item.savedAt || '')})`)
                .join(' · ');
            const reviewed = progress
                .filter((item) => item.reviewedAt)
                .map((item) => `${item.label} (${formatDate(item.reviewedAt || '')})`)
                .join(' · ');
            const attachments = Object.entries(record.attachments || {})
                .filter(([, files]) => Array.isArray(files) && files.length > 0)
                .map(([label, files]) => `${label}: ${files.map((file) => file.name).join(', ')}`)
                .join(' | ');
            return [
                OPERATIONAL_PROCESS_LABELS[record.process] || record.process,
                OPERATIONAL_STATUS_LABELS[record.status] || record.status,
                formatDate(record.updatedAt),
                record.updatedByName || '-',
                saved || '-',
                reviewed || '-',
                attachments || '-',
                record.fields?.observaciones || '-',
            ];
        });
        openTableXlsx({
            title: 'Cierre operativo mensual Solaris',
            subtitle: `${snapshot.monthLabel} ${snapshot.year} · Cerrado: ${formatDate(snapshot.closedAt)} · Responsable: ${snapshot.closedByName || '-'}`,
            fileName: `cierre-operativo-${snapshot.year}-${String(snapshot.month).padStart(2, '0')}.xlsx`,
            headers,
            rows,
            summaryRows: [
                ['Completado', snapshot.statusCounts?.correcto || 0],
                ['En revisión', snapshot.statusCounts?.revision || 0],
                ['Incidencias', snapshot.statusCounts?.critica || 0],
                ['Pendiente', snapshot.statusCounts?.pendiente || 0],
                ['Adjuntos pendientes', snapshot.missingAttachments || 0],
                ['Incidencias abiertas', snapshot.openIncidentCount || 0],
            ],
        });
    };

    return (
        <div className="max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-primary">
                        <Folder size={32} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                            Carpetas Compartidas
                        </h1>
                        <p className="text-gray-500 font-medium">
                            Acceso directo a la documentación y recursos del equipo
                        </p>
                    </div>
                </div>
            </div>

            {/* Folders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {foldersForUser.map((folder) => {
                    const isInternalAlbaranes = folder.id === 'conteo';
                    return (
                        <div
                            key={folder.id}
                            className="group relative bg-white rounded-3xl border-2 border-gray-100 shadow-lg overflow-hidden hover:border-primary/30 hover:shadow-xl transition-all duration-200 flex flex-col"
                        >
                            <div className="p-6 flex-1 flex flex-col items-center text-center">
                                <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                                    <span className="text-3xl">{folder.emoji}</span>
                                </div>

                                <h3 className="text-xl font-bold text-gray-900 mb-2">
                                    {folder.label}
                                </h3>

                                <p className="text-gray-500 text-sm leading-relaxed mb-6 font-medium">
                                    {folder.description}
                                </p>

                                {isInternalAlbaranes ? (
                                    <button
                                        type="button"
                                        onClick={() => navigate('/albaranes')}
                                        className="mt-auto flex items-center gap-2 text-sm font-bold text-primary bg-primary/10 px-4 py-2.5 rounded-xl group-hover:bg-primary group-hover:text-white transition-all"
                                    >
                                        Abrir módulo <FileText size={16} />
                                    </button>
                                ) : (
                                    <a
                                        href={folder.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-auto flex items-center gap-2 text-sm font-bold text-primary bg-primary/10 px-4 py-2.5 rounded-xl group-hover:bg-primary group-hover:text-white transition-all"
                                    >
                                        Abrir carpeta <ExternalLink size={16} />
                                    </a>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {!isRestrictedUser && (
                <div className="mt-8 space-y-4">
                    <details className="rounded-3xl border-2 border-gray-100 bg-white shadow-lg" open={false}>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-6">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900">Carpeta Despachos (interna)</h2>
                                    <p className="text-sm font-medium text-gray-500">
                                        Pedidos despachados archivados por fecha (cierre diario 21:00).
                                    </p>
                                </div>
                            </div>
                            <span className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-black text-gray-600">
                                Plegar / desplegar
                            </span>
                        </summary>

                        <div className="border-t border-gray-100 p-6 pt-4">
                            {archiveLoading ? (
                                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm font-semibold text-gray-500">
                                    Cargando historial de despachos...
                                </div>
                            ) : (!facturacionArchive || facturacionArchive.length === 0) ? (
                                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm font-semibold text-gray-500">
                                    Aún no hay días archivados de despachos.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {facturacionArchive
                                        .slice()
                                        .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
                                        .map((day) => (
                                            <details key={day.dateKey} className="rounded-2xl border border-gray-200 bg-white" open={false}>
                                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                                                    <div>
                                                        <p className="text-sm font-black text-gray-900">{formatDate(day.dateKey)}</p>
                                                        <p className="text-xs font-semibold text-gray-500">
                                                            {day.totalOrders} factura(s) · {day.totalLines} línea(s) · {day.totalQuantity.toLocaleString('es-ES')} uds
                                                        </p>
                                                    </div>
                                                    <span className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-black text-gray-600">
                                                        Ver despachos
                                                    </span>
                                                </summary>

                                                <div className="border-t border-gray-100 px-4 py-3">
                                                    {(() => {
                                                        const orders = Array.isArray(day.orders) ? day.orders : [];
                                                        const realDispatches = orders.filter(isRealDispatchedOrder);
                                                        const dailySnapshots = orders.filter((order) => !isRealDispatchedOrder(order));
                                                        return (
                                                            <div className="space-y-4">
                                                                <div className="space-y-2">
                                                                    <h4 className="text-xs font-black uppercase tracking-wide text-emerald-700">
                                                                        Despachos reales ({realDispatches.length})
                                                                    </h4>
                                                                    {realDispatches.length > 0 ? (
                                                                        realDispatches.map((order) => renderArchiveOrderCard(day, order, true))
                                                                    ) : (
                                                                        <div className="rounded-xl border border-dashed border-emerald-100 bg-emerald-50/40 p-3 text-xs font-semibold text-emerald-700">
                                                                            No hay pedidos marcados como despachados reales este día.
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className="space-y-2">
                                                                    <h4 className="text-xs font-black uppercase tracking-wide text-amber-700">
                                                                        Archivo diario / no despachado ({dailySnapshots.length})
                                                                    </h4>
                                                                    {dailySnapshots.length > 0 ? (
                                                                        dailySnapshots.map((order) => renderArchiveOrderCard(day, order, false))
                                                                    ) : (
                                                                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">
                                                                            Sin pedidos pendientes guardados como snapshot diario.
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </details>
                                        ))}
                                </div>
                            )}
                        </div>
                    </details>

                    <details className="rounded-3xl border-2 border-gray-100 bg-white shadow-lg" open={false}>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-6">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                                    <FileSpreadsheet size={20} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900">Carpeta Cierre de mes (interna)</h2>
                                    <p className="text-sm font-medium text-gray-500">
                                        Excels de cierre generados desde la foto congelada de Canet y Huarte.
                                    </p>
                                </div>
                            </div>
                            <span className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-black text-gray-600">
                                Plegar / desplegar
                            </span>
                        </summary>

                        <div className="space-y-6 border-t border-gray-100 p-6 pt-4">
                            <section>
                                <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-emerald-800">Cierres de stock congelado</h3>
                                {monthlyClosuresLoading ? (
                                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm font-semibold text-gray-500">
                                        Cargando cierres de mes...
                                    </div>
                                ) : sortedMonthlyClosures.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm font-semibold text-gray-500">
                                        Aún no hay cierres de stock guardados.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {sortedMonthlyClosures.map((snapshot) => {
                                            const scopeLabel = snapshot.scope === 'huarte' ? 'Huarte' : 'Canet';
                                            return (
                                                <div key={snapshot.id} className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <div>
                                                            <p className="text-sm font-black text-gray-900">
                                                                Cierre {scopeLabel} · {snapshot.monthLabel || formatMonthKey(snapshot.monthKey)}
                                                            </p>
                                                            <p className="text-xs font-semibold text-gray-500">
                                                                Guardado: {formatDate(snapshot.closedAt)} · {snapshot.totalStock.toLocaleString('es-ES')} uds · {(snapshot.rowCount ?? snapshot.rows.length).toLocaleString('es-ES')} filas
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => downloadMonthlyClose(snapshot)}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"
                                                        >
                                                            <Download size={13} /> Descargar Excel
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>

                            <section>
                                <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-800">Cierres operativos mensuales</h3>
                                {operationalClosuresLoading ? (
                                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm font-semibold text-gray-500">
                                        Cargando cierres operativos...
                                    </div>
                                ) : sortedOperationalClosures.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm font-semibold text-gray-500">
                                        Aún no hay cierres operativos guardados.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {sortedOperationalClosures.map((snapshot) => (
                                            <div key={snapshot.id} className="rounded-2xl border border-gray-200 bg-slate-50/60 p-4">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-black text-gray-900">
                                                            Cierre operativo · {snapshot.monthLabel} {snapshot.year}
                                                        </p>
                                                        <p className="text-xs font-semibold text-gray-500">
                                                            Cerrado: {formatDate(snapshot.closedAt)} · {snapshot.statusCounts?.correcto || 0} completadas · {snapshot.openIncidentCount || 0} incidencias · {snapshot.missingAttachments || 0} adjuntos pendientes
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => downloadOperationalClose(snapshot)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                                                    >
                                                        <Download size={13} /> Descargar resumen
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    </details>
                </div>
            )}

            {foldersForUser.length === 0 && (
                <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                    <Folder size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">No tienes carpetas compartidas asignadas.</p>
                </div>
            )}
        </div>
    );
}

export default FoldersPage;
