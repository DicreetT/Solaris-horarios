import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { KIT_COMPONENT_UNITS, formatKitComponents, normalizeKitComponents, normalizeKitUnit } from '../../utils/productCatalog';

type ProductKitComposerProps = {
  value: string;
  onChange: (value: string) => void;
  productOptions: string[];
};

const clean = (value: unknown) => (value == null ? '' : String(value).trim());

export default function ProductKitComposer({ value, onChange, productOptions }: ProductKitComposerProps) {
  const [draftProduct, setDraftProduct] = useState('');
  const [draftQuantity, setDraftQuantity] = useState('1');
  const [draftUnit, setDraftUnit] = useState('caja');
  const components = useMemo(() => normalizeKitComponents(value), [value]);

  const addComponent = () => {
    const product = clean(draftProduct).toUpperCase();
    const quantity = Number(String(draftQuantity).replace(',', '.'));
    if (!product || !Number.isFinite(quantity) || quantity <= 0) return;
    const next = [
      ...components,
      {
        producto: product,
        cantidad: quantity,
        unidad: normalizeKitUnit(draftUnit),
      },
    ];
    onChange(formatKitComponents(next));
    setDraftProduct('');
    setDraftQuantity('1');
    setDraftUnit('caja');
  };

  const removeComponent = (index: number) => {
    onChange(formatKitComponents(components.filter((_, idx) => idx !== index)));
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
      <p className="text-xs font-black uppercase tracking-wider text-violet-700">Componentes del kit</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_90px_110px_auto]">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-violet-600">
          Producto
          <input
            list="kit-product-options"
            value={draftProduct}
            onChange={(event) => setDraftProduct(event.target.value)}
            placeholder="SV, ENT, ISO..."
            className="rounded-lg border border-violet-200 bg-white p-2 text-sm normal-case tracking-normal text-violet-900 outline-none"
          />
          <datalist id="kit-product-options">
            {productOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-violet-600">
          Cant.
          <input
            type="number"
            min="0"
            step="0.01"
            value={draftQuantity}
            onChange={(event) => setDraftQuantity(event.target.value)}
            className="rounded-lg border border-violet-200 bg-white p-2 text-sm normal-case tracking-normal text-violet-900 outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-violet-600">
          Unidad
          <select
            value={draftUnit}
            onChange={(event) => setDraftUnit(event.target.value)}
            className="rounded-lg border border-violet-200 bg-white p-2 text-sm normal-case tracking-normal text-violet-900 outline-none"
          >
            {KIT_COMPONENT_UNITS.map((unit) => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={addComponent}
          className="self-end rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700"
        >
          <span className="inline-flex items-center gap-1">
            <Plus size={14} />
            Añadir
          </span>
        </button>
      </div>

      <div className="mt-3 space-y-1">
        {components.map((component, index) => (
          <div key={`${component.producto}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-violet-100 bg-white px-2 py-1.5">
            <span className="text-sm font-bold text-violet-950">
              {component.producto} · {component.cantidad} {normalizeKitUnit(component.unidad)}
            </span>
            <button type="button" onClick={() => removeComponent(index)} className="rounded-md p-1 text-rose-600 hover:bg-rose-50">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {components.length === 0 && (
          <p className="rounded-lg border border-dashed border-violet-200 bg-white px-2 py-2 text-xs font-semibold text-violet-500">
            Añade los subproductos del kit. Ejemplo: SV · 1 caja, ENT · 1 caja.
          </p>
        )}
      </div>
    </div>
  );
}
