'use client';

interface DataPoint {
  [key: string]: string | number;
}

interface BarChartHProps {
  data?: DataPoint[];
  valueKey?: string;
  labelKey?: string;
  color1?: string;
  color2?: string;
}

export function BarChartH({
  data = [],
  valueKey = 'value',
  labelKey = 'label',
  color1 = '#2997FF',
  color2 = '#BF5AF2',
}: BarChartHProps) {
  const max = Math.max(...data.map(d => Number(d[valueKey])), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 12, color: 'var(--text2)', width: 90, textAlign: 'right', flexShrink: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {d[labelKey]}
          </span>
          <div style={{ flex: 1, height: 10, background: 'var(--bg-card2)', borderRadius: 0, overflow: 'hidden' }}>
            <div style={{
              width: `${(Number(d[valueKey]) / max) * 100}%`, height: '100%', borderRadius: 0,
              background: `linear-gradient(90deg,${color1},${color2})`, transition: 'width .4s',
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', width: 28, flexShrink: 0 }}>
            {d[valueKey]}
          </span>
        </div>
      ))}
    </div>
  );
}
