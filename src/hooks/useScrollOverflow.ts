'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ScrollDirection = 'vertical' | 'horizontal' | 'both';

type OverflowState = {
  hasVerticalOverflow: boolean;
  hasHorizontalOverflow: boolean;
  verticalEnd: boolean;
  horizontalEnd: boolean;
};

const initialState: OverflowState = {
  hasVerticalOverflow: false,
  hasHorizontalOverflow: false,
  verticalEnd: true,
  horizontalEnd: true,
};

export function useScrollOverflow(direction: ScrollDirection) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState(initialState);

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) {
      setState(initialState);
      return;
    }

    const desktop = window.matchMedia('(min-width: 900px)').matches;
    const checkVertical = desktop && direction !== 'horizontal';
    const checkHorizontal = direction !== 'vertical';
    const hasVerticalOverflow = checkVertical && element.scrollHeight - element.clientHeight > 2;
    const hasHorizontalOverflow = checkHorizontal && element.scrollWidth - element.clientWidth > 2;
    const nextState = {
      hasVerticalOverflow,
      hasHorizontalOverflow,
      verticalEnd:
        !hasVerticalOverflow || element.scrollTop + element.clientHeight >= element.scrollHeight - 2,
      horizontalEnd:
        !hasHorizontalOverflow || element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
    };

    setState((current) =>
      current.hasVerticalOverflow === nextState.hasVerticalOverflow &&
      current.hasHorizontalOverflow === nextState.hasHorizontalOverflow &&
      current.verticalEnd === nextState.verticalEnd &&
      current.horizontalEnd === nextState.horizontalEnd
        ? current
        : nextState
    );
  }, [direction]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let frame = window.requestAnimationFrame(measure);
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    const mutationObserver = new MutationObserver(scheduleMeasure);
    const mediaQuery = window.matchMedia('(min-width: 900px)');

    resizeObserver.observe(element);
    mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });
    element.addEventListener('scroll', scheduleMeasure, { passive: true });
    mediaQuery.addEventListener('change', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      element.removeEventListener('scroll', scheduleMeasure);
      mediaQuery.removeEventListener('change', scheduleMeasure);
    };
  }, [measure]);

  return { ref, ...state };
}
