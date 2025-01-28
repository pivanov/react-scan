import type { JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Store } from '~core/index';
import { Icon } from '~web/components/icon';
import { inspectorUpdateSignal } from '~web/components/inspector/states';
import { getInspectableElements } from '~web/components/inspector/utils';
import { MIN_CONTAINER_WIDTH } from '~web/constants';
import { useVirtualList } from '~web/hooks/use-virtual-list';
import { signalWidget } from '~web/state';
import { cn } from '~web/utils/helpers';
import { getCompositeComponentFromElement } from '../../inspector/utils';
import { Breadcrumb } from './breadcrumb';
import { inspectedElementSignal } from './state';

interface TreeNode {
  label: string;
  children?: TreeNode[];
  badge?: string;
  element?: HTMLElement;
}

interface FlattenedNode extends TreeNode {
  depth: number;
  nodeId: string;
  parentId: string | null;
}

const flattenTree = (
  nodes: TreeNode[],
  depth = 0,
  parentPath: string | null = null,
): FlattenedNode[] => {
  return nodes.reduce<FlattenedNode[]>((acc, node, index) => {
    const nodePath = parentPath
      ? `${parentPath}-${index}-${node.label}`
      : `${index}-${node.label}`;

    const flatNode: FlattenedNode = {
      ...node,
      depth,
      nodeId: nodePath,
      parentId: parentPath,
    };
    acc.push(flatNode);

    if (node.children?.length) {
      acc.push(...flattenTree(node.children, depth + 1, nodePath));
    }

    return acc;
  }, []);
};

const getMaxDepth = (nodes: FlattenedNode[]): number => {
  return nodes.reduce((max, node) => Math.max(max, node.depth), 0);
};

const calculateIndentSize = (containerWidth: number, maxDepth: number) => {
  const CONTENT_MIN_WIDTH = 80;
  const SAFE_AREA = 20;

  const availableSpace = containerWidth - CONTENT_MIN_WIDTH - SAFE_AREA;

  if (maxDepth > 0) {
    const baseIndent = Math.min(20, availableSpace / (maxDepth + 1));

    return (depth: number) => {
      if (depth > 5) {
        const scaleFactor = Math.max(0.4, 1 - ((depth - 5) * 0.15));
        return Math.max(8, baseIndent * scaleFactor);
      }
      return baseIndent;
    };
  }

  return () => 12;
};

const TreeNodeItem = ({
  node,
  containerWidth,
  maxTreeDepth,
  onElementClick,
  expandedNodes,
  onToggle,
}: {
  node: FlattenedNode;
  containerWidth: number;
  maxTreeDepth: number;
  onElementClick?: (element: HTMLElement) => void;
  expandedNodes: Set<string>;
  onToggle: (nodeId: string) => void;
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.nodeId);

  const handleClick = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    if (node.element) {
      onElementClick?.(node.element);
    }
  }, [node.element, onElementClick]);

  const handleToggle = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggle(node.nodeId);
    }
  }, [hasChildren, node.nodeId, onToggle]);

  const indentSize = calculateIndentSize(containerWidth, maxTreeDepth);
  const style = {
    paddingLeft: `${indentSize(node.depth)}px`,
  };

  return (
    <button
      type="button"
      className={cn(
        'flex items-center w-full min-w-0',
        'text-left',
        'rounded py-1 cursor-pointer select-none',
      )}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick(e as unknown as MouseEvent);
        }
      }}
      style={style}
    >
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex-shrink-0',
          'w-4 h-4 flex items-center justify-center',
          'text-left',
        )}
      >
        {hasChildren && (
          <Icon
            name="icon-chevron-right"
            size={12}
            className={cn('w-4 h-4', 'transition-transform duration-150', {
              'rotate-90': isExpanded,
            })}
          />
        )}
      </button>
      <span className={cn('ml-1 truncate min-w-0 flex-1')}>{node.label}</span>
    </button>
  );
};

