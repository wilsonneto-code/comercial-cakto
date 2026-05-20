'use client';

interface ToggleProps {
  value: boolean;
  onChange: (val: boolean) => void;
}

export function Toggle({ value, onChange }: ToggleProps) {
  return (
    <div
      className={`toggle-track ${value ? 'on' : ''}`}
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      tabIndex={0}
      onKeyDown={e => e.key === ' ' && onChange(!value)}
    >
      <div className="toggle-thumb" />
    </div>
  );
}
