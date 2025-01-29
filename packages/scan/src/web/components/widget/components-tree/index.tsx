import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Store } from '~core/index';
import { Icon } from '~web/components/icon';
import { inspectorUpdateSignal } from '~web/components/inspector/states';
import { getInspectableElements } from '~web/components/inspector/utils';
import { LOCALSTORAGE_KEY, MIN_CONTAINER_WIDTH, MIN_SIZE } from '~web/constants';
import { useVirtualList } from '~web/hooks/use-virtual-list';
import { signalWidget } from '~web/state';
import { cn, saveLocalStorage } from '~web/utils/helpers';
import { getCompositeComponentFromElement } from '../../inspector/utils';
import { Breadcrumb } from './breadcrumb';
import {
  type FlattenedNode,
  SEARCH_PREFIX_LENGTH,
  type SearchIndex,
  type TreeNode,
  inspectedElementSignal,
  searchState,
} from './state';

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
  const MIN_INDENT = 0;
  const MAX_INDENT = 16;

  const availableSpace = containerWidth - MIN_CONTAINER_WIDTH;

  if (maxDepth > 0) {
    const baseIndent = Math.min(MAX_INDENT, availableSpace / (maxDepth + 1));

    return (depth: number) => {
      const scaleFactor = Math.max(0.4, 1 - depth * 0.1);
      return Math.max(MIN_INDENT, baseIndent * scaleFactor);
    };
  }

  return () => MAX_INDENT;
};

interface TreeNodeItemProps {
  node: FlattenedNode;
  onElementClick?: (element: HTMLElement) => void;
  expandedNodes: Set<string>;
  onToggle: (nodeId: string) => void;
  searchValue: typeof searchState.value;
}

const TreeNodeItem = ({
  node,
  onElementClick,
  expandedNodes,
  onToggle,
  searchValue,
}: TreeNodeItemProps) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.nodeId);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (node.element) {
        onElementClick?.(node.element);
      }
    },
    [node.element, onElementClick],
  );

  const handleToggle = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (hasChildren) {
        onToggle(node.nodeId);
      }
    },
    [hasChildren, node.nodeId, onToggle],
  );

  const highlightedText = useMemo(() => {
    const { query, matches } = searchValue;
    const isMatch = matches.some(match => match.nodeId === node.nodeId);

    if (!query || !isMatch) {
      return <span className="truncate">{node.label}</span>;
    }

    try {
      if (query.startsWith('/') && query.endsWith('/')) {
        const pattern = query.slice(1, -1);
        const regex = new RegExp(`(${pattern})`, 'i');
        const parts = node.label.split(regex);

        return (
          <span className="tree-node-search-highlight">
            {
              parts.map((part, index) =>
                regex.test(part)
                  ? (
                    <span
                      key={`${node.nodeId}-${part}`}
                      className={cn(
                        'regex',
                        {
                          'start': regex.test(part) && index === 0,
                          'middle': regex.test(part) && index % 2 === 1,
                          'end': regex.test(part) && index === parts.length - 1,
                          '!ml-0': index === 1,
                        }
                      )}
                    >
                      {part}
                    </span>
                  )
                  : part
              )
            }
          </span>
        );
      }

      const lowerLabel = node.label.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const index = lowerLabel.indexOf(lowerQuery);

      if (index >= 0) {
        return (
          <span className="tree-node-search-highlight">
            {node.label.slice(0, index)}
            <span className="single">
              {node.label.slice(index, index + query.length)}
            </span>
            {node.label.slice(index + query.length)}
          </span>
        );
      }
    } catch {}

    return <span className="truncate">{node.label}</span>;
  }, [node.label, node.nodeId, searchValue]);

  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-x-1',
        'px-2',
        'w-full h-7',
        'text-left',
        'rounded',
        'cursor-pointer select-none',
      )}
      onClick={handleClick}
    >
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'w-4 h-4 flex items-center justify-center',
          'text-left',
        )}
      >
        {hasChildren && (
          <Icon
            name="icon-chevron-right"
            size={12}
            className={cn('w-4 h-4', 'transition-transform', {
              'rotate-90': isExpanded,
            })}
          />
        )}
      </button>
      {highlightedText}
    </button>
  );
};

