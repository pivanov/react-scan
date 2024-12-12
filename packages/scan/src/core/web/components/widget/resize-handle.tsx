import { type RefObject, type JSX } from 'preact';
import { useCallback } from "preact/hooks";
import { cn, saveLocalStorage } from '@web-utils/helpers';
import { signalWidgetState } from '../../state';
import { LOCALSTORAGE_KEY, MIN_SIZE, SAFE_AREA } from './constants';

interface ResizeHandleProps {
  refContainer: RefObject<HTMLDivElement>;
  position: string;
  direction: string;
  isLine?: boolean;
}

export const ResizeHandle = (props: ResizeHandleProps) => {
  const {
    refContainer,
    position,
    direction,
    isLine = false
  } = props;

  // Modified resize handler
  const handleResize = useCallback((e: JSX.TargetedMouseEvent<HTMLDivElement>, direction: string) => {
    if (!refContainer.current) return;

    refContainer.current.style.transition = 'none';

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!refContainer.current) return;

      const rect = refContainer.current.getBoundingClientRect();
      let newWidth = signalWidgetState.value.size.width;
      let newHeight = signalWidgetState.value.size.height;
      let newX = signalWidgetState.value.position.x;
      let newY = signalWidgetState.value.position.y;

      // Calculate max dimensions (half of available space)
      const maxWidth = Math.min((window.innerWidth - (SAFE_AREA * 2)) / 2);
      const maxHeight = Math.min((window.innerHeight - (SAFE_AREA * 2)) / 2);

      if (direction.includes('right')) {
        newWidth = Math.max(
          MIN_SIZE.width,
          Math.min(e.clientX - rect.left, maxWidth)
        );
      } else if (direction.includes('left')) {
        const rightEdge = rect.right;
        newWidth = Math.max(
          MIN_SIZE.width,
          Math.min(rightEdge - e.clientX, maxWidth)
        );
        newX = Math.max(SAFE_AREA, rightEdge - newWidth);
      }

      if (direction.includes('bottom')) {
        newHeight = Math.max(
          MIN_SIZE.height,
          Math.min(e.clientY - rect.top, maxHeight)
        );
      } else if (direction.includes('top')) {
        const bottomEdge = rect.bottom;
        newHeight = Math.max(
          MIN_SIZE.height,
          Math.min(bottomEdge - e.clientY, maxHeight)
        );
        newY = Math.max(SAFE_AREA, bottomEdge - newHeight);
      }

      // Ensure we don't exceed viewport bounds
      if ((newX) + (newWidth) > window.innerWidth - SAFE_AREA) {
        newWidth = window.innerWidth - (newX) - SAFE_AREA;
      }
      if ((newY) + (newHeight) > window.innerHeight - SAFE_AREA) {
        newHeight = window.innerHeight - (newY) - SAFE_AREA;
      }

      // Only update DOM and ref state during move
      refContainer.current.style.width = `${newWidth}px`;
      refContainer.current.style.height = `${newHeight}px`;
      refContainer.current.style.transform = `translate(${newX}px, ${newY}px)`;

      // Update ref state without storage
      signalWidgetState.value.position = { x: newX, y: newY };
      signalWidgetState.value.size = { width: newWidth, height: newHeight };
      signalWidgetState.value.lastExpandedWidth = newWidth;
      signalWidgetState.value.lastExpandedHeight = newHeight;
    };

    // Save only on mouseup
    const handleMouseUp = () => {
      if (!refContainer.current) return;

      // Store final dimensions
      saveLocalStorage(LOCALSTORAGE_KEY, {
        corner: signalWidgetState.value.corner,
        size: {
          width: signalWidgetState.value.lastExpandedWidth,
          height: signalWidgetState.value.lastExpandedHeight
        }
      });

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <div
      className={cn(
        "absolute",
        position,
        isLine ? "bg-transparent hover:bg-blue-500/50" : "bg-blue-500 hover:bg-blue-600",
        "transition-colors",
        "select-none",
        "z-50",
        "pointer-events-auto",
        {
          // Squares
          'w-3 h-3': !isLine,
          'rounded-tl': !isLine && (direction.includes('left') || direction.includes('top')),
          'rounded-tr': !isLine && (direction.includes('right') || direction.includes('top')),
          'rounded-bl': !isLine && (direction.includes('left') || direction.includes('bottom')),
          'rounded-br': !isLine && (direction.includes('right') || direction.includes('bottom')),
          // Cursors for squares
          'cursor-nwse-resize': !isLine && (direction.includes('bottom-right') || direction.includes('top-left')),
          'cursor-nesw-resize': !isLine && (direction.includes('bottom-left') || direction.includes('top-right')),
          // Lines
          'w-1 h-full': isLine && (direction.includes('left') || direction.includes('right')),
          'w-full h-1': isLine && (direction.includes('top') || direction.includes('bottom')),
          'rounded-l-md': isLine && (direction.includes('left') || direction.includes('right')),
          'rounded-r-md': isLine && (direction.includes('left') || direction.includes('right')),
          'rounded-t-md': isLine && (direction.includes('top') || direction.includes('bottom')),
          'rounded-b-md': isLine && (direction.includes('top') || direction.includes('bottom')),
          // Cursors for lines
          'cursor-ew-resize': isLine && (direction.includes('left') || direction.includes('right')),
          'cursor-ns-resize': isLine && (direction.includes('top') || direction.includes('bottom')),
        }
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleResize(e, direction);
      }}
    />
  );
};
