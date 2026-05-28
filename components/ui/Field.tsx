'use client';
import { AlertCircle, ChevronDown, Check } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function Field({ label, error, children, required, hint }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)',
          textTransform: 'uppercase', letterSpacing: '.06em' }}>
          {label}
          {required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
        </label>
      )}
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text2)' }}>{hint}</span>}
      {error && (
        <span style={{ fontSize: 11, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertCircle size={12} color="var(--red)" />
          {error}
        </span>
      )}
    </div>
  );
}

interface SelProps {
  value: string;
  onChange: (val: string) => void;
  options?: (string | { value: string; label: string })[];
  placeholder?: string;
  disabled?: boolean;
}

export function Sel({ value, onChange, options = [], placeholder = 'Selecione...', disabled }: SelProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Normaliza opções
  const normalized = options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  // Rótulo da opção selecionada
  const selected = normalized.find(o => o.value === value);
  const displayLabel = selected?.label ?? '';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(p => !p)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: 'var(--bg-card2)',
          border: `1px solid ${open ? 'var(--action)' : 'var(--border)'}`,
          boxShadow: open ? '0 0 0 3px var(--action-dim)' : 'none',
          borderRadius: 10,
          padding: '10px 12px 10px 14px',
          color: displayLabel ? 'var(--text)' : 'var(--text2)',
          fontSize: 14,
          fontWeight: displayLabel ? 500 : 400,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          opacity: disabled ? 0.4 : 1,
          transition: 'border-color .18s, box-shadow .18s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {displayLabel || placeholder}
        </span>
        <ChevronDown
          size={15}
          color="var(--text2)"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}
        />
      </button>

      {/* Dropdown list */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-mid)',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,.45)',
          zIndex: 500,
          maxHeight: 240,
          overflowY: 'auto',
          padding: '4px',
          animation: 'scaleIn .15s cubic-bezier(.22,1,.36,1)',
        }}>
          {/* Opção vazia / placeholder */}
          {placeholder && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              style={{
                width: '100%', textAlign: 'left',
                padding: '8px 12px', borderRadius: 8,
                fontSize: 13.5, fontWeight: 400,
                color: 'var(--text2)', background: 'transparent',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'background .12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {placeholder}
            </button>
          )}

          {normalized.map(o => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 12px', borderRadius: 8,
                  fontSize: 13.5, fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? 'var(--action)' : 'var(--text)',
                  background: isSelected ? 'var(--action-dim)' : 'transparent',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => {
                  if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card2)';
                }}
                onMouseLeave={e => {
                  if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.label}
                </span>
                {isSelected && <Check size={14} color="var(--action)" style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
