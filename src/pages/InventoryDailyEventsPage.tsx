import React, { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, CalendarClock, CheckCircle2, ClipboardCheck, History, Plus, Save, Trash2, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getInventoryDailyStatus,
  InventoryDailyClientRow,
  InventoryDailyManualStockRow,
  InventoryDailyReport,
  InventoryDailyReviewerKey,
  InventoryDailyReviewStatus,
  InventoryDailySimpleRow,
  useInventoryDailyEvents,
} from '../hooks/useInventoryDailyEvents';
import { toDateKey } from '../utils/dateUtils';

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function reviewStatusLabel(status: InventoryDailyReviewStatus) {
  if (status === 'conforme') return 'Conforme';
  if (status === 'waiting') return 'En espera';
  if (status === 'issue') return 'Incidencia';
  return 'Pendiente';
}

function reviewStatusClass(status: InventoryDailyReviewStatus) {
  if (status === 'conforme') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'waiting') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'issue') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

function statusClass(tone: string) {
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (tone === 'rose') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (tone === 'sky') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function formatDate(dateKey: string) {
  if (!dateKey) return '-';
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function canReview(currentUserName: string, isAdmin: boolean, reviewerKey: InventoryDailyReviewerKey) {
  if (isAdmin) return true;
  const normalized = currentUserName.toLowerCase();
  if (reviewerKey === 'anabella') return normalized.includes('anab');
  if (reviewerKey === 'heidy') return normalized.includes('heid');
  return normalized.includes('itzi');
}

function getStockRows(report: InventoryDailyReport | null) {
  return (report?.manualTables?.stock || []).map((row) => {
    const lunaris = toNumber(row.lunaris);
    const physical = row.physical || '';
    const zoho = row.zoho || '';
    const diffPhysical = physical === '' ? null : toNumber(physical) - lunaris;
    const diffZoho = zoho === '' ? null : toNumber(zoho) - lunaris;
    const diffPhysicalZoho = physical === '' || zoho === '' ? null : toNumber(physical) - toNumber(zoho);
    return {
    key: row.id,
    producto: row.producto || '',
    lote: row.lote || '',
    bodega: row.bodega || '',
    lunaris,
    physical,
    physicalOk: physical !== '' && Math.abs(diffPhysical || 0) < 0.000001,
    zoho,
    zohoOk: zoho !== '' && Math.abs(diffZoho || 0) < 0.000001,
    diffPhysical,
    diffZoho,
    diffPhysicalZoho,
    difference: diffPhysical,
    observation: row.observation || '',
  };
  });
}

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function diffClass(value: number | null) {
  if (value === null) return 'text-slate-400';
  if (Math.abs(value) < 0.000001) return 'text-emerald-700';
  return 'text-rose-700';
}

function formatDiff(value: number | null) {
  if (value === null) return '-';
  return value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

function ReviewCard({
  report,
  reviewerKey,
  currentUserName,
  isAdmin,
  onSave,
}: {
  report: InventoryDailyReport;
  reviewerKey: InventoryDailyReviewerKey;
  currentUserName: string;
  isAdmin: boolean;
  onSave: (status: InventoryDailyReviewStatus, comment: string) => void;
}) {
  const review = report.reviews?.[reviewerKey];
  const editable = canReview(currentUserName, isAdmin, reviewerKey);
  const [status, setStatus] = useState<InventoryDailyReviewStatus>(review?.status || 'pending');
  const [comment, setComment] = useState(review?.comment || '');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{review?.responsibility}</p>
          <h3 className="mt-1 text-sm font-black text-slate-950">{review?.label}</h3>
        </div>
        <span className={classNames('rounded-full border px-3 py-1 text-xs font-black', reviewStatusClass(review?.status || 'pending'))}>
          {reviewStatusLabel(review?.status || 'pending')}
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as InventoryDailyReviewStatus)}
          disabled={!editable}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:bg-slate-50"
        >
          <option value="pending">Pendiente</option>
          <option value="conforme">Conforme</option>
          <option value="waiting">En espera</option>
          <option value="issue">Incidencia</option>
        </select>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          disabled={!editable}
          placeholder="Observación de revisión"
          className="min-h-[64px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50"
        />
        <button
          type="button"
          onClick={() => onSave(status, comment)}
          disabled={!editable}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200"
        >
          <Save size={15} />
          Guardar revisión
        </button>
      </div>
      {review?.reviewedAt && (
        <p className="mt-3 text-xs font-semibold text-slate-500">
          Última revisión: {new Date(review.reviewedAt).toLocaleString('es-ES')}
        </p>
      )}
    </div>
  );
}

