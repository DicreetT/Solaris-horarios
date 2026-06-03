export function rawErrorText(error: unknown) {
  const e = error as any;
  return [e?.message, e?.details, e?.hint, typeof error === 'string' ? error : '']
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
    .join(' · ');
}

export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function isTransientConnectionError(error: unknown) {
  const text = rawErrorText(error).toLowerCase();
  return (
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('tiempo de espera') ||
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('fetch') ||
    text.includes('connection') ||
    text.includes('conectar')
  );
}

export function describeConnectionError(error: unknown, fallback = 'No se pudo completar la operación.') {
  const text = rawErrorText(error);
  const low = text.toLowerCase();

  if (isBrowserOffline()) {
    return 'Sin conexión a internet. Se mantiene la última información local y se puede reintentar cuando vuelva la conexión.';
  }
  if (isTransientConnectionError(error)) {
    return 'No se pudo conectar con la base de datos a tiempo. Revisa la conexión y vuelve a intentar; la app conserva la última información local.';
  }
  if (low.includes('row-level security') || low.includes('permission') || low.includes('not authorized')) {
    return 'La base de datos rechazó el cambio por permisos de seguridad. Revisa la sesión o las políticas de Supabase.';
  }
  if (low.includes('jwt') || low.includes('token') || low.includes('session') || low.includes('auth')) {
    return 'La sesión parece caducada. Cierra sesión y vuelve a entrar.';
  }
  if (low.includes('duplicate key') || low.includes('already exists')) {
    return 'Ese registro ya existe en la base de datos.';
  }
  return text || fallback;
}
