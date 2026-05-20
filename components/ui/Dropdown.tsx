'use client';
import React, { useEffect, useRef } from 'react';
import { Divider } from './Divider';
import * as Icons from 'lucide-react';

interface DropdownItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  style?: React.CSSProperties;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: (DropdownItem | 'divider')[];
  open: boolean;
  onClose: () => void;
}

export function Dropdown({ trigger, items, open, onClose }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      {trigger}
      {open && (
        <div className="dropdown-menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200 }}>
          {items.map((item, i) => {
            if (item === 'divider') return <Divider key={i} />;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Icon = item.icon ? (Icons as any)[item.icon] as React.ComponentType<{ size?: number; color?: string }> : null;
            return (
              <div
                key={i}
                className={`dropdown-item ${item.danger ? 'danger' : ''}`}
                onClick={() => { item.onClick(); onClose(); }}
                style={item.style}
              >
                {Icon && <Icon size={16} color={item.danger ? 'var(--red)' : 'var(--text2)'} />}
                {item.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
