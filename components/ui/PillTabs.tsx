'use client';

interface PillTabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
  style?: React.CSSProperties;
}

export function PillTabs({ tabs, active, onChange, style: s }: PillTabsProps) {
  return (
    <div className="pill-tabs" style={s}>
      {tabs.map(t => (
        <div key={t} className={`pill-tab ${active === t ? 'active' : ''}`} onClick={() => onChange(t)}>
          {t}
        </div>
      ))}
    </div>
  );
}
