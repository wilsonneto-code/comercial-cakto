'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, children, width = 520, footer }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="overlay" onClick={onClose}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="modal-box" style={{ width: '100%', maxWidth: width }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ cursor: 'pointer', background: 'none', border: 'none',
            color: 'var(--text2)', borderRadius: 6, padding: 4, display: 'flex' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
        {footer && (
          <div style={{ padding: '0 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
}

export function ConfirmModal({ open, onClose, onConfirm, title, description }: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || 'Confirmar exclusão'}
      width={420}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={() => { onConfirm(); onClose(); }}>Excluir</Button>
        </>
      }
    >
      <p style={{ color: 'var(--text2)', fontSize: 14 }}>
        {description || 'Essa ação não pode ser desfeita. Deseja continuar?'}
      </p>
    </Modal>
  );
}
