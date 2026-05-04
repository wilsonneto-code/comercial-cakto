'use client';

interface DataPoint {
  [key: string]: string | number;
}

interface LineAreaChartProps {
  data?: DataPoint[];
  height?: number;
  color?: string;
  valueKey?: string;
  labelKey?: string;
}

export function LineAreaChart({
  data = [],
  height = 160,
  color = '#2997FF',
  valueKey = 'value',
  labelKey = 'label',
}: LineAreaChartProps) {
  const max = Math.max(...data.map(d => Number(d[valueKey])), 1);
  const W = 400, H = height;
  const PAD = { top: 16, bottom: 28, left: 8, right: 8 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const pts = data.map((d, i) => ({
    x: PAD.left + (i / (data.length - 1 || 1)) * chartW,
    y: PAD.top + chartH - (Number(d[valueKey]) / max) * chartH,
    v: d[valueKey],
    l: d[labelKey],
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = pts.length
    ? `${linePath} L${pts[pts.length - 1].x},${PAD.top + chartH} L${pts[0].x},${PAD.top + chartH} Z`
    : '';

  const uid = `ag${color.replace(/\W/g, '')}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill={`url(#${uid})`} />}
      {linePath && (
        <path d={linePath} fill="none" stroke={color} strokeWidth="2"
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }} />
      )}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.5} fill={color} stroke="var(--bg-card)" strokeWidth={2} />
          {i % Math.ceil(pts.length / 6) === 0 && (
            <text x={p.x} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--text2)">{p.l}</text>
          )}
        </g>
      ))}
    </svg>
  );
}
