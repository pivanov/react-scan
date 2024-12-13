import { type JSX } from 'preact';
import { useCallback, useEffect } from "preact/hooks";
import { memo } from 'preact/compat';
import { cn, saveLocalStorage, debounce } from '@web-utils/helpers';
import { Store } from 'src/core';
import { Icon } from '@web-components/icon';
import { signalWidget, signalRefContainer, updateDimensions } from '../../state';
import { type ResizeHandleProps } from './types';
import { LOCALSTORAGE_KEY, MIN_SIZE } from './constants';
import {
  calculatePosition,
  getInteractionClasses,
  getPositionClasses,
  calculateNewSizeAndPosition,
  getHandleVisibility,
  getWindowDimensions,
  getOppositeCorner,
  calculateDimensions,
  getClosestCorner
} from './helpers';

export const ResizeHandle = memo(({ position }: ResizeHandleProps) => {
  const isLine = !position.includes('-');
  const { dimensions } = signalWidget.value;
  const { isFullWidth, isFullHeight } = dimensions;
  const currentCorner = signalWidget.value.corner;

  const getVisibilityClass = useCallback(() =>
    getHandleVisibility(position, isLine, currentCorner, isFullWidth, isFullHeight),
    [dimensions, position, isLine, isFullWidth, isFullHeight]
  );

  const handleDoubleClick = useCallback((e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!signalRefContainer.value) return;

    const { maxWidth, maxHeight, isFullWidth, isFullHeight } = getWindowDimensions();
    const currentWidth = signalWidget.value.size.width;
    const currentHeight = signalWidget.value.size.height;
    const currentCorner = signalWidget.value.corner;
    const isCurrentFullWidth = isFullWidth(currentWidth);
    const isCurrentFullHeight = isFullHeight(currentHeight);
    const isFullScreen = isCurrentFullWidth && isCurrentFullHeight;

    // Disable corner double-clicks in half-maximized states
    if (!isLine && ((isCurrentFullWidth && !isCurrentFullHeight) || (!isCurrentFullWidth && isCurrentFullHeight))) {
      return;
    }

    let newWidth = currentWidth;
    let newHeight = currentHeight;
    const newCorner = getOppositeCorner(
      position,
      currentCorner,
      isFullScreen,
      isCurrentFullWidth,
      isCurrentFullHeight
    );

    if (isLine) {
      if (position === 'left' || position === 'right') {
        newWidth = isCurrentFullWidth ? MIN_SIZE.width : maxWidth;
      } else {
        newHeight = isCurrentFullHeight ? MIN_SIZE.height : maxHeight;
      }
    } else if (isFullScreen) {
        newWidth = MIN_SIZE.width;
      newHeight = MIN_SIZE.height;
    } else {
      newWidth = maxWidth;
      newHeight = maxHeight;
    }

    const container = signalRefContainer.value;
    const newPosition = calculatePosition(newCorner, newWidth, newHeight);

    container.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    container.style.width = `${newWidth}px`;
    container.style.height = `${newHeight}px`;
    container.style.transform = `translate(${newPosition.x}px, ${newPosition.y}px)`;

    const newDimensions = calculateDimensions({ width: newWidth, height: newHeight }, newCorner);
    const newState = {
      ...signalWidget.value,
      isResizing: true,
      corner: newCorner,
      size: { width: newWidth, height: newHeight },
      position: newPosition,
      lastExpandedWidth: newWidth,
      lastExpandedHeight: newHeight,
      dimensions: newDimensions
    };
    signalWidget.value = newState;

    const onTransitionEnd = () => {
      container.style.transition = '';
      updateDimensions();
      container.removeEventListener('transitionend', onTransitionEnd);
    };
    container.addEventListener('transitionend', onTransitionEnd);

    saveLocalStorage(LOCALSTORAGE_KEY, {
      corner: newCorner,
      size: { width: newWidth, height: newHeight }
    });
  }, [isLine, position]);

  const handleResize = useCallback((e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const container = signalRefContainer.value;
    if (!container) return;

    // Immediately remove transition at the start of resize
    container.style.transition = 'none';

    // Cache initial values
    const initialX = e.clientX;
    const initialY = e.clientY;
    const initialWidth = signalWidget.value.size.width;
    const initialHeight = signalWidget.value.size.height;
    const initialPosition = signalWidget.value.position;

    let rafId: number | null = null;
    let isResizing = true;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || rafId) return;

      rafId = requestAnimationFrame(() => {
        const { newSize, newPosition } = calculateNewSizeAndPosition(
          position,
          { width: initialWidth, height: initialHeight },
          initialPosition,
          e.clientX - initialX,
          e.clientY - initialY
        );

        // Batch DOM updates
        container.style.width = `${newSize.width}px`;
        container.style.height = `${newSize.height}px`;
        container.style.transform = `translate(${newPosition.x}px, ${newPosition.y}px)`;

        signalWidget.value = {
          ...signalWidget.value,
          size: newSize,
          position: newPosition,
          isResizing: true
        };

        rafId = null;
      });
    };

    const handleMouseUp = () => {
      isResizing = false;
      if (rafId) cancelAnimationFrame(rafId);

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      requestAnimationFrame(() => {
        const container = signalRefContainer.value;
        if (!container) return;

        // Get current position and window dimensions
        const { x, y } = signalWidget.value.position;

        // Find closest corner based on current position
        const closestCorner = getClosestCorner(
          { x, y },
        );

        // Calculate new position based on the closest corner
        const newPosition = calculatePosition(
          closestCorner,
          signalWidget.value.size.width,
          signalWidget.value.size.height
        );

        // Apply smooth transition
        container.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        container.style.transform = `translate(${newPosition.x}px, ${newPosition.y}px)`;

        // Update state
        signalWidget.value = {
          ...signalWidget.value,
          corner: closestCorner,
          position: newPosition,
          isResizing: false,
          dimensions: calculateDimensions(signalWidget.value.size, closestCorner)
        };

        queueMicrotask(() => {
          saveLocalStorage(LOCALSTORAGE_KEY, {
            corner: closestCorner,
            size: signalWidget.value.size
          });
        });

        updateDimensions();
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position]);

  // Window resize handler
  useEffect(() => {
    const handleWindowResize = debounce(() => {
      if (!signalRefContainer.value) return;

      const isInspectFocused = Store.inspectState.value.kind === 'focused';

      if (isInspectFocused) {
        const { dimensions, size } = signalWidget.value;
        const { isFullWidth, isFullHeight } = dimensions;

        if (isFullWidth || isFullHeight) {
          const { maxWidth, maxHeight } = getWindowDimensions();

          const newSize = {
            width: isFullWidth ? maxWidth : size.width,
            height: isFullHeight ? maxHeight : size.height
          };

          signalWidget.value = {
            ...signalWidget.value,
            size: newSize,
            currentWidth: newSize.width,
            currentHeight: newSize.height
          };
        }

        updateDimensions();
      }
    }, 16);

    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
      handleWindowResize.cancel();
    };
  }, []);

  return (
    <div
      data-direction={position}
      onMouseDown={handleResize}
      onDblClick={handleDoubleClick}
      className={cn(
        "flex items-center justify-center",
        "resize-handle absolute",
        "group",
        'overflow-hidden',
        "transition-opacity select-none z-50 pointer-events-auto",
        getPositionClasses(position),
        getInteractionClasses(position, isLine, getVisibilityClass())
      )}
    >
      {
        isLine ?
          (
            <span
              className={cn(
                "absolute",
                "opacity-0 group-hover:opacity-100 group-active:opacity-100",
                "transition-[transform, opacity] duration-300",
                "delay-500 group-hover:delay-0 group-active:delay-0",
                {
                  "translate-y-full group-hover:-translate-y-1.5 group-active:-translate-y-1.5":
                    position === 'top',
                  "-translate-x-full group-hover:translate-x-1.5 group-active:translate-x-1.5":
                    position === 'right',
                  "-translate-y-full group-hover:translate-y-1.5 group-active:translate-y-1.5":
                    position === 'bottom',
                  "translate-x-full group-hover:-translate-x-1.5 group-active:-translate-x-1.5":
                    position === 'left',
                }
              )}
            >
              <Icon
                className='text-[#7b51c8]'
                name={position === 'left' || position === 'right'
                  ? 'icon-grip-vertical'
                  : 'icon-grip-horizontal'
                }
              />
            </span>
          )
          : (
            <span
              className={cn(
                "absolute w-6 h-6",
                "opacity-0 group-hover:opacity-100 group-active:opacity-100",
                "transition-[transform,opacity] duration-300",
                "delay-500 group-hover:delay-0 group-active:delay-0",
                "before:content-[''] before:absolute",
                "before:w-0 before:h-0",
                "before:border-[5px] before:border-transparent before:border-t-[#7b51c8]",
                {
                  "before:top-0 before:left-0 before:rotate-[135deg] translate-x-2 translate-y-2":
                    position === 'top-left',

                  "before:top-0 before:right-0 before:rotate-[225deg] -translate-x-2 translate-y-2":
                    position === 'top-right',

                  "before:bottom-0 before:left-0 before:rotate-45 translate-x-2 -translate-y-2":
                    position === 'bottom-left',

                  "before:bottom-0 before:right-0 before:-rotate-45 -translate-x-2 -translate-y-2":
                    position === 'bottom-right',
                },
                "group-hover:translate-x-0 group-hover:translate-y-0",
                "group-active:translate-x-0 group-active:translate-y-0"
              )}
            />
          )
      }
    </div>
  );
}, (prevProps, nextProps) => prevProps.position === nextProps.position);
