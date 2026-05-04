export const AVATAR_PALETTE = ['#2997FF','#BF5AF2','#34C759','#FF375F','#FF9500','#64D2FF','#FFD60A','#FF453A'];

export function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFFFF;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

export function formatDate(str: string) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

export function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export function capitalize(str = '') {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

export function getId() { return Date.now() + Math.random(); }

export function getUserById(id: number, users: { id: number }[]) {
  return users.find(u => u.id === id);
}

export function getTeamName(userId: number, teams: { members: number[]; name: string }[]) {
  const t = teams.find(t => t.members.includes(userId));
  return t ? t.name : '—';
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export const ROLE_COLORS: Record<string, string> = {
  'Closer':            'var(--purple)',
  'SDR':               'var(--action)',
  'Gerente de Contas': 'var(--orange)',
  'Head Comercial':    'var(--pink)',
  'Admin':             'var(--text2)',
  'Colaborador':       'var(--text2)',
};

export const CHANNEL_COLORS: Record<string, string> = {
  'Inbound':   'var(--green)',
  'Outbound':  'var(--action)',
  'Indicação': 'var(--purple)',
};

export const STATUS_COLORS: Record<string, string> = {
  'Pendente':    'var(--orange)',
  'Em Trânsito': 'var(--action)',
  'Entregue':    'var(--green)',
  'Cancelado':   'var(--red)',
  'Agendada':    'var(--action)',
  'Realizada':   'var(--green)',
  'Cancelada':   'var(--red)',
  'Pago':        'var(--green)',
  'Ativo':       'var(--green)',
  'Inativo':     'var(--red)',
};
