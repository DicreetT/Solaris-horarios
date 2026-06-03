import { BarChart3, Boxes, Building2, ClipboardList, PackageSearch } from 'lucide-react';
import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import InventoryConnectionBanner from '../components/inventory/InventoryConnectionBanner';
import { useInventoryMovementsDB } from '../hooks/useInventoryMovementsDB';
import {
  calculateInventoryStockSnapshot,
  formatInventoryWarehouseLabel,
  type InventoryStockScope,
} from '../utils/inventoryStock';
import InventoryPage from './InventoryPage';
import InventoryFacturacionPage from './InventoryFacturacionPage';

type InventoryScope = 'home' | 'general' | 'canet' | 'huarte';

type InventoryMovementLike = {
  producto?: string;
  lote?: string;
  bodega?: string;
  cantidad?: number;
  cantidad_signed?: number;
  signo?: number;
  tipo_movimiento?: string;
  afecta_stock?: string;
  source?: string;
};

const clean = (value: unknown) => (value == null ? '' : String(value).trim());

function getScopeFromRoute(pathname: string, params: URLSearchParams): InventoryScope {
  const raw = `${params.get('view') || params.get('scope') || ''}`.toLowerCase();
  if (raw === 'general') return 'general';
  if (raw === 'huarte') return 'huarte';
  if (raw === 'canet') return 'canet';
  if (pathname.includes('inventory-facturacion')) return 'huarte';
  return 'home';
}

function buildStockSummary(movements: InventoryMovementLike[], scope: InventoryScope = 'general') {
  return calculateInventoryStockSnapshot(movements, {
    scope: scope as InventoryStockScope,
    normalizeProduct: (value) => clean(value),
    normalizeLot: (value) => clean(value),
    excludeMirrorSources: true,
    clampNegative: true,
  });
}

function InventoryHome({ goToScope }: { goToScope: (scope: InventoryScope) => void }) {
  const [canetMovements, , canetLoading, canetDB] = useInventoryMovementsDB('canet');
  const [huarteMovements, , huarteLoading, huarteDB] = useInventoryMovementsDB('huarte');

  const canetSummary = useMemo(() => buildStockSummary(canetMovements as InventoryMovementLike[], 'canet'), [canetMovements]);
  const huarteSummary = useMemo(() => buildStockSummary(huarteMovements as InventoryMovementLike[], 'huarte'), [huarteMovements]);
  const generalSummary = useMemo(
    () => buildStockSummary(
      [...canetMovements, ...huarteMovements] as InventoryMovementLike[],
      'general',
    ),
    [canetMovements, huarteMovements],
  );
  const loading = canetLoading || huarteLoading;

  const cards = [
    {
      scope: 'canet' as const,
      title: 'Canet',
      Icon: Building2,
      summary: canetSummary,
      accent: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    },
    {
      scope: 'huarte' as const,
      title: 'Huarte',
      Icon: Boxes,
      summary: huarteSummary,
      accent: 'border-sky-200 bg-sky-50 text-sky-900',
    },
  ];

  return (
    <main className="inventory-readable mx-auto max-w-7xl space-y-4 px-4 pb-12 md:px-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Inventario general</p>
            <h2 className="text-2xl font-black text-slate-950">Elige una vista de stock</h2>
            <p className="text-sm text-slate-600">Una entrada común para consultar Canet, Huarte o la foto general.</p>
          </div>
          <button
            type="button"
            onClick={() => goToScope('general')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            <BarChart3 size={16} />
            Ver general
          </button>
        </div>
      </section>

      <section className="grid gap-2 lg:grid-cols-2">
        <InventoryConnectionBanner
          label="Canet"
          isOnline={canetDB.isOnline}
          isSyncing={canetDB.isSyncing}
          lastError={canetDB.lastError}
          lastSyncedAt={canetDB.lastSyncedAt}
          onRetry={canetDB.reload}
        />
        <InventoryConnectionBanner
          label="Huarte"
          isOnline={huarteDB.isOnline}
          isSyncing={huarteDB.isSyncing}
          lastError={huarteDB.lastError}
          lastSyncedAt={huarteDB.lastSyncedAt}
          onRetry={huarteDB.reload}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => goToScope('general')}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-400 hover:bg-slate-50"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">General</p>
              <p className="text-xs font-semibold text-slate-500">Canet + Huarte</p>
            </div>
            <PackageSearch className="text-slate-500" size={22} />
          </div>
          <p className="mt-4 text-3xl font-black text-slate-950">
            {loading ? '...' : generalSummary.totalStock.toLocaleString('es-ES')}
          </p>
          <p className="text-xs font-semibold text-slate-500">{generalSummary.lotCount.toLocaleString('es-ES')} lotes con stock</p>
        </button>

        {cards.map(({ scope, title, Icon, summary, accent }) => (
          <button
            key={scope}
            type="button"
            onClick={() => goToScope(scope)}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-400 hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-950">{title}</p>
                <p className="text-xs font-semibold text-slate-500">Stock operativo</p>
              </div>
              <span className={`rounded-lg border p-2 ${accent}`}>
                <Icon size={18} />
              </span>
            </div>
            <p className="mt-4 text-3xl font-black text-slate-950">
              {loading ? '...' : summary.totalStock.toLocaleString('es-ES')}
            </p>
            <p className="text-xs font-semibold text-slate-500">{summary.lotCount.toLocaleString('es-ES')} lotes con stock</p>
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList size={18} className="text-slate-500" />
          <h3 className="text-base font-black text-slate-950">Stock por bodega</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {generalSummary.warehouseRows.slice(0, 12).map((row) => (
            <div key={row.bodega} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-slate-500">{formatInventoryWarehouseLabel(row.bodega)}</p>
              <p className="text-xl font-black text-slate-950">{row.stock.toLocaleString('es-ES')}</p>
            </div>
          ))}
          {!loading && generalSummary.warehouseRows.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-500">
              No hay stock registrado todavía.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function InventoryUnifiedPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scope = useMemo(() => getScopeFromRoute(location.pathname, searchParams), [location.pathname, searchParams]);
  const isStandaloneControlStock = scope === 'canet' && clean(searchParams.get('tab')).toLowerCase() === 'control_stock';

  const goToScope = (nextScope: InventoryScope) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('tab');
    if (nextScope === 'home') {
      nextParams.delete('view');
    } else {
      nextParams.set('view', nextScope);
    }
    navigate(`/inventory${nextParams.toString() ? `?${nextParams.toString()}` : ''}`);
  };

  const tabs: Array<{ key: InventoryScope; label: string }> = [
    { key: 'general', label: 'General' },
    { key: 'canet', label: 'Canet' },
    { key: 'huarte', label: 'Huarte' },
  ];
  const activeScope = scope === 'home' ? 'general' : scope;

  return (
    <div className="inventory-workspace space-y-4">
      {!isStandaloneControlStock && (
      <section className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Inventario</p>
            <h1 className="text-xl font-black text-slate-950 md:text-2xl">Stock y movimientos</h1>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
            {tabs.map((tab) => {
              const active = activeScope === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => goToScope(tab.key)}
                  className={`min-w-[96px] rounded-md px-3 py-2 text-center text-sm font-black transition ${
                    active
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {scope === 'canet' && <InventoryPage />}
      {scope === 'huarte' && <InventoryFacturacionPage />}
      {(scope === 'home' || scope === 'general') && <InventoryHome goToScope={goToScope} />}
    </div>
  );
}
