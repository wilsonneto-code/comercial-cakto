'use client';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: LucideIcon;
  color?: string;
  trend?: number;
  style?: React.CSSProperties;
}

export function KpiCard({ label, value, sub, icon: Icon = Activity, color = 'var(--action)', trend, style: s }: KpiCardProps) {
  return (
    <div className="kpi-card" style={s}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)',
          textTransform: 'uppercase', letterSpacing: '.08em' }}>
          {label}
        </span>
        <div style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
          <Icon size={18} color={color} />
        </div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em',
        color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value}
      </div>
      {(sub || trend !== undefined) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          {trend !== undefined && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600,
              color: trend >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {trend >= 0
                ? <TrendingUp size={13} color="var(--green)" />
                : <TrendingDown size={13} color="var(--red)" />}
              {Math.abs(trend)}%
            </span>
          )}
          {sub && <span style={{ fontSize: 12, color: 'var(--text2)' }}>{sub}</span>}
        </div>
      )}
    </div>
  );
}
