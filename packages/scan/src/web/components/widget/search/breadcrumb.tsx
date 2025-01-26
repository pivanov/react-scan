import {
  ClassComponentTag,
  type Fiber,
  ForwardRefTag,
  FunctionComponentTag,
  MemoComponentTag,
  SimpleMemoComponentTag,
} from 'bippy';
import {
  useEffect,
  useMemo,
  useState,
} from 'preact/hooks';
import { Store } from '~core/index';
import { Icon } from '~web/components/icon';
import {
  getCompositeFiberFromElement,
  getInspectableAncestors,
} from '~web/components/inspector/utils';
import { cn } from '~web/utils/helpers';
import { type TreeItem, inspectedElementSignal } from './state';

export const Breadcrumb = () => {
  const [path, setPath] = useState<TreeItem[]>([]);

  useEffect(() => {
    const unsubscribe = inspectedElementSignal.subscribe(
      (focusedDomElement) => {
        if (!focusedDomElement) return;

        const ancestors = getInspectableAncestors(focusedDomElement);
        const items = ancestors.map((item) => {
          const { parentCompositeFiber } = getCompositeFiberFromElement(
            item.element,
          );

          // Count children for the breadcrumb items
          const getChildrenCount = (
            fiber: Fiber | null | undefined,
          ): number => {
            if (!fiber) return 0;
            let count = 0;
            let child = fiber.child;
            while (child) {
              if (
                child.tag === FunctionComponentTag ||
                child.tag === ForwardRefTag ||
                child.tag === SimpleMemoComponentTag ||
                child.tag === MemoComponentTag ||
                child.tag === ClassComponentTag
              ) {
                count++;
              }
              child = child.sibling;
            }
            return count;
          };

          return {
            ...item,
            fiber: parentCompositeFiber || null,
            childrenCount: getChildrenCount(parentCompositeFiber),
            updates: {
              count: 0,
              lastUpdate: 0,
              renderDuration: 0,
              cascadeLevel: 0,
              hasStructuralChanges: false,
            },
          };
        });
        setPath(items);
      },
    );

    return () => unsubscribe();
  }, []);

  const displayItems = useMemo(() => {
    if (path.length <= 4) return path;

    // Create a fake element for ellipsis that matches TreeItem interface
    const ellipsisItem: TreeItem = {
      name: '…',
      depth: 0,
      element: undefined as unknown as HTMLElement,
      fiber: null,
      childrenCount: 0,
      updates: {
        count: 0,
        lastUpdate: 0,
        renderDuration: 0,
        cascadeLevel: 0,
        hasStructuralChanges: false,
      },
    };

    // Return first item and last 3 items
    return [path[0], ellipsisItem, ...path.slice(-3)];
  }, [path]);

  return (
    <div
      className={cn(
        'flex items-center gap-x-1',
        'py-1 px-2',
        'text-xs text-neutral-400',
        'border-b border-white/10',
      )}
    >
      {displayItems.map((item, index) => (
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
              title={item.name}
              className={cn('rounded', 'truncate', {
                'text-white': index === displayItems.length - 1,
                'text-neutral-400': index !== displayItems.length - 1,
              })}
              onClick={() => {
                inspectedElementSignal.value = item.element;
                Store.inspectState.value = {
                  kind: 'focused',
                  focusedDomElement: item.element,
                };
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
