// @TODO: @pivanov finish this
import type { Fiber } from 'bippy';
import {
  ClassComponentTag,
  ForwardRefTag,
  FunctionComponentTag,
  MemoComponentTag,
  SimpleMemoComponentTag,
} from 'bippy';
import type { RefObject } from 'preact';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import { Store } from '~core/index';
import { isEqual } from '~core/utils';
import {
  findComponentDOMNode,
  getCompositeFiberFromElement,
} from '~web/components/inspector/utils';
import { Breadcrumb } from './breadcrumb';
import { type TreeItem, inspectedElementSignal } from './state';

// Constants
const STYLES = {
  item: {
    height: 24,
    indentWidth: 24,
    initialIndent: 16,
    paddingRight: 40,
  },
  colors: {
    background: '#0a0a0a',
    selectedBg: 'rgba(255,255,255,0.1)',
    hoveredBg: 'rgba(255,255,255,0.05)',
    line: '#333',
    text: '#888',
  },
  font: '12px monospace',
} as const;

const getDpr = () => Math.min(window.devicePixelRatio || 1, 2);
const useTreeNavigation = (
  elements: TreeItem[],
  onSelect: (element: HTMLElement) => void,
  containerRef: RefObject<HTMLDivElement>,
) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number>(-1);

  const scrollToIndex = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container) return;

      const itemTop = index * STYLES.item.height;
      const itemBottom = itemTop + STYLES.item.height;
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;

      if (itemTop < scrollTop) {
        container.scrollTo({ top: itemTop, behavior: 'smooth' });
      } else if (itemBottom > scrollTop + containerHeight) {
        container.scrollTo({
          top: itemBottom - containerHeight,
          behavior: 'smooth',
        });
      }
    },
    [containerRef],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          if (selectedIndex < elements.length - 1) {
            const newIndex = selectedIndex + 1;
            setSelectedIndex(newIndex);
            onSelect(elements[newIndex].element);
            scrollToIndex(newIndex);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          if (selectedIndex > 0) {
            const newIndex = selectedIndex - 1;
            setSelectedIndex(newIndex);
            onSelect(elements[newIndex].element);
            scrollToIndex(newIndex);
          }
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (elements[selectedIndex]) {
            onSelect(elements[selectedIndex].element);
          }
          break;
      }
    },
    [elements, selectedIndex, onSelect, scrollToIndex],
  );

  return {
    selectedIndex,
    setSelectedIndex,
    hoveredIndex,
    setHoveredIndex,
    handleKeyDown,
  };
};

