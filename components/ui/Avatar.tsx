'use client';
import { avatarColor, initials } from '@/lib/utils';

interface AvatarProps {
  name?: string;
  size?: number;
  style?: React.CSSProperties;
}

export function Avatar({ name = '?', size = 36, style: s }: AvatarProps) {
  const bg = avatarColor(name);
  const fs = size * 0.38;
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, background: bg, fontSize: fs, color: '#fff', ...s }}
    >
      {initials(name)}
    </div>
  );
}
