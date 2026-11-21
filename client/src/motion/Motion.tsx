import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export const motionTiming = { quick: 160, page: 320, reveal: 420, stagger: 45 } as const;
export const motionEase = 'cubic-bezier(0.16, 1, 0.3, 1)';

// Animate the current DOM only: never retain a private route after logout.
export function PageTransition({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const animation = !query.matches ? ref.current?.animate(
      [{ opacity: 0.35, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: motionTiming.page, easing: motionEase },
    ) : undefined;
    const stop = () => { if (query.matches) animation?.cancel(); };
    query.addEventListener('change', stop);
    return () => { animation?.cancel(); query.removeEventListener('change', stop); };
  }, [pathname]);
  return <div ref={ref} className={`ms-page ${className}`}>{children}</div>;
}

// Content is visible by default, even without IntersectionObserver or animations.
export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    if (!element || !('IntersectionObserver' in window) || query.matches) return;
    let animation: Animation | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      if (!query.matches) animation = element.animate(
        [{ opacity: 0.4, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
        { duration: motionTiming.reveal, easing: motionEase },
      );
      observer.disconnect();
    }, { threshold: 0.12 });
    const stop = () => { if (query.matches) animation?.cancel(); };
    query.addEventListener('change', stop);
    observer.observe(element);
    return () => { observer.disconnect(); animation?.cancel(); query.removeEventListener('change', stop); };
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

// Reveal the authoritative value, never interpolate fabricated counts.
export function MetricValue({ value }: { value: number | string }) {
  return <span key={value} className="ms-value-change">{value}</span>;
}

export function SelectionTrack({ children, value, className = '', vertical = false }: { children: ReactNode; value: string; className?: string; vertical?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const container = ref.current;
    const line = indicator.current;
    if (!container || !line) return;
    const update = () => {
      const selected = container.querySelector<HTMLElement>('[aria-pressed="true"], [aria-current="page"]');
      if (!selected) { line.style.opacity = '0'; return; }
      line.style.opacity = '1';
      line.style.width = vertical ? '2px' : `${selected.offsetWidth}px`;
      line.style.height = vertical ? `${selected.offsetHeight}px` : '2px';
      line.style.transform = `translate(${selected.offsetLeft}px, ${selected.offsetTop + (vertical ? 0 : selected.offsetHeight)}px)`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [value, vertical]);
  return <div ref={ref} className={`ms-selection-track ${className}`}>{children}<span ref={indicator} className="ms-selection-line" aria-hidden="true" /></div>;
}
