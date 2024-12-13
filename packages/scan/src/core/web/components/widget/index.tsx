import { type JSX } from 'preact';
import { useRef, useCallback, useEffect, useMemo } from 'preact/hooks';
import { cn, debounce, readLocalStorage, saveLocalStorage } from '@web-utils/helpers';
import { getCompositeComponentFromElement } from '@web-inspect-element/utils';
import { Store } from 'src/core';
import { signalWidget, signalRefContainer, updateDimensions } from '../../state';
import { Header } from './header';
import { type WidgetSettings, type Corner } from './types'
import { MIN_SIZE, SAFE_AREA, LOCALSTORAGE_KEY } from './constants';
import Toolbar from './toolbar';
import { ResizeHandle } from './resize-handle';
import { calculatePosition, calculateDimensions } from './helpers';

export const Widget = () => {
  const inspectState = Store.inspectState.value;

  const isInspectFocused = inspectState.kind === 'focused';

  const refContainer = useRef<HTMLDivElement | null>(null);
  const refPropContainer = useRef<HTMLDivElement>(null);
  const refFooter = useRef<HTMLDivElement>(null);

  const refInitialMinimizedWidth = useRef<number>(0);
  const refInitialMinimizedHeight = useRef<number>(0);

  useEffect(() => {
    if (!refContainer.current || !refFooter.current) return;

    refContainer.current.style.width = 'min-content';
    refInitialMinimizedHeight.current = refFooter.current.offsetHeight;
    refInitialMinimizedWidth.current = refContainer.current.offsetWidth;

    const stored = readLocalStorage<WidgetSettings>(LOCALSTORAGE_KEY) ?? {
      corner: 'top-left' as Corner,
      size: { width: 300, height: 400 }
    };

    const newPosition = calculatePosition(
      stored.corner,
      refInitialMinimizedWidth.current,
      refInitialMinimizedHeight.current
    );

    signalWidget.value = {
      ...signalWidget.value,
      position: newPosition,
      corner: stored.corner,
      lastExpandedWidth: stored.size.width,
      lastExpandedHeight: stored.size.height,
      size: {
        width: refInitialMinimizedWidth.current,
        height: refInitialMinimizedHeight.current
      }
    };

    signalRefContainer.value = refContainer.current;
  }, []);

  const shouldExpand = useMemo(() => {
    if (isInspectFocused && inspectState.focusedDomElement) {
      const { parentCompositeFiber } = getCompositeComponentFromElement(inspectState.focusedDomElement);
      if (!parentCompositeFiber) {
        // @TODO: @pivanov fix this in inspect-state-machine.ts pointerdown
        setTimeout(() => {
          Store.inspectState.value = {
            kind: 'inspect-off',
            propContainer: refPropContainer.current!,
          };
        }, 16);

        return false;
      }
    }

    return true;
  }, [isInspectFocused]);

  const handleMouseDown = useCallback((event: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    if (!refContainer.current) return;

    event.preventDefault();

    const container = refContainer.current;
    const { size } = signalWidget.value;
    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = signalWidget.value.position.x;
    const initialY = signalWidget.value.position.y;

    container.style.transition = 'none';

    let currentX = initialX;
    let currentY = initialY;
    let rafId: number | null = null;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        currentX = initialX + deltaX;
        currentY = initialY + deltaY;

        container.style.transform = `translate(${currentX}px, ${currentY}px)`;
        rafId = null;
      });
    };

    const handleMouseUp = () => {
      if (!container) return;
      if (rafId) cancelAnimationFrame(rafId);

      requestAnimationFrame(() => {
        container.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

        const newCorner = `${currentY < window.innerHeight / 2 ? 'top' : 'bottom'}-${currentX < window.innerWidth / 2 ? 'left' : 'right'
          }` as Corner;

        const snappedPosition = calculatePosition(newCorner, size.width, size.height);
        const newDimensions = calculateDimensions(size, newCorner);

        container.style.transform = `translate(${snappedPosition.x}px, ${snappedPosition.y}px)`;

        signalWidget.value = {
          ...signalWidget.value,
          corner: newCorner,
          position: snappedPosition,
          dimensions: newDimensions
        };

        queueMicrotask(() => {
          saveLocalStorage(LOCALSTORAGE_KEY, {
            corner: newCorner,
            size: {
              width: signalWidget.value.lastExpandedWidth,
              height: signalWidget.value.lastExpandedHeight
            }
          });
        });

        updateDimensions();
      });

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  useEffect(() => {
    if (!refContainer.current || !shouldExpand) {
      return;
    }

    let resizeTimeout: number;

    const updateWidgetPosition = () => {
      if (!refContainer.current) return;

      const { corner } = signalWidget.value;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      let newWidth, newHeight;

      if (isInspectFocused) {
        const wasFullWidth = Math.abs(signalWidget.value.lastExpandedWidth - (windowWidth - (SAFE_AREA * 2))) <= 1;
        const wasFullHeight = Math.abs(signalWidget.value.lastExpandedHeight - (windowHeight - (SAFE_AREA * 2))) <= 1;

        newWidth = Math.max(MIN_SIZE.width, wasFullWidth
          ? windowWidth - (SAFE_AREA * 2)
          : Math.min(signalWidget.value.lastExpandedWidth, windowWidth - (SAFE_AREA * 2)));

        newHeight = Math.max(MIN_SIZE.height, wasFullHeight
          ? windowHeight - (SAFE_AREA * 2)
          : Math.min(signalWidget.value.lastExpandedHeight, windowHeight - (SAFE_AREA * 2)));
      } else {
        newWidth = refInitialMinimizedWidth.current;
        newHeight = refInitialMinimizedHeight.current;
      }

      const newPosition = calculatePosition(corner, newWidth, newHeight);

      refContainer.current.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      refContainer.current.style.width = `${newWidth}px`;
      refContainer.current.style.height = `${newHeight}px`;
      refContainer.current.style.transform = `translate(${newPosition.x}px, ${newPosition.y}px)`;

      const newDimensions = isInspectFocused ? calculateDimensions({ width: newWidth, height: newHeight }, corner) : undefined;
      const newState = {
        ...signalWidget.value,
        position: newPosition,
        size: { width: newWidth, height: newHeight },
        ...(isInspectFocused && {
          lastExpandedWidth: newWidth,
          lastExpandedHeight: newHeight,
          dimensions: newDimensions
        })
      };

      signalWidget.value = newState;

      if (isInspectFocused) {
        saveLocalStorage(LOCALSTORAGE_KEY, {
          corner: signalWidget.value.corner,
          size: { width: newWidth, height: newHeight }
        });
      }

      updateDimensions();
    };

    const handleWindowResize = debounce(() => {
      if (resizeTimeout) window.cancelAnimationFrame(resizeTimeout);
      resizeTimeout = window.requestAnimationFrame(updateWidgetPosition);
    }, 16);

    updateWidgetPosition();

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (resizeTimeout) window.cancelAnimationFrame(resizeTimeout);
    };
  }, [isInspectFocused, shouldExpand]);

  return (
    <div
      id="react-scan-toolbar"
      ref={refContainer}
      onMouseDown={handleMouseDown}
      className={cn(
        "fixed inset-0 rounded-lg shadow-lg",
        "flex flex-col",
        "bg-black",
        'font-mono text-[13px]',
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
        />
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
        isInspectFocused && shouldExpand && (
          <>
            <ResizeHandle position="top" />
            <ResizeHandle position="bottom" />
            <ResizeHandle position="left" />
            <ResizeHandle position="right" />

            <ResizeHandle position="top-left" />
            <ResizeHandle position="top-right" />
            <ResizeHandle position="bottom-left" />
            <ResizeHandle position="bottom-right" />
          </>
        )
      }
    </div>
  );
};
