import { useEffect, useState, type RefObject } from 'react';

/**
 * True once the element has come near the viewport, and stays true afterwards.
 * Used to render PDF pages only when they are about to be needed, so a long
 * document does not paint every page up front on a low-end phone.
 */
export function useInView(ref: RefObject<Element | null>, rootMargin = '600px'): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true);
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin, inView]);

  return inView;
}