function SimpleTable({
  title,
  rows,
  empty,
  addLabel,
  onChange,
  clientMode = false,
}: {
  title: string;
  rows: Array<InventoryDailySimpleRow | InventoryDailyClientRow>;
  empty: string;
  addLabel: string;
  onChange: (rows: Array<InventoryDailySimpleRow | InventoryDailyClientRow>) => void;
  clientMode?: boolean;
}) {
  const addRow = () => {
    onChange([
      ...rows,
      clientMode
        ? { id: uid('client'), cliente: '', pedidos: '', productos: '', observation: '' }
        : { id: uid('row'), producto: '', lote: '', cantidad: '', cliente: '', origen: '', destino: '', observation: '' },
    ]);
  };
  const patchRow = (id: string, patch: Record<string, string>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const removeRow = (id: string) => onChange(rows.filter((row) => row.id !== id));

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</h3>
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1 rounded-full border border-teal-200 px-2 py-1 text-[11px] font-black text-teal-700 hover:bg-teal-50">
          <Plus size={13} />
          {addLabel}
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs sm:grid-cols-5">
            {clientMode ? (
              <>
                <input value={(row as InventoryDailyClientRow).cliente || ''} onChange={(event) => patchRow(row.id, { cliente: event.target.value })} placeholder="Cliente" className="rounded-md border border-slate-200 px-2 py-1" />
                <input value={(row as InventoryDailyClientRow).pedidos || ''} onChange={(event) => patchRow(row.id, { pedidos: event.target.value })} placeholder="Pedidos" className="rounded-md border border-slate-200 px-2 py-1" />
                <input value={(row as InventoryDailyClientRow).productos || ''} onChange={(event) => patchRow(row.id, { productos: event.target.value })} placeholder="Productos" className="rounded-md border border-slate-200 px-2 py-1 sm:col-span-2" />
              </>
            ) : (
              <>
                <input value={(row as InventoryDailySimpleRow).producto || ''} onChange={(event) => patchRow(row.id, { producto: event.target.value })} placeholder="Producto" className="rounded-md border border-slate-200 px-2 py-1" />
                <input value={(row as InventoryDailySimpleRow).lote || ''} onChange={(event) => patchRow(row.id, { lote: event.target.value })} placeholder="Lote" className="rounded-md border border-slate-200 px-2 py-1" />
                <input value={(row as InventoryDailySimpleRow).cantidad || ''} onChange={(event) => patchRow(row.id, { cantidad: event.target.value })} placeholder="Cantidad" className="rounded-md border border-slate-200 px-2 py-1" />
                <input value={(row as InventoryDailySimpleRow).cliente || (row as InventoryDailySimpleRow).destino || ''} onChange={(event) => patchRow(row.id, { cliente: event.target.value, destino: event.target.value })} placeholder="Cliente/destino" className="rounded-md border border-slate-200 px-2 py-1" />
              </>
            )}
            <button type="button" onClick={() => removeRow(row.id)} className="inline-flex items-center justify-center rounded-md border border-rose-100 bg-white px-2 py-1 text-rose-600 hover:bg-rose-50">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">{empty}</p>}
      </div>
    </div>
  );
}

