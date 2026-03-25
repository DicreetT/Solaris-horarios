import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileDown, FileSpreadsheet, FileUp, Plus, Trash2, XCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useSharedJsonState } from '../hooks/useSharedJsonState';

const PAYMENT_REQUESTS_KEY = 'facturacion_payment_requests_v1';

type PaymentStatus = 'PENDIENTE' | 'PAGADO' | 'CANCELADO';

type PaymentRequest = {
  id: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  createdByEmail: string;
  sourceType: 'excel' | 'manual';
  sourceFileName?: string;
  providerName: string;
  invoiceRef: string;
  amount: number;
  iban: string;
  notes: string;
  requestFileName?: string;
  requestFileDataUrl?: string;
  status: PaymentStatus;
  paidAt?: string;
  paidById?: string;
  paidByName?: string;
  receiptFileName?: string;
  receiptDataUrl?: string;
};

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeKey(value: string) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function parseAmount(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const raw = clean(value);
  if (!raw) return 0;

  const stripped = raw
    .replace(/\s+/g, '')
    .replace(/\u00a0/g, '')
    .replace(/[€$]/g, '')
    .replace(/[^0-9,.-]/g, '');
  if (!stripped) return 0;

  const hasComma = stripped.includes(',');
  const hasDot = stripped.includes('.');
  let normalized = stripped;

  if (hasComma && hasDot) {
    const lastComma = stripped.lastIndexOf(',');
    const lastDot = stripped.lastIndexOf('.');
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = stripped.split(thousandSeparator).join('');
    if (decimalSeparator === ',') normalized = normalized.replace(',', '.');
  } else if (hasComma) {
    const parts = stripped.split(',');
    const decimals = parts[parts.length - 1] || '';
    const looksLikeDecimal = decimals.length > 0 && decimals.length <= 2;
    normalized = looksLikeDecimal ? stripped.replace(',', '.') : stripped.split(',').join('');
  } else if (hasDot) {
    const parts = stripped.split('.');
    const decimals = parts[parts.length - 1] || '';
    const looksLikeDecimal = decimals.length > 0 && decimals.length <= 2;
    normalized = looksLikeDecimal ? stripped : stripped.split('.').join('');
  }

  // Keep only leading minus if present.
  normalized = normalized.replace(/(?!^)-/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function normalizeIban(value: string) {
  return clean(value).replace(/\s+/g, '').toUpperCase();
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function buildOpenUrl(source: string): { url: string; revoke?: () => void } {
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
    const mime = clean(header.match(/^data:([^;]+)/i)?.[1]) || 'application/octet-stream';
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

function openFile(source?: string, emptyMessage = 'No hay archivo adjunto.') {
  if (!source) {
    alert(emptyMessage);
    return;
  }
  const { url, revoke } = buildOpenUrl(source);
  if (!url) {
    alert('No se pudo abrir el archivo.');
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
    alert('No se pudo abrir el archivo. Revisa el bloqueador de ventanas emergentes.');
  }
}

function downloadFile(source?: string, fileName = 'comprobante') {
  if (!source) {
    alert('No hay archivo adjunto.');
    return;
  }
  const { url, revoke } = buildOpenUrl(source);
  if (!url) {
    alert('No se pudo preparar la descarga.');
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) window.setTimeout(revoke, 120000);
}

function statusClass(status: PaymentStatus) {
  if (status === 'PAGADO') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'CANCELADO') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

const PROVIDER_ALIASES = [
  'nombre',
  'proveedor',
  'beneficiario',
  'destinatario',
  'empresa',
  'acreedor',
];
const INVOICE_ALIASES = [
  'factura',
  'numerofactura',
  'nfactura',
  'referencia',
  'documento',
  'concepto',
];
const AMOUNT_ALIASES = [
  'valorapagar',
  'importe',
  'monto',
  'amount',
  'valor',
  'total',
];
const IBAN_ALIASES = ['iban', 'cuenta', 'cuentabancaria', 'bankaccount'];
const NOTES_ALIASES = ['nota', 'notas', 'observaciones', 'descripcion', 'detalle'];

function pickField(row: Record<string, unknown>, aliases: string[]) {
  const entries = Object.entries(row);
  for (const [k, v] of entries) {
    const key = normalizeKey(k);
    if (aliases.some((alias) => key.includes(alias))) {
      return clean(v);
    }
  }
  return '';
}

function buildPaymentSignature(input: {
  providerName: string;
  invoiceRef: string;
  amount: number;
  iban: string;
}) {
  return [
    normalizeKey(input.providerName),
    normalizeKey(input.invoiceRef),
    (Number(input.amount) || 0).toFixed(2),
    normalizeKey(input.iban),
  ].join('|');
}

function parsePaymentRequestsFromWorkbook(
  fileName: string,
  buffer: ArrayBuffer,
  currentUser: { id?: string; name?: string; email?: string } | null,
) {
  const workbook = XLSX.read(buffer, { type: 'array', raw: false, cellDates: true });
  const results: PaymentRequest[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
      blankrows: false,
    });
    if (!Array.isArray(rows) || rows.length === 0) continue;

    for (const row of rows) {
      const providerName = pickField(row, PROVIDER_ALIASES);
      const invoiceRef = pickField(row, INVOICE_ALIASES);
      const amountRaw = pickField(row, AMOUNT_ALIASES);
      const iban = normalizeIban(pickField(row, IBAN_ALIASES));
      const notes = pickField(row, NOTES_ALIASES);
      const amount = parseAmount(amountRaw);

      const possibleTotal =
        normalizeKey(providerName).includes('total') ||
        normalizeKey(invoiceRef).includes('total');
      if (possibleTotal) continue;
      if (amount <= 0) continue;
      if (!providerName && !invoiceRef) continue;

      results.push({
        id: uid('pay'),
        createdAt: new Date().toISOString(),
        createdById: clean(currentUser?.id),
        createdByName: clean(currentUser?.name) || 'Sistema',
        createdByEmail: clean(currentUser?.email).toLowerCase(),
        sourceType: 'excel',
        sourceFileName: fileName,
        providerName: providerName || 'Proveedor sin detectar',
        invoiceRef: invoiceRef || '-',
        amount,
        iban,
        notes,
        status: 'PENDIENTE',
      });
    }
  }

  return results;
}

export default function BillingPaymentsPage() {
  const { currentUser } = useAuth();
  const [requests, setRequests, requestsLoading] = useSharedJsonState<PaymentRequest[]>(
    PAYMENT_REQUESTS_KEY,
    [],
    { userId: currentUser?.id, initializeIfMissing: true, pollIntervalMs: 15000 },
  );

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [manualProvider, setManualProvider] = useState('');
  const [manualInvoice, setManualInvoice] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualIban, setManualIban] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualRequestFile, setManualRequestFile] = useState<File | null>(null);

  const email = clean(currentUser?.email).toLowerCase();
  const isAdmin = !!currentUser?.isAdmin;
  const isHeidy = email === 'heidy.m.solaris@gmail.com';
  const isEsteban = email === 'contacto@solaris.global';
  const canViewAll = isAdmin || isHeidy || isEsteban;
  const canApprovePayments = isAdmin;

  const visibleRequests = useMemo(() => {
    const list = Array.isArray(requests) ? requests : [];
    const filtered = canViewAll
      ? list
      : list.filter((r) => clean(r.createdById) === clean(currentUser?.id));
    return [...filtered].sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === 'PENDIENTE') return -1;
        if (b.status === 'PENDIENTE') return 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [requests, canViewAll, currentUser?.id]);

  const pendingCount = visibleRequests.filter((r) => r.status === 'PENDIENTE').length;
  const paidCount = visibleRequests.filter((r) => r.status === 'PAGADO').length;

  const resetManualForm = () => {
    setManualProvider('');
    setManualInvoice('');
    setManualAmount('');
    setManualIban('');
    setManualNotes('');
    setManualRequestFile(null);
  };

  const addManualRequest = async () => {
    const providerName = clean(manualProvider);
    const invoiceRef = clean(manualInvoice);
    const amount = parseAmount(manualAmount);
    const iban = normalizeIban(manualIban);
    if (!providerName) {
      alert('Completa el proveedor.');
      return;
    }
    if (!invoiceRef && !manualRequestFile && !clean(manualNotes)) {
      alert('Añade al menos un título/referencia, una nota o un PDF adjunto.');
      return;
    }
    const requestFileDataUrl = manualRequestFile ? await readFileAsDataUrl(manualRequestFile) : undefined;
    const next: PaymentRequest = {
      id: uid('pay'),
      createdAt: new Date().toISOString(),
      createdById: clean(currentUser?.id),
      createdByName: clean(currentUser?.name) || 'Sistema',
      createdByEmail: email,
      sourceType: 'manual',
      providerName,
      invoiceRef: invoiceRef || '-',
      amount: amount > 0 ? amount : 0,
      iban,
      notes: clean(manualNotes),
      requestFileName: manualRequestFile?.name,
      requestFileDataUrl,
      status: 'PENDIENTE',
    };
    setRequests((prev) => [next, ...(Array.isArray(prev) ? prev : [])]);
    resetManualForm();
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const accepted = Array.from(files).filter((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
    });
    setPendingFiles(accepted);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const loadExcelRequests = async () => {
    if (pendingFiles.length === 0) {
      alert('Selecciona al menos un Excel/CSV.');
      return;
    }
    setIsProcessingFiles(true);
    try {
      const parsed: PaymentRequest[] = [];
      for (const file of pendingFiles) {
        const buffer = await file.arrayBuffer();
        parsed.push(...parsePaymentRequestsFromWorkbook(file.name, buffer, currentUser));
      }

      if (parsed.length === 0) {
        alert('No se pudieron extraer filas de pago desde los archivos seleccionados.');
        return;
      }

      setRequests((prev) => {
        const current = Array.isArray(prev) ? prev : [];
        const signatures = new Set(
          current.map((item) =>
            buildPaymentSignature({
              providerName: item.providerName,
              invoiceRef: item.invoiceRef,
              amount: item.amount,
              iban: item.iban,
            }),
          ),
        );

        const newRows = parsed.filter((item) => {
          const sig = buildPaymentSignature({
            providerName: item.providerName,
            invoiceRef: item.invoiceRef,
            amount: item.amount,
            iban: item.iban,
          });
          if (!sig || signatures.has(sig)) return false;
          signatures.add(sig);
          return true;
        });

        return [...newRows, ...current];
      });
      setPendingFiles([]);
      alert(`${parsed.length} petición(es) detectada(s) desde Excel.`);
    } catch (error) {
      console.error('Error leyendo Excel de pagos:', error);
      alert('No se pudieron procesar los archivos Excel/CSV.');
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const updateRequest = (requestId: string, updater: (request: PaymentRequest) => PaymentRequest) => {
    const safeId = clean(requestId);
    if (!safeId) return;
    setRequests((prev) =>
      (Array.isArray(prev) ? prev : []).map((item) => (item.id === safeId ? updater(item) : item)),
    );
  };

  const uploadReceipt = async (requestId: string, file: File | null) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateRequest(requestId, (item) => ({
      ...item,
      receiptFileName: file.name,
      receiptDataUrl: dataUrl,
    }));
  };

  const uploadRequestFile = async (requestId: string, file: File | null) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateRequest(requestId, (item) => ({
      ...item,
      requestFileName: file.name,
      requestFileDataUrl: dataUrl,
    }));
  };

  const markPaid = (requestId: string) => {
    if (!canApprovePayments) {
      alert('Solo administradora puede marcar como pagado.');
      return;
    }
    updateRequest(requestId, (item) => {
      return {
        ...item,
        status: 'PAGADO',
        paidAt: new Date().toISOString(),
        paidById: clean(currentUser?.id),
        paidByName: clean(currentUser?.name) || 'Sistema',
      };
    });
  };

  const cancelRequest = (requestId: string) => {
    updateRequest(requestId, (item) => ({ ...item, status: 'CANCELADO' }));
  };

  const deleteRequest = (requestId: string) => {
    setRequests((prev) => (Array.isArray(prev) ? prev : []).filter((item) => item.id !== requestId));
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <h1 className="text-3xl font-black text-violet-950">Facturación</h1>
        <p className="mt-1 text-sm text-violet-700">
          Cola interna de peticiones de pago. Carga Excel/CSV, crea solicitudes manuales y adjunta comprobantes.
        </p>
      </section>

      <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-violet-700">Solicitudes visibles</p>
            <p className="mt-1 text-2xl font-black text-violet-950">{visibleRequests.length}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-amber-700">Pendientes</p>
            <p className="mt-1 text-2xl font-black text-amber-900">{pendingCount}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Pagadas</p>
            <p className="mt-1 text-2xl font-black text-emerald-900">{paidCount}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-violet-950">Carga Excel de pagos</h2>
        <p className="mt-1 text-xs font-semibold text-violet-600">
          Formatos soportados: <span className="font-black">.xlsx</span>, <span className="font-black">.xls</span>, <span className="font-black">.csv</span>.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <label className="md:col-span-4 text-xs font-black uppercase tracking-wide text-violet-700">
            Archivo(s) Excel/CSV
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              multiple
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
            />
            {pendingFiles.length > 0 && (
              <div className="mt-2 space-y-1 rounded-xl border border-violet-200 bg-violet-50/40 p-2">
                {pendingFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-2 text-[11px] font-semibold text-violet-900">
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
              </div>
            )}
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void loadExcelRequests()}
              disabled={isProcessingFiles || pendingFiles.length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-700 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              <FileSpreadsheet size={16} />
              {isProcessingFiles ? 'Procesando...' : `Cargar (${pendingFiles.length})`}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-violet-950">Nueva solicitud manual</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <input
            value={manualProvider}
            onChange={(e) => setManualProvider(e.target.value)}
            placeholder="Proveedor"
            className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
          />
          <input
            value={manualInvoice}
            onChange={(e) => setManualInvoice(e.target.value)}
            placeholder="Título / factura / referencia"
            className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
          />
          <input
            value={manualAmount}
            onChange={(e) => setManualAmount(e.target.value)}
            placeholder="Importe (opcional)"
            className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
          />
          <input
            value={manualIban}
            onChange={(e) => setManualIban(e.target.value)}
            placeholder="IBAN"
            className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
          />
          <button
            type="button"
            onClick={() => void addManualRequest()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-black text-violet-800"
          >
            <Plus size={14} />
            Añadir
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <label className="md:col-span-3 text-xs font-black uppercase tracking-wide text-violet-700">
            PDF solicitud/factura (opcional)
            <input
              type="file"
              accept=".pdf,application/pdf,image/*"
              onChange={(e) => setManualRequestFile(e.target.files?.[0] || null)}
              className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
            />
          </label>
          <div className="md:col-span-2 flex items-end">
            {manualRequestFile ? (
              <div className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
                <div className="truncate">{manualRequestFile.name}</div>
                <button
                  type="button"
                  onClick={() => setManualRequestFile(null)}
                  className="mt-1 rounded-md border border-rose-200 bg-white px-2 py-1 font-black text-rose-700 hover:bg-rose-50"
                >
                  Quitar PDF
                </button>
              </div>
            ) : (
              <div className="w-full rounded-xl border border-dashed border-violet-200 bg-violet-50/40 px-3 py-2 text-xs font-semibold text-violet-600">
                Sin PDF adjunto
              </div>
            )}
          </div>
        </div>
        <textarea
          value={manualNotes}
          onChange={(e) => setManualNotes(e.target.value)}
          placeholder="Notas (opcional)"
          className="mt-3 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900"
          rows={2}
        />
      </section>

      <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-black text-violet-950">Cola de pagos</h2>
          <span className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-black text-violet-700">
            {requestsLoading ? 'Cargando...' : `${visibleRequests.length} registro(s)`}
          </span>
        </div>

        {!canViewAll && (
          <p className="mb-3 text-xs font-semibold text-violet-600">
            Solo ves tus propias solicitudes. Heidi, Esteban y administradora ven la cola completa.
          </p>
        )}

        {visibleRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-6 text-center text-sm font-semibold text-violet-700">
            No hay solicitudes de pago visibles.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-black uppercase tracking-wide text-violet-700">
                  <th className="px-2 py-2">Estado</th>
                  <th className="px-2 py-2">Proveedor</th>
                  <th className="px-2 py-2">Factura</th>
                  <th className="px-2 py-2">Importe</th>
                  <th className="px-2 py-2">IBAN</th>
                  <th className="px-2 py-2">Solicita</th>
                  <th className="px-2 py-2">Documento</th>
                  <th className="px-2 py-2">Comprobante</th>
                  <th className="px-2 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((item) => {
                  const canDelete = isAdmin || clean(item.createdById) === clean(currentUser?.id);
                  const canUploadReceipt =
                    isAdmin || canViewAll || clean(item.createdById) === clean(currentUser?.id);
                  return (
                    <tr key={item.id} className="border-t border-violet-100 align-top">
                      <td className="px-2 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${statusClass(item.status)}`}>
                          {item.status}
                        </span>
                        {item.status === 'PAGADO' && item.paidAt && (
                          <div className="mt-1 text-[11px] font-semibold text-emerald-700">
                            {new Date(item.paidAt).toLocaleDateString('es-ES')}
                            {item.paidByName ? ` · ${item.paidByName}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 font-black text-violet-900">
                        {item.providerName}
                        {item.notes && <div className="mt-1 text-[11px] font-semibold text-violet-600">{item.notes}</div>}
                      </td>
                      <td className="px-2 py-2 font-semibold text-violet-800">
                        {item.invoiceRef}
                        {item.sourceFileName && (
                          <div className="mt-1 text-[11px] font-semibold text-violet-500">{item.sourceFileName}</div>
                        )}
                      </td>
                      <td className="px-2 py-2 font-black text-violet-900">
                        {item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                      </td>
                      <td className="px-2 py-2 font-mono text-xs font-semibold text-violet-800">{item.iban || '-'}</td>
                      <td className="px-2 py-2 text-xs font-semibold text-violet-700">
                        {item.createdByName || 'Sistema'}
                        <div className="text-[11px] text-violet-500">
                          {new Date(item.createdAt).toLocaleDateString('es-ES')}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {item.requestFileDataUrl ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openFile(item.requestFileDataUrl, 'No hay documento adjunto.')}
                                className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-[11px] font-black text-violet-700 hover:bg-violet-50"
                              >
                                Abrir
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadFile(item.requestFileDataUrl, item.requestFileName || 'documento')}
                                className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2 py-1 text-[11px] font-black text-violet-700 hover:bg-violet-50"
                              >
                                <FileDown size={12} /> Descargar
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] font-black text-amber-700">Sin documento</span>
                          )}
                          {(isAdmin || clean(item.createdById) === clean(currentUser?.id)) && (
                            <label className="cursor-pointer rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-black text-cyan-800 hover:bg-cyan-100">
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  void uploadRequestFile(item.id, file);
                                  e.currentTarget.value = '';
                                }}
                              />
                              <FileUp size={11} className="inline-block mr-1" />
                              Subir
                            </label>
                          )}
                        </div>
                        {item.requestFileName && (
                          <div className="mt-1 text-[11px] font-semibold text-violet-500">{item.requestFileName}</div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {item.receiptDataUrl ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openFile(item.receiptDataUrl, 'No hay comprobante cargado.')}
                                className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-[11px] font-black text-violet-700 hover:bg-violet-50"
                              >
                                Abrir
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadFile(item.receiptDataUrl, item.receiptFileName || 'comprobante')}
                                className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2 py-1 text-[11px] font-black text-violet-700 hover:bg-violet-50"
                              >
                                <FileDown size={12} /> Descargar
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] font-black text-amber-700">Sin comprobante</span>
                          )}
                          {canUploadReceipt && (
                            <label className="cursor-pointer rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-black text-cyan-800 hover:bg-cyan-100">
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  void uploadReceipt(item.id, file);
                                  e.currentTarget.value = '';
                                }}
                              />
                              <FileUp size={11} className="inline-block mr-1" />
                              Subir
                            </label>
                          )}
                        </div>
                        {item.receiptFileName && (
                          <div className="mt-1 text-[11px] font-semibold text-violet-500">{item.receiptFileName}</div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => markPaid(item.id)}
                            disabled={!canApprovePayments || item.status !== 'PENDIENTE'}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700 disabled:opacity-40"
                          >
                            <CheckCircle2 size={12} /> Pagado
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelRequest(item.id)}
                            disabled={item.status === 'PAGADO'}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-700 disabled:opacity-40"
                          >
                            <XCircle size={12} /> Cancelar
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => deleteRequest(item.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-700"
                            >
                              <Trash2 size={12} /> Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
