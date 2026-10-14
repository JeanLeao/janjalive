const AVATAR_PALETTES = [
  { bg: '#1e3a8a', text: '#93c5fd' }, // blue
  { bg: '#312e81', text: '#c7d2fe' }, // indigo
  { bg: '#581c87', text: '#e9d5ff' }, // purple
  { bg: '#701a75', text: '#f5d0fe' }, // fuchsia
  { bg: '#831843', text: '#fbcfe8' }, // pink
  { bg: '#064e3b', text: '#6ee7b7' }, // emerald
  { bg: '#134e4a', text: '#5eead4' }, // teal
  { bg: '#164e63', text: '#67e8f9' }, // cyan
  { bg: '#78350f', text: '#fde68a' }, // amber
  { bg: '#7c2d12', text: '#fed7aa' }, // orange
];

export function getAvatarColor(name: string): { bg: string; text: string } {
  if (!name) return { bg: '#21262d', text: '#8c959f' };
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

export function getInitials(name?: string): string {
  if (!name || !name.trim()) return 'V';
  const clean = name.trim();
  if (clean.toLowerCase() === 'você' || clean.toLowerCase() === 'voce') return 'V';
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatDisplayName(nickname?: string, isLocal?: boolean): string {
  const trimmed = nickname?.trim();
  if (!trimmed) {
    return isLocal ? 'Visitante (você)' : 'Visitante';
  }
  if (trimmed.toLowerCase() === 'você' || trimmed.toLowerCase() === 'voce') {
    return isLocal ? 'Você' : 'Visitante';
  }
  return isLocal ? `${trimmed} (você)` : trimmed;
}
