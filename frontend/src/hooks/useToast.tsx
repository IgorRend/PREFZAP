import React, { useState, useCallback, useRef } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

const COLOURS: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: { bg: 'rgba(16,185,129,0.97)', border: 'rgba(16,185,129,0.4)', icon: '✓' },
    error: { bg: 'rgba(239,68,68,0.97)', border: 'rgba(239,68,68,0.4)', icon: '✗' },
    info: { bg: 'rgba(99,102,241,0.97)', border: 'rgba(99,102,241,0.4)', icon: 'ℹ' },
};

/**
 * useToast — lightweight self-contained snackbar hook.
 *
 * Usage:
 *   const { showToast, ToastContainer } = useToast();
 *   showToast('Mensagem enviada ✓', 'success');
 *   return <><YourPage /><ToastContainer /></>;
 */
export function useToast(durationMs = 2000) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const counter = useRef(0);

    const showToast = useCallback((message: string, type: ToastType = 'success') => {
        const id = ++counter.current;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), durationMs);
    }, [durationMs]);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    function ToastContainer() {
        if (toasts.length === 0) return null;
        return (
            <div className="fixed bottom-7 right-7 flex flex-col gap-2 z-[9999] pointer-events-none">
                {toasts.map(t => {
                    const c = COLOURS[t.type];
                    return (
                        <div
                            key={t.id}
                            onClick={() => dismiss(t.id)}
                            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg backdrop-blur-sm pointer-events-auto cursor-pointer select-none min-w-[200px] max-w-[340px] animate-fadeIn"
                            style={{ background: c.bg, border: `1px solid ${c.border}` }}
                        >
                            <span className="text-[15px]">{c.icon}</span>
                            {t.message}
                        </div>
                    );
                })}
            </div>
        );
    }

    return { toasts, showToast, ToastContainer };
}