const useCanvasDrawing = (
  elements: TreeItem[],
  selectedIndex: number,
  hoveredIndex: number,
  scrollTop: number,
  containerHeight: number,
  maxContentWidth: number,
) => {
  const drawTree = useCallback(
    (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
      const dpr = getDpr();
      const containerWidth = Math.floor(canvas.parentElement?.clientWidth || 0);
      canvas.width = Math.max(containerWidth, maxContentWidth) * dpr;
      canvas.height = containerHeight * dpr + 10;

      ctx.scale(dpr, dpr);
      ctx.fillStyle = STYLES.colors.background;
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      ctx.font = STYLES.font;
      ctx.textBaseline = 'middle';

      const startIndex = Math.max(
        0,
        Math.floor(scrollTop / STYLES.item.height) - 1,
      );
      const endIndex = Math.min(
        elements.length,
        Math.ceil((scrollTop + containerHeight) / STYLES.item.height) + 2,
      );

      for (let index = startIndex; index < endIndex; index++) {
        const item = elements[index];
        const y = index * STYLES.item.height - scrollTop;

        // Draw background
        if (index === selectedIndex || index === hoveredIndex) {
          ctx.fillStyle =
            index === selectedIndex
              ? STYLES.colors.selectedBg
              : STYLES.colors.hoveredBg;
          ctx.fillRect(0, y, canvas.width / dpr, STYLES.item.height);
        }

        // Draw tree lines
        if (item.depth > 0) {
          ctx.strokeStyle = STYLES.colors.line;
          ctx.beginPath();
          ctx.setLineDash([1, 2]);

          for (let d = 1; d <= item.depth; d++) {
            const lineX =
              (d - 1) * STYLES.item.indentWidth + STYLES.item.initialIndent;
            ctx.moveTo(lineX, y);
            ctx.lineTo(lineX, y + STYLES.item.height);
          }

          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw component name with update info
        ctx.fillStyle = STYLES.colors.text;
        const x =
          item.depth * STYLES.item.indentWidth + STYLES.item.initialIndent;
        let text = item.name;

        if (item.updates.count > 0) {
          text += ` (${item.updates.count}×`;
          if (item.updates.renderDuration > 0) {
            text += ` ${item.updates.renderDuration.toFixed(1)}ms`;
          }
          text += ')';
        }

        ctx.fillText(text, x, y + STYLES.item.height / 2);
      }
    },
    [
      elements,
      selectedIndex,
      hoveredIndex,
      scrollTop,
      containerHeight,
      maxContentWidth,
    ],
  );

  return { drawTree };
};

export const Search = () => {
  const refContainer = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [scrollTop, setScrollTop] = useState(0);


  const refInput = useRef<HTMLInputElement>(null);
  const refCanvas = useRef<HTMLCanvasElement>(null);

  // Track elements state
  const [elements, setElements] = useState<TreeItem[]>([]);
  const updateRef = useRef({ timestamp: 0 });

  // Initialize and track elements
  useEffect(() => {
    const collectElements = (
      rootFiber: Fiber,
      currentElements: TreeItem[],
      focusedElement: HTMLElement,
      isUpdate = false,
    ) => {
      const seenFibers = new Set<Fiber>();
      const newElements: TreeItem[] = [];
      const validFibers = new Set<Fiber>();

      const processNode = (node: Fiber | null, depth: number) => {
        if (!node || seenFibers.has(node)) return;
        seenFibers.add(node);

        // Check if this is a React component
        if (
          node.tag === FunctionComponentTag ||
          node.tag === ForwardRefTag ||
          node.tag === SimpleMemoComponentTag ||
          node.tag === MemoComponentTag ||
          node.tag === ClassComponentTag
        ) {
          validFibers.add(node);
          const existingElement = currentElements.find(
            (el) => el.fiber === node,
          );

          // Get the most accurate timing info by checking both current and alternate
          const getTimingInfo = (fiber: Fiber) => {
            const current = {
              duration: fiber.actualDuration ?? 0,
              startTime: fiber.actualStartTime ?? 0,
            };
            const alternate = fiber.alternate
              ? {
                duration: fiber.alternate.actualDuration ?? 0,
                startTime: fiber.alternate.actualStartTime ?? 0,
              }
              : null;

            // Use the most recent timing info
            if (
              alternate?.startTime &&
              alternate.startTime > current.startTime
            ) {
              return alternate;
            }
            return current;
          };

          const timing = getTimingInfo(node);
          const hasNewUpdate = isUpdate && timing.duration !== undefined;

          const domElement = findComponentDOMNode(node);

          newElements.push({
            name:
              node.type?.displayName ||
              node.type?.name ||
              'Anonymous',
            depth,
            element: domElement || focusedElement,
            fiber: node,
            childrenCount: 0, // We'll calculate this after collecting all elements
            updates: existingElement
              ? {
                ...existingElement.updates,
                count:
                  existingElement.updates.count + (hasNewUpdate ? 1 : 0),
                renderDuration: timing.duration || 0,
                lastUpdate: hasNewUpdate
                  ? Date.now()
                  : existingElement.updates.lastUpdate,
                cascadeLevel: Math.min(
                  existingElement.updates.cascadeLevel || depth,
                  depth,
                ),
                hasStructuralChanges: false, // We'll update this after collecting all elements
              }
              : {
                count: hasNewUpdate ? 1 : 0,
                lastUpdate: hasNewUpdate ? Date.now() : 0,
                renderDuration: timing.duration || 0,
                cascadeLevel: depth,
                hasStructuralChanges: false,
              },
          });

          // For components, we increment depth for their children
          if (node.child) {
            processNode(node.child, depth + 1);
          }
        } else {
          // For non-component nodes, we keep the same depth
          if (node.child) {
            processNode(node.child, depth);
          }
        }

        // Process siblings at the same depth
        if (node.sibling) {
          processNode(node.sibling, depth);
        }
      };

      processNode(rootFiber, 0);

      // Now update structural change flags by comparing with previous elements
      const updateStructuralChanges = (elements: TreeItem[]) => {
        const elementsByDepth = new Map<number, TreeItem[]>();
        for (const el of elements) {
          const depthElements = elementsByDepth.get(el.depth) || [];
          depthElements.push(el);
          elementsByDepth.set(el.depth, depthElements);
        }

        for (const el of elements) {
          const prevEl = currentElements.find(
            (prev) => prev.fiber === el.fiber,
          );
          const prevChildren = currentElements.filter(
            (prev) =>
              prev.depth === el.depth + 1 &&
              currentElements.find(
                (p) => p.fiber === el.fiber && p.depth === el.depth,
              ),
          );
          const currentChildren = elements.filter(
            (curr) =>
              curr.depth === el.depth + 1 &&
              elements.find(
                (p) => p.fiber === el.fiber && p.depth === el.depth,
              ),
          );

          el.childrenCount = currentChildren.length;
          el.updates.hasStructuralChanges =
            prevEl?.childrenCount !== currentChildren.length ||
            !isEqual(
              prevChildren.map((c) => c.name),
              currentChildren.map((c) => c.name),
            );
        }
      };

      updateStructuralChanges(newElements);
      return newElements.filter((el) => el.fiber && validFibers.has(el.fiber));
    };

    const handleStateUpdate = (state: typeof Store.inspectState.value) => {
      if (state.kind !== 'focused') {
        inspectedElementSignal.value = null;
        return;
      }

      const currentElement = state.focusedDomElement as HTMLElement;

      // Only build the tree if it's the initial inspection or matches signal
      if (
        !inspectedElementSignal.value ||
        currentElement === inspectedElementSignal.value
      ) {
        inspectedElementSignal.value = currentElement;
        const { parentCompositeFiber } =
          getCompositeFiberFromElement(currentElement);

        if (parentCompositeFiber) {
          setElements((prevElements) =>
            collectElements(
              parentCompositeFiber,
              prevElements,
              currentElement,
              false,
            ),
          );
        }
      }
    };

    // Initial collection
    handleStateUpdate(Store.inspectState.value);

    // Subscribe to state changes
    const unsubscribeState = Store.inspectState.subscribe(handleStateUpdate);

    // Subscribe to updates
    const unsubscribeUpdates = Store.lastReportTime.subscribe(() => {
      const state = Store.inspectState.value;
      if (state.kind !== 'focused') return;

      // Only update elements if this is the initial inspected element
      if (state.focusedDomElement === inspectedElementSignal.value) {
        setElements((prevElements) => {
          const rootElement = prevElements[0];
          if (!rootElement?.fiber) return prevElements;

          // Get the most recent fiber tree
          const currentIsNewer = rootElement.fiber.alternate
            ? (rootElement.fiber.actualStartTime ?? 0) >
            (rootElement.fiber.alternate.actualStartTime ?? 0)
            : true;

          const currentFiber = currentIsNewer
            ? rootElement.fiber
            : rootElement.fiber.alternate;
          if (!currentFiber) return prevElements;

          // Now collect elements with the current fiber tree
          const elements = collectElements(
            currentFiber,
            prevElements,
            state.focusedDomElement as HTMLElement,
            true,
          );
          return elements;
        });

        updateRef.current.timestamp = Date.now();
      }
    });

    return () => {
      unsubscribeState();
      unsubscribeUpdates();
    };
  }, []);

  const filteredElements = useMemo(() => {
    if (!search) return elements;
    const searchLower = search.toLowerCase();
    return elements.filter((item) =>
      item.name.toLowerCase().includes(searchLower),
    );
  }, [elements, search]);

  // const { refContainer, handleRefContainer } = useContainerSize((height) => {
  //   setContainerHeight(height);
  //   setIsReady(true);
  // });

  const {
    selectedIndex,
    setSelectedIndex,
    hoveredIndex,
    setHoveredIndex,
    handleKeyDown,
  } = useTreeNavigation(
    filteredElements,
    (element) => {
      Store.inspectState.value = {
        kind: 'focused',
        focusedDomElement: element,
      };
    },
    refContainer,
  );

  // Calculate max content width
  const maxContentWidth = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;

    ctx.font = STYLES.font;
    const contentWidth =
      Math.max(
        ...filteredElements.map((item) => {
          const x =
            item.depth * STYLES.item.indentWidth + STYLES.item.initialIndent;
          return x + ctx.measureText(item.name).width;
        }),
      ) + STYLES.item.paddingRight;

    // Use container width if content width is smaller
    const containerWidth = refContainer.current?.clientWidth || 0;
    return Math.max(contentWidth, containerWidth);
  }, [filteredElements]);

  // Update canvas width on container resiz

  const { drawTree } = useCanvasDrawing(
    filteredElements,
    selectedIndex,
    hoveredIndex,
    scrollTop,
    refContainer.current?.clientHeight ?? 0,
    maxContentWidth,
  );

  // Handle scroll with horizontal adjustment
  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    setScrollTop(target.scrollTop);
  }, []);

  // Draw effect with debouncing
  useEffect(() => {
    if (refContainer?.current && refCanvas?.current) {
      const canvas = refCanvas.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawTree(canvas, ctx);
      }
    }
  }, [drawTree]);

  // Canvas event handlers
  const handleCanvasMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = refCanvas.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top + scrollTop;
      const index = Math.floor(y / STYLES.item.height);

      if (index >= 0 && index < filteredElements.length) {
        setHoveredIndex(index);
      }
    },
    [filteredElements.length, scrollTop, setHoveredIndex],
  );

  const handleCanvasClick = useCallback(
    (e: MouseEvent) => {
      const canvas = refCanvas.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top + scrollTop;
      const index = Math.floor(y / STYLES.item.height);

      if (index >= 0 && index < filteredElements.length) {
        setSelectedIndex(index);
        const element = filteredElements[index];
        if (element.element) {
          Store.inspectState.value = {
            kind: 'focused',
            focusedDomElement: element.element,
          };
        }
      }
    },
    [filteredElements, scrollTop, setSelectedIndex],
  );

  // Focus effect
  useEffect(() => {
    refCanvas.current?.focus();
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
    <div
      ref={refContainer}
      className="flex-1 min-w-[260px] flex flex-col overflow-hidden gap-y-2"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        refCanvas.current?.focus();
      }}
    >
      <Breadcrumb />

      <input
        ref={refInput}
        type="text"
        value={search}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.focus();
        }}
        onInput={(e: Event) => {
          const target = e.target as HTMLInputElement;
          setSearch(target.value);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            setSearch('');
          }
        }}
        className="h-9 w-full mx-2 border-b border-white/10 bg-[#0a0a0a] px-2 py-1 text-white focus:outline-none"
        placeholder="Search components..."
      />
      <div className="flex-1 h-[calc(100%-25px-36px-16px)] overflow-hidden flex bg-[#0a0a0a]">
        <div
          // ref={handleRefContainer}
          className="flex-1 overflow-x-auto overflow-y-auto"
          onScroll={handleScroll}
        >
          <div
            style={{
              height: filteredElements.length * STYLES.item.height,
              position: 'relative',
              width: maxContentWidth,
            }}
          >
              <canvas
                ref={refCanvas}
                style={{
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: refContainer.current?.clientHeight ?? 0,
                  width: maxContentWidth,
                }}
                onMouseMove={handleCanvasMouseMove}
                onClick={handleCanvasClick}
                onKeyDown={handleKeyDown}
                tabIndex={0}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
