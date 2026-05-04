'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}

export function Sheet({ open, onClose, title, children, width = 480 }: SheetProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const w = typeof window !== 'undefined' ? Math.min(width, window.innerWidth) : width;

  return createPortal(
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet-box" style={{ width: w }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
        }}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{
            cursor: 'pointer', background: 'none', border: 'none',
            color: 'var(--text2)', borderRadius: 6, padding: 4, display: 'flex',
          }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </>,
    document.body
  );
}
