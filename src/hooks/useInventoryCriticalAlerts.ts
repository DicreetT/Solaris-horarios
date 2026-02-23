import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types';
import { USERS } from '../constants';
import huarteSeed from '../data/inventory_facturacion_seed.json';
import canetSeed from '../data/inventory_seed.json';

const INVENTORY_ALERTS_KEY = 'inventory_alerts_summary_v1';
const INVENTORY_HUARTE_MOVS_KEY = 'invhf_movimientos_v1';
const STOCK_ALERT_SENT_KEY = 'inventory-stock-alert:last';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const clean = (v: unknown) => (v == null ? '' : String(v).trim());
const toNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const getDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

const getAlertRecipients = () => {
    const wanted = ['thalia', 'itzi', 'esteban', 'anabel'];
    return USERS.filter((u) => wanted.some((tag) => u.name.toLowerCase().includes(tag))).map((u) => u.id);
};

type AlertSummary = {
    mounted: Array<{ producto: string; stockTotal: number; coberturaMeses: number }>;
    potential: Array<{ producto: string; cajasPotenciales: number; coberturaMeses: number }>;
    canet: Array<{ producto: string; stockTotal: number; coberturaMeses: number }>;
};

async function buildMountedCriticalFromHuarte(): Promise<Array<{ producto: string; stockTotal: number; coberturaMeses: number }>> {
    const { data } = await supabase
        .from('shared_json_state')
        .select('payload')
        .eq('key', INVENTORY_HUARTE_MOVS_KEY)
        .maybeSingle();
    const source = Array.isArray(data?.payload) ? data?.payload : (huarteSeed.movimientos || []);

    const productos = (canetSeed.productos as any[]) || [];
    const consumoByProduct = new Map<string, number>();
    productos.forEach((p: any) => {
        const code = clean(p.producto).toUpperCase();
        if (!code || code === 'PRODUCTO') return;
        consumoByProduct.set(code, toNum(p.consumo_mensual_cajas));
    });

    const stockByProduct = new Map<string, number>();
    (source || []).forEach((m: any) => {
        const producto = clean(m?.producto).toUpperCase();
        const lote = clean(m?.lote);
        const bodega = clean(m?.bodega);
        if (!producto || producto === 'PRODUCTO' || !lote || !bodega) return;
        const signed = Number(m?.cantidad_signed);
        const qty = Number.isFinite(signed) ? signed : toNum(m?.cantidad) * (toNum(m?.signo) || 1);
        stockByProduct.set(producto, (stockByProduct.get(producto) || 0) + qty);
    });

    return Array.from(stockByProduct.entries())
        .map(([producto, stockTotal]) => {
            const consumo = consumoByProduct.get(producto) || 0;
            const total = Math.max(0, toNum(stockTotal));
            const coberturaMeses = consumo > 0 ? total / consumo : 0;
            return { producto, stockTotal: total, coberturaMeses };
        })
        .filter((row) => row.stockTotal > 0 && row.coberturaMeses > 0 && row.coberturaMeses < 3)
        .sort((a, b) => a.coberturaMeses - b.coberturaMeses)
        .slice(0, 12);
}

async function buildSummaryFromStorage(): Promise<AlertSummary> {
    try {
        const { data } = await supabase
            .from('shared_json_state')
            .select('payload')
            .eq('key', INVENTORY_ALERTS_KEY)
            .maybeSingle();
        const parsed = data?.payload || null;
        const mounted = (parsed?.mountedCritical || []) as AlertSummary['mounted'];
        const potential = (parsed?.potentialCritical || []) as AlertSummary['potential'];
        const canet = (parsed?.criticalProducts || []) as AlertSummary['canet'];
        return {
            mounted: mounted.length > 0 ? mounted : await buildMountedCriticalFromHuarte(),
            potential,
            canet,
        };
    } catch {
        return {
            mounted: await buildMountedCriticalFromHuarte(),
            potential: [],
            canet: [],
        };
    }
}

export function useInventoryCriticalAlerts(currentUser: User | null) {
    useEffect(() => {
        if (!currentUser?.isAdmin) return;

        let cancelled = false;

        const run = async () => {
            if (cancelled) return;

            const recipientIds = getAlertRecipients();
            if (recipientIds.length === 0) return;

            const summary = await buildSummaryFromStorage();
            const totalCritical = summary.mounted.length + summary.potential.length + summary.canet.length;
            if (totalCritical === 0) return;

            const day = getDateKey();
            const signature = JSON.stringify({ day });
            const sent = localStorage.getItem(STOCK_ALERT_SENT_KEY);
            if (sent === signature) return;

            const message = `Recuerda revisar stock crítico (montadas ${summary.mounted.length}, potenciales ${summary.potential.length}, Canet ${summary.canet.length}).`;
            const dayStart = `${day}T00:00:00.000Z`;

            const { data: existingTodayRows } = await supabase
                .from('notifications')
                .select('id, user_id')
                .in('user_id', recipientIds)
                .eq('message', message)
                .gte('created_at', dayStart);

            const existingUsers = new Set((existingTodayRows || []).map((row: any) => row.user_id));
            const missingRecipients = recipientIds.filter((id) => !existingUsers.has(id));
            if (missingRecipients.length === 0) {
                localStorage.setItem(STOCK_ALERT_SENT_KEY, signature);
                return;
            }

            const nowIso = new Date().toISOString();
            const rows = missingRecipients.map((userId) => ({
                user_id: userId,
                type: 'action_required',
                message,
                read: false,
                created_at: nowIso,
            }));
            const { error: notificationsError } = await supabase.from('notifications').insert(rows);
            if (notificationsError) throw notificationsError;

            localStorage.setItem(STOCK_ALERT_SENT_KEY, signature);
        };

        void run();
        const timer = window.setInterval(() => {
            void run().catch((error) => {
                console.error('inventory critical alert error:', error);
            });
        }, CHECK_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [currentUser]);
}