function StockControlTable({
  rows,
  onChange,
}: {
  rows: InventoryDailyManualStockRow[];
  onChange: (rows: InventoryDailyManualStockRow[]) => void;
}) {
  const addRow = () => onChange([...rows, { id: uid('stock'), producto: '', lote: '', bodega: 'CANET', lunaris: '', physical: '', zoho: '', observation: '' }]);
  const patchRow = (id: string, patch: Partial<InventoryDailyManualStockRow>) => onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const removeRow = (id: string) => onChange(rows.filter((row) => row.id !== id));
  const decorated = rows.map((row) => {
    const lunaris = toNumber(row.lunaris);
    const physical = row.physical || '';
    const zoho = row.zoho || '';
    return {
      row,
      diffPhysical: physical === '' ? null : toNumber(physical) - lunaris,
      diffZoho: zoho === '' ? null : toNumber(zoho) - lunaris,
      diffPhysicalZoho: physical === '' || zoho === '' ? null : toNumber(physical) - toNumber(zoho),
    };
  });

  return (
    <div className="rounded-2xl border border-teal-100 bg-teal-50/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">Stock del día</p>
          <h2 className="text-lg font-black text-slate-950">Control editable Lunaris · Físico · Zoho</h2>
        </div>
        <button type="button" onClick={addRow} className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-black text-teal-700 hover:bg-teal-50">
          <Plus size={14} />
          Fila stock
        </button>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[1120px] text-left text-xs">
          <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Lote</th>
              <th className="px-3 py-2">Bodega</th>
              <th className="px-3 py-2">Lunaris</th>
              <th className="px-3 py-2">Físico</th>
              <th className="px-3 py-2">OK físico</th>
              <th className="px-3 py-2">Zoho</th>
              <th className="px-3 py-2">OK Zoho</th>
              <th className="px-3 py-2">L-F</th>
              <th className="px-3 py-2">L-Z</th>
              <th className="px-3 py-2">F-Z</th>
              <th className="px-3 py-2">Observación</th>
              <th className="px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {decorated.map(({ row, diffPhysical, diffZoho, diffPhysicalZoho }) => (
              <tr key={row.id}>
                <td className="px-2 py-2"><input value={row.producto || ''} onChange={(event) => patchRow(row.id, { producto: event.target.value })} className="w-32 rounded-md border border-slate-200 px-2 py-1 font-semibold" /></td>
                <td className="px-2 py-2"><input value={row.lote || ''} onChange={(event) => patchRow(row.id, { lote: event.target.value })} className="w-28 rounded-md border border-slate-200 px-2 py-1 font-semibold" /></td>
                <td className="px-2 py-2"><input value={row.bodega || ''} onChange={(event) => patchRow(row.id, { bodega: event.target.value })} className="w-28 rounded-md border border-slate-200 px-2 py-1 font-semibold" /></td>
                <td className="px-2 py-2"><input value={row.lunaris || ''} onChange={(event) => patchRow(row.id, { lunaris: event.target.value })} className="w-24 rounded-md border border-slate-200 px-2 py-1 font-semibold" /></td>
                <td className="px-2 py-2"><input value={row.physical || ''} onChange={(event) => patchRow(row.id, { physical: event.target.value })} className="w-24 rounded-md border border-slate-200 px-2 py-1 font-semibold" /></td>
                <td className="px-3 py-2 text-center">{diffPhysical !== null && Math.abs(diffPhysical) < 0.000001 ? '✓' : '—'}</td>
                <td className="px-2 py-2"><input value={row.zoho || ''} onChange={(event) => patchRow(row.id, { zoho: event.target.value })} className="w-24 rounded-md border border-slate-200 px-2 py-1 font-semibold" /></td>
                <td className="px-3 py-2 text-center">{diffZoho !== null && Math.abs(diffZoho) < 0.000001 ? '✓' : '—'}</td>
                <td className={classNames('px-3 py-2 font-black', diffClass(diffPhysical))}>{formatDiff(diffPhysical)}</td>
                <td className={classNames('px-3 py-2 font-black', diffClass(diffZoho))}>{formatDiff(diffZoho)}</td>
                <td className={classNames('px-3 py-2 font-black', diffClass(diffPhysicalZoho))}>{formatDiff(diffPhysicalZoho)}</td>
                <td className="px-2 py-2"><input value={row.observation || ''} onChange={(event) => patchRow(row.id, { observation: event.target.value })} placeholder="Observación" className="w-40 rounded-md border border-slate-200 px-2 py-1" /></td>
                <td className="px-2 py-2">
                  <button type="button" onClick={() => removeRow(row.id)} className="rounded-md border border-rose-100 px-2 py-1 text-rose-600 hover:bg-rose-50"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-sm font-semibold text-slate-500">Sin filas de stock. Usa Fila stock o genera snapshot desde Control de Stock.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InventoryDailyEventsPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const todayKey = toDateKey(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const { reports, inventorySnapshot, createEventForDate, updateReview, updateNotes, updateManualTable, loading } = useInventoryDailyEvents(currentUser?.id);
  const currentReport = useMemo(
    () => reports.find((report) => report.dateKey === selectedDateKey) || null,
    [reports, selectedDateKey],
  );
  const latestReport = reports[0] || null;
  const currentStatus = getInventoryDailyStatus(currentReport);
  const currentUserName = currentUser?.name || '';
  const stockRows = getStockRows(currentReport);
  const stockDiffs = stockRows.filter((row) => (
    (row.diffPhysical !== null && Math.abs(Number(row.diffPhysical)) > 0.000001)
    || (row.diffZoho !== null && Math.abs(Number(row.diffZoho)) > 0.000001)
    || (row.diffPhysicalZoho !== null && Math.abs(Number(row.diffPhysicalZoho)) > 0.000001)
  ));
  const [notesDraft, setNotesDraft] = useState(currentReport?.notes || '');

  React.useEffect(() => {
    setNotesDraft(currentReport?.notes || '');
  }, [currentReport?.id, currentReport?.notes]);

  const handleCreate = () => {
    createEventForDate(selectedDateKey);
  };

  const tables = currentReport?.manualTables || {};

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">Inventario diario</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Controles diarios de inventario</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
              Anabela crea el control, Itzi valida movimientos/Zoho y Heidy valida conciliación. La plantilla se alimenta de despachos y Control de Stock, pero permite correcciones manuales guardadas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={selectedDateKey}
              onChange={(event) => setSelectedDateKey(event.target.value || todayKey)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
            />
            <button
              type="button"
              onClick={handleCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-teal-800"
            >
              <CalendarClock size={16} />
              {currentReport ? 'Actualizar control' : 'Crear control inventario diario'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{formatDate(selectedDateKey)}</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Control inventario diario</h2>
            </div>
            <span className={classNames('rounded-full border px-3 py-1 text-xs font-black', statusClass(currentStatus.tone))}>
              {currentStatus.label}
            </span>
          </div>

          {!currentReport ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-600">
              No hay control para esta fecha todavía. Crea el control para cargar la plantilla y activar las tres revisiones.
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <Truck className="text-teal-700" size={20} />
                  <p className="mt-3 text-2xl font-black text-slate-950">{tables.shipments?.length || 0}</p>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Ventas/envíos</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <Boxes className="text-teal-700" size={20} />
                  <p className="mt-3 text-2xl font-black text-slate-950">{stockRows.length}</p>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Filas de stock</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <AlertTriangle className={stockDiffs.length > 0 ? 'text-amber-600' : 'text-emerald-600'} size={20} />
                  <p className="mt-3 text-2xl font-black text-slate-950">{stockDiffs.length}</p>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Diferencias</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 xl:grid-cols-3">
                <div className="space-y-3">
                  <SimpleTable
                    title="Ventas / envíos"
                    rows={tables.shipments || []}
                    empty="Sin ventas/envíos registrados para esta fecha."
                    addLabel="Fila"
                    onChange={(rows) => updateManualTable(selectedDateKey, 'shipments', rows)}
                  />
                  <SimpleTable
                    title="Clientes del día"
                    rows={tables.clients || []}
                    empty="Sin clientes todavía."
                    addLabel="Cliente"
                    clientMode
                    onChange={(rows) => updateManualTable(selectedDateKey, 'clients', rows)}
                  />
                  <SimpleTable
                    title="Traspasos"
                    rows={tables.transfers || []}
                    empty="Sin traspasos registrados."
                    addLabel="Fila"
                    onChange={(rows) => updateManualTable(selectedDateKey, 'transfers', rows)}
                  />
                </div>
                <SimpleTable
                  title="Ensamblajes"
                  rows={tables.assemblies || []}
                  empty="Sin ensamblajes registrados."
                  addLabel="Fila"
                  onChange={(rows) => updateManualTable(selectedDateKey, 'assemblies', rows)}
                />
                <SimpleTable
                  title="Soporte del día"
                  rows={tables.support || []}
                  empty="Sin soporte registrado."
                  addLabel="Soporte"
                  onChange={(rows) => updateManualTable(selectedDateKey, 'support', rows)}
                />
              </div>

              <div className="mt-5">
                <StockControlTable
                  rows={tables.stock || []}
                  onChange={(rows) => updateManualTable(selectedDateKey, 'stock', rows)}
                />
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-600">Notas del evento</h3>
                  <button
                    type="button"
                    onClick={() => updateNotes(selectedDateKey, notesDraft)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                  >
                    <Save size={14} />
                    Guardar notas
                  </button>
                </div>
                <textarea
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  placeholder="Observaciones generales del evento diario"
                  className="mt-3 min-h-[96px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                />
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {(['anabella', 'itzi', 'heidy'] as InventoryDailyReviewerKey[]).map((reviewerKey) => (
                  <ReviewCard
                    key={reviewerKey}
                    report={currentReport}
                    reviewerKey={reviewerKey}
                    currentUserName={currentUserName}
                    isAdmin={!!currentUser?.isAdmin}
                    onSave={(status, comment) => updateReview(selectedDateKey, reviewerKey, status, comment)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Accesos relacionados</h2>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => navigate('/inventory?view=canet&tab=control_stock')}
                className="rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Control de stock
              </button>
              <button
                type="button"
                onClick={() => navigate('/despachos')}
                className="rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Despachos
              </button>
              <button
                type="button"
                onClick={() => navigate('/albaranes')}
                className="rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Incidencias de producto/lote
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Fuente del stock</h2>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              Se lee el snapshot actual de Control de Stock. Crear el evento no modifica inventario, lotes ni movimientos.
            </p>
            <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">
              Snapshot: {inventorySnapshot?.updatedAt ? new Date(inventorySnapshot.updatedAt).toLocaleString('es-ES') : 'sin fecha guardada'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <History size={18} className="text-slate-500" />
              <h2 className="text-lg font-black text-slate-950">Histórico</h2>
            </div>
            <div className="mt-4 space-y-2">
              {reports.slice(0, 8).map((report) => {
                const status = getInventoryDailyStatus(report);
                return (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => setSelectedDateKey(report.dateKey)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black text-slate-800">{report.dateKey}</span>
                      <span className={classNames('rounded-full border px-2 py-0.5 text-[11px] font-black', statusClass(status.tone))}>{status.label}</span>
                    </div>
                  </button>
                );
              })}
              {!loading && reports.length === 0 && (
                <p className="text-sm font-semibold text-slate-500">Todavía no hay eventos guardados.</p>
              )}
            </div>
          </div>
        </aside>
      </section>

      {currentReport && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-teal-700" />
            <h2 className="text-lg font-black text-slate-950">Resumen de diferencias del control</h2>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Lote</th>
                  <th className="px-3 py-2">Bodega</th>
                  <th className="px-3 py-2">Lunaris</th>
                  <th className="px-3 py-2">Físico</th>
                  <th className="px-3 py-2">Zoho</th>
                  <th className="px-3 py-2">L-F</th>
                  <th className="px-3 py-2">L-Z</th>
                  <th className="px-3 py-2">F-Z</th>
                  <th className="px-3 py-2">Obs.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockRows.slice(0, 120).map((row) => (
                  <tr key={row.key || `${row.producto}-${row.lote}-${row.bodega}`}>
                    <td className="px-3 py-2 font-black text-slate-800">{row.producto}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{row.lote}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{row.bodega}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{row.lunaris}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{row.physical || '-'}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{row.zoho || '-'}</td>
                    <td className={classNames('px-3 py-2 font-black', diffClass(row.diffPhysical))}>{formatDiff(row.diffPhysical)}</td>
                    <td className={classNames('px-3 py-2 font-black', diffClass(row.diffZoho))}>{formatDiff(row.diffZoho)}</td>
                    <td className={classNames('px-3 py-2 font-black', diffClass(row.diffPhysicalZoho))}>{formatDiff(row.diffPhysicalZoho)}</td>
                    <td className="px-3 py-2 font-semibold text-slate-600">{row.observation || '-'}</td>
                  </tr>
                ))}
                {stockRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-sm font-semibold text-slate-500">
                      No hay filas de stock en este control. Entra primero a Control de Stock para generar snapshot, o añade filas manuales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {currentStatus.complete && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
              <CheckCircle2 size={17} />
              Inventario diario conciliado y visible para Dirección como resumen.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
