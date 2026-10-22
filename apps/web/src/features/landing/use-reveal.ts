import { useEffect, useRef, useState } from 'react';

/**
 * 'static' is the final, fully visible state used on the server, without JavaScript,
 * with reduced motion and for content already on screen at hydration.
 * 'pending' hides content that is still below the fold; 'play' runs its one-shot entrance.
 */
export type RevealState = 'static' | 'pending' | 'play';

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useReveal<T extends Element>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<RevealState>('static');
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    const { top } = element.getBoundingClientRect();
    if (top < window.innerHeight * 0.9) return;
    setState('pending');
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setState('play');
      observer.disconnect();
    }, { threshold, rootMargin: '0px 0px -8% 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, state] as const;
}
