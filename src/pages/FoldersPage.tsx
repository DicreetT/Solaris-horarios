import React from 'react';
import { useAuth } from '../context/AuthContext';
import { CARLOS_EMAIL, DRIVE_FOLDERS } from '../constants';
import { Folder, ExternalLink, FileText, Printer, Trash2 } from 'lucide-react';
import { useSharedJsonState } from '../hooks/useSharedJsonState';

const FACTURACION_ARCHIVE_KEY = 'facturacion_archive_v1';

type ArchiveOrderLine = {
    quantity: number;
    productCode: string;
    productRaw: string;
};

type ArchiveOrder = {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    customerName: string;
    sourceFileName: string;
    sourcePdfDataUrl?: string;
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

function formatDate(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-ES');
}

function clean(value: unknown) {
    return String(value ?? '').trim();
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
    const isRestrictedUser = !!currentUser?.isRestricted || (currentUser?.email || '').toLowerCase() === CARLOS_EMAIL;
    const [facturacionArchive, setFacturacionArchive] = useSharedJsonState<BillingArchiveEntry[]>(
        FACTURACION_ARCHIVE_KEY,
        [],
        { userId: currentUser?.id, initializeIfMissing: true, pollIntervalMs: 20000 },
    );

    // Filter folders for current user
    const foldersForUser = isRestrictedUser
        ? DRIVE_FOLDERS.filter((f) => f.id === 'protocolos')
        : DRIVE_FOLDERS.filter((f) => f.users.includes(currentUser?.id));

    const openPdf = (dataUrl?: string) => {
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

    const printPdf = (dataUrl?: string) => {
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
                    return (
                        <a
                            key={folder.id}
                            href={folder.url}
                            target="_blank"
                            rel="noopener noreferrer"
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

                                <div className="mt-auto flex items-center gap-2 text-sm font-bold text-primary bg-primary/10 px-4 py-2.5 rounded-xl group-hover:bg-primary group-hover:text-white transition-all">
                                    Abrir carpeta <ExternalLink size={16} />
                                </div>
                            </div>
                        </a>
                    );
                })}
            </div>

            {!isRestrictedUser && (
                <section className="mt-8 rounded-3xl border-2 border-gray-100 bg-white p-6 shadow-lg">
                    <div className="mb-4 flex items-center gap-3">
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

                    {(!facturacionArchive || facturacionArchive.length === 0) ? (
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
                                            <div className="space-y-2">
                                                {(day.orders || []).map((order) => (
                                                    <div key={order.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div>
                                                                <p className="text-sm font-black text-gray-900">
                                                                    Factura {order.invoiceNumber} · {order.customerName || 'Cliente sin detectar'}
                                                                </p>
                                                                <p className="text-xs font-semibold text-gray-500">
                                                                    {formatDate(order.invoiceDate)} · {order.sourceFileName}
                                                                </p>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openPdf(order.sourcePdfDataUrl)}
                                                                    className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-white px-2 py-1 text-xs font-black text-primary hover:bg-primary/5"
                                                                >
                                                                    <FileText size={12} /> Abrir
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => printPdf(order.sourcePdfDataUrl)}
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
                                                                .map((line) => `${line.productCode || line.productRaw}: ${line.quantity}`)
                                                                .join(' · ')}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </details>
                                ))}
                        </div>
                    )}
                </section>
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
