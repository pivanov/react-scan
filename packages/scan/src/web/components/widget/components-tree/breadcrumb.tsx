import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Store } from '~core/index';
import { Icon } from '~web/components/icon';
import {
  getCompositeFiberFromElement,
  getInspectableAncestors,
} from '~web/components/inspector/utils';
import { cn } from '~web/utils/helpers';
import { type TreeItem, inspectedElementSignal } from './state';

export const Breadcrumb = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<TreeItem[]>([]);
  const [visibleItems, setVisibleItems] = useState<TreeItem[]>([]);
  const updateTimeoutRef = useRef<number>();
  const lastWidthRef = useRef<number>(0);

  const updateVisibleItems = useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth || 0;
    if (Math.abs(containerWidth - lastWidthRef.current) < 5) return;
    lastWidthRef.current = containerWidth;

    if (!path.length) return;

    const ROOT_WIDTH = 80;
    const ITEM_WIDTH = 80;

    const result: TreeItem[] = [path[0]];
    if (path.length <= 1) {
      setVisibleItems(result);
      return;
    }

    const remainingWidth = containerWidth - ROOT_WIDTH;
    const maxItemsAfterRoot = Math.floor(remainingWidth / ITEM_WIDTH);

    if (maxItemsAfterRoot >= path.length - 1) {
      result.push(...path.slice(1));
      setVisibleItems(result);
      return;
    }

    if (maxItemsAfterRoot <= 0 && path.length > 1) {
      result.push({
        name: '…',
        depth: 0,
        element: path[path.length - 1].element,
      }, path[path.length - 1]);
      setVisibleItems(result);
      return;
    }

    if (maxItemsAfterRoot >= 2) {
      const MAX_END_ITEMS = 10;
      const availableSlots = Math.min(maxItemsAfterRoot - 1, MAX_END_ITEMS);
      const endItems = path.slice(Math.max(1, path.length - availableSlots));

      const ellipsisItem: TreeItem = {
        name: '…',
        depth: 0,
        element: path[Math.max(1, path.length - availableSlots - 1)].element,
      };
      result.push(ellipsisItem, ...endItems);
    } else if (path.length > 1) {
      const ellipsisItem: TreeItem = {
        name: '…',
        depth: 0,
        element: path[path.length - 2].element,
      };
      result.push(ellipsisItem, path[path.length - 1]);
    }

    setVisibleItems(result);
  }, [path]);

  useEffect(() => {
    const handleElementChange = (focusedDomElement: HTMLElement | null) => {
      if (!focusedDomElement) return;

      const ancestors = getInspectableAncestors(focusedDomElement);
      const items = ancestors.map((item) => {
        return {
          ...item,
        };
      });

      setPath(items);

      lastWidthRef.current = 0;
      updateVisibleItems();
    };

    const unsubscribeStore = Store.inspectState.subscribe((state) => {
      if (state.kind === 'focused' && state.focusedDomElement) {
        handleElementChange(state.focusedDomElement as HTMLElement);
      }
    });

    if (Store.inspectState.value.kind === 'focused') {
      handleElementChange(Store.inspectState.value.focusedDomElement as HTMLElement);
    }

    return () => {
      unsubscribeStore();
    };
  }, [updateVisibleItems]);

  useEffect(() => {
    if (path.length > 0) {
      updateVisibleItems();
    }
  }, [path, updateVisibleItems]);

  useLayoutEffect(() => {
    const handleResize = () => {
      if (updateTimeoutRef.current) {
        cancelAnimationFrame(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = requestAnimationFrame(() => {
        if (path.length > 0) {
          updateVisibleItems();
        }
      });
    };

    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (updateTimeoutRef.current) {
        cancelAnimationFrame(updateTimeoutRef.current);
      }
    };
  }, [path.length, updateVisibleItems]);

  const handleElementClick = (element: HTMLElement) => {
    const { parentCompositeFiber } = getCompositeFiberFromElement(element);
    if (!parentCompositeFiber) return;

    Store.inspectState.value = {
      kind: 'focused',
      focusedDomElement: element,
      fiber: parentCompositeFiber,
    };
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex items-center gap-x-1',
        'py-1 px-2',
        'text-xs text-neutral-400',
        'border-b border-white/10',
        'overflow-hidden w-full'
      )}
    >
      {visibleItems.map((item, index) => (
        <div
          key={`${item.name}-${index}`}
          className="flex items-center gap-x-1 overflow-hidden h-6"
        >
          {index > 0 && (
            <span className="w-2.5 h-2.5 flex items-center justify-center text-neutral-400">
              <Icon name="icon-chevron-right" size={10} />
            </span>
          )}
          {item.name === '…' ? (
            <span className="text-sm h-4">…</span>
          ) : (
            <button
                type="button"
              className={cn('rounded truncate max-w-20', {
                'text-white': index === visibleItems.length - 1,
                'text-neutral-400': index !== visibleItems.length - 1,
              })}
              onClick={() => {
                inspectedElementSignal.value = item.element;
                handleElementClick(item.element as HTMLElement);
              }}
            >
                {item.name}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
