import { IconHand } from './Icons';

export function HandCount({ count }: { count: number }) {
  if (!count) return null;
  return <span aria-label={`${count} ${count === 1 ? 'mão levantada' : 'mãos levantadas'}`}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#93c5fd', fontSize: 11, fontWeight: 600 }}>
    <IconHand size={12} aria-hidden /><span aria-hidden>{count}</span>
  </span>;
}
