import { useRef, useEffect } from 'react';

interface UseDragToScrollOptions {
  disabled?: boolean;
}

/**
 * Reusable hook that enables click-and-drag to scroll horizontally and vertically
 * on wide table containers with grab / grabbing cursor and a 5px threshold
 * to ensure interactive buttons and links inside the table are never blocked.
 */
export function useDragToScroll<T extends HTMLElement = HTMLDivElement>(options: UseDragToScrollOptions = {}) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || options.disabled) return;

    let isDown = false;
    let startX = 0;
    let startY = 0;
    let initialScrollLeft = 0;
    let initialScrollTop = 0;
    let hasMoved = false;

    const onMouseDown = (e: MouseEvent) => {
      // Ignore if clicking on buttons, inputs, links, or dropdowns
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('button, input, select, textarea, a, [role="button"], [contenteditable="true"]')
      ) {
        return;
      }

      // Only respond to main/left mouse button
      if (e.button !== 0) return;

      isDown = true;
      hasMoved = false;
      startX = e.pageX - el.offsetLeft;
      startY = e.pageY - el.offsetTop;
      initialScrollLeft = el.scrollLeft;
      initialScrollTop = el.scrollTop;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      const x = e.pageX - el.offsetLeft;
      const y = e.pageY - el.offsetTop;
      const walkX = x - startX;
      const walkY = y - startY;

      // 5px threshold: only scroll if dragged > 5px
      if (Math.abs(walkX) > 5 || Math.abs(walkY) > 5) {
        hasMoved = true;
      }

      if (hasMoved) {
        e.preventDefault();
        el.scrollLeft = initialScrollLeft - walkX;
        el.scrollTop = initialScrollTop - walkY;
      }
    };

    const onMouseUp = () => {
      if (!isDown) return;
      isDown = false;
      el.style.cursor = 'grab';
      el.style.removeProperty('user-select');
    };

    const onMouseLeave = () => {
      if (!isDown) return;
      isDown = false;
      el.style.cursor = 'grab';
      el.style.removeProperty('user-select');
    };

    // Default hover cursor
    el.style.cursor = 'grab';

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('mouseleave', onMouseLeave);

    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('mouseleave', onMouseLeave);
      el.style.removeProperty('cursor');
      el.style.removeProperty('user-select');
    };
  }, [options.disabled]);

  return ref;
}
