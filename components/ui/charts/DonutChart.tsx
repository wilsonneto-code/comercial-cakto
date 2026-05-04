'use client';

export interface DonutSegment { label: string; value: number; color: string }

interface DonutChartProps {
  data: DonutSegment[]
  size?: number
  thickness?: number
}

export function DonutChart({ data, size = 140, thickness = 20 }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const cx = size / 2, cy = size / 2
  const r  = size / 2 - thickness / 2 - 4
  const C  = 2 * Math.PI * r

  let accumulated = 0

  return (
    <svg width={size} height={size} style={{ overflow: 'visible', flexShrink: 0 }}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="rgba(255,255,255,0.05)" strokeWidth={thickness} />

      {data.map((d, i) => {
        const dashLen  = Math.max((d.value / total) * C - 3, 0)
        const rotateDeg = (accumulated / total) * 360
        accumulated += d.value
        return (
          <circle key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={thickness}
            strokeDasharray={`${dashLen} ${C - dashLen}`}
            strokeDashoffset={C / 4}
            transform={`rotate(${rotateDeg}, ${cx}, ${cy})`}
            style={{ filter: `drop-shadow(0 0 6px ${d.color}99)` }}
          />
        )
      })}

      {/* Center label */}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={18} fontWeight={800} fill="#F8FAFC">
        {total.toLocaleString('pt-BR')}
      </text>
    </svg>
  )
}
