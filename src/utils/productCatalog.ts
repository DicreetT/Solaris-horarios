export type ProductKitComponent = {
  producto: string;
  cantidad: number;
  unidad?: string;
};

export const KIT_COMPONENT_UNITS = ['caja'] as const;
export const RETIRED_PRODUCT_CODES = ['TESTING KIT'] as const;

export const DEFAULT_KIT_PRODUCTS = [
  {
    producto: 'KIT BELLEZA',
    nombre: 'Kit Belleza',
    descripcion: 'Kit Belleza con 1 Isotonic y 1 Khala',
    aliases: ['KIT BELLEZA', 'BELLEZA'],
    tipo_producto: 'KIT',
    modo_stock: 'KIT',
    activo_si_no: 'SI',
    kit_componentes: [
      { producto: 'ISO', cantidad: 1, unidad: 'caja' },
      { producto: 'KL', cantidad: 1, unidad: 'caja' },
    ],
    componentes_kit: [
      { producto: 'ISO', cantidad: 1, unidad: 'caja' },
      { producto: 'KL', cantidad: 1, unidad: 'caja' },
    ],
  },
] as const;

const clean = (value: unknown) => (value == null ? '' : String(value).trim());

export function isRetiredProductCode(value: unknown) {
  const code = clean(value).toUpperCase();
  return RETIRED_PRODUCT_CODES.includes(code as (typeof RETIRED_PRODUCT_CODES)[number]);
}

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function parseKitComponentsText(value: unknown): ProductKitComponent[] {
  const raw = clean(value);
  if (!raw) return [];

  return raw
    .split(/\n|;|,/)
    .map((part) => clean(part))
    .filter(Boolean)
    .map((part) => {
      const normalized = part.replace(/\s+/g, ' ');
      const colonParts = normalized.split(':').map(clean).filter(Boolean);
      if (colonParts.length >= 2) {
        return {
          producto: clean(colonParts[0]).toUpperCase(),
          cantidad: toNumber(clean(colonParts[1]).replace(',', '.')) || 1,
          unidad: normalizeKitUnit(colonParts[2]),
        };
      }

      const qtyUnitCode = normalized.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(unidad|unidades|caja|cajas)?\s*(?:x|\*)?\s*([A-Za-z0-9._-]+)$/i);
      const codeQtyUnit = normalized.match(/^([A-Za-z0-9._-]+)\s*(?::|x|\*)?\s*([0-9]+(?:[.,][0-9]+)?)?\s*(unidad|unidades|caja|cajas)?$/i);

      if (qtyUnitCode) {
        return {
          producto: clean(qtyUnitCode[3]).toUpperCase(),
          cantidad: toNumber(clean(qtyUnitCode[1]).replace(',', '.')) || 1,
          unidad: normalizeKitUnit(qtyUnitCode[2]),
        };
      }

      if (codeQtyUnit) {
        return {
          producto: clean(codeQtyUnit[1]).toUpperCase(),
          cantidad: toNumber(clean(codeQtyUnit[2] || '1').replace(',', '.')) || 1,
          unidad: normalizeKitUnit(codeQtyUnit[3]),
        };
      }

      return {
        producto: normalized.toUpperCase(),
        cantidad: 1,
        unidad: 'caja',
      };
    })
    .filter((component) => !!component.producto && component.cantidad > 0);
}

export function normalizeKitUnit(value: unknown) {
  const unit = clean(value).toLowerCase();
  if (unit.startsWith('caja')) return 'caja';
  return 'caja';
}

export function normalizeKitComponents(value: unknown): ProductKitComponent[] {
  if (Array.isArray(value)) {
    return value
      .map((item: any) => ({
        producto: clean(item?.producto || item?.product || item?.code).toUpperCase(),
        cantidad: toNumber(item?.cantidad || item?.quantity || 1) || 1,
        unidad: normalizeKitUnit(item?.unidad || item?.unit),
      }))
      .filter((component) => !!component.producto && component.cantidad > 0);
  }

  if (typeof value === 'string') {
    try {
      return normalizeKitComponents(JSON.parse(value));
    } catch {
      return parseKitComponentsText(value);
    }
  }

  return [];
}

export function formatKitComponents(value: unknown) {
  return normalizeKitComponents(value)
    .map((component) => `${component.producto}:${component.cantidad}:${normalizeKitUnit(component.unidad)}`)
    .join('\n');
}

export function formatKitComponentsInline(value: unknown) {
  const components = normalizeKitComponents(value);
  if (components.length === 0) return '-';
  return components.map((component) => `${component.producto} x ${component.cantidad} ${normalizeKitUnit(component.unidad)}`).join(', ');
}

export function upsertProductCatalogRow<T extends Record<string, any>>(rows: T[] | null | undefined, row: T) {
  const code = clean(row.producto).toUpperCase();
  if (!code) return Array.isArray(rows) ? rows : [];
  const list = Array.isArray(rows) ? rows : [];
  const nextRow = { ...row, producto: code };
  const exists = list.some((item) => clean(item.producto).toUpperCase() === code);
  if (!exists) return [...list, nextRow];
  return list.map((item) => (clean(item.producto).toUpperCase() === code ? { ...item, ...nextRow } : item));
}
