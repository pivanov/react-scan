import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';

export interface VirtualItem {
  key: number;
  index: number;
  start: number;
}

export const useVirtualList = (options: {
  count: number;
  getScrollElement: () => HTMLElement | null;
  estimateSize: () => number;
  overscan?: number;
}) => {
  const { count, getScrollElement, estimateSize, overscan = 5 } = options;
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver>();
  const scrollElementRef = useRef<HTMLElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const itemHeight = estimateSize();

  const updateContainer = useCallback((entries?: ResizeObserverEntry[]) => {
    if (!scrollElementRef.current) return;

    const height =
      entries?.[0]?.contentRect.height ??
      scrollElementRef.current.getBoundingClientRect().height;
    setContainerHeight(height);
  }, []);

  const debouncedUpdateContainer = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      updateContainer();
      rafIdRef.current = null;
    });
  }, [updateContainer]);

  useEffect(() => {
    const element = getScrollElement();
    if (!element) return;

    scrollElementRef.current = element;

    const handleScroll = () => {
      if (!scrollElementRef.current) return;
      setScrollTop(scrollElementRef.current.scrollTop);
    };

    updateContainer();

    if (!resizeObserverRef.current) {
      resizeObserverRef.current = new ResizeObserver(() => {
        debouncedUpdateContainer();
      });
    }
    resizeObserverRef.current.observe(element);

    element.addEventListener('scroll', handleScroll, { passive: true });

    const mutationObserver = new MutationObserver(debouncedUpdateContainer);
    mutationObserver.observe(element, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      mutationObserver.disconnect();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [getScrollElement, updateContainer, debouncedUpdateContainer]);

  const visibleRange = useMemo(() => {
    const start = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);

    return {
      start: Math.max(0, start - overscan),
      end: Math.min(count, start + visibleCount + overscan),
    };
  }, [scrollTop, itemHeight, containerHeight, count, overscan]);

  const items = useMemo(() => {
    const virtualItems: VirtualItem[] = [];
    for (let index = visibleRange.start; index < visibleRange.end; index++) {
      virtualItems.push({
        key: index,
        index,
        start: index * itemHeight,
      });
    }
    return virtualItems;
  }, [visibleRange, itemHeight]);

  return {
    virtualItems: items,
    totalSize: count * itemHeight,
    scrollTop,
    containerHeight,
  };
};
