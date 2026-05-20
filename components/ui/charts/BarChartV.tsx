'use client';
import { useState } from 'react';

interface DataPoint {
  [key: string]: string | number;
}

interface BarChartVProps {
  data?: DataPoint[];
  height?: number;
  color?: string;
  color1?: string;
  color2?: string;
  labelKey?: string;
  valueKey?: string;
  tooltipSuffix?: string;
}

export function BarChartV({
  data = [],
  height = 180,
  color,
  color1,
  color2,
  labelKey = 'label',
  valueKey = 'value',
  tooltipSuffix = '',
}: BarChartVProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [tipPos, setTipPos]   = useState({ x: 0, y: 0 });

  const c1 = color ?? color1 ?? '#2997FF';
  const c2 = color2 ?? c1;

  const max = Math.max(...data.map(d => Number(d[valueKey])), 1);
  const W = 400, H = height;
  const PAD = { top: 20, bottom: 28, left: 8, right: 8 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barW   = Math.min(32, (chartW / (data.length || 1)) * 0.65);
  const gap    = chartW / (data.length || 1);

  const gradId = `bvg-${c1.replace(/[^a-z0-9]/gi, '')}`;

  function handleMouseMove(e: React.MouseEvent<SVGRectElement>, i: number) {
    const rect = (e.currentTarget as SVGRectElement).closest('svg')!.getBoundingClientRect();
    setTipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setHovered(i);
  }

  const hovItem = hovered !== null ? data[hovered] : null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none"
        onMouseLeave={() => setHovered(null)}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} stopOpacity={0.5} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(p => {
          const y = PAD.top + chartH * (1 - p);
          return <line key={p} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
            stroke="var(--border)" strokeWidth=".5" strokeDasharray="3,3" />;
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const val = Number(d[valueKey]);
          const bh  = val === 0 ? 1 : (val / max) * chartH;
          const x   = PAD.left + i * gap + (gap - barW) / 2;
          const y   = PAD.top + chartH - bh;
          const isH = hovered === i;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={bh}
                fill={isH ? c1 : `url(#${gradId})`}
                opacity={hovered !== null && !isH ? 0.4 : 1}
                rx={3}
                style={{ cursor: 'default', transition: 'opacity .15s' }}
                onMouseMove={e => handleMouseMove(e, i)}
                onMouseLeave={() => setHovered(null)}
              />
              {/* X label — show only every Nth to avoid overlap */}
              {(data.length <= 15 || i % Math.ceil(data.length / 10) === 0) && (
                <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text2)">
                  {String(d[labelKey]).slice(0, 5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hovItem !== null && (
        <div style={{
          position: 'absolute',
          left: tipPos.x,
          top: tipPos.y - 56,
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 12,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,.35)',
          zIndex: 10,
        }}>
          <div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 2 }}>
            {String(hovItem![labelKey])}
          </div>
          <div style={{ fontWeight: 800, color: c1, fontSize: 16 }}>
            {hovItem![valueKey]}{tooltipSuffix}
          </div>
        </div>
      )}
    </div>
  );
}
