'use client';
import { LucideIcon } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'success' | 'warning';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children?: React.ReactNode;
  variant?: Variant;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  size?: Size;
  icon?: LucideIcon;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

const SIZES = {
  sm: { padding: '6px 12px', fontSize: 12, iconSize: 14 },
  md: { padding: '9px 18px', fontSize: 14, iconSize: 16 },
  lg: { padding: '12px 24px', fontSize: 15, iconSize: 18 },
};

const VARIANTS: Record<Variant, React.CSSProperties> = {
  primary:     { background: 'var(--action)', color: '#fff' },
  secondary:   { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' },
  ghost:       { background: 'transparent', color: 'var(--text2)' },
  destructive: { background: 'color-mix(in srgb, var(--red) 12%, transparent)', color: 'var(--red)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)' },
  success:     { background: 'color-mix(in srgb, var(--green) 15%, transparent)', color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)' },
  warning:     { background: 'color-mix(in srgb, var(--orange) 12%, transparent)', color: 'var(--orange)', border: '1px solid color-mix(in srgb, var(--orange) 25%, transparent)' },
};

export function Button({
  children,
  variant = 'primary',
  onClick,
  disabled,
  style: s,
  size = 'md',
  icon: Icon,
  type = 'button',
  className,
}: ButtonProps) {
  const sz = SIZES[size];
  const variantStyle = VARIANTS[variant];

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    borderRadius: 8,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .15s',
    border: 'none',
    fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
    padding: sz.padding,
    fontSize: sz.fontSize,
    ...variantStyle,
    ...s,
  };

  return (
    <button
      type={type}
      style={baseStyle}
      onClick={onClick}
      disabled={disabled}
      className={className}
      onMouseEnter={e => {
        if (disabled) return;
        if (variant === 'primary') (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.12)';
        else if (variant === 'ghost') (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card2)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.filter = '';
        if (variant === 'ghost') (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      {Icon && <Icon size={sz.iconSize} />}
      {children}
    </button>
  );
}
