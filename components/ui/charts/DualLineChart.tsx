'use client';

interface DataPoint { value: number; }

interface DualLineChartProps {
  dataA?: DataPoint[];
  dataB?: DataPoint[];
  height?: number;
  colorA?: string;
  colorB?: string;
  labelA?: string;
  labelB?: string;
}

export function DualLineChart({
  dataA = [],
  dataB = [],
  height = 160,
  colorA = '#2997FF',
  colorB = '#BF5AF2',
  labelA = 'A',
  labelB = 'B',
}: DualLineChartProps) {
  const allVals = [...dataA, ...dataB].map(d => d.value);
  const max = Math.max(...allVals, 1);
  const W = 400, H = height;
  const PAD = { top: 16, bottom: 28, left: 8, right: 8 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const pts = (arr: DataPoint[]) =>
    arr.map((d, i) => ({
      x: PAD.left + (i / (arr.length - 1 || 1)) * cW,
      y: PAD.top + cH - (d.value / max) * cH,
    }));

  const path = (arr: DataPoint[]) =>
    pts(arr).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      {dataA.length > 0 && (
        <path d={path(dataA)} fill="none" stroke={colorA} strokeWidth="2"
          style={{ filter: `drop-shadow(0 0 6px ${colorA}88)` }} />
      )}
      {dataB.length > 0 && (
        <path d={path(dataB)} fill="none" stroke={colorB} strokeWidth="2"
          style={{ filter: `drop-shadow(0 0 6px ${colorB}88)` }} />
      )}
      <rect x={PAD.left} y={4} width={10} height={3} fill={colorA} rx={1} />
      <text x={PAD.left + 14} y={8} fontSize={9} fill="var(--text2)">{labelA}</text>
      <rect x={PAD.left + 50} y={4} width={10} height={3} fill={colorB} rx={1} />
      <text x={PAD.left + 64} y={8} fontSize={9} fill="var(--text2)">{labelB}</text>
    </svg>
  );
}
