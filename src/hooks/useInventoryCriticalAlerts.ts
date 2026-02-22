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

const isPreferredGroupTitle = (title?: string | null) => {
    const value = `${title || ''}`.toLowerCase();
    return value.includes('equipo') || value.includes('solaris') || value.includes('general');
};

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

async function findTeamConversationId(currentUserId: string, recipientIds: string[]): Promise<number | null> {
    const { data: memberships, error: membershipError } = await supabase
        .from('chat_participants')
        .select('conversation_id')
        .eq('user_id', currentUserId);
    if (membershipError) throw membershipError;

    const conversationIds = Array.from(
        new Set((memberships || []).map((row: any) => Number(row.conversation_id)).filter(Boolean)),
    );
    if (conversationIds.length === 0) return null;

    const { data: conversations, error: conversationsError } = await supabase
        .from('chat_conversations')
        .select('id, title, kind')
        .in('id', conversationIds)
        .eq('kind', 'group');
    if (conversationsError) throw conversationsError;
    if (!conversations || conversations.length === 0) return null;

    const groupIds = conversations.map((c: any) => c.id);
    const { data: participantRows, error: participantsError } = await supabase
        .from('chat_participants')
        .select('conversation_id, user_id')
        .in('conversation_id', groupIds);
    if (participantsError) throw participantsError;

    const participantsByConversation = new Map<number, Set<string>>();
    (participantRows || []).forEach((row: any) => {
        const set = participantsByConversation.get(row.conversation_id) || new Set<string>();
        set.add(row.user_id);
        participantsByConversation.set(row.conversation_id, set);
    });

    const ranked = conversations.map((conversation: any) => {
        const members = participantsByConversation.get(conversation.id) || new Set<string>();
        const includesRecipients = recipientIds.every((id) => members.has(id));
        const titlePreferred = isPreferredGroupTitle(conversation.title);
        const score = (includesRecipients ? 1000 : 0) + (titlePreferred ? 200 : 0) + members.size;
        return { id: conversation.id as number, score };
    });
    ranked.sort((a, b) => b.score - a.score);
    return ranked[0]?.id || null;
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

            const signature = JSON.stringify({
                day: getDateKey(),
                mounted: summary.mounted.map((r) => `${r.producto}:${Math.round(r.stockTotal)}`),
                potential: summary.potential.map((r) => `${r.producto}:${Math.round(r.cajasPotenciales)}`),
                canet: summary.canet.map((r) => `${r.producto}:${Math.round(r.stockTotal)}`),
            });
            const sent = localStorage.getItem(STOCK_ALERT_SENT_KEY);
            if (sent === signature) return;

            const message = `Alerta de stock crítico: montadas ${summary.mounted.length}, potenciales ${summary.potential.length}, Canet ${summary.canet.length}.`;
            const conversationId = await findTeamConversationId(currentUser.id, recipientIds);

            if (conversationId) {
                const { error: messageError } = await supabase.from('chat_messages').insert({
                    conversation_id: conversationId,
                    sender_id: currentUser.id,
                    message,
                    attachments: [],
                    mentions: [],
                    reply_to: null,
                    linked_task_id: null,
                    linked_meeting_id: null,
                });
                if (messageError) throw messageError;
            }

            const nowIso = new Date().toISOString();
            const rows = recipientIds.map((userId) => ({
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
