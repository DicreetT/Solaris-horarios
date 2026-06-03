import { AlertTriangle, CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';

type Props = {
  label: string;
  isOnline?: boolean;
  isSyncing?: boolean;
  lastError?: string | null;
  lastSyncedAt?: string | null;
  onRetry?: () => void;
};

const formatSyncTime = (value?: string | null) => {
  if (!value) return 'Sin sincronización reciente';
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) return 'Sincronización registrada';
  return `Última sincronización: ${ts.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`;
};

export default function InventoryConnectionBanner({
  label,
  isOnline = true,
  isSyncing = false,
  lastError,
  lastSyncedAt,
  onRetry,
}: Props) {
  const hasIssue = !isOnline || !!lastError;
  const Icon = !isOnline ? WifiOff : hasIssue ? AlertTriangle : CheckCircle2;
  const tone = hasIssue
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-emerald-100 bg-emerald-50 text-emerald-900';
  const iconTone = hasIssue ? 'text-amber-700' : 'text-emerald-700';
  const message = !isOnline
    ? 'Sin conexión. Se muestra la última información guardada localmente.'
    : lastError || 'Conectado a base de datos.';

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs ${tone}`}>
      <Icon size={15} className={iconTone} />
      <span className="font-black">{label}</span>
      <span className="font-semibold">{isSyncing ? 'Sincronizando...' : message}</span>
      <span className="text-[11px] opacity-75">{formatSyncTime(lastSyncedAt)}</span>
      {hasIssue && onRetry && isOnline && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 font-bold text-amber-800 hover:bg-amber-100"
        >
          <RefreshCw size={12} />
          Reintentar
        </button>
      )}
    </div>
  );
}
