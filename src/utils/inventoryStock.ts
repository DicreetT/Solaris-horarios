export type InventoryStockMovement = {
  id?: number | string | null;
  fecha?: string | null;
  tipo_movimiento?: string | null;
  producto?: string | null;
  lote?: string | null;
  cantidad?: number | string | null;
  cantidad_signed?: number | string | null;
  signo?: number | string | null;
  bodega?: string | null;
  cliente?: string | null;
  destino?: string | null;
  notas?: string | null;
  afecta_stock?: string | null;
  source?: string | null;
};

export type InventoryStockRow = {
  producto: string;
  lote: string;
  bodega: string;
  stock: number;
};

export const cleanInventoryValue = (value: unknown) => (value == null ? '' : String(value).trim());

export const toInventoryNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeInventorySearch = (value: unknown) =>
  cleanInventoryValue(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export type InventoryStockScope = 'general' | 'canet' | 'huarte';

export const CANET_STOCK_WAREHOUSES = ['CANET', 'ENSAMBLAJE COLOMBIA', 'MAS BORRAS', 'VALENCIA'];
export const CANET_MASTER_WAREHOUSES = CANET_STOCK_WAREHOUSES;
export const HUARTE_STOCK_WAREHOUSES = ['HUARTE', 'BARCELONA', 'BILBAO', 'LOGROÑO', 'PAMPLONA'];

const CANET_STOCK_WAREHOUSE_SET = new Set(CANET_STOCK_WAREHOUSES);
const CANET_MASTER_WAREHOUSE_SET = new Set(CANET_MASTER_WAREHOUSES);
const HUARTE_STOCK_WAREHOUSE_SET = new Set(HUARTE_STOCK_WAREHOUSES);

export const normalizeInventoryWarehouse = (value: unknown) => {
  const token = cleanInventoryValue(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  if (!token) return '';
  if (token === 'CAN' || token === 'CANET') return 'CANET';
  if (token.includes('ENSAMBLAJE COL') || token.includes('COLOMBIA')) return 'ENSAMBLAJE COLOMBIA';
  if (token.includes('ENSAMBLAJE ESP') || token.includes('ESPANA')) return 'ENSAMBLAJE ESPAÑA';
  if (token.includes('MAS BORRAS') || token.includes('MASBORRAS')) return 'MAS BORRAS';
  if (token.includes('MI MEDICO') || token.includes('MIMEDICO')) return 'MI MEDICO';
  if (token.includes('VALENCIA')) return 'VALENCIA';
  if (token.includes('BARCELONA')) return 'BARCELONA';
  if (token.includes('BILBAO')) return 'BILBAO';
  if (token.includes('LOGRONO')) return 'LOGROÑO';
  if (token.includes('PAMPLONA')) return 'PAMPLONA';
  if (token.includes('HUARTE') || token.includes('GUARTE') || token.includes('WARTE') || token.includes('WUARTE')) return 'HUARTE';
  return token;
};

export const formatInventoryWarehouseLabel = (warehouse: unknown) => {
  const normalized = normalizeInventoryWarehouse(warehouse);
  if (normalized === 'MAS BORRAS') return 'MAS BORRÁS';
  return normalized;
};

export function getInventoryExpectedWarehouses(scope: InventoryStockScope, kind: 'stock' | 'master' = 'stock') {
  if (scope === 'canet') return kind === 'master' ? CANET_MASTER_WAREHOUSES : CANET_STOCK_WAREHOUSES;
  if (scope === 'huarte') return HUARTE_STOCK_WAREHOUSES;
  return [...CANET_STOCK_WAREHOUSES, ...HUARTE_STOCK_WAREHOUSES];
}

export function inventoryWarehouseBelongsToScope(warehouseRaw: unknown, scope: InventoryStockScope, kind: 'stock' | 'master' = 'stock') {
  const warehouse = normalizeInventoryWarehouse(warehouseRaw);
  if (!warehouse) return false;
  if (scope === 'canet') return kind === 'master' ? CANET_MASTER_WAREHOUSE_SET.has(warehouse) : CANET_STOCK_WAREHOUSE_SET.has(warehouse);
  if (scope === 'huarte') return HUARTE_STOCK_WAREHOUSE_SET.has(warehouse);
  return true;
}

export function sortInventoryWarehouses<T extends Record<string, unknown>>(rows: T[], scope: InventoryStockScope, kind: 'stock' | 'master' = 'stock') {
  const order = getInventoryExpectedWarehouses(scope, kind);
  return [...rows].sort((a, b) => {
    const aw = normalizeInventoryWarehouse(a.bodega);
    const bw = normalizeInventoryWarehouse(b.bodega);
    const ai = order.indexOf(aw);
    const bi = order.indexOf(bw);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return aw.localeCompare(bw);
  });
}

export const isInventoryMirrorSource = (sourceRaw: unknown) => {
  const source = cleanInventoryValue(sourceRaw).toLowerCase();
  return source === 'canet_live' || source === 'canet_auto_in' || source === 'canet';
};

export function inferInventoryMovementSign(typeRaw: unknown, quantityRaw: unknown) {
  const type = normalizeInventorySearch(typeRaw);
  if (type.includes('nota credito') || type.includes('nota_credito')) return 1;
  if (type.includes('venta') || type.includes('envio') || type.includes('traspaso')) return -1;
  if (/ajuste[\s_-]*negativ/.test(type) || /ajuste\s*-/.test(type) || type.includes('ajuste-')) return -1;
  if (/ajuste[\s_-]*positiv/.test(type) || type.includes('ajuste+')) return 1;
  return toInventoryNumber(quantityRaw) < 0 ? -1 : 1;
}

export function getInventorySignedQuantity(movement: Pick<InventoryStockMovement, 'cantidad' | 'cantidad_signed' | 'signo' | 'tipo_movimiento'>) {
  const hasSigned =
    movement.cantidad_signed !== undefined &&
    movement.cantidad_signed !== null &&
    cleanInventoryValue(movement.cantidad_signed) !== '';
  if (hasSigned) return toInventoryNumber(movement.cantidad_signed);

  const rawQuantity = toInventoryNumber(movement.cantidad);
  const explicitSign = toInventoryNumber(movement.signo);
  const sign = explicitSign !== 0 ? explicitSign : inferInventoryMovementSign(movement.tipo_movimiento, rawQuantity);
  return Math.abs(rawQuantity) * sign;
}

export const isInventoryTransferOutType = (typeRaw: unknown) => {
  const type = normalizeInventorySearch(typeRaw);
  return type.includes('traspaso') && !type.includes('entrada');
};

export const isInventoryTransferInType = (typeRaw: unknown) => {
  const type = normalizeInventorySearch(typeRaw);
  return type.includes('entrada') && type.includes('traspaso');
};

export const getInventoryTransferDestination = (movement: Pick<InventoryStockMovement, 'destino' | 'cliente'>) =>
  normalizeInventoryWarehouse(movement.destino || movement.cliente);

const getTransferPairMarker = (notesRaw: unknown) => {
  const match = cleanInventoryValue(notesRaw).match(/TRANSFER_PAIR:[A-Za-z0-9_-]+/);
  return match?.[0] || '';
};

export function buildMissingTransferEntryMovements<TMovement extends InventoryStockMovement>(
  sourceMovements: TMovement[],
  options: {
    existingMovements?: TMovement[];
    allowedDestinations?: Iterable<string>;
    idOffset?: number;
    source?: string;
    normalizeProduct?: (value: unknown, movement: TMovement) => string;
    normalizeLot?: (value: unknown, movement: TMovement) => string;
    normalizeWarehouse?: (value: unknown, movement: TMovement) => string;
  } = {},
) {
  const normalizeProduct = options.normalizeProduct || ((value: unknown) => cleanInventoryValue(value));
  const normalizeLot = options.normalizeLot || ((value: unknown) => cleanInventoryValue(value));
  const normalizeWarehouse = options.normalizeWarehouse || ((value: unknown) => normalizeInventoryWarehouse(value));
  const allowedDestinationSet = options.allowedDestinations
    ? new Set(Array.from(options.allowedDestinations).map((value) => normalizeInventoryWarehouse(value)).filter(Boolean))
    : null;
  const existing = Array.isArray(options.existingMovements) ? options.existingMovements : sourceMovements;
  const idOffset = options.idOffset || 1700000000;
  const source = options.source || 'legacy_transfer_auto_in';

  const hasExistingEntry = (movement: TMovement, destination: string, product: string, lot: string, quantity: number) => {
    const pairMarker = getTransferPairMarker(movement.notas);
    const origin = normalizeWarehouse(movement.bodega, movement);
    const date = cleanInventoryValue(movement.fecha);
    return existing.some((candidate) => {
      if (cleanInventoryValue(candidate.afecta_stock || 'SI').toUpperCase() !== 'SI') return false;
      if (!isInventoryTransferInType(candidate.tipo_movimiento)) return false;
      if (normalizeWarehouse(candidate.bodega, candidate) !== destination) return false;
      if (normalizeProduct(candidate.producto, candidate) !== product) return false;
      if (normalizeLot(candidate.lote, candidate) !== lot) return false;
      if (pairMarker && cleanInventoryValue(candidate.notas).includes(pairMarker)) return true;
      const candidateQty = Math.abs(getInventorySignedQuantity(candidate));
      const candidateOrigin = normalizeWarehouse(candidate.cliente || candidate.destino, candidate);
      const candidateDate = cleanInventoryValue(candidate.fecha);
      return (
        Math.abs(candidateQty - quantity) < 0.000001 &&
        (!origin || !candidateOrigin || candidateOrigin === origin) &&
        (!date || !candidateDate || candidateDate === date)
      );
    });
  };

  return (Array.isArray(sourceMovements) ? sourceMovements : []).flatMap((movement, index) => {
    if (cleanInventoryValue(movement.afecta_stock || 'SI').toUpperCase() !== 'SI') return [];
    if (!isInventoryTransferOutType(movement.tipo_movimiento)) return [];
    const product = normalizeProduct(movement.producto, movement);
    const lot = normalizeLot(movement.lote, movement);
    const origin = normalizeWarehouse(movement.bodega, movement);
    const destination = getInventoryTransferDestination(movement);
    if (!product || !lot || !origin || !destination || origin === destination) return [];
    if (allowedDestinationSet && !allowedDestinationSet.has(destination)) return [];
    const quantity = Math.abs(getInventorySignedQuantity(movement));
    if (quantity <= 0) return [];
    if (hasExistingEntry(movement, destination, product, lot, quantity)) return [];
    const numericId = toInventoryNumber(movement.id);
    const id = idOffset + (Number.isFinite(numericId) && numericId > 0 ? numericId : index + 1);
    const pairMarker = getTransferPairMarker(movement.notas);
    return [{
      ...(movement as Record<string, unknown>),
      id,
      tipo_movimiento: 'entrada_traspaso',
      producto: product,
      lote: lot,
      cantidad: quantity,
      cantidad_signed: quantity,
      signo: 1,
      bodega: destination,
      cliente: origin,
      destino: destination,
      source,
      notas: [
        cleanInventoryValue(movement.notas),
        pairMarker ? '' : 'Entrada calculada por traspaso histórico',
        pairMarker,
      ].filter(Boolean).join(' | '),
      afecta_stock: 'SI',
    } as TMovement];
  });
}

export function calculateInventoryStockByLot<TMovement extends InventoryStockMovement>(
  movements: TMovement[],
  options: {
    normalizeProduct?: (value: unknown, movement: TMovement) => string;
    normalizeLot?: (value: unknown, movement: TMovement) => string;
    normalizeWarehouse?: (value: unknown, movement: TMovement) => string;
    includeMovement?: (movement: TMovement) => boolean;
    signedQuantity?: (movement: TMovement) => number;
    clampNegative?: boolean;
    round?: boolean;
    skipZero?: boolean;
  } = {},
) {
  const {
    normalizeProduct = (value) => cleanInventoryValue(value),
    normalizeLot = (value) => cleanInventoryValue(value),
    normalizeWarehouse = (value) => cleanInventoryValue(value),
    includeMovement,
    signedQuantity = (movement) => getInventorySignedQuantity(movement),
    clampNegative = false,
    round = false,
    skipZero = false,
  } = options;

  const map = new Map<string, InventoryStockRow>();

  for (const movement of Array.isArray(movements) ? movements : []) {
    if (cleanInventoryValue(movement.afecta_stock || 'SI').toUpperCase() !== 'SI') continue;
    if (includeMovement && !includeMovement(movement)) continue;

    const producto = normalizeProduct(movement.producto, movement);
    const lote = normalizeLot(movement.lote, movement);
    const bodega = normalizeWarehouse(movement.bodega, movement);
    if (!producto || !lote || !bodega) continue;

    const key = `${producto}|${lote}|${bodega}`;
    if (!map.has(key)) map.set(key, { producto, lote, bodega, stock: 0 });
    map.get(key)!.stock += signedQuantity(movement);
  }

  return Array.from(map.values())
    .map((row) => {
      let stock = toInventoryNumber(row.stock);
      if (round) stock = Math.round(stock);
      if (clampNegative) stock = Math.max(0, stock);
      return { ...row, stock };
    })
    .filter((row) => !skipZero || row.stock !== 0)
    .sort((a, b) => a.producto.localeCompare(b.producto) || a.lote.localeCompare(b.lote) || a.bodega.localeCompare(b.bodega));
}

export function calculateInventoryStockSnapshot<TMovement extends InventoryStockMovement>(
  movements: TMovement[],
  options: {
    scope?: InventoryStockScope;
    expectedWarehouses?: string[];
    normalizeProduct?: (value: unknown, movement: TMovement) => string;
    normalizeLot?: (value: unknown, movement: TMovement) => string;
    normalizeWarehouse?: (value: unknown, movement: TMovement) => string;
    includeMovement?: (movement: TMovement) => boolean;
    signedQuantity?: (movement: TMovement) => number;
    rowFilter?: (row: InventoryStockRow) => boolean;
    rowTransform?: (row: InventoryStockRow) => InventoryStockRow;
    excludeMirrorSources?: boolean;
    clampNegative?: boolean;
    round?: boolean;
  } = {},
) {
  const scope = options.scope || 'general';
  const normalizeWarehouse = options.normalizeWarehouse || ((value: unknown) => normalizeInventoryWarehouse(value));
  const rows = calculateInventoryStockByLot(movements, {
    normalizeProduct: options.normalizeProduct,
    normalizeLot: options.normalizeLot,
    normalizeWarehouse,
    signedQuantity: options.signedQuantity,
    clampNegative: options.clampNegative,
    round: options.round,
    includeMovement: (movement) => {
      const warehouse = normalizeWarehouse(movement.bodega, movement);
      if (!warehouse) return false;
      if (!inventoryWarehouseBelongsToScope(warehouse, scope)) return false;
      if (options.excludeMirrorSources && isInventoryMirrorSource(movement.source)) return false;
      return options.includeMovement ? options.includeMovement(movement) : true;
    },
  })
    .map((row) => (options.rowTransform ? options.rowTransform(row) : row))
    .filter((row) => (options.rowFilter ? options.rowFilter(row) : true));

  const byWarehouse = new Map<string, number>();
  const byProduct = new Map<string, number>();
  rows.forEach((row) => {
    const stock = Math.max(0, toInventoryNumber(row.stock));
    byWarehouse.set(row.bodega, (byWarehouse.get(row.bodega) || 0) + stock);
    byProduct.set(row.producto, (byProduct.get(row.producto) || 0) + stock);
  });

  const expectedWarehouses = options.expectedWarehouses || getInventoryExpectedWarehouses(scope);
  const warehouseRows = Array.from(new Set([...expectedWarehouses, ...byWarehouse.keys()]))
    .map((bodega) => ({ bodega, stock: byWarehouse.get(bodega) || 0 }))
    .filter((row) => inventoryWarehouseBelongsToScope(row.bodega, scope))
    .sort((a, b) => {
      const ai = expectedWarehouses.indexOf(a.bodega);
      const bi = expectedWarehouses.indexOf(b.bodega);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return b.stock - a.stock;
    });

  const positiveRows = rows.filter((row) => toInventoryNumber(row.stock) > 0);
  return {
    rows,
    positiveRows,
    totalStock: positiveRows.reduce((acc, row) => acc + Math.max(0, toInventoryNumber(row.stock)), 0),
    lotCount: positiveRows.length,
    warehouseRows,
    productRows: Array.from(byProduct.entries())
      .map(([producto, stock]) => ({ producto, stock }))
      .filter((row) => row.stock > 0)
      .sort((a, b) => b.stock - a.stock),
  };
}
