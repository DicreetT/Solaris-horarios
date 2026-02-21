import React from 'react';
import { CheckCircle2, Download, Pencil, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { successFeedbackEventName } from '../utils/uiFeedback';

type ToastState = {
    id: number;
    message: string;
};

export default function GlobalSuccessToast() {
    const [toast, setToast] = React.useState<ToastState | null>(null);
    const [visible, setVisible] = React.useState(false);
    const [sparkles, setSparkles] = React.useState(false);
    const [burst, setBurst] = React.useState(false);
    const counterRef = React.useRef(0);
    const hideTimerRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        const onSuccess = (event: Event) => {
            const custom = event as CustomEvent<{ message?: string }>;
            const message = `${custom.detail?.message || 'Acción completada con éxito.'}`.trim();
            counterRef.current += 1;
            const id = counterRef.current;

            setToast({ id, message });
            setVisible(true);
            setSparkles(true);
            setBurst(true);

            window.setTimeout(() => setSparkles(false), 450);
            window.setTimeout(() => setBurst(false), 700);
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = window.setTimeout(() => {
                setVisible(false);
            }, 2600);
        };

        window.addEventListener(successFeedbackEventName, onSuccess as EventListener);
        return () => {
            window.removeEventListener(successFeedbackEventName, onSuccess as EventListener);
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        };
    }, []);

    if (!toast) return null;

    const text = toast.message.toLowerCase();
    const variant: 'create' | 'update' | 'delete' | 'complete' | 'download' = (() => {
        if (text.includes('eliminad') || text.includes('borrad') || text.includes('rechazad') || text.includes('deneg')) return 'delete';
        if (text.includes('pdf') || text.includes('descarg')) return 'download';
        if (text.includes('finaliz') || text.includes('complet') || text.includes('marc')) return 'complete';
        if (text.includes('actualiz') || text.includes('guardad') || text.includes('editad') || text.includes('resoluc')) return 'update';
        return 'create';
    })();

    const stylesByVariant = {
        create: {
            container: 'border-violet-300',
            text: 'text-violet-900',
            icon: 'text-violet-600',
            spark: 'text-violet-400',
            sparkBg: 'bg-violet-400',
        },
        update: {
            container: 'border-sky-300',
            text: 'text-sky-900',
            icon: 'text-sky-600',
            spark: 'text-sky-400',
            sparkBg: 'bg-sky-400',
        },
        delete: {
            container: 'border-rose-300',
            text: 'text-rose-900',
            icon: 'text-rose-600',
            spark: 'text-rose-400',
            sparkBg: 'bg-rose-400',
        },
        complete: {
            container: 'border-emerald-300',
            text: 'text-emerald-900',
            icon: 'text-emerald-600',
            spark: 'text-emerald-400',
            sparkBg: 'bg-emerald-400',
        },
        download: {
            container: 'border-amber-300',
            text: 'text-amber-900',
            icon: 'text-amber-600',
            spark: 'text-amber-400',
            sparkBg: 'bg-amber-400',
        },
    } as const;

    const variantStyle = stylesByVariant[variant];
    const LeadingIcon = variant === 'delete'
        ? Trash2
        : variant === 'update'
            ? Pencil
            : variant === 'download'
                ? Download
                : variant === 'complete'
                    ? CheckCircle2
                    : Wand2;

    return (
        <div className="fixed inset-0 z-[9998] pointer-events-none flex items-center justify-center px-4">
            {visible && (
                <div className="absolute inset-0 bg-black/5" />
            )}

            {burst && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`w-56 h-56 rounded-full ${variantStyle.sparkBg} opacity-20 blur-2xl animate-ping`} />
                </div>
            )}

            <div
                className={`relative overflow-hidden rounded-2xl border ${variantStyle.container} bg-white/96 backdrop-blur-xl px-5 py-4 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.45)] transition-all duration-300 ${
                    visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-2 opacity-0 scale-90'
                }`}
            >
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                    <div className="absolute -inset-3 rounded-3xl border border-white/35" />
                    <div className="absolute -inset-6 rounded-[2rem] border border-white/20" />
                </div>

                <div className="flex items-center gap-2 pr-1">
                    <LeadingIcon size={18} className={`${variantStyle.icon} shrink-0`} />
                    <p className={`text-base font-black ${variantStyle.text}`}>{toast.message}</p>
                    <Sparkles size={16} className={`${variantStyle.spark} shrink-0`} />
                </div>

                {sparkles && (
                    <div className="absolute inset-0 pointer-events-none">
                        <span className={`absolute left-2 top-1 ${variantStyle.spark} animate-ping`}>✦</span>
                        <span className={`absolute right-3 top-1 ${variantStyle.spark} animate-ping`}>✧</span>
                        <span className={`absolute right-7 bottom-1 ${variantStyle.spark} animate-ping`}>✦</span>
                        <span className={`absolute left-8 bottom-1 ${variantStyle.spark} animate-ping`}>✧</span>
                    </div>
                )}
            </div>
        </div>
    );
}