export const ComponentsTree = ({ parentElement }: { parentElement: HTMLDivElement | null }) => {
  const refContainer = useRef<HTMLDivElement>(null);
  const refBreadcrumbContainer = useRef<HTMLDivElement>(null);
  const refMainContainer = useRef<HTMLDivElement>(null);

  const [flattenedNodes, setFlattenedNodes] = useState<FlattenedNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [visibleNodes, setVisibleNodes] = useState<FlattenedNode[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const refInitialElement = useRef<Element | null>(null);
  const [maxTreeDepth, setMaxTreeDepth] = useState(0);

  const handleElementClick = useCallback((element: HTMLElement) => {
    const { parentCompositeFiber } = getCompositeComponentFromElement(element);
    if (!parentCompositeFiber) return;

    Store.inspectState.value = {
      kind: 'focused',
      focusedDomElement: element,
      fiber: parentCompositeFiber,
    };

    const nodeIndex = visibleNodes.findIndex(node => node.element === element);
    if (nodeIndex !== -1) {
      setSelectedIndex(nodeIndex);
      const itemTop = nodeIndex * ITEM_HEIGHT;
      const container = refContainer.current;
      if (container) {
        const containerHeight = container.clientHeight;
        const scrollTop = container.scrollTop;
        const breadcrumbHeight = 32;

        if (itemTop < scrollTop || itemTop + ITEM_HEIGHT > scrollTop + containerHeight) {
          container.scrollTo({
            top: Math.max(0, itemTop - (containerHeight - breadcrumbHeight) / 2),
            behavior: 'smooth'
          });
        }
      }
    }
  }, [visibleNodes]);

  const handleToggle = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const getVisibleNodes = () => {
      const visible: FlattenedNode[] = [];

      for (const node of flattenedNodes) {
        if (!node.parentId) {
          visible.push(node);
          continue;
        }

        let currentParentId: string | null = node.parentId;
        let isVisible = true;

        while (currentParentId !== null) {
          if (!expandedNodes.has(currentParentId)) {
            isVisible = false;
            break;
          }
          const parentNode = flattenedNodes.find(
            (n) => n.nodeId === currentParentId,
          );
          if (!parentNode) break;
          currentParentId = parentNode.parentId;
        }

        if (isVisible) {
          visible.push(node);
        }
      }

      return visible;
    };

    setVisibleNodes(getVisibleNodes());
  }, [flattenedNodes, expandedNodes]);

  useEffect(() => {
    const buildTreeFromElements = (
      elements: Array<{ element: HTMLElement; depth: number; name: string }>,
    ) => {
      const nodeMap = new Map<HTMLElement, TreeNode>();
      const rootNodes: TreeNode[] = [];

      for (const { element, name } of elements) {
        nodeMap.set(element, {
          label: name,
          children: [],
          element,
        });
      }

      for (const { element, depth } of elements) {
        const node = nodeMap.get(element);
        if (!node) continue;

        if (depth === 0) {
          rootNodes.push(node);
        } else {
          let parent = element.parentElement;
          while (parent) {
            const parentNode = nodeMap.get(parent);
            if (parentNode) {
              if (!parentNode.children) parentNode.children = [];
              parentNode.children.push(node);
              break;
            }
            parent = parent.parentElement;
          }
        }
      }

      return rootNodes;
    };

    const updateTree = (element: HTMLElement) => {
      if (!refInitialElement.current) {
        refInitialElement.current = element;
      }

      const inspectableElements = getInspectableElements(
        refInitialElement.current as HTMLElement,
      );
      const tree = buildTreeFromElements(inspectableElements);

      if (tree.length > 0) {
        const flattened = flattenTree(tree);
        setFlattenedNodes(flattened);

        const newMaxDepth = getMaxDepth(flattened);
        setMaxTreeDepth(newMaxDepth);

        if (refContainer.current) {
          const indentSize = calculateIndentSize(refContainer.current.offsetWidth, newMaxDepth);
          refContainer.current.style.setProperty(
            '--indentation-size',
            `${indentSize(0)}px`,
          );
        }

        setExpandedNodes((prev) => {
          const next = new Set(prev);
          for (const node of flattened) {
            next.add(node.nodeId);
          }
          return next;
        });
      }
    };

    const handleStoreUpdate = (state: typeof Store.inspectState.value) => {
      if (state.kind !== 'focused') return;
      updateTree(state.focusedDomElement as HTMLElement);
    };

    handleStoreUpdate(Store.inspectState.value);

    const unsubscribeStore = Store.inspectState.subscribe(handleStoreUpdate);
    const unsubscribeSignal = inspectedElementSignal.subscribe((element) => {
      if (element) {
        refInitialElement.current = element;
        updateTree(element as HTMLElement);
      }
    });
    const unsubscribeUpdates = inspectorUpdateSignal.subscribe(() => {
      handleStoreUpdate(Store.inspectState.value);
    });

    return () => {
      unsubscribeStore();
      unsubscribeSignal();
      unsubscribeUpdates();
    };
  }, []);

  useEffect(() => {
    setMaxTreeDepth(getMaxDepth(flattenedNodes));
  }, [flattenedNodes]);

  const ITEM_HEIGHT = 28;

  const { virtualItems, totalSize } = useVirtualList({
    count: visibleNodes.length,
    getScrollElement: () => refContainer.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  const updateContainerWidths = useCallback((width: number) => {
    if (refMainContainer.current) {
      refMainContainer.current.style.width = `${width}px`;
    }
    if (refBreadcrumbContainer.current) {
      refBreadcrumbContainer.current.style.width = `${width}px`;
    }
    if (refContainer.current) {
      refContainer.current.style.width = `${width}px`;
      const indentSize = calculateIndentSize(width, maxTreeDepth);
      refContainer.current.style.setProperty(
        '--indentation-size',
        `${indentSize(0)}px`,
      );
    }
  }, [maxTreeDepth]);

  useEffect(() => {
    updateContainerWidths(signalWidget.value.componentsTree.width);
  }, [updateContainerWidths]);

  const handleResize = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!refContainer.current) return;
    refContainer.current.style.setProperty('pointer-events', 'none');

    const startX = e.clientX;
    const startWidth = refContainer.current.offsetWidth;
    const parentWidth = parentElement?.offsetWidth ?? 0;
    const maxWidth = Math.floor(parentWidth * 2 / 3);

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const newWidth = Math.min(maxWidth, Math.max(MIN_CONTAINER_WIDTH, startWidth + delta));
      updateContainerWidths(newWidth);
    };

    const handleMouseUp = () => {
      if (!refContainer.current) return;
      refContainer.current.style.removeProperty('pointer-events');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      signalWidget.value = {
        ...signalWidget.value,
        componentsTree: {
          ...signalWidget.value.componentsTree,
          width: refContainer.current.offsetWidth,
        },
      };
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [parentElement, updateContainerWidths]);

  const handleKeyDown = useCallback((
    e: JSX.TargetedKeyboardEvent<HTMLDivElement>
  ) => {
    switch (e.key) {
      case 'ArrowUp': {
        e.preventDefault();
        e.stopPropagation();

        if (selectedIndex > 0) {
          const currentNode = visibleNodes[selectedIndex - 1];
          if (currentNode?.element) {
            handleElementClick(currentNode.element);
          }
        }
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        e.stopPropagation();

        if (selectedIndex < visibleNodes.length - 1) {
          const currentNode = visibleNodes[selectedIndex + 1];
          if (currentNode?.element) {
            handleElementClick(currentNode.element);
          }
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        e.stopPropagation();

        const currentNode = visibleNodes[selectedIndex];
        if (currentNode?.nodeId) {
          handleToggle(currentNode.nodeId);
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        e.stopPropagation();

        const currentNode = visibleNodes[selectedIndex];
        if (currentNode?.nodeId) {
          handleToggle(currentNode.nodeId);
        }
        break;
      }
    }
  }, [visibleNodes, selectedIndex, handleToggle, handleElementClick]);

  const onMouseEnter = useCallback((e?: MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    refContainer.current?.focus();
  }, []);

  const onMouseLeave = useCallback((e?: MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    refContainer.current?.blur();
  }, []);

  return (
    <>
      <div
        className={cn('relative', 'resize-v-line')}
        onMouseDown={handleResize}
      >
        <span>
          <Icon name="icon-ellipsis" size={18} />
        </span>
      </div>
      <div
        ref={refMainContainer}
        className="flex flex-col h-full"
      >
        <div
          ref={refBreadcrumbContainer}
          className="overflow-hidden"
        >
          <Breadcrumb />
        </div>
        <div className="flex-1 overflow-hidden">
          <div
            ref={refContainer}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onKeyDown={handleKeyDown}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: <explanation>
            tabIndex={0}
            className="h-full overflow-auto will-change-transform focus:outline-none"
          >
            <div
              className="relative w-full"
              style={{
                height: totalSize,
              }}
            >
              {
                virtualItems.map((virtualItem) => {
                  const node = visibleNodes[virtualItem.index];
                  if (!node) return null;

                  const isSelected =
                    Store.inspectState.value.kind === 'focused' &&
                    node.element === Store.inspectState.value.focusedDomElement;
                  const isKeyboardSelected = virtualItem.index === selectedIndex;

                  return (
                    <div
                      key={node.nodeId}
                      className={cn(
                        'absolute left-0 w-full overflow-hidden',
                        'text-neutral-400 hover:text-neutral-300',
                        'bg-transparent hover:bg-[#5f3f9a]/20',
                        {
                          'text-neutral-300 bg-[#5f3f9a]/40 hover:bg-[#5f3f9a]/40':
                            isSelected || isKeyboardSelected,
                        },
                      )}
                      style={{
                        top: virtualItem.start,
                        height: ITEM_HEIGHT,
                      }}
                    >
                      <div
                        className="w-full h-full"
                        style={{ transform: `translateX(calc(${node.depth} * var(--indentation-size)))` }}
                      >
                        <TreeNodeItem
                          node={node}
                          containerWidth={refContainer.current?.offsetWidth ?? 0}
                          maxTreeDepth={maxTreeDepth}
                          onElementClick={handleElementClick}
                          expandedNodes={expandedNodes}
                          onToggle={handleToggle}
                        />
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
