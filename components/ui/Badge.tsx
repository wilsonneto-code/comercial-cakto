'use client';

interface BadgeProps {
  label: string;
  color?: string;
  style?: React.CSSProperties;
}

export function Badge({ label, color = 'var(--action)', style: s }: BadgeProps) {
  return (
    <span
      className="badge"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        ...s,
      }}
    >
      {label}
    </span>
  );
}
