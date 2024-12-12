import { type JSX } from 'preact';
import { useRef, useCallback, useEffect } from 'preact/hooks';
import { cn, readLocalStorage, saveLocalStorage } from '@web-utils/helpers';
import { Store } from '../../../..';
import { signalWidgetState, signalSelectedCorner } from '../../state';
import { Header } from './header';
import { type WidgetState, type Corner, type Position, type StoredWidgetState } from './types'
import { MIN_SIZE, SAFE_AREA, CORNER_CONFIGS, RESIZE_HANDLE_SIZE, LOCALSTORAGE_KEY } from './constants';
import Toolbar from './toolbar';
import { ResizeHandle } from './resize-handle';
import { calculatePosition } from './helpers';

export const Widget = () => {
  const inspectState = Store.inspectState;

  const isInspectFocused = inspectState.value.kind === 'focused';


  // Refs for all mutable state
  const refContainer = useRef<HTMLDivElement>(null);
  const refPropContainer = useRef<HTMLDivElement>(null);
  const refFooter = useRef<HTMLDivElement>(null);

  // Add ref for footer height before state initialization
  const refFooterHeight = useRef<number>(0);

  // Measure footer height immediately
  useEffect(() => {
    if (!refFooter.current) return;
    refFooterHeight.current = refFooter.current.offsetHeight;
  }, []);

  // Initialize state from storage
  useEffect(() => {
    const stored = readLocalStorage<StoredWidgetState>(LOCALSTORAGE_KEY);
    if (stored) {
      signalWidgetState.value = {
        ...signalWidgetState.value,
        corner: stored.corner,
        lastExpandedWidth: stored.size.width,
        lastExpandedHeight: stored.size.height,
      };
    }
  }, []);

  const refDragStart = useRef<Position | null>(null);
  const refInitialPosition = useRef<Position | null>(null);

  // Add this helper function at the top of the component
  const getTransformOrigin = useCallback((corner: Corner) => {
    switch (corner) {
      case 'top-left': return 'top left';
      case 'top-right': return 'top right';
      case 'bottom-left': return 'bottom left';
      case 'bottom-right': return 'bottom right';
      default: return 'center';
    }
  }, []);

  // Modify updateState to use calculatePosition
  const updateState = useCallback((updates: Partial<WidgetState>) => {
    signalWidgetState.value = { ...signalWidgetState.value, ...updates };

    if (!refContainer.current) return;

    requestAnimationFrame(() => {
      if (!refContainer.current) return;

      const { corner } = signalWidgetState.value;
      const width = signalWidgetState.value.size.width;
      const height = isInspectFocused ? signalWidgetState.value.size.height : refFooterHeight.current;

      const position = calculatePosition(corner, width, height);

      refContainer.current.style.width = `${width}px`;
      refContainer.current.style.height = `${height}px`;
      refContainer.current.style.transform = `translate(${position.x}px, ${position.y}px)`;
      refContainer.current.style.transformOrigin = getTransformOrigin(corner);

      signalWidgetState.value.position = position;

      if (isInspectFocused) {
        saveLocalStorage(LOCALSTORAGE_KEY, {
          corner,
          size: {
            width: signalWidgetState.value.lastExpandedWidth,
            height: signalWidgetState.value.lastExpandedHeight
          }
        });
      }
    });
  }, [getTransformOrigin]);

  // Move determineCorner before handleMouseDown
  const determineCorner = useCallback((x: number, y: number): Corner => {
    return `${y < window.innerHeight / 2 ? 'top' : 'bottom'}-${x < window.innerWidth / 2 ? 'left' : 'right'}` as Corner;
  }, []);

  // Modified drag handler
  const handleMouseDown = useCallback((event: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }

    if (!refContainer.current) return;

    // Remove transition when starting drag
    refContainer.current.style.transition = 'none';

    const rect = refContainer.current.getBoundingClientRect();
    const isClickInResizeArea = (() => {
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      switch (signalWidgetState.value.corner) {
        case 'top-left':
          return (
            clickX >= rect.width - RESIZE_HANDLE_SIZE &&
            clickY >= rect.height - RESIZE_HANDLE_SIZE
          );
        case 'top-right':
          return (
            clickX <= RESIZE_HANDLE_SIZE &&
            clickY >= rect.height - RESIZE_HANDLE_SIZE
          );
        case 'bottom-left':
          return (
            clickX >= rect.width - RESIZE_HANDLE_SIZE &&
            clickY <= RESIZE_HANDLE_SIZE
          );
        case 'bottom-right':
          return (
            clickX <= RESIZE_HANDLE_SIZE &&
            clickY <= RESIZE_HANDLE_SIZE
          );
      }
    })();

    // Don't trigger repositioning if click was in resize area
    if (isClickInResizeArea) return;

    event.preventDefault();

    refDragStart.current = { x: event.clientX, y: event.clientY };
    refInitialPosition.current = signalWidgetState.value.position;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!refDragStart.current || !refInitialPosition.current || !refContainer.current) return;

      const deltaX = e.clientX - refDragStart.current.x;
      const deltaY = e.clientY - refDragStart.current.y;

      const newX = Math.min(
        Math.max(SAFE_AREA, refInitialPosition.current.x + deltaX),
        window.innerWidth - signalWidgetState.value.size.width - SAFE_AREA
      );
      const newY = Math.min(
        Math.max(SAFE_AREA, refInitialPosition.current.y + deltaY),
        window.innerHeight - signalWidgetState.value.size.height - SAFE_AREA
      );

      refContainer.current.style.transform = `translate(${newX}px, ${newY}px)`;
      signalWidgetState.value.position = { x: newX, y: newY };
    };

    const handleMouseUp = (e: globalThis.MouseEvent) => {
      if (!refDragStart.current || !refContainer.current) return;

      // Add transition before moving to corner
      refContainer.current.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

      const newCorner = determineCorner(e.clientX, e.clientY);
      const newPosition = calculatePosition(newCorner,
        signalWidgetState.value.size.width,
        signalWidgetState.value.size.height
      );

      // Update position with animation
      refContainer.current.style.transform = `translate(${newPosition.x}px, ${newPosition.y}px)`;

      // Update state after animation
      requestAnimationFrame(() => {
        if (refContainer.current) {
          updateState({
            corner: newCorner,
            position: newPosition
          });

          saveLocalStorage(LOCALSTORAGE_KEY, {
            corner: newCorner,
            size: {
              width: signalWidgetState.value.lastExpandedWidth,
              height: signalWidgetState.value.lastExpandedHeight
            }
          });
        }
      });

      refDragStart.current = null;
      refInitialPosition.current = null;

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [determineCorner, updateState]);

  // Window resize handler
  useEffect(() => {
    const handleWindowResize = () => {
      const { corner, size, position } = signalWidgetState.value;

      // Get current window dimensions
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Calculate maximum allowed positions
      const maxX = windowWidth - size.width - SAFE_AREA;
      const maxY = windowHeight - size.height - SAFE_AREA;

      // Ensure widget stays within bounds and maintains corner position
      let newX = position.x;
      let newY = position.y;

      switch (corner) {
        case 'top-left':
          newX = SAFE_AREA;
          newY = SAFE_AREA;
          break;
        case 'top-right':
          newX = Math.min(maxX, windowWidth - size.width - SAFE_AREA);
          newY = SAFE_AREA;
          break;
        case 'bottom-left':
          newX = SAFE_AREA;
          newY = Math.min(maxY, windowHeight - size.height - SAFE_AREA);
          break;
        case 'bottom-right':
          newX = Math.min(maxX, windowWidth - size.width - SAFE_AREA);
          newY = Math.min(maxY, windowHeight - size.height - SAFE_AREA);
          break;
      }

      // Update position if it changed
      if (newX !== position.x || newY !== position.y) {
        updateState({ position: { x: newX, y: newY } });
      }

      // Adjust size if it exceeds new window dimensions
      const newSize = {
        width: Math.min(size.width, windowWidth - (SAFE_AREA * 2)),
        height: Math.min(size.height, windowHeight - (SAFE_AREA * 2))
      };

      if (newSize.width !== size.width || newSize.height !== size.height) {
        updateState({ size: newSize });
      }
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [updateState]);

  // Add this effect right after the refs and state declarations
  useEffect(() => {
    if (!refContainer.current || !refFooter.current) {
      return;
    }

    // Ensure no transition during initial mount
    refContainer.current.style.transition = 'none';

    const { size } = signalWidgetState.value;
    const height = isInspectFocused ? size.height : refFooter.current.clientHeight;
    const width = isInspectFocused ? size.width : MIN_SIZE.width;
    const position = calculatePosition(signalWidgetState.value.corner, width, refFooter.current.clientHeight);

    refContainer.current.style.width = `${width}px`;
    refContainer.current.style.height = `${height}px`;
    refContainer.current.style.transform = `translate(${position.x}px, ${position.y}px)`;
  }, []);

  // Add refs for initial minimized dimensions
  const refMinimizedWidth = useRef<number>(0);
  const refMinimizedHeight = useRef<number>(0);

  // Measure and store initial dimensions on mount
  useEffect(() => {
    if (!refContainer.current || !refFooter.current) return;

    // Measure footer height
    refMinimizedHeight.current = refFooter.current.offsetHeight;

    // Set width to min-content and measure
    refContainer.current.style.width = 'min-content';
    refMinimizedWidth.current = refContainer.current.offsetWidth;

    // Set initial position with measured dimensions
    const newPosition = calculatePosition(
      signalWidgetState.value.corner,
      refMinimizedWidth.current,
      refMinimizedHeight.current
    );

    signalWidgetState.value.position = newPosition;
    signalWidgetState.value.size = {
      width: refMinimizedWidth.current,
      height: refMinimizedHeight.current
    };

    refContainer.current.style.transform = `translate(${newPosition.x}px, ${newPosition.y}px)`;
  }, []);

  useEffect(() => {
    if (!refContainer.current) {
      return;
    }

    const newWidth = isInspectFocused ? signalWidgetState.value.lastExpandedWidth : refMinimizedWidth.current;
    const newHeight = isInspectFocused ? signalWidgetState.value.lastExpandedHeight : refMinimizedHeight.current;
    const newPosition = calculatePosition(signalWidgetState.value.corner, newWidth, newHeight);

    requestAnimationFrame(() => {
      if (!refContainer.current) return;

      refContainer.current.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      refContainer.current.style.width = `${newWidth}px`;
      refContainer.current.style.height = `${newHeight}px`;
      refContainer.current.style.transform = `translate(${newPosition.x}px, ${newPosition.y}px)`;

      // @pivanov
      signalSelectedCorner.value = signalWidgetState.value.corner;

      signalWidgetState.value = {
        ...signalWidgetState.value,
        size: { width: newWidth, height: newHeight },
        position: newPosition,
      };
    });
  }, [isInspectFocused]);

  return (
    <div
      id="pivanov"
      ref={refContainer}
      onMouseDown={handleMouseDown}
      className={cn(
        "fixed inset-0 bg-white rounded-lg shadow-lg",
        "flex flex-col",
        "bg-black",
        'user-select-none',
        'opacity-0',
        'cursor-move',
        'z-[124124124124]',
        'animate-fade-in animation-duration-300 animation-delay-300',
      )}
    >
      <div
        className={cn(
          "flex-1",
          "flex flex-col",
          "rounded-t-md",
          "overflow-hidden",
          'opacity-100',
          'transition-opacity duration-300 delay-300',
          {
            'opacity-0 duration-0 delay-0': !isInspectFocused,
          }
        )}>
        <Header />
        <div
          ref={refPropContainer}
          className={cn(
            "react-scan-prop",
            "flex-1",
            "p-4",
            "max-w-0",
            "text-white",
            'opacity-100',
            "transition-[max-width,height,opacity] duration-max-width-0",
            "duration-opacity-300 delay-opacity-300",
            "overflow-y-auto overflow-x-hidden",
            {
              'max-w-full': isInspectFocused,
              'opacity-0 duration-0 delay-0': !isInspectFocused
            }
          )}
        >
          <div
            className="space-y-4"
          >
            <p>Widget Content</p>
            <p>Scrollable content goes here...</p>
            {Array.from({ length: 10 }).map((_, i) => (
              <p key={i}>Scroll content {i + 1}</p>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={refFooter}
        className={cn(
          "h-9",
          "flex items-center justify-between",
          "transition-colors duration-200"
        )}
      >
        <Toolbar refPropContainer={refPropContainer} />
      </div>

      {
        isInspectFocused && Object.entries(CORNER_CONFIGS).map(([key, config]) =>
          signalWidgetState.value.corner === key && (
            <>
              {/* Horizontal line */}
              <ResizeHandle
                isLine
                refContainer={refContainer}
                position={key.startsWith('top') ? "bottom-0 left-0" : "top-0 left-0"}
                direction={key.startsWith('top') ? "bottom" : "top"}
              />
              {/* Vertical line */}
              <ResizeHandle
                isLine
                refContainer={refContainer}
                position={key.endsWith('left') ? "right-0 top-0 h-full" : "left-0 top-0 h-full"}
                direction={key.endsWith('left') ? "right" : "left"}
              />
              {/* Corner dot */}
              <ResizeHandle
                refContainer={refContainer}
                position={config.resize.position}
                direction={config.resize.direction}
              />
            </>
          )
        )
      }
    </div>
  );
};
