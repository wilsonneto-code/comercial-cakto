'use client';

export function Divider({ style: s }: { style?: React.CSSProperties }) {
  return <div style={{ height: 1, background: 'var(--border)', ...s }} />;
}
