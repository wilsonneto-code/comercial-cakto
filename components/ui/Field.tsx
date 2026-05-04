'use client';
import { AlertCircle } from 'lucide-react';

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
  return (
    <div style={{ position: 'relative' }}>
      <select
        className="inp"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{ paddingRight: 36 }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o =>
          typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
        )}
      </select>
      <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
          fill="none" stroke="var(--text2)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </div>
    </div>
  );
}