export const ComponentsTree = () => {
  const refContainer = useRef<HTMLDivElement>(null);
  const refBreadcrumbContainer = useRef<HTMLDivElement>(null);
  const refMainContainer = useRef<HTMLDivElement>(null);
  const refSearchInputContainer = useRef<HTMLDivElement>(null);
  const refSearchInput = useRef<HTMLInputElement>(null);

  const [flattenedNodes, setFlattenedNodes] = useState<FlattenedNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [visibleNodes, setVisibleNodes] = useState<FlattenedNode[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const refInitialElement = useRef<Element | null>(null);
  const [maxTreeDepth, setMaxTreeDepth] = useState(0);
  const refIsHovering = useRef(false);

  const refSearchIndex = useRef<SearchIndex>({
    prefixMap: new Map(),
    nodeMap: new Map(),
    labelMap: new Map(),
    PREFIX_LENGTH: SEARCH_PREFIX_LENGTH,
  });

  const ITEM_HEIGHT = 28;

  const { virtualItems, totalSize } = useVirtualList({
    count: visibleNodes.length,
    getScrollElement: () => refContainer.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  const [searchValue, setSearchValue] = useState(searchState.value);

  const buildSearchIndex = useCallback((nodes: FlattenedNode[]) => {
    const prefixMap = new Map<string, Set<string>>();
    const nodeMap = new Map<string, FlattenedNode>();
    const labelMap = new Map<string, string>();

    for (const node of nodes) {
      nodeMap.set(node.nodeId, node);
      const lowerLabel = node.label.toLowerCase();
      labelMap.set(node.nodeId, lowerLabel);

      const prefix = lowerLabel.slice(0, SEARCH_PREFIX_LENGTH);
      const nodeIds = prefixMap.get(prefix) || new Set();
      nodeIds.add(node.nodeId);
      prefixMap.set(prefix, nodeIds);
    }

    refSearchIndex.current = {
      prefixMap,
      nodeMap,
      labelMap,
      PREFIX_LENGTH: SEARCH_PREFIX_LENGTH,
    };
  }, []);

  const handleElementClick = useCallback((element: HTMLElement) => {
    refIsHovering.current = true;
    refSearchInput.current?.blur();

    const { parentCompositeFiber } =
      getCompositeComponentFromElement(element);
    if (!parentCompositeFiber) return;

    Store.inspectState.value = {
      kind: 'focused',
      focusedDomElement: element,
      fiber: parentCompositeFiber,
    };

    const nodeIndex = visibleNodes.findIndex(
      (node) => node.element === element,
    );
    if (nodeIndex !== -1) {
      setSelectedIndex(nodeIndex);
      const itemTop = nodeIndex * ITEM_HEIGHT;
      const container = refContainer.current;
      if (container) {
        const containerHeight = container.clientHeight;
        const scrollTop = container.scrollTop;
        const breadcrumbHeight = 32;

        if (
          itemTop < scrollTop ||
          itemTop + ITEM_HEIGHT > scrollTop + containerHeight
        ) {
          container.scrollTo({
            top: Math.max(
              0,
              itemTop - (containerHeight - breadcrumbHeight) / 2,
            ),
            behavior: 'smooth',
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

  const handleOnChangeSearch = useCallback((query: string) => {
    refSearchInputContainer.current?.classList.remove('!border-red-500');
    const { prefixMap, nodeMap, labelMap, PREFIX_LENGTH } = refSearchIndex.current;
    const matches: FlattenedNode[] = [];

    if (!query) {
      searchState.value = { query, matches, currentMatchIndex: -1 };
      return;
    }

    const isRegex = /^\/.*\/$/.test(query);

    if (isRegex) {
      try {
        const pattern = query.slice(1, -1);
        const regex = new RegExp(pattern, 'i');

        for (const [id, label] of labelMap) {
          if (regex.test(label)) {
            const node = nodeMap.get(id);
            if (node) matches.push(node);
          }
        }
      } catch {
        refSearchInputContainer.current?.classList.add('!border-red-500');
      }
    } else {
      const lowerQuery = query.toLowerCase();
      const searchPrefix = lowerQuery.slice(0, PREFIX_LENGTH);

      const matchingIds = prefixMap.get(searchPrefix);
      if (matchingIds) {
        for (const id of matchingIds) {
          const node = nodeMap.get(id);
          const lowerLabel = labelMap.get(id);
          if (node && lowerLabel?.startsWith(lowerQuery)) {
            matches.push(node);
          }
        }
      }
    }

    searchState.value = {
      query,
      matches,
      currentMatchIndex: matches.length > 0 ? 0 : -1,
    };

    if (matches.length > 0) {
      const firstMatch = matches[0];
      const nodeIndex = visibleNodes.findIndex(
        (node) => node.nodeId === firstMatch.nodeId,
      );
      if (nodeIndex !== -1) {
        const itemTop = nodeIndex * ITEM_HEIGHT;
        const container = refContainer.current;
        if (container) {
          const containerHeight = container.clientHeight;
          container.scrollTo({
            top: Math.max(0, itemTop - containerHeight / 2),
            behavior: 'smooth',
          });
        }
      }
    }
  }, [visibleNodes]);

  const handleInputChange = useCallback((e: Event) => {
    const target = e.currentTarget as HTMLInputElement;
    if (!target) return;
    handleOnChangeSearch(target.value);
  }, [handleOnChangeSearch]);

  const navigateSearch = useCallback(
    (direction: 'next' | 'prev') => {
      const { matches, currentMatchIndex } = searchState.value;
      if (matches.length === 0) return;

      const newIndex =
        direction === 'next'
          ? (currentMatchIndex + 1) % matches.length
          : (currentMatchIndex - 1 + matches.length) % matches.length;

      searchState.value = {
        ...searchState.value,
        currentMatchIndex: newIndex,
      };

      const currentMatch = matches[newIndex];
      const nodeIndex = visibleNodes.findIndex(
        (node) => node.nodeId === currentMatch.nodeId,
      );
      if (nodeIndex !== -1) {
        setSelectedIndex(nodeIndex);
        const itemTop = nodeIndex * ITEM_HEIGHT;
        const container = refContainer.current;
        if (container) {
          const containerHeight = container.clientHeight;
          container.scrollTo({
            top: Math.max(0, itemTop - containerHeight / 2),
            behavior: 'smooth',
          });
        }
      }
    },
    [visibleNodes],
  );

  const updateContainerWidths = useCallback((width: number) => {
    if (refMainContainer.current) {
      refMainContainer.current.style.width = `${width}px`;
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

  const handleResize = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!refContainer.current) return;
    refContainer.current.style.setProperty('pointer-events', 'none');

    const startX = e.clientX;
    const startWidth = refContainer.current.offsetWidth;
    const parentWidth = signalWidget.value.dimensions.width;
    const maxWidth = Math.floor(parentWidth - (MIN_SIZE.width / 2));

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const newWidth = Math.min(
        maxWidth,
        Math.max(MIN_CONTAINER_WIDTH, startWidth + delta),
      );
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

      saveLocalStorage(LOCALSTORAGE_KEY, signalWidget.value);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [updateContainerWidths]);

  const onMouseLeave = useCallback(() => {
    refIsHovering.current = false;
  }, []);

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
        buildSearchIndex(flattened);

        const newMaxDepth = getMaxDepth(flattened);
        setMaxTreeDepth(newMaxDepth);

        if (refContainer.current) {
          const indentSize = calculateIndentSize(
            refContainer.current.offsetWidth,
            newMaxDepth,
          );
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
  }, [buildSearchIndex]);

  useEffect(() => {
    const unsubscribe = signalWidget.subscribe((widget) => {
      updateContainerWidths(widget.componentsTree.width);
    });
    return () => {
      unsubscribe();
    };
  }, [updateContainerWidths]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!refIsHovering.current) return;

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
          return;
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
          return;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          e.stopPropagation();

          const currentNode = visibleNodes[selectedIndex];
          if (currentNode?.nodeId) {
            handleToggle(currentNode.nodeId);
          }
          return;
        }
        case 'ArrowRight': {
          e.preventDefault();
          e.stopPropagation();

          const currentNode = visibleNodes[selectedIndex];
          if (currentNode?.nodeId) {
            handleToggle(currentNode.nodeId);
          }
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedIndex, visibleNodes, handleElementClick, handleToggle]);

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
    return searchState.subscribe(setSearchValue);
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
      <div ref={refMainContainer} className="flex flex-col h-full">
        <div ref={refBreadcrumbContainer} className="overflow-hidden">
          <Breadcrumb />

          <div className="py-2 pr-2 border-b border-[#1e1e1e]">
            <div
              ref={refSearchInputContainer}
              className={cn(
                'relative',
                'flex items-center gap-x-1 px-2',
                'rounded',
                'border border-transparent',
                'focus-within:border-[#454545]',
                'bg-[#1e1e1e] text-neutral-300',
                'transition-colors',
                'whitespace-nowrap',
                'overflow-hidden',
              )}
            >
              <Icon name="icon-search" size={12} className=' text-neutral-500' />
              <div className="relative flex-1 h-7 overflow-hidden">
                <input
                  ref={refSearchInput}
                  type="text"
                  value={searchState.value.query}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.currentTarget.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.shiftKey) {
                      e.preventDefault();
                      navigateSearch('prev');
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      navigateSearch('next');
                    }
                  }}
                  onChange={handleInputChange}
                  className="absolute inset-y-0 inset-x-1"
                  placeholder="(text or /regex/)"
                />
              </div>
              {
                searchState.value.query && (
                  <>
                    <span className="flex items-center gap-x-0.5 text-xs text-neutral-500">
                      {searchState.value.currentMatchIndex + 1}
                      {'|'}
                      {searchState.value.matches.length}
                    </span>
                    {
                      !!searchState.value.matches.length && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateSearch('prev');
                            }}
                            className="button rounded w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-300"
                          >
                            <Icon
                              name="icon-chevron-right"
                              className="-rotate-90"
                              size={12}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateSearch('next');
                            }}
                            className="button rounded w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-300"
                          >
                            <Icon
                              name="icon-chevron-right"
                              className="rotate-90"
                              size={12}
                            />
                          </button>
                        </>
                      )
                    }
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOnChangeSearch('');
                      }}
                      className="button rounded w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-300"
                    >
                      <Icon name="icon-close" size={12} />
                    </button>
                  </>
                )
              }
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <div
            ref={refContainer}
            onMouseLeave={onMouseLeave}
            className="h-full overflow-auto will-change-transform"
          >
            <div
              className="relative w-full"
              style={{
                height: totalSize,
              }}
            >
              {virtualItems.map((virtualItem) => {
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
                      }
                    )}
                    style={{
                      top: virtualItem.start,
                      height: ITEM_HEIGHT,
                    }}
                  >
                    <div
                      className="w-full h-full"
                      style={{
                        paddingLeft: `calc(${node.depth} * var(--indentation-size))`,
                      }}
                    >
                      <TreeNodeItem
                        node={node}
                        onElementClick={handleElementClick}
                        expandedNodes={expandedNodes}
                        onToggle={handleToggle}
                        searchValue={searchValue}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
