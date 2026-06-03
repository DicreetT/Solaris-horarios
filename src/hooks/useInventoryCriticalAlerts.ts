import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types';
import { USERS } from '../constants';

const INVENTORY_ALERTS_KEY = 'inventory_alerts_summary_v1';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

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
        return { mounted, potential, canet };
    } catch {
        return { mounted: [], potential: [], canet: [] };
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
            const message = 'Recuerda revisar el stock crítico de inventario.';
            const dayStart = `${day}T00:00:00.000Z`;
            const { data: existingTodayRows } = await supabase
                .from('notifications')
                .select('id, user_id')
                .in('user_id', recipientIds)
                .eq('message', message)
                .gte('created_at', dayStart);

            const existingUsers = new Set((existingTodayRows || []).map((row: any) => row.user_id));
            const missingRecipients = recipientIds.filter((id) => !existingUsers.has(id));
            if (missingRecipients.length === 0) return;

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
