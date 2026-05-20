import { createContext, useCallback, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { getId } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  msg: string;
  type: ToastType;
}

type AddToast = (msg: string, type?: ToastType) => void;

const ToastCtx = createContext<AddToast | null>(null);

const ICON_MAP = {
  success: CheckCircle,
  error:   XCircle,
  info:    Info,
  warning: AlertTriangle,
};
const COLOR_MAP: Record<ToastType, string> = {
  success: 'var(--green)',
  error:   'var(--red)',
  info:    'var(--action)',
  warning: 'var(--orange)',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback<AddToast>((msg, type = 'success') => {
    const id = getId();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);

  const portal = typeof document !== 'undefined'
    ? createPortal(
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
          {toasts.map(t => {
            const Icon = ICON_MAP[t.type];
            return (
              <div key={t.id} className="toast-item" style={{ pointerEvents: 'all' }}
                onClick={() => remove(t.id)}>
                <Icon size={18} color={COLOR_MAP[t.type]} />
                <span style={{ flex: 1, color: 'var(--text)', fontSize: 13 }}>{t.msg}</span>
                <X size={14} color="var(--text2)" />
              </div>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <ToastCtx.Provider value={add}>
      {children}
      {portal}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
