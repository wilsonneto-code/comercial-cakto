'use client';

interface DataPoint {
  [key: string]: string | number;
}

interface BarChartVProps {
  data?: DataPoint[];
  height?: number;
  color1?: string;
  color2?: string;
  labelKey?: string;
  valueKey?: string;
}

export function BarChartV({
  data = [],
  height = 180,
  color1 = '#2997FF',
  color2 = '#BF5AF2',
  labelKey = 'label',
  valueKey = 'value',
}: BarChartVProps) {
  const max = Math.max(...data.map(d => Number(d[valueKey])), 1);
  const W = 400, H = height;
  const PAD = { top: 16, bottom: 32, left: 32, right: 8 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barW = Math.min(36, (chartW / (data.length || 1)) * 0.65);
  const gap = chartW / (data.length || 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="bvg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color1} />
          <stop offset="100%" stopColor={color2} />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map(p => {
        const y = PAD.top + chartH * (1 - p);
        return (
          <line key={p} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
            stroke="var(--border)" strokeWidth=".5" strokeDasharray="3,3" />
        );
      })}
      {data.map((d, i) => {
        const bh = (Number(d[valueKey]) / max) * chartH;
        const x = PAD.left + i * gap + (gap - barW) / 2;
        const y = PAD.top + chartH - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} fill="url(#bvg)" rx={0} />
            <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text2)">
              {String(d[labelKey]).slice(0, 6)}
            </text>
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="var(--text)" fontWeight={600}>
              {d[valueKey]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
